// ============================================================
// 第一百一十三轮（2026-10-21）量价看板 · 面板头（定高 32 = 左侧共享轴列的对齐基准）：
// 左 = 品牌点 + 产品·配置下拉（选项分组 [自有品牌][竞品]，当前国家×产业口径）；
// 右 = 销量读数（悬停时间列优先，无悬停取最新有值期）。
// 第一百一十四轮（评审）：撤「我司」小标签（铁律：任何地方不标注「我司」——
// 品牌点+品牌名已表达归属）。
// 原「销量轴」上限药丸已删：数值口径恒自动，柱区高度改由图右侧拉伸柄调节。
// ============================================================
import { ConfigProvider, Select } from 'antd';
import BrandDot from '../../components/BrandMark';
import { filterBarTheme } from '../../components/FilterBar';
import { color } from '../../theme/tokens';
import { fmtVolume, type VolumeSlot } from './volumeAxis';

export interface VolumeOption {
  value: string;
  label: string;
}

export default function PanelHeader(props: {
  slot: VolumeSlot | null;
  options: { label: string; options: VolumeOption[] }[];
  brand: string;
  volume: number | null;
  onSelect: (key: string | null) => void;
}) {
  const value = props.slot ? `${props.slot.modelId}|${props.slot.romram}` : undefined;
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
    </div>
  );
}
