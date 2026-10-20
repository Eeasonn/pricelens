// ============================================================
// 第112轮 量价看板 · 面板头（定高 32 = 左侧共享轴列的对齐基准）：
// 左 = 品牌点 + 产品·配置下拉（选项分组 [我司][竞品]，当前国家×产业口径）
//      +「我司」小标签（仅我司）；
// 右 = 销量读数（悬停时间列优先，无悬停取最新有值期）+「销量轴」上限药丸
//      （Popover：上限输入 + 自动复位；三图一致模式下禁用）。
// ============================================================
import { Button, ConfigProvider, InputNumber, Popover, Select } from 'antd';
import BrandDot from '../../components/BrandMark';
import { filterBarTheme } from '../../components/FilterBar';
import { color, radius, selectSoft, selectSoftInk } from '../../theme/tokens';
import { fmtVolume, type VolumeAxisMode, type VolumeSlot } from './volumeAxis';

export interface VolumeOption {
  value: string;
  label: string;
}

export default function PanelHeader(props: {
  slot: VolumeSlot | null;
  options: { label: string; options: VolumeOption[] }[];
  isOwn: boolean;
  brand: string;
  volume: number | null;
  axisMode: VolumeAxisMode;
  cap: number | null;
  onCap: (v: number | null) => void;
  onSelect: (key: string | null) => void;
}) {
  const unified = props.axisMode === 'unified';
  const value = props.slot ? `${props.slot.modelId}|${props.slot.romram}` : undefined;
  const capPill = (
    <span
      title={unified ? '三图一致时使用统一上限' : '设置本图销量轴上限'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 18,
        padding: '0 8px',
        fontSize: 11,
        lineHeight: '16px',
        color: unified ? color.hairlineStrong : color.body,
        background: color.canvas,
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.pill,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      销量轴{props.cap != null && !unified ? ` ${props.cap.toLocaleString('en-US')}` : ''}
    </span>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 4px' }}>
      {props.slot && <BrandDot brand={props.brand} />}
      <ConfigProvider theme={filterBarTheme}>
        <Select
          size="small"
          showSearch
          allowClear
          variant="borderless"
          value={value}
          onChange={(v) => props.onSelect(typeof v === 'string' ? v : null)}
          placeholder="选择产品"
          optionFilterProp="label"
          options={props.options}
          style={{ minWidth: 0, flex: 1 }}
        />
      </ConfigProvider>
      {props.isOwn && (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            lineHeight: '16px',
            padding: '0 6px',
            borderRadius: radius.pill,
            color: selectSoftInk,
            background: selectSoft,
            flexShrink: 0,
          }}
        >
          我司
        </span>
      )}
      <span
        style={{
          marginLeft: 'auto',
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 3,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 11, color: color.mute }}>销量</span>
        <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>
          {props.volume != null ? fmtVolume(props.volume) : '—'}
        </span>
        <span style={{ fontSize: 11, color: color.mute }}>台</span>
      </span>
      {unified ? (
        capPill
      ) : (
        <ConfigProvider theme={filterBarTheme}>
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <InputNumber
                  size="small"
                  min={1}
                  step={100}
                  value={props.cap ?? undefined}
                  placeholder="自动"
                  onChange={(v) => props.onCap(v == null ? null : v)}
                  style={{ width: 96 }}
                />
                <Button size="small" onClick={() => props.onCap(null)}>
                  自动
                </Button>
              </div>
            }
          >
            {capPill}
          </Popover>
        </ConfigProvider>
      )}
    </div>
  );
}
