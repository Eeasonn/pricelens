import { describe, expect, it } from 'vitest';
import { RECORDING_PLAN } from '../plan';
import { toWebVtt } from '../subtitles';

describe('连续录制字幕', () => {
  it('从分镜脚本生成带时间轴的 WebVTT', () => {
    const vtt = toWebVtt(RECORDING_PLAN);
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:05.000');
    expect(vtt).toContain('02:48.000');
    expect(vtt).toContain('这就是 Price Agent 的规划路径');
    expect(vtt).not.toContain('undefined');
  });
});
