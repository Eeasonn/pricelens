import { describe, expect, it } from 'vitest';
import { RECORDING_PLAN, recordingDuration, sectionSource, validateRecordingPlan } from '../plan';

describe('连续录制分镜与真实来源', () => {
  it('14 个镜头共 180 秒，并包含四个章节的转场', () => {
    expect(RECORDING_PLAN).toHaveLength(14);
    expect(recordingDuration(RECORDING_PLAN)).toBe(180000);
    expect(RECORDING_PLAN[0].scene).toBe('agent-fullscreen');
    expect(RECORDING_PLAN[RECORDING_PLAN.length - 1]?.scene).toBe('closing');
    expect(RECORDING_PLAN.filter((shot) => shot.transition).map((shot) => shot.transition)).toEqual([
      '主动提醒，让变化先被看见',
      '把外部变化放进同一上下文',
      '从历史关系，到滚动预测',
    ]);
  });

  it('价格与真实预警使用真实系统，情报和 SO 使用模拟页面', () => {
    expect(sectionSource('price')).toBe('http://localhost:5174/');
    expect(sectionSource('alerts')).toBe('http://localhost:5174/?p=alerts');
    expect(sectionSource('intel')).toBeNull();
    expect(sectionSource('so')).toBeNull();
    expect(sectionSource('closing')).toBeNull();
  });

  it('缺少真实来源或结尾错误时拒绝录制计划', () => {
    expect(validateRecordingPlan(RECORDING_PLAN).valid).toBe(true);
    expect(validateRecordingPlan(RECORDING_PLAN.slice(0, 3)).valid).toBe(false);
    expect(validateRecordingPlan([...RECORDING_PLAN.slice(0, -1), { ...RECORDING_PLAN[RECORDING_PLAN.length - 1]!, scene: 'so' }]).valid).toBe(false);
  });
});
