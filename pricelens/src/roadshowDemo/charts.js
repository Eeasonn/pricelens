function pathFrom(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join('');
}

function scale(value, min, max, top, bottom) {
  if (max === min) return (top + bottom) / 2;
  return bottom - ((value - min) / (max - min)) * (bottom - top);
}

export function renderSOChart(series, selectedFactor = null) {
  const width = 980;
  const left = 58;
  const right = 942;
  const step = (right - left) / (series.length - 1);
  const priceValues = series.map((row) => row.price);
  const priceMin = Math.min(...priceValues) - 20;
  const priceMax = Math.max(...priceValues) + 20;
  const soMax = Math.max(...series.map((row) => Math.max(row.so, row.high ?? 0, row.unconstrainedDemand ?? 0))) * 1.12;
  const x = (index) => left + index * step;
  const yp = (value) => scale(value, priceMin, priceMax, 42, 174);
  const ys = (value) => scale(value, 0, soMax, 218, 330);
  const actual = series.filter((row) => row.kind === 'actual');
  const forecast = series.filter((row) => row.kind === 'forecast');
  const actualIndexes = series.map((row, index) => row.kind === 'actual' ? index : -1).filter((index) => index >= 0);
  const forecastIndexes = series.map((row, index) => row.kind === 'forecast' ? index : -1).filter((index) => index >= 0);
  const actualPricePath = pathFrom(actualIndexes.map((index) => [x(index), yp(series[index].price)]));
  const forecastPricePath = pathFrom([actualIndexes[actualIndexes.length - 1], ...forecastIndexes].map((index) => [x(index), yp(series[index].price)]));
  const splitX = (x(actualIndexes[actualIndexes.length - 1]) + x(forecastIndexes[0])) / 2;
  const bandTop = forecastIndexes.map((index) => [x(index), ys(series[index].high)]);
  const bandBottom = forecastIndexes.map((index) => [x(index), ys(series[index].low)]).reverse();
  const band = `${pathFrom(bandTop)}${bandBottom.map((point) => `L${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join('')}Z`;
  const unconstrainedPath = pathFrom([actualIndexes[actualIndexes.length - 1], ...forecastIndexes].map((index) => [x(index), ys(series[index].kind === 'forecast' ? series[index].unconstrainedDemand : series[index].so)]));
  const capPath = pathFrom(forecastIndexes.map((index) => [x(index), ys(series[index].inventoryAvailableForecast * series[index].fulfillmentRate)]));
  const bars = series.map((row, index) => {
    const barWidth = Math.min(28, step * 0.58);
    const y = ys(row.so);
    const height = 330 - y;
    if (row.kind === 'actual') {
      return `<rect class="so-actual" x="${x(index) - barWidth / 2}" y="${y}" width="${barWidth}" height="${height}" rx="3" fill="#c7ddff"/>`;
    }
    return `<rect class="so-forecast" x="${x(index) - barWidth / 2}" y="${y}" width="${barWidth}" height="${height}" rx="3" fill="#fff" stroke="#0070f3" stroke-width="1.5" stroke-dasharray="4 3"><animate attributeName="height" values="0;${height}" dur="0.28s" begin="0s" fill="freeze"/><animate attributeName="y" values="330;${y}" dur="0.28s" begin="0s" fill="freeze"/></rect>`;
  }).join('');
  const labels = series.map((row, index) => index % 4 === 0 || index === series.length - 1
    ? `<text x="${x(index)}" y="354" text-anchor="middle" font-size="10" fill="#737373">${row.week.slice(0, 4)}W${row.week.slice(4)}</text>` : '').join('');
  const eventLines = [4, 8, 13, 16].filter((index) => index < series.length).map((index) => {
    const labels = { 4: '大促', 8: '锁量释放', 13: '竞品价促', 16: '新品进入' };
    return `<line x1="${x(index)}" y1="34" x2="${x(index)}" y2="330" stroke="#d4d4d4" stroke-dasharray="2 4"/><rect x="${x(index) - 28}" y="12" width="56" height="20" rx="4" fill="${index === 16 ? '#fff7e8' : '#f5f5f5'}"/><text x="${x(index)}" y="26" text-anchor="middle" font-size="9" fill="#4d4d4d">${labels[index]}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} 380" role="img" aria-label="Pura 90s Pro 实际价格与 SO 连续接未来预测" data-selected-factor="${selectedFactor ?? ''}">
    <rect x="${splitX}" y="34" width="${right - splitX}" height="302" fill="#fafafa" stroke="#d4d4d4" stroke-dasharray="4 4"/>
    <g stroke="#ededed"><line x1="${left}" y1="70" x2="${right}" y2="70"/><line x1="${left}" y1="122" x2="${right}" y2="122"/><line x1="${left}" y1="174" x2="${right}" y2="174"/><line x1="${left}" y1="218" x2="${right}" y2="218"/><line x1="${left}" y1="330" x2="${right}" y2="330"/></g>
    <text x="${left}" y="28" font-size="10" fill="#737373">价格 · USD</text><text x="${left}" y="208" font-size="10" fill="#737373">SO · 台</text><text x="${splitX + 12}" y="52" font-size="10" fill="#0053c2">滚动预测</text>
    <path d="${band}" fill="#e8f1ff" opacity=".65"/>
    <path d="${unconstrainedPath}" fill="none" stroke="#0070f3" stroke-width="1.5" stroke-dasharray="3 4" opacity=".75"/>
    <path d="${capPath}" fill="none" stroke="#a1a1a1" stroke-width="1.4" stroke-dasharray="6 4"/>
    ${bars}
    <path d="${actualPricePath}" fill="none" stroke="#c7000b" stroke-width="2.8"/>
    <path d="${forecastPricePath}" fill="none" stroke="#c7000b" stroke-width="2.3" stroke-dasharray="7 5"/>
    <line x1="${splitX}" y1="34" x2="${splitX}" y2="336" stroke="#737373" stroke-dasharray="3 4"/>
    <text x="${splitX - 8}" y="374" text-anchor="end" font-size="10" fill="#737373">当前 W42</text>
    ${labels}${eventLines}
  </svg>`;
}

export function renderFactorChart(actualValues, forecastValues, color = '#0070f3') {
  const values = [...actualValues, ...forecastValues];
  const min = Math.min(...values) * 0.96;
  const max = Math.max(...values) * 1.04;
  const all = [...actualValues, ...forecastValues];
  const step = 280 / (all.length - 1);
  const points = all.map((value, index) => [20 + index * step, scale(value, min, max, 18, 100)]);
  const actualPath = pathFrom(points.slice(0, actualValues.length));
  const forecastPath = pathFrom(points.slice(actualValues.length - 1));
  const splitX = 20 + (actualValues.length - 0.5) * step;
  return `<svg viewBox="0 0 320 120" aria-hidden="true"><line x1="20" y1="100" x2="300" y2="100" stroke="#ebebeb"/><line x1="${splitX}" y1="12" x2="${splitX}" y2="104" stroke="#d4d4d4" stroke-dasharray="2 3"/><path d="${actualPath}" fill="none" stroke="${color}" stroke-width="2"/><path d="${forecastPath}" fill="none" stroke="${color}" stroke-width="1.7" stroke-dasharray="5 4"/><text x="20" y="115" font-size="8" fill="#737373">实际</text><text x="280" y="115" font-size="8" fill="#737373">预测</text></svg>`;
}

export function renderFxChart(points) {
  const coords = points.map((point, index) => [50 + index * (690 / (points.length - 1)), 220 - (point[1] - 68) * 10]);
  const path = pathFrom(coords);
  const area = `${path}L740 235L50 235Z`;
  return `<svg viewBox="0 0 760 270" role="img" aria-label="2026 年俄罗斯央行美元兑卢布官方汇率走势"><defs><linearGradient id="fxFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0070f3" stop-opacity=".18"/><stop offset="1" stop-color="#0070f3" stop-opacity="0"/></linearGradient></defs><g stroke="#eee"><line x1="50" y1="40" x2="740" y2="40"/><line x1="50" y1="90" x2="740" y2="90"/><line x1="50" y1="140" x2="740" y2="140"/><line x1="50" y1="190" x2="740" y2="190"/><line x1="50" y1="235" x2="740" y2="235"/></g><g fill="#737373" font-size="10" text-anchor="end"><text x="40" y="44">88</text><text x="40" y="94">83</text><text x="40" y="144">78</text><text x="40" y="194">73</text><text x="40" y="239">68</text></g><path d="${area}" fill="url(#fxFill)"/><path d="${path}" fill="none" stroke="#0070f3" stroke-width="2.5" stroke-linejoin="round"/><g fill="#737373" font-size="10"><text x="50" y="258">1月</text><text x="180" y="258">3月</text><text x="310" y="258">5月</text><text x="450" y="258">7月</text><text x="580" y="258">9月</text><text x="715" y="258">10月</text></g><circle cx="740" cy="91.3" r="4.5" fill="#0070f3"/><text x="660" y="78" fill="#0070f3" font-size="11">80.8664</text></svg>`;
}

export function renderPriceDemoChart({ split = false, promo = true, benefits = false }) {
  const bands = promo ? '<g><rect x="305" y="18" width="95" height="288" fill="#fff4db"/><rect x="655" y="18" width="90" height="288" fill="#fff4db"/><text x="320" y="35" fill="#a16207" font-size="10">大促档期 · 模拟</text><text x="670" y="35" fill="#a16207" font-size="10">平台大促 · 模拟</text></g>' : '';
  const benefit = benefits ? '<g><rect x="330" y="90" width="92" height="24" rx="5" fill="#e8f1ff"/><text x="341" y="106" fill="#0053c2" font-size="10">平台券 −6%</text><rect x="680" y="90" width="100" height="24" rx="5" fill="#e8f1ff"/><text x="691" y="106" fill="#0053c2" font-size="10">以旧换新补贴</text></g>' : '';
  if (split) {
    return `<div class="split-charts"><div class="mini-chart"><b>Pura 90s Pro · 价格</b><svg viewBox="0 0 400 190"><path d="M20 145H70V135H120V140H170V130H220V135H270V125H320V130H380" fill="none" stroke="#c7000b" stroke-width="3"/><g stroke="#eee"><line x1="15" y1="45" x2="385" y2="45"/><line x1="15" y1="95" x2="385" y2="95"/><line x1="15" y1="160" x2="385" y2="160"/></g></svg></div><div class="mini-chart"><b>iPhone 17 Pro / S26 Ultra · 对比</b><svg viewBox="0 0 400 190"><path d="M20 70H70V65H120V75H170V85H220V75H270V90H320V80H380" fill="none" stroke="#1d1d1f" stroke-width="2"/><path d="M20 105H70V100H120V110H170V120H220V115H270V140H320V80H380V110" fill="none" stroke="#0000cc" stroke-width="2"/><g stroke="#eee"><line x1="15" y1="45" x2="385" y2="45"/><line x1="15" y1="160" x2="385" y2="160"/></g></svg></div></div>`;
  }
  return `<svg class="price-demo-svg" viewBox="0 0 900 340" role="img" aria-label="价格走势交互模拟">${bands}<g stroke="#ededed"><line x1="50" y1="50" x2="880" y2="50"/><line x1="50" y1="110" x2="880" y2="110"/><line x1="50" y1="170" x2="880" y2="170"/><line x1="50" y1="230" x2="880" y2="230"/><line x1="50" y1="290" x2="880" y2="290"/></g><g fill="#737373" font-size="10" text-anchor="end"><text x="40" y="54">2K</text><text x="40" y="114">1.7K</text><text x="40" y="174">1.4K</text><text x="40" y="234">1.1K</text><text x="40" y="294">800</text></g><path d="M60 165H140V155H220V165H300V180H380V160H460V180H540V195H620V180H700V195H780V210H870" fill="none" stroke="#1d1d1f" stroke-width="2.2"/><path d="M60 205H140V195H220V210H300V220H380V235H460V225H540V245H620V275H700V230H780V155H870V220" fill="none" stroke="#0000cc" stroke-width="2.2"/><path d="M540 270H580V260H620V265H660V255H700V250H740V255H780V245H820V250H870" fill="none" stroke="#c7000b" stroke-width="3"/>${benefit}<g fill="#c7000b" font-size="11"><text x="792" y="230">1 021</text></g><g fill="#737373" font-size="10" text-anchor="middle"><text x="60" y="324">W19</text><text x="220" y="324">W25</text><text x="380" y="324">W29</text><text x="540" y="324">W33</text><text x="700" y="324">W38</text><text x="870" y="324">W42</text></g></svg>`;
}
