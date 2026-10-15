import { Button } from 'antd';
import { usePage } from '../state/PageContext';
import FilterBar from '../components/FilterBar';
import PriceTrend from '../chart/PriceTrend';
import { color, fontSize, radius, shadow, space } from '../theme/tokens';

const FOOTER_TEXT =
  '口径：RRP=官方建议零售价 · 折后价=可抓取平台最低在架价 · offer 为文本权益不计价 · 月/季=桶内均值取整 · 促销力度=折后价相对上市价的降幅（+为高于上市价） · 参考汇率 80₽/$（配置页可改）';

/** 页面骨架 —— 图表负责人（Agent C）在此基础上完善（§4.1 信息架构） */
export default function Dashboard() {
  const { go } = usePage();
  return (
    <div style={{ height: '100%', overflowX: 'auto', background: color.canvasSoft }}>
      {/* 第二十八轮：1440 → 1280，筛选条重排后 1280 视口零溢出（1280 笔记本无横向滚动） */}
      <div style={{ minWidth: 1280, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏 64px */}
        <header
          style={{
            height: 64,
            flexShrink: 0,
            background: color.canvas,
            boxShadow: shadow.l1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `0 ${space.lg}px`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: space.md }}>
            <span style={{ fontSize: fontSize.bodyMd, fontWeight: 600, color: color.ink }}>PriceLens</span>
            <span style={{ fontSize: fontSize.caption, color: color.mute }}>
              欧亚 / R国 · 数据批次 <span className="tnum">2026-W41</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: space.sm }}>
            <Button size="small" style={{ height: 28 }} onClick={() => go('overview')}>
              总览
            </Button>
            <Button size="small" type="primary" style={{ height: 28 }}>
              价格看板
            </Button>
            <Button size="small" style={{ height: 28 }} onClick={() => go('config')}>
              配置
            </Button>
          </div>
        </header>

        {/* 筛选条五框（占位 → Agent B 替换） */}
        <FilterBar />

        {/* 价格走势（第十二轮：标题并入 PriceTrend 首行，消除三段式纵向空白） */}
        <main style={{ flex: 1, padding: space.lg }}>
          <section
            style={{
              background: color.canvas,
              boxShadow: shadow.l1,
              borderRadius: radius.card,
              padding: space.lg,
            }}
          >
            {/* 图表全家桶（§6：标题+价格类型/汇总 + 图主体 + 刷选 + 下钻） */}
            <PriceTrend />
          </section>
        </main>

        {/* 页脚：全页唯一允许的说明文本 */}
        <footer
          style={{
            flexShrink: 0,
            padding: `${space.md}px ${space.lg}px`,
            fontSize: fontSize.caption,
            color: color.mute,
          }}
        >
          {FOOTER_TEXT}
        </footer>
      </div>
    </div>
  );
}
