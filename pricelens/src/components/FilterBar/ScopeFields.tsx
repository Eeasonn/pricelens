import type { ReactNode } from 'react';
import { color } from '../../theme/tokens';
import { IndustryControl } from './ProductBox';

function Field({ label, htmlFor, width, children }: { label: string; htmlFor: string; width?: number; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width, minWidth: 0, flexShrink: 0 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {label}
      </label>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  );
}

/** 分析范围 = 产业；国家口径已上收页头分析模式页签组（全站唯一入口），各页不再重复 */
export default function ScopeFields() {
  return (
    <div role="group" aria-label="分析范围" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <Field label="产业" htmlFor="scope-industry" width={155}><IndustryControl /></Field>
      <span aria-hidden style={{ width: 1, height: 20, background: color.hairline }} />
    </div>
  );
}
