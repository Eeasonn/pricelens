// ============================================================
// 配置对标弹窗（第四十四轮施工 / 第四十五轮入口下沉 / 预警中心重构定版为唯一入口）：
// 总览各我司 ROM 行的「＋ 添加竞品」直达（预选该 ROM）。原配置页竞品矩阵整块
// 删除后，本浮窗吸收其三个独有能力：①「恢复默认（auto）」（footer 左，Popconfirm）；
// ②候选区品牌筛选 + 搜索（原品牌分列视角）；③↑↓ 任意排序（首位 = 主竞品，
// 语义等价取代原「设为主竞品」按钮）。
// 业界范式（2026-10 调研）：「推荐 + 人工确认」的 human-in-the-loop（Competera/
// Pricefx）——候选区按同档位优先、价差升序排（v0 置信度 = 价差%），人工添加/移除/排序；
// 保存走 configStore.manual 快照 + CONFIG_CHANGED_EVENT 广播（矩阵与看板竞品即时同步）。
// 映射粒度 = ROM 级（own_model_id × own_romram → competitor_sku_id）。
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Popconfirm, Segmented, message } from 'antd';
import { DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import BrandDot from '../../components/BrandMark';
import { COMPETITOR_BRANDS } from '../../components/ProductCascader/tree';
import { TIER_LABELS } from '../../dataModel/aggregate';
import { getCurrentCountry } from '../../state/currentScope';
import type { OverviewModel, OverviewRow, OverviewTierBand } from '../../dataModel/aggregate';
import type { DimBenchmark } from '../../dataModel/types';
import { getEffectiveBenchmark, notifyConfigChanged, saveBenchmark } from '../../state/configStore';
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
  // 候选区筛选（预警中心重构新增：品牌 chips + 搜索，补齐原配置页品牌视角）
  const [brandSel, setBrandSel] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');

  // initialRomram → 行下标（找不到该 ROM 回退首个）；modal 关闭态下重算不生效
  const initialIdx = useMemo(() => {
    if (!model || !initialRomram) return 0;
    const k = model.rows.findIndex((r) => norm(r.romram) === norm(initialRomram));
    return k >= 0 ? k : 0;
  }, [model, initialRomram]);

  // 打开/换型号：重置为当前生效配置快照（manual 优先、回退 auto）+ 入口 ROM + 清筛选
  useEffect(() => {
    if (open) {
      setDraft(getEffectiveBenchmark());
      setRomIdx(initialIdx);
      setBrandSel([]);
      setKeyword('');
    }
  }, [open, model?.modelId, initialIdx]);

  const rom = model ? model.rows[Math.min(romIdx, model.rows.length - 1)] : undefined;

  const cc = getCurrentCountry();
  const inGroup = (r: DimBenchmark): boolean =>
    !!model && !!rom && (r.country_code ?? cc) === cc && r.own_model_id === model.modelId && norm(r.own_romram) === norm(rom.romram);
  const currentRows = useMemo(() => draft.filter(inGroup), [draft, model, rom, cc]); // eslint-disable-line react-hooks/exhaustive-deps
  const sortedRows = useMemo(() => [...currentRows].sort((a, b) => a.sort - b.sort), [currentRows]);
  const mappedSkus = useMemo(() => new Set(currentRows.map((r) => r.competitor_sku_id)), [currentRows]);

  /** 候选 = 全部竞品型号 ROM 行；同档位优先、价差升序（无价沉底）+ 品牌/关键词筛选 */
  const { sameTier, otherGroups, brandOptions } = useMemo(() => {
    if (!model || !rom) return { sameTier: [] as Candidate[], otherGroups: [] as { tierCode: string; items: Candidate[] }[], brandOptions: [] as string[] };
    const kw = keyword.trim().toLowerCase();
    const pass = (c: { model: OverviewModel; row: OverviewRow }): boolean =>
      (brandSel.length === 0 || brandSel.includes(c.model.brand)) &&
      (kw === '' || `${c.row.modelName} ${c.row.romram}`.toLowerCase().includes(kw));
    const all: Candidate[] = bands
      .flatMap((b) => b.models)
      .filter((m) => !m.isOwn && m.modelId !== model.modelId)
      .flatMap((m) => m.rows.map((row) => ({ model: m, row })))
      .filter(pass)
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
    const brandOptions = [...new Set(bands.flatMap((b) => b.models).filter((m) => !m.isOwn && m.modelId !== model.modelId).map((m) => m.brand))]
      .sort((a, b) => {
        const ia = COMPETITOR_BRANDS.indexOf(a);
        const ib = COMPETITOR_BRANDS.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      });
    return { sameTier: same, otherGroups, brandOptions };
  }, [bands, model, rom, brandSel, keyword]);

  const writeGroup = (rows: DimBenchmark[]): void => {
    // 只重写本国×本型号×当前配置组，其余草稿行（含别国）原样保留
    setDraft([...draft.filter((r) => !inGroup(r)), ...rows]);
  };
  const addComp = (skuId: string): void => {
    if (!model || !rom) return;
    const nextSort = currentRows.length === 0 ? 1 : Math.max(...currentRows.map((r) => r.sort)) + 1;
    writeGroup([
      ...currentRows,
      { country_code: getCurrentCountry(), own_model_id: model.modelId, own_romram: rom.romram, competitor_sku_id: skuId, sort: nextSort, source: 'manual' },
    ]);
  };
  const removeComp = (skuId: string): void => {
    writeGroup(currentRows.filter((r) => r.competitor_sku_id !== skuId));
  };
  /** ↑↓ 排序（预警中心重构：取代原「设为主竞品」——首位 = 主竞品，sort 重排 1..n） */
  const moveComp = (skuId: string, delta: number): void => {
    const idx = sortedRows.findIndex((r) => r.competitor_sku_id === skuId);
    const to = idx + delta;
    if (idx < 0 || to < 0 || to >= sortedRows.length) return;
    const next = [...sortedRows];
    [next[idx], next[to]] = [next[to], next[idx]];
    writeGroup(next.map((r, i) => ({ ...r, sort: i + 1 })));
  };

  const save = (): void => {
    // 生效矩阵整快照落 manual（getEffectiveBenchmark 为「manual 存在即整表接管」语义，
    // 只存增量会遮蔽 auto 行）；保存后广播 → 总览矩阵与看板竞品即时同步
    // 空草稿也要持久化为 manual=[]：null 的语义是“清除手动配置并恢复 auto”，
    // 如果把删光竞品误写成 null，用户刚删除的竞品会在下一次读取时重新出现。
    saveBenchmark(draft); // 保留每行来源（矩阵/自动/替代），人工增加的行已标 manual
    window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT));
    message.success('对标配置已保存，看板竞品已同步');
    onClose();
  };

  const restoreAuto = (): void => {
    saveBenchmark(null); // 清除 manual 快照，回退 dimBenchmark（auto）
    setDraft(getEffectiveBenchmark());
    window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT));
    message.success('已恢复默认对标（矩阵 + 自动匹配）');
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
      width={720}
      centered
      title={model ? `配置对标 · ${model.modelName}` : '配置对标'}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* 恢复默认（auto）——原配置页独有能力收编（清 manual 快照回 auto 基准） */}
          <Popconfirm
            title="恢复默认（auto）？"
            description="清除手动配置，全部映射回到数据基准（auto）"
            okText="恢复"
            cancelText="取消"
            onConfirm={restoreAuto}
          >
            <Button size="small">恢复默认（auto）</Button>
          </Popconfirm>
          <span style={{ flex: 1 }} />
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

          {/* 已配置（当前 ROM）：首位 = 主竞品★，↑↓ 微调次序（预警中心重构收编原配置页排序能力） */}
          {sectionTitle(
            `已配置对标（${currentRows.length}）`,
            '首位 = 主竞品（看板/摘要条的排序首位）· ↑↓ 调整次序',
          )}
          {currentRows.length === 0 ? (
            <div style={{ border: `1px dashed ${color.hairlineStrong}`, borderRadius: radius.card, padding: '8px 12px', fontSize: 12, color: color.mute }}>
              该 ROM 暂无对标竞品 — 从下方候选添加
            </div>
          ) : (
            sortedRows.map((r, i) => {
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
                    {i === 0 && (
                      <span style={{ fontSize: 10, color: color.link, background: '#e8f1ff', borderRadius: radius.pill, padding: '0 6px' }}>
                        ★ 主竞品
                      </span>
                    )}
                  </span>
                  <span className="tnum" style={{ fontSize: 12, fontWeight: 600, color: color.ink, textAlign: 'right' }}>
                    {formatPrice(colorPrice, 'usd')}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                    <Button
                      type="text"
                      size="small"
                      disabled={i === 0}
                      icon={<UpOutlined style={{ fontSize: 10 }} />}
                      style={{ height: 22, width: 22, padding: 0 }}
                      title="上移（移到首位 = 设为主竞品）"
                      onClick={() => moveComp(r.competitor_sku_id, -1)}
                    />
                    <Button
                      type="text"
                      size="small"
                      disabled={i === sortedRows.length - 1}
                      icon={<DownOutlined style={{ fontSize: 10 }} />}
                      style={{ height: 22, width: 22, padding: 0 }}
                      title="下移"
                      onClick={() => moveComp(r.competitor_sku_id, 1)}
                    />
                    <Button size="small" style={{ height: 22, fontSize: 11 }} onClick={() => removeComp(r.competitor_sku_id)}>
                      移除
                    </Button>
                  </span>
                </div>
              );
            })
          )}

          {/* 候选区：品牌 chips + 搜索（原配置页品牌视角收编）+ 同档位推荐优先（价差升序） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 2px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
              {brandOptions.map((b) => {
                const active = brandSel.includes(b);
                return (
                  <span
                    key={b}
                    role="button"
                    onClick={() => setBrandSel((prev) => (active ? prev.filter((x) => x !== b) : [...prev, b]))}
                    style={{
                      padding: '1px 8px',
                      fontSize: 10.5,
                      fontWeight: 600,
                      lineHeight: '17px',
                      borderRadius: radius.pill,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      color: active ? '#ffffff' : color.body,
                      background: active ? '#0070f3' : color.canvasSoft2,
                      border: `1px solid ${active ? '#0070f3' : color.hairline}`,
                    }}
                  >
                    {b}
                  </span>
                );
              })}
            </span>
            <Input
              size="small"
              allowClear
              prefix={<SearchOutlined style={{ fontSize: 11, color: color.mute }} />}
              placeholder="搜索型号 / 容量"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 180, marginLeft: 'auto', fontSize: fontSize.caption }}
            />
          </div>
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
            {sameTier.length === 0 && otherGroups.length === 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: color.mute }}>
                无匹配候选 — 调整品牌 / 关键词
              </div>
            )}
          </div>

          <div style={{ fontSize: fontSize.caption, color: color.mute, marginTop: 8, lineHeight: '16px' }}>
            保存 = 整表快照转为手动配置，可随时在左下角恢复 auto 默认；自动匹配开启时看板竞品立即跟随。
          </div>
        </div>
      )}
    </Modal>
  );
}
