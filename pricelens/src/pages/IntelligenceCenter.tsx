// ============================================================
// 情报中心 → GTM 情报工作台（t428u Batch3，2026-11-07）
// ----------------------------------------------------------------
// 设计定稿：docs/design/pricelens-t428u-design-20261107.md §6.1/§14、
// mockups/b-gtm-intel-workbench.html。这是给 GTM 决策用的高密度工作台，
// 不是营销海报墙：
//   - 顶栏：五大模块 chips（新品 | 竞品 | 渠道 | 价格促销 | 市场事件），
//     国家 / 产业 / 时间窗读取全局 FiltersState（国家选择在共享页头，
//     时间窗在价格走势筛选条——本页只读联动，不回写，避免破坏稳定口径）；
//   - 五模块分区卡片流：区分「示例 / 本地 / 待接入」三种数据状态，
//     渠道模块诚实占位，绝不伪造实时抓取；
//   - 图卡 5 要素 + 示例徽章；新品 / 竞品默认渲染 Wikimedia Commons
//     CC/PD 真机照片（public/gtm-samples/），未配图 / 加载失败走中性灰底缩写；
//   - 点卡片 / Tab+Enter 展开右侧详情抽屉（Esc 关闭，240ms +
//     prefers-reduced-motion 降级），提供「进入量价预测」真实捷径。
// 稳定渠道继续由 appChannel 隐藏本页（hiddenInStable），本文件不触碰通道语义。
// ============================================================
import { useMemo, useState } from 'react';
import { RobotOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import PageHeader from '../components/PageHeader';
import { useAgent } from '../state/AgentContext';
import { useFilters } from '../state/FiltersContext';
import { usePage } from '../state/PageContext';
import { scopeLabels } from '../dataModel/scope';
import { DEMO_INTELLIGENCE_PROVENANCE, provenanceSummary } from '../dataModel/provenance';
import { color, font, fontSize, radius, selectSoft, selectSoftInk, shadow, space } from '../theme/tokens';
import {
  INTEL_MODULES,
  bucketRangeLabel,
  intelItemsForScope,
  moduleEmptyReason,
  type IntelItem,
  type IntelModuleId,
  type IntelScope,
} from './intelligence/gtmIntel';
import IntelCard from './intelligence/IntelCard';
import IntelDrawer from './intelligence/IntelDrawer';

export default function IntelligenceCenter() {
  const { state } = useFilters();
  const { openAgent } = useAgent();
  const { go } = usePage();
  const labels = useMemo(() => scopeLabels(state), [state]);
  const rangeLabel = bucketRangeLabel(state.granularity, state.rangeStart, state.rangeEnd);
  const scope: IntelScope = {
    countryCode: state.countryCode,
    industry: state.industry,
    granularity: state.granularity,
    rangeStart: state.rangeStart,
    rangeEnd: state.rangeEnd,
  };
  const items = useMemo(
    () => intelItemsForScope(scope),
    [state.countryCode, state.industry, state.granularity, state.rangeStart, state.rangeEnd], // eslint-disable-line react-hooks/exhaustive-deps -- scope 字段即依赖清单
  );

  // 模块 chips = 本地视图过滤（默认五区全开）；点 chip 收起/恢复对应分区
  const [hiddenModules, setHiddenModules] = useState<ReadonlySet<IntelModuleId>>(new Set());
  const toggleModule = (id: IntelModuleId) => {
    setHiddenModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 详情抽屉：点卡片 / Enter 打开；Esc / 遮罩 / 关闭钮关闭
  const [openItem, setOpenItem] = useState<IntelItem | null>(null);

  const askAgentSummary = () =>
    openAgent('full', `总结当前 GTM 情报工作台的关键变化，并指出对价格和库存的影响（范围：${labels.country} · ${labels.industry} · ${rangeLabel}）`);

  const askAgentAboutItem = (item: IntelItem) => {
    const subject = item.brand && item.model ? `${item.brand} ${item.model}` : item.title;
    setOpenItem(null);
    openAgent('dock', `评估 ${subject} 对当前产品价格、销量和库存的影响（范围：${labels.country} · ${labels.industry} · ${rangeLabel}）`);
  };

  return (
    <div style={{ height: '100%', overflowX: 'auto', overflowY: 'auto', background: color.canvasSoft }} data-lpl-scroll>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <PageHeader />
        <main style={{ flex: 1, padding: `${space.lg}px`, maxWidth: 1440, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {/* 标题行 + 演示口径：示例徽章全局可见，不冒充实时 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: space.md, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: color.mute, letterSpacing: '.04em' }}>INTELLIGENCE CENTER / {state.countryCode}</div>
              <h1 style={{ margin: '3px 0 0', fontSize: fontSize.displaySm, color: color.ink }}>GTM 情报工作台</h1>
              <div style={{ marginTop: 5, fontSize: 12, color: color.mute }}>
                {labels.country} · {labels.industry} · {rangeLabel}——新品 / 竞品 / 渠道 / 价格促销 / 市场事件五模块；卡片按 5 要素组织，展开可溯源。
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Tag color="blue" title={provenanceSummary(DEMO_INTELLIGENCE_PROVENANCE)}>示例数据</Tag>
              <Button onClick={() => go('forecast')}>进入量价预测</Button>
              <Button icon={<RobotOutlined />} onClick={askAgentSummary}>让 Agent 总结</Button>
            </div>
          </div>

          {/* 模块 chips + 全局筛选联动状态（只读）：chips 控制分区显隐，范围随全局筛选 */}
          <section
            aria-label="模块与筛选范围"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: space.sm,
              flexWrap: 'wrap',
              background: color.canvas,
              border: `1px solid ${color.hairline}`,
              borderRadius: radius.card,
              boxShadow: shadow.l1,
              padding: `${space.sm}px ${space.md}px`,
              marginBottom: space.md,
            }}
          >
            {INTEL_MODULES.map((module) => {
              const count = items.filter((item) => item.module === module.id).length;
              const visible = !hiddenModules.has(module.id);
              const pending = module.id === 'channel';
              return (
                <button
                  key={module.id}
                  type="button"
                  data-lpl-intel-chip={module.id}
                  aria-pressed={visible}
                  onClick={() => toggleModule(module.id)}
                  title={module.hint}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: `1px solid ${visible && !pending ? selectSoftInk : color.hairline}`,
                    background: visible && !pending ? selectSoft : color.canvas,
                    color: visible && !pending ? selectSoftInk : color.body,
                    borderRadius: radius.control,
                    padding: '6px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    opacity: visible ? 1 : 0.72,
                  }}
                >
                  {module.label}
                  <span className="tnum" style={{ fontSize: 11, color: visible && !pending ? selectSoftInk : color.mute }}>
                    {pending ? '待接入' : count}
                  </span>
                </button>
              );
            })}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: color.mute, whiteSpace: 'nowrap' }}>
              联动全局筛选：{labels.country} / {labels.industry} / {rangeLabel}（只读，改筛选请回价格走势）
            </span>
          </section>

          {/* 五模块分区：每区头部亮明数据状态，空区给诚实空态 */}
          {INTEL_MODULES.map((module) => {
            if (hiddenModules.has(module.id)) return null;
            const moduleItems = items.filter((item) => item.module === module.id);
            const sampleCount = moduleItems.filter((item) => item.dataMode === 'sample').length;
            const localCount = moduleItems.filter((item) => item.dataMode === 'local').length;
            return (
              <section
                key={module.id}
                data-lpl-intel-section={module.id}
                aria-label={`${module.label}分区`}
                style={{ background: color.canvas, borderRadius: radius.card, boxShadow: shadow.l1, padding: space.lg, marginBottom: space.md }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: space.md, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 16, color: color.ink }}>{module.label}</h2>
                  <span style={{ fontSize: 11, color: sampleCount && localCount ? color.body : color.mute }}>
                    {localCount > 0 && `本地 ${localCount}`}
                    {localCount > 0 && sampleCount > 0 && ' + '}
                    {sampleCount > 0 && `示例 ${sampleCount}`}
                    {module.id === 'channel' && '待接入'}
                  </span>
                  <span style={{ fontSize: 11.5, color: color.mute }}>{module.hint}</span>
                </div>
                {moduleItems.length === 0 ? (
                  <div
                    data-lpl-intel-empty={module.id}
                    style={{ border: `1px dashed ${color.hairlineStrong}`, borderRadius: radius.card, padding: `${space.md}px ${space.base}px`, fontSize: 12, color: color.mute, lineHeight: 1.6 }}
                  >
                    {moduleEmptyReason(module.id)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: space.md }}>
                    {moduleItems.map((item) => (
                      <IntelCard key={item.id} item={item} onOpen={setOpenItem} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {/* 口径与图片授权说明：本页所有判断均为示例，图片为 CC/PD 真机照 */}
          <div style={{ marginTop: space.sm, fontSize: 11, color: color.mute, lineHeight: 1.7 }}>
            口径说明：{provenanceSummary(DEMO_INTELLIGENCE_PROVENANCE)}；新品 / 竞品卡图为 Wikimedia Commons CC0 / CC BY / CC BY-SA 真机照片（授权见
            {' '}<span style={{ fontFamily: font.mono, fontSize: 10.5 }}>public/gtm-samples/ATTRIBUTION.md</span>），未配图条目与加载失败均显示中性灰底占位。真实情报源（新品官方图库、渠道采集、促销抓取）接入前，本页不展示任何实时数据。
          </div>
        </main>
      </div>
      {openItem ? (
        <IntelDrawer
          item={openItem}
          onClose={() => setOpenItem(null)}
          onGoForecast={() => go('forecast')}
          onAskAgent={askAgentAboutItem}
        />
      ) : null}
    </div>
  );
}
