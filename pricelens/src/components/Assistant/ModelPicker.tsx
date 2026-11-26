// ============================================================
// Agent 面板 · 模型选择器（输入框下方工具栏左侧）
//  - 只在本机服务器模式渲染（isServiceMode()）；离线 / 在线 Pages 模式不出现。
//  - 显示「供应商徽标 + 模型名 + 状态点」；下拉按服务商分组切换已启用的模型，
//    末项「管理模型服务…」跳到配置页对应分块。
//  - 未配置任何模型 = 警示态「本地引擎 · 未配置模型服务」，点击直达配置页。
//    发送按钮不禁用——Agent 有本地确定性引擎，没有模型也能回答（与通用规范的有意
//    差异）；说明只放在悬停提示里。
//  - 切换只发 POST /api/agent/active：不新建会话、不清输入、不中断进行中的运行；
//    结果由触发器文字变化直接表达，失败原因写在下拉内（不用 toast）。
//  设计口径：.impeccable/surfaces/agent-model-service.md
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown, type DropdownProps, type MenuProps } from 'antd';
import { CheckOutlined, DownOutlined, SettingOutlined, WarningOutlined } from '@ant-design/icons';
import ProviderBadge, { ProviderStatusDot } from '../../agentService/ProviderBadge';
import {
  AGENT_SERVICE_BLOCK_ID,
  CONFIG_STATUS_LABELS,
  configStatusOf,
  formatTestedAt,
  modelChoicesOf,
  sortPresets,
  type ModelChoice,
  type ProviderPreset,
  type SavedProvider,
} from '../../agentService/providers';
import { loadAgentService, setActiveModel, useAgentService } from '../../agentService/store';
import { isServiceMode } from '../../data/serviceMode';
import { usePage } from '../../state/PageContext';
import { color, fontSize, radius, shadow, space } from '../../theme/tokens';

/** 下拉末项「管理模型服务…」的 key（不与模型项冲突：模型项用数字下标） */
export const MODEL_MENU_MANAGE_KEY = '__manage__';

/** 未配置时发送按钮仍可用，原因写在这里（悬停提示），不靠禁用表达 */
export const UNCONFIGURED_HINT = '未配置模型服务时由本地引擎回答。配置模型服务后可获得结合看板的叙述增强。';

const MAX_MODEL_NAME_WIDTH = 220;

/** 下拉末尾的固定项：分隔线 + 「管理模型服务…」 */
const MANAGE_ITEMS: NonNullable<MenuProps['items']> = [
  { type: 'divider' },
  { key: MODEL_MENU_MANAGE_KEY, icon: <SettingOutlined aria-hidden />, label: '管理模型服务…' },
];

/** 配置页由状态驱动切换，分块 DOM 要到下一帧才出现：逐帧找，找到即滚进视野 */
export function scrollToAgentServiceBlock(maxFrames = 30): void {
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tries = 0;
  const step = (): void => {
    const el = document.getElementById(AGENT_SERVICE_BLOCK_ID);
    if (el) {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      }
      return;
    }
    tries += 1;
    if (tries < maxFrames) nextFrame(step);
  };
  nextFrame(step);
}

function statusTextOf(saved: SavedProvider | undefined): string {
  const status = configStatusOf(saved);
  if (status === 'connected') return `${CONFIG_STATUS_LABELS.connected} · ${saved?.latencyMs ?? '—'} ms · ${formatTestedAt(saved?.testedAt)}`;
  if (status === 'failed') return `${CONFIG_STATUS_LABELS.failed}：${saved?.lastError || '原因未知'}`;
  return CONFIG_STATUS_LABELS[status];
}

const choiceKey = (choice: ModelChoice): string => `${choice.preset.id}\u0000${choice.model}`;

/** 下一帧执行（无 rAF 的环境退回定时器） */
const nextFrame = (callback: () => void): number => (typeof window.requestAnimationFrame === 'function'
  ? window.requestAnimationFrame(callback)
  : window.setTimeout(callback, 16));
const cancelFrame = (handle: number): void => {
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(handle);
  else window.clearTimeout(handle);
};

export interface ModelPickerProps {
  /** 离开对话去配置页时收起面板（对话保留） */
  onLeave?: () => void;
  /** 选完模型后把焦点送回输入框，接着写下一个问题 */
  resumeFocus?: () => void;
}

/** 外层不含 Hook：非服务器模式直接不渲染， Hook 全在内层组件里 */
export default function ModelPicker({ onLeave, resumeFocus }: ModelPickerProps) {
  if (!isServiceMode()) return null;
  return <ServiceModelPicker onLeave={onLeave} resumeFocus={resumeFocus} />;
}

function ServiceModelPicker({ onLeave, resumeFocus }: ModelPickerProps) {
  const snapshot = useAgentService();
  const { go } = usePage();
  const [open, setOpen] = useState(false);
  const [switchingKey, setSwitchingKey] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // antd 在菜单 onClick 之后会同步请求关闭下拉；切换是否在途要用同步可读的 ref 拦
  const switchingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const resumeFocusRef = useRef(resumeFocus);
  resumeFocusRef.current = resumeFocus;
  /** 关闭后把焦点还给谁：选完模型回到输入框，其余情况回到触发器；null = 不接管 */
  const focusAfterCloseRef = useRef<'composer' | 'trigger' | null>(null);
  /** 本组件已主动发起收起（同一轮事件里 antd 跟着的关闭请求不再重复处理） */
  const closeIntentRef = useRef(false);
  const wasOpenRef = useRef(false);

  // 首挂载：没有缓存才请求（5 秒内反复开合面板直接用缓存）
  useEffect(() => { void loadAgentService(); }, []);

  // 打开后把焦点交给菜单里的当前项：键盘从此可用（方向键在菜单内移动，Enter 选择，Esc 关闭）。
  // 浮层带入场动画，DOM 可能晚一两帧，最多等 12 帧。
  useEffect(() => {
    if (!open) return undefined;
    let frames = 0;
    let handle = 0;
    const step = (): void => {
      const items = [...(popupRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
      const target = items.find((item) => item.querySelector('.anticon-check')) ?? items[0];
      if (target) { target.focus(); return; }
      frames += 1;
      if (frames <= 12) handle = nextFrame(step);
    };
    handle = nextFrame(step);
    return () => cancelFrame(handle);
  }, [open]);

  // 关闭后按约定归还焦点；只有焦点原本在触发器 / 浮层里才接管（点到别处时不抢）
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open || !wasOpen) return;
    closeIntentRef.current = false;
    const target = focusAfterCloseRef.current;
    focusAfterCloseRef.current = null;
    if (!target) return;
    if (target === 'composer' && resumeFocusRef.current) {
      resumeFocusRef.current();
      // 焦点已经落到输入框就到此为止；输入框不在了（焦点落空回到 body）再退回触发器
      if (document.activeElement !== document.body) return;
    }
    triggerRef.current?.focus();
  }, [open]);

  /** 焦点此刻是否在触发器或浮层里 */
  const focusIsHere = (): boolean => {
    const active = document.activeElement;
    return active === triggerRef.current || (active != null && (popupRef.current?.contains(active) ?? false));
  };

  const data = snapshot.data;
  const choices = useMemo(() => (data ? modelChoicesOf(data, sortPresets(data.presets)) : []), [data]);
  const activeChoice = useMemo(() => {
    const active = data?.active;
    return active ? choices.find((choice) => choice.preset.id === active.provider && choice.model === active.model) ?? null : null;
  }, [choices, data]);
  const activeProvider: ProviderPreset | null = activeChoice?.preset ?? null;
  const activeSaved: SavedProvider | undefined = activeChoice?.saved;

  /** 由本组件主动收起下拉，并约定关闭后焦点去哪（null = 不接管） */
  const closeDropdown = (focus: 'composer' | 'trigger' | null): void => {
    closeIntentRef.current = true;
    focusAfterCloseRef.current = focus;
    setOpen(false);
  };

  const openManager = (): void => {
    // 面板马上收起，组件卸载，不需要再归还焦点
    closeDropdown(null);
    // 面板收起（对话保留），把配置页完整让出来；再切页并滚到分块
    onLeave?.();
    go('config');
    scrollToAgentServiceBlock();
  };

  const onOpenChange: DropdownProps['onOpenChange'] = (next, info) => {
    // antd 在菜单 onClick 之后会紧跟一次「点了菜单项」的关闭请求：
    // 切换在途时先不关（失败时原因要留在下拉里给人看）；本组件已经主动收起时也不重复处理，
    // 否则会把刚约定的焦点去向（回输入框）盖掉
    if (!next && (closeIntentRef.current || (info.source === 'menu' && switchingRef.current))) return;
    if (!next) focusAfterCloseRef.current = focusIsHere() ? 'trigger' : null;
    setOpen(next);
    if (next) {
      // 每次打开都刷新一次：别的标签页 / 配置页可能已经改过
      setSwitchError(null);
      void loadAgentService({ force: true });
    }
  };

  const switchTo = async (choice: ModelChoice): Promise<void> => {
    if (switchingRef.current) return;
    if (choiceKey(choice) === (activeChoice ? choiceKey(activeChoice) : null)) {
      // 点的就是当前模型：直接收起，焦点回输入框
      closeDropdown('composer');
      return;
    }
    switchingRef.current = true;
    setSwitchingKey(choiceKey(choice));
    setSwitchError(null);
    try {
      await setActiveModel({ provider: choice.preset.id, model: choice.model });
      // 选完把焦点送回输入框，接着写下一个问题
      closeDropdown('composer');
    } catch (error) {
      // 下拉保持打开，原因写在里面；当前模型不变
      setSwitchError(error instanceof Error && error.message ? error.message : '切换失败，请重试');
      void loadAgentService({ force: true });
    } finally {
      switchingRef.current = false;
      setSwitchingKey(null);
    }
  };

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === MODEL_MENU_MANAGE_KEY) { openManager(); return; }
    const choice = choices[Number(key)];
    if (choice) void switchTo(choice);
  };

  const items = useMemo(() => {
    // 按服务商分组（choices 已按预置顺序排好，同一家的模型连续）
    const next: NonNullable<MenuProps['items']> = [];
    let groupId = '';
    choices.forEach((choice, index) => {
      const selected = activeChoice != null && choiceKey(choice) === choiceKey(activeChoice);
      const status = configStatusOf(choice.saved);
      const item = {
        key: String(index),
        disabled: switchingKey != null,
        label: (
          <span title={statusTextOf(choice.saved)} style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 0 }}>
            <ProviderStatusDot status={status} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: MAX_MODEL_NAME_WIDTH }}>{choice.model}</span>
            {selected && <CheckOutlined aria-hidden style={{ color: color.ink, flexShrink: 0 }} />}
          </span>
        ),
      };
      if (choice.preset.id !== groupId) {
        groupId = choice.preset.id;
        next.push({
          type: 'group',
          key: `group:${groupId}`,
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: space.sm, fontSize: fontSize.caption, color: color.body }}>
              <ProviderBadge preset={choice.preset} size={16} />
              {choice.preset.name}
            </span>
          ),
          children: [item],
        });
      } else {
        const group = next[next.length - 1];
        if (group && 'children' in group && Array.isArray(group.children)) group.children.push(item);
      }
    });
    return [...next, ...MANAGE_ITEMS];
  }, [choices, activeChoice, switchingKey]);

  // ---- 还没有服务器状态时 ----
  if (!data) {
    if (snapshot.error) {
      return (
        <button type="button" className="aui-model-picker" data-model-state="warning" onClick={openManager}
          aria-label="本地引擎 · 模型服务不可用，点击前往配置页检查"
          title={`读取模型服务失败：${snapshot.error}。点击前往配置页检查。`}>
          <WarningOutlined aria-hidden />本地引擎 · 模型服务不可用
        </button>
      );
    }
    return (
      <button type="button" className="aui-model-picker" disabled aria-label="正在读取模型服务" title="正在读取本机服务器的模型服务配置">
        读取模型服务…
      </button>
    );
  }

  // ---- 未配置任何可用模型：警示态，直达配置页（发送按钮不受影响） ----
  if (!choices.length) {
    return (
      <button type="button" className="aui-model-picker" data-model-state="warning" onClick={openManager}
        aria-label="本地引擎 · 未配置模型服务，点击前往配置" title={UNCONFIGURED_HINT}>
        <WarningOutlined aria-hidden />本地引擎 · 未配置模型服务
      </button>
    );
  }

  const label = activeChoice?.model ?? '未选择模型';
  const statusTitle = activeChoice ? statusTextOf(activeChoice.saved) : '请选择一个模型';
  const triggerTitle = activeChoice
    ? `${activeChoice.preset.name} · ${activeChoice.model} · ${statusTitle}。切换对下一次运行生效，不影响当前对话。`
    : `尚未选择模型。${statusTitle}。切换对下一次运行生效，不影响当前对话。`;

  return (
    <Dropdown
      open={open}
      onOpenChange={onOpenChange}
      trigger={['click']}
      placement="topLeft"
      // 浮层挂在本面板内而不是 body：抽屉 / 全屏 / 窄屏是模态，AgentThread 会把面板以外的
      // 节点置为 inert——挂到 body 的浮层容器下次打开面板时会被一起禁用
      getPopupContainer={(node) => node.closest('.aui-panel') ?? document.body}
      menu={{ items, onClick: onMenuClick, selectable: false, style: { maxHeight: 360, overflowY: 'auto', minWidth: 240, background: 'transparent', boxShadow: 'none' } }}
      popupRender={(menu) => (
        // 卡片外观直接取 token：白底 + 卡片圆角 + L5 阴影由这层外壳承担，菜单自身不再重复画底和
        // 阴影——底部的说明 / 失败原因与菜单在同一个白卡里，而不是透明地压在输入框上
        <div
          ref={popupRef}
          style={{ minWidth: 240, background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l5, overflow: 'hidden' }}
          onKeyDown={(event) => {
            if (!open) return;
            if (event.key === 'Escape') {
              // 只关下拉：Esc 不再往上冒泡——AgentThread 在 document 上的 Esc 处理会关掉整个面板
              event.preventDefault();
              event.stopPropagation();
              closeDropdown('trigger');
              return;
            }
            if (event.key === 'Tab') {
              // 离开菜单：先收起并把焦点放回触发器，让 Tab 从触发器往后走（面板的焦点循环照常生效）
              triggerRef.current?.focus();
              closeDropdown(null);
            }
          }}
        >
          {menu}
          <div role={switchError ? 'alert' : undefined} style={{
            padding: `${space.xs}px ${space.md}px`, borderTop: `1px solid ${color.hairline}`,
            fontSize: fontSize.caption, lineHeight: '18px', color: switchError ? color.error : color.mute,
          }}>
            {switchError ? `切换失败：${switchError}` : '切换对下一次运行生效，不影响当前对话'}
          </div>
        </div>
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        className="aui-model-picker"
        data-model-state={activeChoice ? 'active' : 'none'}
        data-model-switching={switchingKey != null || undefined}
        aria-label={activeChoice ? `当前模型：${activeChoice.preset.name} ${activeChoice.model}，点击切换` : '尚未选择模型，点击选择'}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={switchingKey != null}
        title={triggerTitle}
        onKeyDown={(event) => {
          // 菜单按钮惯例：上下方向键直接展开（Enter / 空格走按钮原生点击）
          if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
          event.preventDefault();
          setOpen(true);
          setSwitchError(null);
          void loadAgentService({ force: true });
        }}
      >
        {activeProvider ? <ProviderBadge preset={activeProvider} size={16} /> : null}
        <span className="aui-model-picker-name">{switchingKey != null ? '正在切换…' : label}</span>
        {activeChoice && <ProviderStatusDot status={configStatusOf(activeSaved)} />}
        <DownOutlined aria-hidden style={{ fontSize: fontSize.caption, color: 'inherit' }} />
      </button>
    </Dropdown>
  );
}
