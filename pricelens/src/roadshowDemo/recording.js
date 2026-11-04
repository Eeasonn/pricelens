export const RECORDING_SHOTS = [
  { id: 'opening', scene: 'agent-fullscreen', durationMs: 5000, narration: '这次演示从 Price Agent 的全屏语音开始。' },
  { id: 'voice', scene: 'agent-fullscreen', durationMs: 12000, narration: '我只说一句：我要查看 R 国的 Pura 90s Pro 价格情况。Agent 随即给出全部型号，并自动带出相关竞品。' },
  { id: 'dock', scene: 'transition', durationMs: 8000, narration: '确认应用后，Agent 在原地收窄为侧栏，左侧看板同步出现。对话和筛选上下文都连续保留。' },
  { id: 'chart', scene: 'price', durationMs: 18000, narration: '接下来是真实看板。分图、合并、大促权益和悬停都围绕同一口径展开。' },
  { id: 'details', scene: 'price', durationMs: 9000, narration: '图表与下方明细保持同一时间窗口。' },
  { id: 'promo-alert', scene: 'alerts', durationMs: 8000, narration: '主动预警直接出现在 Agent 消息流中，同时列出促销权益和仍需核实的内容。' },
  { id: 'fx-alert', scene: 'intel', durationMs: 12000, narration: '汇率预警可以顺势进入情报中心，核对真实汇率和关键节点。' },
  { id: 'context', scene: 'intel', durationMs: 10000, narration: '存储行业预测、模拟大盘和新品事件，共同构成后续预测的外部情景。' },
  { id: 'continuous', scene: 'so', durationMs: 14000, narration: 'SO 主视图始终锁定 Pura 90s Pro。实线和实柱是已发生的价格与销量，右侧虚线是未来预测。' },
  { id: 'prior', scene: 'so', durationMs: 16000, narration: '上一代 Pura 80 Pro 提供先验，本代实际数据持续校准。' },
  { id: 'reasons', scene: 'so', durationMs: 20000, narration: '当本周 SO 下滑，Agent 只列出可能原因：供应收紧、竞品价促、档位真实需求变化，以及产品进出档位造成的结构变化。' },
  { id: 'scenario', scene: 'so', durationMs: 22000, narration: '我可以把这些因素作为假设纳入预测。调整竞品、大盘、成本情景和供应后，只有未来的虚线柱发生变化。' },
  { id: 'realized', scene: 'so', durationMs: 14000, narration: '无约束需求还要经过可售库存和渠道履约，才会成为实际 SO。' },
  { id: 'closing', scene: 'closing', durationMs: 12000, narration: '这就是 Price Agent 的规划路径：从价格事实和主动预警出发，把情报转为情景，再持续修正产品全生命周期的量价预测。', asset: 'price-agent-rolling-forecast-v2.png' },
];

export function recordingDuration(shots) {
  return shots.reduce((total, shot) => total + shot.durationMs, 0);
}

export function validateRecordingShots(shots) {
  const errors = [];
  if (shots.length !== 14) errors.push('需要 14 个镜头');
  if (recordingDuration(shots) !== 180000) errors.push('总时长必须为 180000ms');
  if (shots[0]?.scene !== 'agent-fullscreen') errors.push('必须从 Agent 全屏开始');
  if (shots[shots.length - 1]?.asset !== 'price-agent-rolling-forecast-v2.png') errors.push('必须以 V2 定稿图结束');
  for (const scene of ['price', 'alerts', 'intel', 'so']) {
    if (!shots.some((shot) => shot.scene === scene)) errors.push(`缺少 ${scene} 场景`);
  }
  return { valid: errors.length === 0, errors };
}
