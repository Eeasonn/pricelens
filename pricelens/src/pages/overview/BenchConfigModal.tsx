// ============================================================
// 配置对标弹窗（第四十四轮施工 / 第四十五轮入口下沉）：总览各我司 ROM 行的
// 「＋ 添加竞品」直达（预选该 ROM）的轻量映射编辑器。
// 业界范式落地（2026-10 调研）：「推荐 + 人工确认」的 human-in-the-loop（Competera/
// Pricefx）——候选区按同档位优先、价差升序排（v0 置信度 = 价差%），人工添加/移除/
// 设主竞品；IN 的匹配状态标签 = 主竞品星标；保存走 configStore.manual 快照 +
// CONFIG_CHANGED_EVENT 广播（矩阵与看板竞品即时同步）。
// 映射粒度 = ROM 级（own_model_id × own_romram → competitor_sku_id），与配置页同储。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Segmented, message } from 'antd';
import BrandDot from '../../components/BrandMark';
import { TIER_LABELS } from '../../dataModel/aggregate';
import type { OverviewModel, OverviewRow, OverviewTierBand } from '../../dataModel/aggregate';
import type { DimBenchmark } from '../../dataModel/types';
import { getEffectiveBenchmark, saveBenchmark } from '../../state/configStore';
import { CONFIG_CHANGED_EVENT } from '../../state/lplKeys';
import { color, fontSize, formatPrice, radius } from '../../theme/tokens';

const norm = (r: string): string => r.replace(/\s+/g, '');

interface Candidate {
  model: OverviewModel;
  row: OverviewRow;
  /** 价差率（相对当前我司 ROM 现价）；任一侧无价 = null（沉底） */
  dist: number | null;
}

export default function BenchConfigModal(props: {
  open: boolean;
  model: OverviewModel | null;
  bands: OverviewTierBand[];
  /** 第四十五轮：从总览某 ROM 行进入时预选该 ROM（缺省 = 首个 ROM） */
  initialRomram?: string | null;
  onClose: () => void;
}) {
  const { open, model, bands, initialRomram, onClose } = props;
  const [romIdx, setRomIdx] = useState(0);
  const [draft, setDraft] = useState<DimBenchmark[]>([]);

  // initialRomram → 行下标（找不到该 ROM 回退首个）；modal 关闭态下重算不生效
  const initialIdx = useMemo(() => {
    if (!model || !initialRomram) return 0;
    const k = model.rows.findIndex((r) => norm(r.romram) === norm(initialRomram));
    return k >= 0 ? k : 0;
  }, [model, initialRomram]);

  // 打开/换型号：重置为当前生效配置快照（manual 优先、回退 auto）+ 入口 ROM
  useEffect(() => {
    if (open) {
      setDraft(getEffectiveBenchmark());
      setRomIdx(initialIdx);
    }
  }, [open, model?.modelId, initialIdx]);

  const rom = model ? model.rows[Math.min(romIdx, model.rows.length - 1)] : undefined;

  const currentRows = useMemo(
    () =>
      model && rom
        ? draft.filter((r) => r.own_model_id === model.modelId && norm(r.own_romram) === norm(rom.romram))
        : [],
    [draft, model, rom],
  );
  const mappedSkus = useMemo(() => new Set(currentRows.map((r) => r.competitor_sku_id)), [currentRows]);

  /** 候选 = 全部竞品型号 ROM 行；同档位优先、价差升序（无价沉底） */
  const { sameTier, otherGroups } = useMemo(() => {
    if (!model || !rom) return { sameTier: [] as Candidate[], otherGroups: [] as { tierCode: string; items: Candidate[] }[] };
    const all: Candidate[] = bands
      .flatMap((b) => b.models)
      .filter((m) => !m.isOwn && m.modelId !== model.modelId)
      .flatMap((m) => m.rows.map((row) => ({ model: m, row })))
      .map((c) => ({
        ...c,
        dist: c.row.price != null && rom.price != null ? Math.abs(c.row.price - rom.price) / rom.price : null,
      }))
      .sort((a, b) => (a.dist ?? Number.POSITIVE_INFINITY) - (b.dist ?? Number.POSITIVE_INFINITY));
    const same = all.filter((c) => c.model.tierCode === model.tierCode);
    const otherGroups = bands
      .filter((b) => b.tierCode !== model.tierCode)
      .map((b) => ({ tierCode: b.tierCode, items: all.filter((c) => c.model.tierCode === b.tierCode) }))
      .filter((g) => g.items.length > 0);
    return { sameTier: same, otherGroups };
  }, [bands, model, rom]);

  const writeGroup = (rows: DimBenchmark[]): void => {
    // 只重写本型号+当前 ROM 组，其余草稿行原样保留
    setDraft([
      ...draft.filter((r) => !(model && r.own_model_id === model.modelId && rom && norm(r.own_romram) === norm(rom.romram))),
      ...rows,
    ]);
  };
  const addComp = (skuId: string): void => {
    if (!model || !rom) return;
    const nextSort = currentRows.length === 0 ? 1 : Math.max(...currentRows.map((r) => r.sort)) + 1;
    writeGroup([
      ...currentRows,
      { own_model_id: model.modelId, own_romram: rom.romram, competitor_sku_id: skuId, sort: nextSort, source: 'manual' },
    ]);
  };
  const removeComp = (skuId: string): void => {
    writeGroup(currentRows.filter((r) => r.competitor_sku_id !== skuId));
  };
  const makePrimary = (skuId: string): void => {
    const target = currentRows.find((r) => r.competitor_sku_id === skuId);
    if (!target) return;
    const others = currentRows.filter((r) => r.competitor_sku_id !== skuId).map((r, i) => ({ ...r, sort: i + 2 }));
    writeGroup([{ ...target, sort: 1 }, ...others]);
  };

  const save = (): void => {
    // 生效矩阵整快照落 manual（getEffectiveBenchmark 为「manual 存在即整表接管」语义，
    // 只存增量会遮蔽 auto 行）；保存后广播 → 总览矩阵与看板竞品即时同步
    saveBenchmark(draft.length > 0 ? draft.map((r) => ({ ...r, source: 'manual' as const })) : null);
    window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT));
    message.success('对标配置已保存，总览矩阵与看板竞品已同步');
    onClose();
  };

  const candRow = (c: Candidate) => {
    const mapped = mappedSkus.has(c.row.skuId);
    return (
      <div
        key={c.row.skuId}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) 76px 64px auto',
          alignItems: 'center',
          gap: 8,
          padding: '5px 10px',
          borderRadius: radius.control,
          background: mapped ? '#f5f5f5' : undefined,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <BrandDot brand={c.row.brand} size={7} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.row.modelName}
          </span>
          <span style={{ fontSize: 10.5, color: color.mute, whiteSpace: 'nowrap' }}>{c.row.romram}</span>
        </span>
        <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: color.ink, textAlign: 'right' }}>
          {formatPrice(c.row.price, 'usd')}
        </span>
        <span className="tnum" style={{ fontSize: 10.5, color: c.dist != null && c.dist <= 0.15 ? '#0a7d38' : color.mute, textAlign: 'right' }}>
          {c.dist != null ? `价差 ${Math.round(c.dist * 100)}%` : '—'}
        </span>
        {mapped ? (
          <span style={{ fontSize: 10.5, color: color.mute, padding: '0 6px' }}>已配置</span>
        ) : (
          <Button size="small" style={{ height: 22, fontSize: 11 }} onClick={() => addComp(c.row.skuId)}>
            添加
          </Button>
        )}
      </div>
    );
  };

  const sectionTitle = (t: string, note?: string) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '10px 0 4px' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: color.body }}>{t}</span>
      {note && <span style={{ fontSize: 10.5, color: color.mute }}>{note}</span>}
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={680}
      centered
      title={model ? `配置对标 · ${model.modelName}` : '配置对标'}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button size="small" onClick={onClose}>
            取消
          </Button>
          <Button type="primary" size="small" onClick={save}>
            保存配置
          </Button>
        </div>
      }
    >
      {model && rom && (
        <div>
          {/* ROM 维度切换：映射按 own_romram 存储 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: color.mute }}>我司 ROM</span>
            <Segmented
              size="small"
              value={Math.min(romIdx, model.rows.length - 1)}
              onChange={(v) => setRomIdx(v as number)}
              options={model.rows.map((r, i) => ({ label: r.romram, value: i }))}
            />
            <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: color.ink, marginLeft: 'auto' }}>
              {formatPrice(rom.price, 'usd')}
            </span>
          </div>

          {/* 已配置（当前 ROM）：主竞品星标 + 设主/移除 */}
          {sectionTitle(
            `已配置对标（${currentRows.length}）`,
            '主竞品 = 看板/摘要条的排序首位',
          )}
          {currentRows.length === 0 ? (
            <div style={{ border: `1px dashed ${color.hairlineStrong}`, borderRadius: radius.card, padding: '8px 12px', fontSize: 12, color: color.mute }}>
              该 ROM 暂无对标竞品 — 从下方候选添加
            </div>
          ) : (
            [...currentRows]
              .sort((a, b) => a.sort - b.sort)
              .map((r) => {
                // sku_id 解析：型号段 + ROM 段 + 色段；型号/ROM 信息从 bands 找回，价格取该色现价
                const [mid, romSeg] = r.competitor_sku_id.split('__');
                const colorSeg = r.competitor_sku_id.split('__').slice(2).join('__');
                const cm = bands.flatMap((b) => b.models).find((m) => m.modelId === mid);
                const cRow = cm?.rows.find((row) => norm(row.romram) === norm(romSeg ?? ''));
                const colorPrice = cRow?.colors.find((c) => c.skuId === r.competitor_sku_id)?.price ?? null;
                return (
                  <div
                    key={r.competitor_sku_id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0,1fr) 76px auto',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 10px',
                      borderRadius: radius.control,
                      background: '#fafafa',
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      {cm && <BrandDot brand={cm.brand} size={7} />}
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: color.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cm?.modelName ?? r.competitor_sku_id}
                      </span>
                      <span style={{ fontSize: 10.5, color: color.mute, whiteSpace: 'nowrap' }}>
                        {cRow ? `${cRow.romram} · ${colorSeg}` : colorSeg}
                      </span>
                      {r.sort === 1 && (
                        <span style={{ fontSize: 10, color: color.link, background: '#e8f1ff', borderRadius: radius.pill, padding: '0 6px' }}>
                          ★ 主竞品
                        </span>
                      )}
                    </span>
                    <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: color.ink, textAlign: 'right' }}>
                      {formatPrice(colorPrice, 'usd')}
                    </span>
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      {r.sort !== 1 && (
                        <Button size="small" style={{ height: 22, fontSize: 11 }} onClick={() => makePrimary(r.competitor_sku_id)}>
                          设为主竞品
                        </Button>
                      )}
                      <Button size="small" style={{ height: 22, fontSize: 11 }} onClick={() => removeComp(r.competitor_sku_id)}>
                        移除
                      </Button>
                    </span>
                  </div>
                );
              })
          )}

          {/* 候选区：同档位推荐优先（价差升序 = v0 推荐度），其余按档位分组 */}
          <div style={{ maxHeight: '40vh', overflowY: 'auto', marginTop: 4 }}>
            {sameTier.length > 0 && (
              <>
                {sectionTitle(`同档位推荐 · ${TIER_LABELS[model.tierCode]}`, '按价差升序（推荐 + 人工确认）')}
                {sameTier.map(candRow)}
              </>
            )}
            {otherGroups.map((g) => (
              <div key={g.tierCode}>
                {sectionTitle(TIER_LABELS[g.tierCode as keyof typeof TIER_LABELS] ?? g.tierCode)}
                {g.items.map(candRow)}
              </div>
            ))}
          </div>

          <div style={{ fontSize: fontSize.caption, color: color.mute, marginTop: 8, lineHeight: '16px' }}>
            保存 = 整表快照转为手动配置（配置页可恢复 auto 默认）；自动匹配开启时看板竞品立即跟随。
          </div>
        </div>
      )}
    </Modal>
  );
}
