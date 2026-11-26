// ============================================================
// Agent 模型服务 · 供应商预置注册表（前端侧唯一读取入口）
//  - 预置清单单一来源：providers.generated.json（models.dev 生成，禁止手改——
//    改 scripts/gen_provider_presets.mjs 的 SPEC 后重跑 npm run providers:gen）。
//    配置界面优先用服务器 GET /api/agent/providers 返回的 presets，本地 JSON 提供
//    类型、稳定排序与服务器缺项时的兜底。
//  - 本文件是纯数据模块（无 React、无网络）：类型、按 id 查找、搜索过滤、
//    徽标首字母与身份色映射、状态文字。
//  - 徽标色 = 身份标识（同品牌色点的性质），取 brandColorOf(providerId)（品牌扩展
//    色板的稳定哈希，不新增颜色）；与状态色（link / error / mute）互不混用，
//    状态永远另有文字。设计口径见 .impeccable/surfaces/agent-model-service.md
// ============================================================
import generated from './providers.generated.json';
import { brandColorOf, color } from '../theme/tokens';

export type ProviderProtocol = 'openai-compatible' | 'anthropic';
export type ModelCapability = 'vision' | 'reasoning' | 'tools';

export interface ProviderPresetModel {
  id: string;
  label: string;
  capabilities: ModelCapability[];
  contextWindow?: number;
  releaseDate?: string;
}

/** 与 providers.generated.json 的对象同构；服务器 GET /api/agent/providers 的 presets 也是这个形态 */
export interface ProviderPreset {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  defaultBaseUrl: string;
  baseUrlSource: string;
  requiresKey: boolean;
  optionalKey?: boolean;
  docsUrl?: string;
  presetModels: ProviderPresetModel[];
  fetchModels: boolean;
  local?: boolean;
  custom?: boolean;
  comingSoon?: boolean;
  extraBody?: Record<string, unknown>;
}

export type ProviderStatus = 'connected' | 'failed';

/** 服务器已保存的某家配置——服务器永不返回密钥明文，只有 hasKey */
export interface SavedProvider {
  enabled: boolean;
  baseUrl: string;
  models: string[];
  /** 这家默认使用的模型（配置页表单里的选中项） */
  model: string;
  status?: ProviderStatus;
  testedAt?: string;
  latencyMs?: number | null;
  lastError?: string;
  hasKey: boolean;
}

export interface ActiveModel {
  provider: string;
  model: string;
}

/** GET /api/agent/providers 与所有写接口的返回体 */
export interface AgentServiceState {
  service: string;
  active: ActiveModel | null;
  presets: ProviderPreset[];
  providers: Record<string, SavedProvider>;
}

/** 配置页分块锚点 id：Config.tsx 的 Block 与 Agent 面板「管理模型服务…」跳转共用 */
export const AGENT_SERVICE_BLOCK_ID = 'agent-service';
export const CUSTOM_PROVIDER_ID = 'custom';

// ---------------- 预置读取与校验 ----------------

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

/** 宽松校验一条预置：缺必填 id / name 的条目丢弃；数组字段缺失补空（服务器与本地 JSON 共用） */
function coercePreset(raw: unknown): ProviderPreset | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id).trim();
  const name = str(r.name).trim();
  if (!id || !name) return null;
  const models = Array.isArray(r.presetModels)
    ? r.presetModels.flatMap((item): ProviderPresetModel[] => {
      if (item == null || typeof item !== 'object') return [];
      const m = item as Record<string, unknown>;
      const modelId = str(m.id).trim();
      if (!modelId) return [];
      return [{
        id: modelId,
        label: str(m.label, modelId),
        capabilities: (Array.isArray(m.capabilities) ? m.capabilities : []).filter(
          (c): c is ModelCapability => c === 'vision' || c === 'reasoning' || c === 'tools',
        ),
        ...(typeof m.contextWindow === 'number' ? { contextWindow: m.contextWindow } : {}),
        ...(typeof m.releaseDate === 'string' ? { releaseDate: m.releaseDate } : {}),
      }];
    })
    : [];
  return {
    id,
    name,
    protocol: r.protocol === 'anthropic' ? 'anthropic' : 'openai-compatible',
    defaultBaseUrl: str(r.defaultBaseUrl),
    baseUrlSource: str(r.baseUrlSource),
    requiresKey: r.requiresKey === true,
    ...(r.optionalKey != null ? { optionalKey: r.optionalKey === true } : {}),
    ...(typeof r.docsUrl === 'string' && r.docsUrl ? { docsUrl: r.docsUrl } : {}),
    presetModels: models,
    fetchModels: r.fetchModels !== false,
    ...(r.local === true ? { local: true } : {}),
    ...(r.custom === true ? { custom: true } : {}),
    ...(r.comingSoon === true ? { comingSoon: true } : {}),
    ...(r.extraBody != null && typeof r.extraBody === 'object' && !Array.isArray(r.extraBody)
      ? { extraBody: r.extraBody as Record<string, unknown> }
      : {}),
  };
}

/** 本地 JSON 预置（按生成顺序；custom 恒在最后） */
export const LOCAL_PROVIDER_PRESETS: readonly ProviderPreset[] = (generated.providers as unknown[])
  .map(coercePreset)
  .filter((preset): preset is ProviderPreset => preset != null);

/** 稳定排序：本地预置顺序为准，服务器新增而本地没有的排在其后，自定义恒排最后 */
export function sortPresets(presets: readonly ProviderPreset[]): ProviderPreset[] {
  const rankOf = (id: string): number => {
    const index = LOCAL_PROVIDER_PRESETS.findIndex((preset) => preset.id === id);
    return index < 0 ? LOCAL_PROVIDER_PRESETS.length : index;
  };
  const seen = new Set<string>();
  const unique: ProviderPreset[] = [];
  for (const preset of presets) {
    if (seen.has(preset.id)) continue;
    seen.add(preset.id);
    unique.push(preset);
  }
  return unique.sort((a, b) => {
    const customDelta = Number(a.custom === true) - Number(b.custom === true);
    if (customDelta !== 0) return customDelta;
    return rankOf(a.id) - rankOf(b.id) || a.id.localeCompare(b.id);
  });
}

/** 服务器 presets 为主；服务器缺的条目用本地预置补齐（两端版本暂时不一致时不至于少一家） */
export function mergePresets(serverPresets: readonly ProviderPreset[] | undefined): ProviderPreset[] {
  const server = (serverPresets ?? []).map(coercePreset).filter((preset): preset is ProviderPreset => preset != null);
  const ids = new Set(server.map((preset) => preset.id));
  return sortPresets([...server, ...LOCAL_PROVIDER_PRESETS.filter((preset) => !ids.has(preset.id))]);
}

export function findPreset(presets: readonly ProviderPreset[], id: string): ProviderPreset | null {
  return presets.find((preset) => preset.id === id) ?? null;
}

/** 即将支持的占位（如 Anthropic）在列表里可见但不可配置 */
export function isConfigurablePreset(preset: ProviderPreset): boolean {
  return preset.comingSoon !== true;
}

/** 密钥字段形态：必填 / 可选（自定义）/ 不显示（本机服务） */
export function apiKeyModeOf(preset: ProviderPreset): 'required' | 'optional' | 'none' {
  if (preset.requiresKey) return 'required';
  if (preset.custom) return 'optional';
  return 'none';
}

// ---------------- 搜索 ----------------

/** 常见别名词（名称与模型 ID 之外的帮助词）；模型 ID / 型号名本身也参与匹配 */
const PROVIDER_SEARCH_ALIASES: Record<string, readonly string[]> = {
  zhipu: ['glm', 'bigmodel', '智谱', 'chatglm'],
  moonshot: ['kimi', '月之暗面'],
  deepseek: ['深度求索'],
  bailian: ['qwen', '通义', '千问', '阿里', '百炼', 'dashscope', 'aliyun'],
  siliconflow: ['硅基'],
  openai: ['gpt', 'chatgpt'],
  anthropic: ['claude'],
  openrouter: ['router'],
  ollama: ['llama', '本地'],
  lmstudio: ['lm studio', '本地'],
  custom: ['自定义', '兼容'],
};

function searchTextOf(preset: ProviderPreset): string {
  const models = preset.presetModels.map((model) => `${model.id} ${model.label}`).join(' ');
  const aliases = (PROVIDER_SEARCH_ALIASES[preset.id] ?? []).join(' ');
  return `${preset.id} ${preset.name} ${aliases} ${models}`.toLocaleLowerCase();
}

/** 可搜索过滤：空查询返回全部；多个词以空格分隔时须全部命中；顺序不变，自定义仍在最后 */
export function searchProviders(presets: readonly ProviderPreset[], query: string): ProviderPreset[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...presets];
  return presets.filter((preset) => {
    const text = searchTextOf(preset);
    return terms.every((term) => text.includes(term));
  });
}

// ---------------- 徽标（首字母 + 稳定色点） ----------------

/**
 * 供应商身份色：品牌扩展色板的稳定哈希（brandColorOf），同一 id 永远同一色。
 * 性质同品牌色点——只标识身份，不承载状态，也不作强调色。
 */
export function providerBadgeColorOf(providerId: string): string {
  return brandColorOf(providerId);
}

/** 徽标单字符：常见称呼的首字（智 / K / D / Q / 硅 / G / A / R / O / L / 自），彼此不重复 */
const PROVIDER_INITIALS: Record<string, string> = {
  zhipu: '智',
  moonshot: 'K',
  deepseek: 'D',
  bailian: 'Q',
  siliconflow: '硅',
  openai: 'G',
  anthropic: 'A',
  openrouter: 'R',
  ollama: 'O',
  lmstudio: 'L',
  custom: '自',
};

export function providerInitialOf(preset: ProviderPreset): string {
  const curated = PROVIDER_INITIALS[preset.id];
  if (curated) return curated;
  const latin = preset.name.match(/[A-Za-z]/);
  return (latin ? latin[0] : preset.name[0] ?? preset.id[0] ?? '?').toLocaleUpperCase();
}

// ---------------- 一句话说明 ----------------

const PROVIDER_SUMMARIES: Record<string, string> = {
  zhipu: 'GLM 系列，OpenAI 兼容接口。',
  moonshot: 'Kimi 系列，OpenAI 兼容接口。',
  deepseek: 'DeepSeek 系列，OpenAI 兼容接口。',
  bailian: '阿里云百炼上的通义千问系列，OpenAI 兼容接口。',
  siliconflow: '聚合多家开源模型的推理平台，OpenAI 兼容接口。',
  openai: 'GPT 系列，OpenAI 兼容接口。',
  anthropic: 'Claude 系列，Anthropic 协议尚未适配。',
  openrouter: '聚合多家模型的统一入口，OpenAI 兼容接口。',
  ollama: '本机 Ollama 服务，无需密钥；需先启动 Ollama 并拉取模型。',
  lmstudio: '本机 LM Studio 服务，无需密钥；需先在 LM Studio 里启动本地服务器。',
  custom: '任何 OpenAI 兼容服务：填写服务地址与模型即可。',
};

export function providerSummaryOf(preset: ProviderPreset): string {
  const curated = PROVIDER_SUMMARIES[preset.id];
  if (curated) return curated;
  if (preset.custom) return '自定义 OpenAI 兼容服务：填写服务地址与模型即可。';
  if (apiKeyModeOf(preset) === 'none') return '本机服务，无需密钥。';
  return preset.protocol === 'anthropic' ? 'Anthropic 协议。' : 'OpenAI 兼容接口。';
}

// ---------------- 状态语义（文字为主，色点为辅） ----------------

export type ProviderConfigStatus = 'unconfigured' | 'disabled' | 'saved' | 'connected' | 'failed';

export const CONFIG_STATUS_LABELS: Record<ProviderConfigStatus, string> = {
  unconfigured: '未配置',
  disabled: '已停用',
  saved: '已保存，尚未测试',
  connected: '已连接',
  failed: '连接失败',
};

/** 列表 / 状态区用短标签 */
export const CONFIG_STATUS_SHORT_LABELS: Record<ProviderConfigStatus, string> = {
  unconfigured: '未配置',
  disabled: '已停用',
  saved: '已配置',
  connected: '已配置',
  failed: '已配置',
};

export function configStatusOf(saved: SavedProvider | undefined): ProviderConfigStatus {
  if (!saved) return 'unconfigured';
  if (!saved.enabled) return 'disabled';
  if (saved.status === 'connected') return 'connected';
  if (saved.status === 'failed') return 'failed';
  return 'saved';
}

/**
 * 状态点颜色：状态永远另有文字，色点只是辅助。已连接 = 已核实语义的绿
 * （alert.evidence.verified），失败 = 红，已配置未测 = 蓝（选中 / 已配置语义），其余中性。
 */
export function statusDotColorOf(status: ProviderConfigStatus): string {
  if (status === 'connected') return color.alert.evidence.verified;
  if (status === 'failed') return color.error;
  if (status === 'saved') return color.link;
  return color.mute;
}

/** 测试时间：服务器给的是 ISO UTC，按本地时区显示到秒 */
export function formatTestedAt(iso: string | undefined | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false });
}

// ---------------- 面板选择器的可选模型 ----------------

export interface ModelChoice {
  preset: ProviderPreset;
  saved: SavedProvider;
  model: string;
}

/** 已启用服务商的全部可选模型，按服务商顺序分组排列（面板下拉与「当前模型」判定共用） */
export function modelChoicesOf(state: AgentServiceState, presets: readonly ProviderPreset[] = sortPresets(state.presets)): ModelChoice[] {
  const choices: ModelChoice[] = [];
  for (const preset of presets) {
    const saved = state.providers[preset.id];
    if (!saved?.enabled) continue;
    const models = saved.model && !saved.models.includes(saved.model) ? [saved.model, ...saved.models] : saved.models;
    for (const model of models) {
      if (model) choices.push({ preset, saved, model });
    }
  }
  return choices;
}
