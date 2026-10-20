// ============================================================
// 多平台对比弹窗（第五十三轮实装，取代原「规划中」占位）：单产品多平台视角——
// 同一 ROM 的周度折后价按平台展开（OZON/DNS/M.Video 三线）+ 最新周平台价差读数。
// 数据 = buildPlatformCompare（纯计算层，与预警平台价差同源因子）；周度口径固定
// （与采集/预警一致），随币种切换折算。入口 = 总览型号行「多平台对比」。
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, Segmented } from 'antd';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { OverviewModel } from '../../dataModel/aggregate';
import { buildPlatformCompare } from '../../dataModel/platformCompare';
import type { CurrencyMode } from '../../dataModel/types';
import { color, fontSize, radius, localCurrencySymbol } from '../../theme/tokens';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

/** 平台线配色（与预警类型徽标同语言）：OZON = 品牌蓝（我司官方渠道基准）、DNS = 琥珀、M.Video = 紫 */
const PLATFORM_COLOR: Record<string, string> = {
  OZON: '#0053c2',
  DNS: '#b45309',
  'M.Video': '#6d28d9',
};

export default function MultiPlatformModal(props: {
  open: boolean;
  model: OverviewModel | null;
  /** 打开时预选的 ROM（总览我司行「多平台对比」按该行 ROM 预选） */
  initialRomram?: string | null;
  currency: CurrencyMode;
  onClose: () => void;
}) {
  const { model, currency } = props;
  const [romram, setRomram] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // ROM 切换默认 = 预选 ROM → 首档（模型变化 / 打开时重置）
  const effectiveRom = useMemo(() => {
    if (!model) return null;
    const chosen = romram ?? props.initialRomram ?? null;
    return model.rows.some((r) => r.romram === chosen) ? chosen : (model.rows[0]?.romram ?? null);
  }, [model, romram, props.initialRomram]);

  const result = useMemo(() => {
    if (!model || !effectiveRom) return null;
    const row = model.rows.find((r) => r.romram === effectiveRom)!;
    return buildPlatformCompare(model.modelId, effectiveRom, [row.skuId], currency);
  }, [model, effectiveRom, currency]);

  // 渲染 ECharts（open/数据/币种 变化重建；弹窗宽度固定，无 resize 跟随需求）
  useEffect(() => {
    if (!props.open || !result || !boxRef.current || result.weeks.length === 0) return;
    const chart = echarts.init(boxRef.current);
    chartRef.current = chart;
    const isUsd = currency === 'usd';
    chart.setOption({
      animation: false,
      grid: { left: 56, right: 16, top: 34, bottom: 26 },
      legend: { top: 4, left: 4, itemWidth: 14, textStyle: { fontSize: 11, color: color.body } },
      tooltip: {
        trigger: 'axis',
        confine: true,
        valueFormatter: (v: number | null) => (v == null ? '—' : `${isUsd ? '$' : localCurrencySymbol()}${v.toLocaleString('en-US')}`),
      },
      xAxis: {
        type: 'category',
        data: result.weeks.map((w) => w.label),
        axisLine: { lineStyle: { color: color.hairlineStrong } },
        axisTick: { show: false },
        axisLabel: { fontSize: 10, color: color.mute, interval: Math.max(1, Math.floor(result.weeks.length / 10)) },
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: color.hairline } },
        axisLabel: {
          fontSize: 10,
          color: color.mute,
          formatter: (v: number) => (isUsd ? `$${Math.round(v)}` : `${localCurrencySymbol()}${Math.round(v / 1000)}K`),
        },
      },
      series: result.series.map((s) => ({
        name: s.platform,
        type: 'line',
        data: s.points,
        symbol: 'none',
        lineStyle: {
          width: s.platform === 'OZON' ? 2.5 : 1.5,
          color: PLATFORM_COLOR[s.platform] ?? color.body,
        },
        itemStyle: { color: PLATFORM_COLOR[s.platform] ?? color.body },
        emphasis: { focus: 'series' },
      })),
    });
    return () => {
      chart.dispose();
      chartRef.current = null;
    };
  }, [props.open, result, currency]);

  // 每次打开重置 ROM 选择到预选档（props.open 变化时）
  useEffect(() => {
    if (props.open) setRomram(props.initialRomram ?? null);
  }, [props.open, model, props.initialRomram]);

  const fmt = (v: number | null): string => (v == null ? '—' : `${currency === 'usd' ? '$' : localCurrencySymbol()}${v.toLocaleString('en-US')}`);
  const gapPctText = (v: number): string => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

  return (
    <Modal
      open={props.open}
      width={720}
      centered
      title={
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          多平台对比
          <span style={{ fontSize: 11, fontWeight: 400, color: color.mute }}>
            {model?.modelName ?? ''} · 单产品多平台（周度折后价）
          </span>
        </span>
      }
      onCancel={props.onClose}
      footer={
        <Button type="primary" size="small" onClick={props.onClose}>
          关闭
        </Button>
      }
    >
      {!model || !result || result.weeks.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', fontSize: fontSize.bodySm, color: color.mute }}>
          该型号暂无可比周数据
        </div>
      ) : (
        <>
          {/* ROM 切换（多档型号）+ 最新周价差读数 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            {model.rows.length > 1 ? (
              <Segmented
                size="small"
                value={effectiveRom ?? undefined}
                onChange={(v) => setRomram(String(v))}
                options={model.rows.map((r) => ({ label: r.romram, value: r.romram }))}
              />
            ) : (
              <span style={{ fontSize: 12, color: color.body }}>{effectiveRom}</span>
            )}
            <span style={{ flex: 1 }} />
            {result.latest && (
              <span className="tnum" style={{ fontSize: 12, color: color.body }}>
                最新周（{result.latest.label}）平台价差{' '}
                <span style={{ fontWeight: 700, color: '#6d28d9' }}>{gapPctText(result.latest.gapPct)}</span>
                ：{result.latest.high.platform} {fmt(result.latest.high.price)} ／ {result.latest.low.platform}{' '}
                {fmt(result.latest.low.price)}
              </span>
            )}
          </div>
          <div
            ref={boxRef}
            style={{
              height: 300,
              border: `1px solid ${color.hairline}`,
              borderRadius: radius.card,
              background: color.canvas,
            }}
          />
        </>
      )}
    </Modal>
  );
}
