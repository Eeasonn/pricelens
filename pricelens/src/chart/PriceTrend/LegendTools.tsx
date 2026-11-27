// ============================================================
// 图例工具（2026-11-27，取消单图折线条数上限后的可读性手段）：
// 单图 8 线 / 合并 16 线上限退役后，折线再多也全画（不阻止、不自动减少、不强制
// 切图）；可读性交给用户主动动作——本组件把「图例搜索 / 隔离 / 主动隐藏」收进
// 工具行的一枚入口（稳定版价格页本就没有常驻药丸带，这里是唯一的图例清单）：
// · 搜索：按品牌 / 产品名 / 配置筛图例清单；输入后可一键「只看匹配」= 隔离匹配项；
// · 隔离：单条「隔离」= 只留这一条；品牌行「只看本品牌」= 只留该品牌全部产品；
// · 隐藏 / 显示：逐条切换，或「全部显示」整批恢复；
// · 折线达到 MANY_LINES_HINT_AT 条时入口旁给一句非阻断提示（纯文字，可忽略）。
// 隐藏即 PriceTrend 既有的 hiddenKeys（图例取消选中同一份状态），不新增状态源；
// 悬停行 = 图内高亮该系列（与图例药丸悬停同效）。键盘可达：全部为原生按钮 / 输入框。
// ============================================================
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Input, Popover, Tooltip } from 'antd';
import { SearchOutlined, EyeInvisibleOutlined, EyeOutlined, ScanOutlined } from '@ant-design/icons';
import BrandDot, { brandLabelOf } from '../../components/BrandMark';
import type { Series } from '../../dataModel/types';
import { curveNameOf, seriesPillMetaOf } from './chartModel';
import { color, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';
import { useTopEscClose } from '../../components/ProductPicker/pickerBits';

/** 折线数达到此值即出「折线较多」非阻断提示 */
export const MANY_LINES_HINT_AT = 12;

const compact = (s: string): string => s.toLowerCase().replace(/\s+/g, '');

/** 图例搜索命中：品牌 / 产品名 / 配置 / 全名（大小写不敏感、忽略空白；容量写法
 *  「256GB」可命中「12+256 GB」）。空查询 = 全部命中。 */
export function legendSearchMatch(s: Series, query: string): boolean {
  const q = compact(query);
  if (!q) return true;
  const meta = seriesPillMetaOf(s);
  const hay = [brandLabelOf(s.brand), s.brand, s.label, meta.name ?? '', meta.cfg ?? ''].map(compact);
  return hay.some((h) => h.includes(q));
}

/** 行尾小图标钮（隔离 / 隐藏）：24px 方形描边，命中区经 .lpl-hit 外扩 */
const ROW_ICON_BTN: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: radius.control,
  border: `1px solid ${color.hairline}`,
  background: color.canvas,
  color: color.mute,
  cursor: 'pointer',
  flexShrink: 0,
};

export default function LegendTools({
  series,
  hiddenKeys,
  onSetHidden,
  onHover,
}: {
  /** 图上（含被隐藏者）的全部系列；分离模式 = 各面板系列并集 */
  series: Series[];
  hiddenKeys: Set<string>;
  /** 写入新的隐藏集（隔离 / 逐条隐藏 / 全部显示的唯一出口） */
  onSetHidden: (next: Set<string>) => void;
  /** 悬停行 = 图内高亮该系列；null = 清除 */
  onHover: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useTopEscClose(open, () => setOpen(false));

  // 品牌分组（品牌序 = 系列出现序）
  const groups = useMemo(() => {
    const order: string[] = [];
    const byBrand = new Map<string, Series[]>();
    for (const s of series) {
      if (!byBrand.has(s.brand)) {
        byBrand.set(s.brand, []);
        order.push(s.brand);
      }
      byBrand.get(s.brand)!.push(s);
    }
    return order.map((b) => ({ brand: b, items: byBrand.get(b)! }));
  }, [series]);
  const matchOf = useMemo(() => new Map(series.map((s) => [s.key, legendSearchMatch(s, query)] as const)), [series, query]);
  const matchCount = series.filter((s) => matchOf.get(s.key)).length;
  const hiddenCount = series.filter((s) => hiddenKeys.has(s.key)).length;
  const allKeys = useMemo(() => series.map((s) => s.key), [series]);

  /** 隐藏 keep 之外的全部系列（keep 为空 = 不动，避免一键全黑） */
  const isolate = (keep: Iterable<string>): void => {
    const keepSet = new Set(keep);
    if (!keepSet.size) return;
    onSetHidden(new Set(allKeys.filter((k) => !keepSet.has(k))));
  };

  const rowBtn = (ariaLabel: string, title: string, icon: ReactNode, onClick: () => void, extra?: CSSProperties) => (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      className="lpl-pk-ghost lpl-hit"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ ...ROW_ICON_BTN, ...extra }}
    >
      {icon}
    </button>
  );

  return (
    <span data-testid="legend-tools" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      {series.length >= MANY_LINES_HINT_AT && (
        <span
          role="note"
          style={{ fontSize: 12, color: color.mute, whiteSpace: 'nowrap' }}
          title="折线较多：可在图例里搜索、隔离或主动隐藏；系统不会自动减少折线，也不会强制切图。"
        >
          折线较多（{series.length} 条）
        </span>
      )}
      <Popover
        trigger="click"
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setQuery('');
            onHover(null);
          }
        }}
        placement="bottomRight"
        arrow={false}
        styles={{ body: { padding: 10, width: 340 } }}
        content={
          <div role="group" aria-label="图例">
            <Input
              allowClear
              size="small"
              autoFocus
              prefix={<SearchOutlined style={{ color: color.mute }} />}
              placeholder="搜索品牌 / 产品名 / 配置"
              aria-label="搜索图例"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '8px 0 6px', fontSize: 12 }}>
              {query.trim() && (
                <button
                  type="button"
                  className="lpl-pk-ghost"
                  disabled={matchCount === 0}
                  onClick={() => isolate(series.filter((s) => matchOf.get(s.key)).map((s) => s.key))}
                  style={{ height: 22, padding: '0 9px', borderRadius: radius.pill, border: `1px solid ${color.hairline}`, background: color.canvas, font: 'inherit', fontSize: 11, fontWeight: 600, color: matchCount ? selectSoftInk : color.mute, cursor: matchCount ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
                >
                  只看匹配（{matchCount}）
                </button>
              )}
              <button
                type="button"
                className="lpl-pk-ghost"
                disabled={hiddenCount === 0}
                onClick={() => onSetHidden(new Set())}
                style={{ height: 22, padding: '0 9px', borderRadius: radius.pill, border: `1px solid ${color.hairline}`, background: color.canvas, font: 'inherit', fontSize: 11, color: hiddenCount ? color.body : color.mute, cursor: hiddenCount ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
              >
                全部显示
              </button>
              <span className="tnum" style={{ marginLeft: 'auto', color: color.mute }}>
                共 {series.length} 条{hiddenCount ? ` · 已隐藏 ${hiddenCount}` : ''}
              </span>
            </div>
            <div className="lpl-card-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {groups.flatMap((g) => {
                const items = g.items.filter((s) => matchOf.get(s.key));
                if (!items.length) return [];
                return [
                  <div
                    key={`h-${g.brand}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 4px 3px', position: 'sticky', top: 0, background: color.canvas, zIndex: 1 }}
                  >
                    <BrandDot brand={g.brand} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: color.ink }}>{brandLabelOf(g.brand)}</span>
                    <span className="tnum" style={{ fontSize: 11, color: color.mute }}>{items.length} 条</span>
                    <button
                      type="button"
                      className="lpl-pk-ghost"
                      aria-label={`只看 ${brandLabelOf(g.brand)} 全部产品`}
                      title="隐藏其他品牌，只保留本品牌全部产品"
                      onClick={() => isolate(g.items.map((s) => s.key))}
                      style={{ marginLeft: 'auto', height: 20, padding: '0 8px', borderRadius: radius.pill, border: `1px solid ${color.hairline}`, background: color.canvas, font: 'inherit', fontSize: 11, color: color.body, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      只看本品牌
                    </button>
                  </div>,
                  ...items.map((s) => {
                    const meta = seriesPillMetaOf(s);
                    const hidden = hiddenKeys.has(s.key);
                    return (
                      <div
                        key={s.key}
                        data-testid="legend-row"
                        onMouseEnter={() => onHover(s.key)}
                        onMouseLeave={() => onHover(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 4px 3px 8px',
                          borderRadius: radius.control,
                          fontSize: 12,
                          opacity: hidden ? 0.5 : undefined,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{ width: 14, height: 2, flexShrink: 0, background: s.color, textDecoration: hidden ? 'line-through' : undefined }}
                        />
                        <span title={curveNameOf(s)} style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: hidden ? color.mute : color.ink }}>
                          {meta.name ?? curveNameOf(s)}
                          {meta.cfg ? <span style={{ color: color.mute }}> {meta.cfg}</span> : null}
                        </span>
                        {rowBtn(`隔离 ${curveNameOf(s)}`, '只显示这一条折线，其余全部隐藏', <ScanOutlined style={{ fontSize: 11 }} />, () => isolate([s.key]))}
                        {rowBtn(
                          hidden ? `显示 ${curveNameOf(s)}` : `隐藏 ${curveNameOf(s)}`,
                          hidden ? '恢复显示该产品' : '隐藏该产品',
                          hidden ? <EyeOutlined style={{ fontSize: 11 }} /> : <EyeInvisibleOutlined style={{ fontSize: 11 }} />,
                          () => {
                            const next = new Set(hiddenKeys);
                            if (hidden) next.delete(s.key);
                            else next.add(s.key);
                            onSetHidden(next);
                          },
                          hidden ? { border: `1px solid ${selectAccent}`, color: selectSoftInk, background: selectSoft } : undefined,
                        )}
                      </div>
                    );
                  }),
                ];
              })}
              {matchCount === 0 && (
                <div role="status" style={{ padding: 12, fontSize: 12, color: color.mute, textAlign: 'center' }}>
                  没有匹配的折线
                </div>
              )}
            </div>
          </div>
        }
      >
        <button
          type="button"
          aria-label={hiddenCount ? `图例，已隐藏 ${hiddenCount} 条` : '图例'}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="搜索、隔离或隐藏折线"
          className={hiddenCount ? 'lpl-only-main' : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 24,
            padding: '0 10px',
            borderRadius: radius.control,
            border: `1px solid ${hiddenCount ? selectAccent : color.hairline}`,
            background: hiddenCount ? selectSoft : color.canvas,
            color: hiddenCount ? selectSoftInk : color.body,
            font: 'inherit',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: '13px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          图例
          <span className="tnum" style={{ fontWeight: 400 }}>
            {hiddenCount ? `已隐藏 ${hiddenCount}` : series.length}
          </span>
        </button>
      </Popover>
    </span>
  );
}
