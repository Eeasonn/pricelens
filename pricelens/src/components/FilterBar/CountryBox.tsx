// ============================================================
// §5.1 框一：国家 —— 地区部 → 国家 级联（dimRegion）。
// 仅 欧亚 → R国 可选、默认选中；其余 27 国置灰（🔒，可见不可点）。
// 切换国家 = 重载该国家维度数据（demo 仅 R国实现）。
// ============================================================
import { useMemo } from 'react';
import { Cascader } from 'antd';
import type { CascaderProps } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useFilters } from '../../state/FiltersContext';
import { dimRegion } from '../../data';
import type { DimRegion } from '../../dataModel/types';

interface RegionOption {
  value: string;
  label: string;
  children?: CountryOption[];
}

interface CountryOption {
  value: string;
  label: string;
  disabled: boolean;
}

function buildOptions(rows: DimRegion[]): RegionOption[] {
  const regions = new Map<string, { name: string; sort: number; countries: CountryOption[] }>();
  for (const r of rows) {
    const region = regions.get(r.region_code) ?? { name: r.region_name, sort: r.sort, countries: [] };
    region.countries.push({ value: r.country_code, label: r.country_name, disabled: !r.enabled });
    regions.set(r.region_code, region);
  }
  return [...regions.entries()]
    .sort((a, b) => a[1].sort - b[1].sort)
    .map(([code, region]) => ({
      value: code,
      label: region.name,
      children: region.countries.sort((a, b) => a.label.localeCompare(b.label, 'zh')),
    }));
}

/** 选项尾缀：置灰国家带锁标（§4.3 禁用态） */
const optionRender: CascaderProps<RegionOption>['optionRender'] = (option) => {
  const disabled = (option as { disabled?: boolean }).disabled;
  return (
    <span>
      {option.label}
      {disabled ? <LockOutlined style={{ fontSize: 10 }} /> : null}
    </span>
  );
};

export default function CountryBox() {
  const { state, actions } = useFilters();
  const options = useMemo(() => buildOptions(dimRegion), []);
  const current = dimRegion.find((r) => r.country_code === state.countryCode);
  // 数据未就绪（dimRegion 为空）时降级：值无法在维表中定位，展示 spec 默认路径文案
  const value: string[] | undefined = current ? [current.region_code, current.country_code] : undefined;

  return (
    <Cascader
      id="scope-country"
      aria-label="国家"
      options={options}
      value={value}
      placeholder={current ? '选择国家' : '欧亚 / R国'}
      optionRender={options.length ? optionRender : undefined}
      allowClear={false}
      style={{ width: '100%' }}
      onChange={(keys) => {
        const path = keys as string[];
        const code = path[path.length - 1];
        if (typeof code === 'string') actions.set({ countryCode: code });
      }}
    />
  );
}
