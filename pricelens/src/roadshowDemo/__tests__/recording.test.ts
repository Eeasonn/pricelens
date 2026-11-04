import { describe, expect, it } from 'vitest';
import { RECORDING_SHOTS, recordingDuration, validateRecordingShots } from '../recording';

describe('180 秒录制契约', () => {
  it('14 个镜头总计 180000ms，从 Agent 全屏开始，以 V2 定稿图结束', () => {
    expect(RECORDING_SHOTS).toHaveLength(14);
    expect(recordingDuration(RECORDING_SHOTS)).toBe(180000);
    expect(RECORDING_SHOTS[0].scene).toBe('agent-fullscreen');
    expect(RECORDING_SHOTS[RECORDING_SHOTS.length - 1]?.asset).toBe('price-agent-rolling-forecast-v2.png');
    expect(validateRecordingShots(RECORDING_SHOTS)).toEqual({ valid: true, errors: [] });
  });

  it('时长不正确或缺少必要场景时拒绝录制契约', () => {
    const invalid = RECORDING_SHOTS.slice(0, 3);
    const result = validateRecordingShots(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
