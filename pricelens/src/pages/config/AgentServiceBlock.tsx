// ============================================================
// 配置页「Agent 模型服务」区块（2026-11-26 Agent 模型服务规范「配置 UI」）
//  - 布局：左侧服务商列表（可搜索；徽标 + 名称 + 已配置 / 未配置状态点）→ 右侧该家
//    配置区。本页首个「左列表 + 右详情」实现（既有分区都是纵向分块）。
//  - 数据：全部在本机服务器（agentService/api.ts）。本块不落任何浏览器存储；密钥只在
//    「输入 → POST」这一段存在于组件内存，保存成功即清空，已保存的密钥永远只显示掩码。
//  - 交互（固定）：名称 + 一句话说明 + 外链 → API Key（密码态可显隐；已保存只给掩码 +
//    「更换」；本机服务不显示）→ 模型下拉（「获取模型列表」填充，失败回退预置并写明
//    原因；可「手动添加」模型 ID）→「高级设置」里收着服务地址（自定义服务商必填，默认
//    展开）→「测试连接」「保存」「设为当前模型」→ 状态区四态。
//  - 纪律：必填项未填时按钮禁用并在旁边写出原因；失败原因一律用服务器给的人话；
//    每家一份草稿，切换服务商不丢未保存的输入。
//  - 权限沿用 canEdit（查阅者只读）；写操作入口再过一次 canEditConfig（纵深）。
//  设计口径：.impeccable/surfaces/agent-model-service.md
// ============================================================
import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { App as AntdApp, Button, Input, Popconfirm, Select } from 'antd';
import { CheckOutlined, CloseCircleOutlined, PlusOutlined, RightOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import ProviderBadge, { ProviderStatusDot } from '../../agentService/ProviderBadge';
import { agentServiceApi } from '../../agentService/api';
import {
  AGENT_SERVICE_BLOCK_ID,
  CONFIG_STATUS_LABELS,
  CONFIG_STATUS_SHORT_LABELS,
  apiKeyModeOf,
  configStatusOf,
  findPreset,
  formatTestedAt,
  isConfigurablePreset,
  mergePresets,
  providerSummaryOf,
  searchProviders,
  type ProviderConfigStatus,
  type ProviderPreset,
  type SavedProvider,
} from '../../agentService/providers';
import { getAgentServiceSnapshot, loadAgentService, refreshAgentService, saveAgentProvider, setActiveModel, useAgentService } from '../../agentService/store';
import { canEditConfig } from '../../access/role';
import { color, font, fontSize, motion, radius, selectAccent, selectSoft, selectSoftInk, space } from '../../theme/tokens';
import './agentServiceBlock.css';

type ModelOptionSource = 'preset' | 'fetched' | 'custom';

interface ModelOption {
  value: string;
  label: string;
  source: ModelOptionSource;
}

/** 每家一份草稿：切换服务商不丢未保存的输入；从未保存的密钥不回显 */
interface ProviderDraft {
  baseUrl: string;
  /** 选中的模型 ID（空 = 未选） */
  model: string;
  options: ModelOption[];
  /** 本次新输入、尚未保存的密钥；保存成功即清空 */
  apiKeyDraft: string;
  /** 密钥输入框展开（已保存过密钥时默认收起，只显示掩码 + 更换） */
  keyInputOpen: boolean;
  keyVisible: boolean;
  manualOpen: boolean;
  manualText: string;
  advancedOpen: boolean;
  /** 本次保存改了密钥或地址：服务器上记录的旧测试结果不再对应当前配置 */
  configChanged: boolean;
}

type Busy = null | 'models' | 'test' | 'save' | 'activate' | 'remove' | 'local';

interface Notice {
  providerId: string;
  tone: 'info' | 'error';
  text: string;
}

interface TestFeedback {
  providerId: string;
  ok: boolean;
  latencyMs: number | null;
  model: string;
  message: string;
}

const SOURCE_LABELS: Record<ModelOptionSource, string> = { preset: '预置', fetched: '已获取', custom: '手动添加' };
const KEY_INPUT_WIDTH = 420;
const MODEL_SELECT_WIDTH = 320;

const captionStyle: CSSProperties = { fontSize: fontSize.caption, lineHeight: '18px', color: color.mute };
const bodyStyle: CSSProperties = { fontSize: fontSize.bodySm, lineHeight: '20px', color: color.body };

/** --las-* 桥接变量：本块 CSS 的唯一视觉数值来源（源：theme/tokens.ts） */
const bridgeStyle = {
  '--las-canvas': color.canvas,
  '--las-hover': color.canvasSoft2,
  '--las-line': color.hairline,
  '--las-ink': color.ink,
  '--las-body': color.body,
  '--las-mute': color.mute,
  '--las-link': color.link,
  '--las-focus': selectAccent,
  '--las-select-soft': selectSoft,
  '--las-select-ink': selectSoftInk,
  '--las-caption': `${fontSize.caption}px`,
  '--las-body-sm': `${fontSize.bodySm}px`,
  '--las-control-radius': `${radius.control}px`,
  '--las-xs': `${space.xs}px`,
  '--las-sm': `${space.sm}px`,
  '--las-md': `${space.md}px`,
  '--las-base': `${space.base}px`,
  '--las-motion': `${motion.fast}ms`,
} as CSSProperties;

const chipStyle: CSSProperties = {
  padding: '1px 8px',
  fontSize: fontSize.caption,
  fontWeight: 600,
  lineHeight: '18px',
  borderRadius: radius.pill,
  color: selectSoftInk,
  background: selectSoft,
};

const tabIdOf = (providerId: string): string => `${AGENT_SERVICE_BLOCK_ID}-tab-${providerId}`;
const panelId = `${AGENT_SERVICE_BLOCK_ID}-panel`;

function presetLabelOf(preset: ProviderPreset, modelId: string): string {
  return preset.presetModels.find((model) => model.id === modelId)?.label ?? modelId;
}

function createDraft(preset: ProviderPreset, saved: SavedProvider | undefined): ProviderDraft {
  const options: ModelOption[] = saved
    ? saved.models.map((id) => ({ value: id, label: presetLabelOf(preset, id), source: 'preset' as const }))
    : preset.presetModels.map((model) => ({ value: model.id, label: model.label, source: 'preset' as const }));
  const defaultBaseUrl = saved?.baseUrl || preset.defaultBaseUrl || '';
  return {
    baseUrl: defaultBaseUrl,
    model: saved?.model || '',
    options,
    apiKeyDraft: '',
    keyInputOpen: apiKeyModeOf(preset) !== 'none' && !saved?.hasKey,
    keyVisible: false,
    manualOpen: false,
    manualText: '',
    // 自定义服务商地址必填：默认展开；其余收在「高级设置」里
    advancedOpen: preset.custom === true || !defaultBaseUrl,
    configChanged: false,
  };
}

/** 拉取失败时的回退清单：预置模型 + 当前选中的模型（不把已选项弄丢） */
function fallbackOptions(preset: ProviderPreset, draft: ProviderDraft): ModelOption[] {
  const byValue = new Map<string, ModelOption>();
  for (const model of preset.presetModels) byValue.set(model.id, { value: model.id, label: model.label, source: 'preset' });
  const current = draft.options.find((option) => option.value === draft.model);
  if (current) byValue.set(current.value, current);
  return [...byValue.values()];
}

/** 拉取成功：以获取到的列表为准，保留手动添加的项与当前选中项 */
function fetchedOptions(preset: ProviderPreset, draft: ProviderDraft, models: string[]): ModelOption[] {
  const byValue = new Map<string, ModelOption>();
  for (const id of models) byValue.set(id, { value: id, label: presetLabelOf(preset, id), source: 'fetched' });
  for (const option of draft.options) {
    if ((option.source === 'custom' || option.value === draft.model) && !byValue.has(option.value)) byValue.set(option.value, option);
  }
  return [...byValue.values()];
}

function statusView(saved: SavedProvider | undefined, configChanged: boolean): {
  status: ProviderConfigStatus; title: string; detail: string; hint: string;
} {
  const status = configStatusOf(saved);
  if (status === 'unconfigured') return { status, title: CONFIG_STATUS_LABELS.unconfigured, detail: '', hint: '填写上方信息后保存。' };
  if (status === 'disabled') return { status, title: CONFIG_STATUS_LABELS.disabled, detail: '', hint: '保存后重新启用。' };
  // 服务器保存时不重置旧的测试结果：改过密钥 / 地址后，旧结果不能再当作当前配置的结论
  if (configChanged && saved?.status) {
    return {
      status: 'saved',
      title: '已保存，配置已变更',
      detail: '',
      hint: `上次测试（${CONFIG_STATUS_LABELS[saved.status]}）针对的是旧配置，请重新测试连接。`,
    };
  }
  if (status === 'connected') return { status, title: CONFIG_STATUS_LABELS.connected, detail: `${formatTestedAt(saved?.testedAt)} · ${saved?.latencyMs ?? '—'} ms`, hint: '' };
  if (status === 'failed') return { status, title: CONFIG_STATUS_LABELS.failed, detail: saved?.lastError || '原因未知，请重新测试连接', hint: '' };
  return { status, title: CONFIG_STATUS_LABELS.saved, detail: '', hint: '可点「测试连接」确认密钥、地址与模型可用。' };
}

const errorText = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback);

/** 右侧静态说明（事实口径见 server/agent_gateway.py 头注：模型只改写叙述与建议，密钥不进配置导出） */
const MODEL_SERVICE_NOTES: readonly (readonly [string, string])[] = [
  ['模型负责什么', '只改写结论叙述与后续问题建议；数字、卡片与引用仍由本地确定性引擎计算。'],
  ['何时生效', '切换当前模型后对下一次 Agent 运行生效；没有可用模型时由本地引擎回答。'],
  ['密钥存在哪里', '只保存在本机服务器的数据目录，不进入浏览器存储，也不随配置导出。'],
];

export default function AgentServiceBlock({ canEdit = true }: { canEdit?: boolean }) {
  const { message } = AntdApp.useApp();
  const snapshot = useAgentService();
  const data = snapshot.data;
  // 首挂载读一次（5 秒内重复挂载直接用缓存）；读失败不抛，下方按 snapshot.error 展示
  useEffect(() => { void loadAgentService(); }, []);

  const presets = useMemo(() => mergePresets(data?.presets), [data]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [testFeedback, setTestFeedback] = useState<TestFeedback | null>(null);

  const visible = useMemo(() => searchProviders(presets, query), [presets, query]);

  // 未点选过时落在当前使用的那家（面板「管理模型服务…」跳过来即对上），否则第一家可配置的
  const selected = (selectedId && findPreset(presets, selectedId))
    || (data?.active ? findPreset(presets, data.active.provider) : null)
    || presets.find(isConfigurablePreset)
    || presets[0]
    || null;
  const saved = selected && data ? data.providers[selected.id] : undefined;
  const draft = selected ? drafts[selected.id] ?? createDraft(selected, saved) : null;

  // 防纵深：按钮置灰之外，写操作入口在调用时再校验一次角色（查阅者态下即便被调用也直接拒绝）
  const writable = canEdit && canEditConfig();
  const canWrite = (): boolean => canEdit && canEditConfig();
  const viewerHint = '查阅者不可修改配置，请联系 GTM';

  /** 改某家的草稿。基准记录以共享状态里的最新值为准（异步操作回来时闭包里的 record 可能已旧） */
  const update = (preset: ProviderPreset, fallbackRecord: SavedProvider | undefined, patch: (current: ProviderDraft) => Partial<ProviderDraft>): void => {
    setDrafts((prev) => {
      const record = getAgentServiceSnapshot().data?.providers[preset.id] ?? fallbackRecord;
      const current = prev[preset.id] ?? createDraft(preset, record);
      return { ...prev, [preset.id]: { ...current, ...patch(current) } };
    });
  };

  const noticeFor = (providerId: string): Notice | null => (notice && notice.providerId === providerId ? notice : null);
  const feedbackFor = (providerId: string): TestFeedback | null => (testFeedback && testFeedback.providerId === providerId ? testFeedback : null);

  /** 测试 / 拉模型用的临时配置：只有表单里的地址 / 密钥与服务器上已保存的不同才带上——
   *  两样都不带时服务器测的才是「已保存的那份」，并把结果记进状态 */
  const effectivePayload = (preset: ProviderPreset, record: SavedProvider | undefined, current: ProviderDraft): { payload: { provider: string; baseUrl?: string; apiKey?: string }; usesSavedConfig: boolean } => {
    const baseUrl = current.baseUrl.trim();
    const apiKey = current.apiKeyDraft.trim();
    const savedBaseUrl = record?.baseUrl || preset.defaultBaseUrl || '';
    const payload: { provider: string; baseUrl?: string; apiKey?: string } = { provider: preset.id };
    if (baseUrl !== savedBaseUrl) payload.baseUrl = baseUrl;
    if (apiKey) payload.apiKey = apiKey;
    return { payload, usesSavedConfig: payload.baseUrl === undefined && payload.apiKey === undefined };
  };

  const onFetchModels = async (preset: ProviderPreset, record: SavedProvider | undefined, current: ProviderDraft): Promise<void> => {
    if (busy || !canWrite()) return;
    setBusy('models');
    setNotice(null);
    const hasPreset = preset.presetModels.length > 0;
    const lead = hasPreset ? '自动获取失败，已显示预置清单' : '自动获取失败，可点「手动添加」填写模型 ID';
    try {
      const result = await agentServiceApi.fetchModels(effectivePayload(preset, record, current).payload);
      if (result.ok) {
        update(preset, record, (d) => ({ options: fetchedOptions(preset, d, result.models), manualOpen: false }));
        const dropped = current.model && !result.models.includes(current.model);
        setNotice({ providerId: preset.id, tone: 'info', text: `已获取 ${result.models.length} 个模型${dropped ? '；当前模型不在列表里，可重新选择' : ''}` });
        return;
      }
      update(preset, record, (d) => ({ options: fallbackOptions(preset, d) }));
      setNotice({ providerId: preset.id, tone: 'error', text: `${lead}：${result.message}` });
    } catch (error) {
      update(preset, record, (d) => ({ options: fallbackOptions(preset, d) }));
      setNotice({ providerId: preset.id, tone: 'error', text: `${lead}：${errorText(error, '请稍后重试')}` });
    } finally {
      setBusy(null);
    }
  };

  const onTest = async (preset: ProviderPreset, record: SavedProvider | undefined, current: ProviderDraft): Promise<void> => {
    if (busy || !canWrite()) return;
    setBusy('test');
    setTestFeedback(null);
    const { payload, usesSavedConfig } = effectivePayload(preset, record, current);
    try {
      const result = await agentServiceApi.testConnection({ ...payload, model: current.model });
      setTestFeedback({ providerId: preset.id, ...result });
      if (usesSavedConfig) {
        // 服务器此时才把结果记进状态：同步进来，并解除「配置已变更」标记
        await refreshAgentService();
        update(preset, record, (d) => (d.configChanged ? { configChanged: false } : {}));
      }
    } catch (error) {
      setTestFeedback({ providerId: preset.id, ok: false, latencyMs: null, model: current.model, message: errorText(error, '测试失败，请重试') });
    } finally {
      setBusy(null);
    }
  };

  const onSave = async (preset: ProviderPreset, record: SavedProvider | undefined, current: ProviderDraft): Promise<void> => {
    if (busy || !canWrite()) return;
    setBusy('save');
    const apiKey = current.apiKeyDraft.trim();
    const baseUrl = current.baseUrl.trim();
    try {
      const next = await saveAgentProvider({
        provider: preset.id,
        enabled: true,
        baseUrl,
        ...(apiKey ? { apiKey } : {}),
        models: current.options.map((option) => option.value),
        model: current.model,
      });
      const savedNext = next.providers[preset.id];
      // 保存成功：草稿整体换成基于服务器最新状态的新草稿——刚输入的密钥随即从组件内存清掉
      const fresh = createDraft(preset, savedNext);
      fresh.configChanged = record?.status != null && (apiKey !== '' || baseUrl !== record.baseUrl);
      setDrafts((prev) => ({ ...prev, [preset.id]: fresh }));
      setTestFeedback(null);
      const activeModel = next.active && next.active.provider === preset.id ? next.active.model : '';
      message.success(activeModel ? `${preset.name} 已保存，下次 Agent 运行即使用 ${activeModel}` : `${preset.name} 已保存`);
    } catch (error) {
      message.error(`保存失败：${errorText(error, '请稍后重试')}`);
    } finally {
      setBusy(null);
    }
  };

  const onMakeActive = async (preset: ProviderPreset, record: SavedProvider): Promise<void> => {
    if (busy || !canWrite()) return;
    setBusy('activate');
    try {
      await setActiveModel({ provider: preset.id, model: record.model });
      message.success(`已设为当前模型：${preset.name} · ${record.model}，下次 Agent 运行生效`);
    } catch (error) {
      message.error(`设置失败：${errorText(error, '请稍后重试')}`);
    } finally {
      setBusy(null);
    }
  };

  /** 删除这家在本机保存的配置（连同密钥）；它若正是当前模型，服务器一并取消 */
  const onRemove = async (preset: ProviderPreset): Promise<void> => {
    if (busy || !canWrite()) return;
    setBusy('remove');
    try {
      await saveAgentProvider({ provider: preset.id, remove: true });
      setDrafts((prev) => {
        const rest = { ...prev };
        delete rest[preset.id];
        return rest;
      });
      setTestFeedback(null);
      message.success(`${preset.name} 的配置与密钥已从本机删除`);
    } catch (error) {
      message.error(`删除失败：${errorText(error, '请稍后重试')}`);
    } finally {
      setBusy(null);
    }
  };

  /** 取消当前模型：Agent 回到本地确定性引擎，不再调用模型服务 */
  const onUseLocalEngine = async (): Promise<void> => {
    if (busy || !canWrite()) return;
    setBusy('local');
    try {
      await setActiveModel(null);
      message.success('已改用本地引擎：Agent 仍可回答，不再调用模型服务');
    } catch (error) {
      message.error(`设置失败：${errorText(error, '请稍后重试')}`);
    } finally {
      setBusy(null);
    }
  };

  const addManualModel = (preset: ProviderPreset, record: SavedProvider | undefined, current: ProviderDraft): void => {
    const id = current.manualText.trim();
    if (!id) return;
    const exists = current.options.some((option) => option.value === id);
    update(preset, record, (d) => ({
      model: id,
      manualOpen: false,
      manualText: '',
      options: exists ? d.options : [...d.options, { value: id, label: id, source: 'custom' }],
    }));
    setNotice(null);
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // 方向键只在可配置的服务商之间移动（上下 / 右左 同义；纵向 tablist）
    const order = visible.filter(isConfigurablePreset);
    if (!order.length) return;
    const current = Math.max(0, order.findIndex((preset) => preset.id === selected?.id));
    let next = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % order.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (current - 1 + order.length) % order.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = order.length - 1;
    else return;
    const target = order[next];
    if (!target) return;
    event.preventDefault();
    setSelectedId(target.id);
    document.getElementById(tabIdOf(target.id))?.focus();
  };

  if (!data) {
    return (
      <div style={{ ...bridgeStyle, padding: space.xl, textAlign: 'center' }}>
        {snapshot.error ? (
          <>
            <div role="alert" style={{ ...bodyStyle, color: color.error }}>读取模型服务配置失败：{snapshot.error}</div>
            <Button style={{ marginTop: space.sm }} loading={snapshot.loading} onClick={() => { void loadAgentService({ force: true }); }}>重试</Button>
          </>
        ) : (
          <div style={{ ...bodyStyle, color: color.mute }}>正在读取模型服务配置…</div>
        )}
      </div>
    );
  }

  const activeUsable = data.active && data.providers[data.active.provider]?.enabled ? data.active : null;
  const activePreset = activeUsable ? findPreset(presets, activeUsable.provider) : null;
  const isActive = !!selected && !!activeUsable && activeUsable.provider === selected.id;
  const configurable = !!selected && isConfigurablePreset(selected);
  const keyMode = selected ? apiKeyModeOf(selected) : 'none';
  const baseAddress = selected ? saved?.baseUrl || selected.defaultBaseUrl || '' : '';
  const baseModel = saved?.model || '';
  const dirty = !!draft && (draft.apiKeyDraft.trim() !== '' || draft.baseUrl.trim() !== baseAddress || draft.model !== baseModel);

  // 必填项：按字段顺序收集原因，按钮禁用时原样写在按钮旁
  const missing: string[] = [];
  if (!canEdit) missing.push(viewerHint);
  // 必填密钥且服务器上也没有：拉模型列表同样需要密钥，一并禁用
  const keyMissing = keyMode === 'required' && !saved?.hasKey && !draft?.apiKeyDraft.trim();
  if (keyMissing) missing.push('请先填写 API Key');
  if (draft && !draft.baseUrl.trim()) missing.push('请先填写服务地址');
  if (!draft?.model) missing.push('请先选择模型');
  const busyReason = busy === 'models' ? '正在获取模型列表…'
    : busy === 'test' ? '正在测试连接…'
      : busy === 'save' ? '正在保存…'
        : busy === 'activate' ? '正在设置当前模型…' : '';
  const formReady = missing.length === 0 && busy === null;

  // 「设为当前模型」作用于已保存的那份配置：未保存 / 有未保存修改 / 已停用时都写明原因
  const activateReason = !saved ? '请先保存'
    : !saved.enabled ? '该服务商已停用，保存后重新启用'
      : dirty ? '请先保存修改'
        : busy ? busyReason : '';
  // 已经是当前使用的那家且模型一致时不再显示该动作（头部有「当前使用中」）
  const showActivate = configurable && !!saved && !(isActive && activeUsable?.model === saved.model);

  const reasons = [...missing];
  if (!missing.length && busyReason) reasons.push(busyReason);
  if (showActivate && activateReason && !reasons.includes(activateReason)) reasons.push(activateReason);
  const reasonText = reasons.join('；');

  const view = statusView(saved, draft?.configChanged ?? false);
  const keyInputId = `${AGENT_SERVICE_BLOCK_ID}-key-${selected?.id ?? ''}`;
  const modelInputId = `${AGENT_SERVICE_BLOCK_ID}-model-${selected?.id ?? ''}`;
  const baseUrlInputId = `${AGENT_SERVICE_BLOCK_ID}-url-${selected?.id ?? ''}`;
  const providerNotice = selected ? noticeFor(selected.id) : null;
  const feedback = selected ? feedbackFor(selected.id) : null;
  const docsUrl = selected?.docsUrl;

  return (
    <div style={bridgeStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, flexWrap: 'wrap', marginBottom: space.md }}>
        <span style={bodyStyle}>
          当前模型：
          <span style={{ color: color.ink, fontWeight: 600 }}>
            {activePreset && activeUsable ? `${activePreset.name} · ${activeUsable.model}` : '本地引擎（未配置模型服务）'}
          </span>
        </span>
        <span style={captionStyle}>
          已配置 {presets.filter((preset) => data.providers[preset.id] != null).length} / {presets.filter(isConfigurablePreset).length} 家 · 可同时启用多家 · 密钥只存本机服务器
        </span>
      </div>

      <div className="lpl-agent-service">
        {/* 左：服务商列表（纵向 tablist；上下方向键在可配置的服务商间移动） */}
        <div className="lpl-agent-service-list">
          <Input
            allowClear
            prefix={<SearchOutlined aria-hidden style={{ color: color.mute }} />}
            aria-label="搜索服务商"
            placeholder="搜索服务商或模型"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="lpl-agent-service-tabs" role="tablist" aria-label="模型服务商" aria-orientation="vertical" onKeyDown={onListKeyDown}>
            {visible.map((preset) => {
              const record = data.providers[preset.id];
              const status = configStatusOf(record);
              const isSelected = preset.id === selected?.id;
              const active = !!activeUsable && activeUsable.provider === preset.id;
              return (
                <button
                  type="button"
                  key={preset.id}
                  id={tabIdOf(preset.id)}
                  role="tab"
                  className="lpl-agent-service-item"
                  aria-selected={isSelected}
                  aria-controls={panelId}
                  tabIndex={isSelected ? 0 : -1}
                  title={!isConfigurablePreset(preset) ? '即将支持，暂不可配置' : undefined}
                  onClick={() => setSelectedId(preset.id)}
                >
                  <ProviderBadge preset={preset} />
                  <span className="lpl-agent-service-item-name">{preset.name}</span>
                  {active ? (
                    <span style={{ ...chipStyle, flexShrink: 0 }}>使用中</span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space.xs, flexShrink: 0, fontSize: fontSize.caption, color: status === 'unconfigured' ? color.mute : undefined }}>
                      <ProviderStatusDot status={status} />
                      {preset.comingSoon ? '即将支持' : CONFIG_STATUS_SHORT_LABELS[status]}
                    </span>
                  )}
                </button>
              );
            })}
            {!visible.length && <div style={{ ...captionStyle, padding: space.sm }}>没有匹配的服务商</div>}
          </div>
        </div>

        {/* 右：所选服务商的配置区 */}
        {selected && draft && (
          <div id={panelId} role="tabpanel" aria-labelledby={tabIdOf(selected.id)} className="lpl-agent-service-detail">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                <ProviderBadge preset={selected} size={24} />
                <h4 style={{ margin: 0, fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>{selected.name}</h4>
                {isActive && <span style={chipStyle}>当前使用中</span>}
                {selected.comingSoon && <span style={{ ...chipStyle, color: color.mute, background: color.canvasSoft2 }}>即将支持</span>}
              </div>
              <div style={{ ...bodyStyle, marginTop: space.xs }}>{providerSummaryOf(selected)}</div>
              {docsUrl && (
                <div style={{ display: 'flex', gap: space.base, marginTop: space.sm, flexWrap: 'wrap' }}>
                  <a className="lpl-agent-service-link" href={docsUrl} target="_blank" rel="noreferrer">官方文档</a>
                  {keyMode === 'required' && (
                    <a className="lpl-agent-service-link" href={docsUrl} target="_blank" rel="noreferrer" title="前往服务商网站获取 API Key（跳转官方文档）">获取 API Key</a>
                  )}
                </div>
              )}
            </div>

            {!configurable ? (
              <div role="status" style={{ padding: space.md, border: `1px solid ${color.hairline}`, borderRadius: radius.control, background: color.canvasSoft, ...bodyStyle }}>
                该服务商即将支持，暂不可配置。
              </div>
            ) : (
              <div className="lpl-agent-service-body">
                <div className="lpl-agent-service-form">
                  {/* 2. API Key */}
                  <div className="lpl-agent-service-row">
                    <label htmlFor={keyInputId}>
                      API Key
                      {keyMode === 'optional' && <span style={{ marginLeft: space.xs, fontSize: fontSize.caption, fontWeight: 400, color: color.mute }}>可选</span>}
                    </label>
                    {keyMode === 'none' ? (
                      <div style={{ ...bodyStyle, paddingTop: space.xs }}>本机服务，无需密钥</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs, minWidth: 0 }}>
                        {saved?.hasKey && !draft.keyInputOpen ? (
                          <div className="lpl-agent-service-controls">
                            <Input
                              id={keyInputId}
                              readOnly
                              disabled
                              value="••••••••••••"
                              aria-label="API Key（已保存，不显示明文）"
                              style={{ width: KEY_INPUT_WIDTH, maxWidth: '100%' }}
                            />
                            <Button disabled={!canEdit} onClick={() => update(selected, saved, () => ({ keyInputOpen: true, keyVisible: false }))}>更换</Button>
                          </div>
                        ) : (
                          <>
                            <div className="lpl-agent-service-controls">
                              <Input.Password
                                id={keyInputId}
                                value={draft.apiKeyDraft}
                                onChange={(event) => update(selected, saved, () => ({ apiKeyDraft: event.target.value }))}
                              placeholder={saved?.hasKey ? '输入新的 API Key' : keyMode === 'optional' ? '服务商要求鉴权时填写' : '粘贴 API Key'}
                              // 不进密码管理器：关闭自动填充与拼写纠正；输入框不在 <form> 里、不命名，
                              // 浏览器不会把它当登录密码保存（也不用 new-password——那会弹「建议强密码」）
                              autoComplete="off"
                              autoCapitalize="off"
                              autoCorrect="off"
                              spellCheck={false}
                              disabled={!canEdit}
                                visibilityToggle={{ visible: draft.keyVisible, onVisibleChange: (keyVisible) => update(selected, saved, () => ({ keyVisible })) }}
                                style={{ width: KEY_INPUT_WIDTH, maxWidth: '100%' }}
                              />
                              {saved?.hasKey && (
                                <Button disabled={!canEdit} onClick={() => update(selected, saved, () => ({ keyInputOpen: false, apiKeyDraft: '', keyVisible: false }))}>取消</Button>
                              )}
                            </div>
                            {saved?.hasKey && <div style={captionStyle}>留空保存 = 保留已保存的密钥；输入新密钥后保存即覆盖。</div>}
                          </>
                        )}
                        <div style={captionStyle}>密钥只保存在本机服务器，不写入浏览器存储；保存后不再显示。</div>
                      </div>
                    )}
                  </div>

                  {/* 4. 模型：下拉选择器（获取列表填充 / 手动添加） */}
                  <div className="lpl-agent-service-row">
                    <label htmlFor={modelInputId}>模型</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: space.xs, minWidth: 0 }}>
                      <div className="lpl-agent-service-controls">
                        <Select
                          id={modelInputId}
                          showSearch
                          style={{ width: MODEL_SELECT_WIDTH, maxWidth: '100%' }}
                          placeholder={draft.options.length ? '选择模型' : '暂无模型：请获取列表或手动添加'}
                          disabled={!canEdit}
                          value={draft.model || undefined}
                          options={draft.options}
                          filterOption={(input, option) => `${option?.value ?? ''} ${option?.label ?? ''}`.toLocaleLowerCase().includes(input.trim().toLocaleLowerCase())}
                          optionRender={(option) => {
                            const item = option.data as ModelOption;
                            return (
                              <span style={{ display: 'flex', alignItems: 'baseline', gap: space.sm, minWidth: 0 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                                {item.label !== item.value && <span style={{ ...captionStyle, fontFamily: font.mono }}>{item.value}</span>}
                                <span style={{ ...captionStyle, marginLeft: 'auto', flexShrink: 0 }}>{SOURCE_LABELS[item.source]}</span>
                              </span>
                            );
                          }}
                          notFoundContent="没有匹配的模型"
                          listHeight={256}
                          onChange={(value: string) => update(selected, saved, () => ({ model: value }))}
                        />
                        {selected.fetchModels && (
                          <Button icon={<SyncOutlined aria-hidden />} loading={busy === 'models'} disabled={!canEdit || busy !== null || keyMissing} onClick={() => void onFetchModels(selected, saved, draft)}>获取模型列表</Button>
                        )}
                        <Button type="link" size="small" icon={!draft.manualOpen && <PlusOutlined aria-hidden />} aria-expanded={draft.manualOpen} disabled={!canEdit || busy !== null} onClick={() => update(selected, saved, (d) => ({ manualOpen: !d.manualOpen, manualText: '' }))}>手动添加</Button>
                      </div>
                      {draft.manualOpen && (
                        <div className="lpl-agent-service-controls">
                          <Input
                            aria-label="模型 ID"
                            placeholder="输入模型 ID，例如 gpt-4o-mini"
                            value={draft.manualText}
                            disabled={!canEdit}
                            onChange={(event) => update(selected, saved, () => ({ manualText: event.target.value }))}
                            onPressEnter={() => addManualModel(selected, saved, draft)}
                            style={{ width: MODEL_SELECT_WIDTH, maxWidth: '100%' }}
                          />
                          <Button disabled={!canEdit} onClick={() => addManualModel(selected, saved, draft)}>添加</Button>
                          <Button type="text" disabled={!canEdit} onClick={() => update(selected, saved, () => ({ manualOpen: false, manualText: '' }))}>取消</Button>
                        </div>
                      )}
                      {providerNotice && (
                        <div role={providerNotice.tone === 'error' ? 'alert' : 'status'} style={{ ...captionStyle, color: providerNotice.tone === 'error' ? color.error : color.mute }}>
                          {providerNotice.text}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. 服务地址：收在「高级设置」里；自定义服务商必填，默认展开 */}
                  <details
                    className="lpl-agent-service-advanced"
                    open={draft.advancedOpen}
                    onToggle={(event) => {
                      if (event.currentTarget.open !== draft.advancedOpen) update(selected, saved, () => ({ advancedOpen: event.currentTarget.open }));
                    }}
                  >
                    <summary><RightOutlined aria-hidden />高级设置</summary>
                    <div className="lpl-agent-service-row">
                      <label htmlFor={baseUrlInputId}>服务地址</label>
                      <div style={{ minWidth: 0 }}>
                        <Input
                          id={baseUrlInputId}
                          value={draft.baseUrl}
                          onChange={(event) => update(selected, saved, () => ({ baseUrl: event.target.value }))}
                          placeholder="https://example.com/v1"
                          autoComplete="off"
                          disabled={!canEdit}
                          style={{ width: 480, maxWidth: '100%' }}
                        />
                        <div style={{ ...captionStyle, marginTop: space.xs }}>OpenAI 兼容地址，通常以 /v1 结尾；服务器会在其后拼接 /models 与 /chat/completions。</div>
                        {selected.custom && !draft.baseUrl.trim() && <div style={{ ...captionStyle, color: color.error }}>自定义服务商必须填写服务地址。</div>}
                      </div>
                    </div>
                  </details>

                  {/* 5. 按钮区：禁用时在旁边写出原因 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                    <Button loading={busy === 'test'} disabled={!formReady} onClick={() => void onTest(selected, saved, draft)}>测试连接</Button>
                    <Button type="primary" loading={busy === 'save'} disabled={!formReady} onClick={() => void onSave(selected, saved, draft)}>保存</Button>
                    {showActivate && (
                      <Button
                        loading={busy === 'activate'}
                        disabled={!writable || !!activateReason}
                        title={activateReason || `把 ${saved!.model} 设为当前模型`}
                        onClick={() => void onMakeActive(selected, saved!)}
                      >
                        设为当前模型
                      </Button>
                    )}
                    {reasonText && (
                      <span role="status" style={{ ...captionStyle, color: missing.length ? color.warningInk : color.mute }}>{reasonText}</span>
                    )}
                  </div>
                  {feedback && (
                    feedback.ok ? (
                      <div role="status" style={{ ...bodyStyle, color: color.ink }}>
                        <CheckOutlined aria-hidden style={{ color: color.alert.evidence.verified, marginRight: space.xs }} />
                        连接成功 · {feedback.latencyMs ?? '—'} ms · {feedback.model}
                      </div>
                    ) : (
                      <div role="alert" style={{ ...bodyStyle, color: color.error }}>
                        <CloseCircleOutlined aria-hidden style={{ marginRight: space.xs }} />
                        连接失败：{feedback.message}
                      </div>
                    )
                  )}

                  {/* 6. 状态区：未配置 / 已保存未测试 / 已连接 / 连接失败（+ 已停用），「当前使用中」另标 */}
                  <div style={{ borderTop: `1px solid ${color.hairline}`, paddingTop: space.md, display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', gap: space.sm, alignItems: 'start' }}>
                    <span style={{ ...bodyStyle, paddingTop: space.xs }}>状态</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: space.xs, flexWrap: 'wrap', ...bodyStyle, color: color.ink }}>
                        <ProviderStatusDot status={view.status} />
                        <span style={{ fontWeight: 600 }}>{view.title}</span>
                        {view.detail && (
                          <span style={{ color: view.status === 'failed' ? color.error : color.body, overflowWrap: 'anywhere' }}>
                            {view.status === 'failed' ? '：' : ' · '}{view.detail}
                          </span>
                        )}
                      </div>
                      {view.hint && <div style={captionStyle}>{view.hint}</div>}
                      {isActive && activeUsable?.model !== saved?.model && (
                        <div style={captionStyle}>当前使用的模型：{activeUsable?.model}；点「设为当前模型」可改为上面选中的模型。</div>
                      )}
                      {saved && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap', marginTop: space.xs }}>
                          {isActive && (
                            <Button type="link" size="small" loading={busy === 'local'} disabled={!writable} onClick={() => void onUseLocalEngine()} style={{ padding: 0, height: 'auto' }}>
                              改用本地引擎
                            </Button>
                          )}
                          <Popconfirm
                            title="删除这家在本机保存的配置？"
                            description="密钥会一并删除。Agent 仍可用本地引擎回答。"
                            okText="删除"
                            okButtonProps={{ danger: true }}
                            cancelText="取消"
                            disabled={!writable}
                            onConfirm={() => void onRemove(selected)}
                          >
                            <Button type="link" size="small" danger loading={busy === 'remove'} disabled={!writable} style={{ padding: 0, height: 'auto' }}>
                              删除配置
                            </Button>
                          </Popconfirm>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* 右侧静态说明：宽屏下与表单并排，回答「模型负责什么 / 何时生效 / 密钥在哪」 */}
                <aside className="lpl-agent-service-notes" aria-label="模型服务说明">
                  <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: space.md }}>
                    {MODEL_SERVICE_NOTES.map(([term, text]) => (
                      <div key={term}>
                        <dt style={{ fontSize: fontSize.bodySm, fontWeight: 600, lineHeight: '20px', color: color.ink }}>{term}</dt>
                        <dd style={{ margin: 0, fontSize: fontSize.caption, lineHeight: '18px', color: color.mute }}>{text}</dd>
                      </div>
                    ))}
                  </dl>
                </aside>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
