import { describe, expect, it } from 'vitest';
import { clampIntent, clampSuggestions, fallbackResponse, mergeModelNarrative, parseModelJson } from '../merge';
import { VALID_BASELINE } from './helpers';

describe('parseModelJson', () => {
  it('parses a plain JSON object', () => {
    expect(parseModelJson('{"summary":"a","intent":"query"}')).toEqual({ summary: 'a', intent: 'query' });
  });

  it('tolerates markdown fences and surrounding noise', () => {
    expect(parseModelJson('好的，结果如下：\n```json\n{"summary":"b"}\n```\n以上。')).toEqual({ summary: 'b' });
  });

  it('returns null for garbage or non-objects', () => {
    expect(parseModelJson('')).toBeNull();
    expect(parseModelJson('没有任何大括号')).toBeNull();
    expect(parseModelJson('{broken')).toBeNull();
    expect(parseModelJson('[1,2,3]')).toBeNull();
  });
});

describe('clampIntent / clampSuggestions (intent 白名单与建议钳制)', () => {
  it('keeps only whitelisted intents, otherwise falls back to baseline', () => {
    expect(clampIntent('alert', 'query')).toBe('alert');
    expect(clampIntent('sort', 'query')).toBe('query');
    expect(clampIntent(undefined, 'clarify')).toBe('clarify');
  });

  it('clamps suggestions to at most 3 non-empty strings', () => {
    expect(clampSuggestions(['a', 'b', 'c', 'd'], ['x'])).toEqual(['a', 'b', 'c']);
    expect(clampSuggestions(['  a  ', '', 42, 'b'], ['x'])).toEqual(['a', 'b']);
    expect(clampSuggestions([], ['x', 'y'])).toEqual(['x', 'y']);
    expect(clampSuggestions(undefined, ['x'])).toEqual(['x']);
  });
});

describe('mergeModelNarrative (baseline 合并)', () => {
  it('overlays only summary/suggestions/intent and keeps baseline facts untouched', () => {
    const baseline = { ...VALID_BASELINE, cards: [{ kind: 'table', id: 't1' }], citations: [{ id: 'c1' }] };
    const merged = mergeModelNarrative(baseline, { summary: '新结论', suggestions: ['追问1', '追问2'], intent: 'alert' }, 'glm-4-flash');
    expect(merged.summary).toBe('新结论');
    expect(merged.intent).toBe('alert');
    expect(merged.suggestions).toEqual(['追问1', '追问2']);
    expect(merged.cards).toEqual([{ kind: 'table', id: 't1' }]);
    expect(merged.citations).toEqual([{ id: 'c1' }]);
    expect(merged.contextFingerprint).toBe('ctx-abc');
    expect(merged.provider).toEqual({ name: 'GLM Gateway', model: 'glm-4-flash' });
    expect(merged.provenance).toMatchObject({ source: 'glm-gateway', provider: 'GLM Gateway', model: 'glm-4-flash' });
  });

  it('falls back to baseline fields when the model output is unusable', () => {
    const merged = mergeModelNarrative(VALID_BASELINE, { summary: '   ', suggestions: [1, null], intent: 'hacking' }, 'glm-4-flash');
    expect(merged.summary).toBe(VALID_BASELINE.summary);
    expect(merged.suggestions).toEqual(VALID_BASELINE.suggestions);
    expect(merged.intent).toBe('query');
  });

  it('accepts a null narrative (empty model output) and still serves the baseline', () => {
    const merged = mergeModelNarrative(VALID_BASELINE, null, 'glm-4-flash');
    expect(merged.summary).toBe(VALID_BASELINE.summary);
    expect(merged.provider?.name).toBe('GLM Gateway');
  });
});

describe('fallbackResponse (流中失败)', () => {
  it('serves the baseline verbatim with an honest fallback provider marker', () => {
    const response = fallbackResponse(VALID_BASELINE, 'glm-4-flash');
    expect(response.summary).toBe(VALID_BASELINE.summary);
    expect(response.suggestions).toEqual(VALID_BASELINE.suggestions);
    expect(response.provider).toEqual({ name: 'GLM Gateway 回退基线', model: 'glm-4-flash' });
    expect(response.provenance).toMatchObject({ source: 'glm-gateway-fallback' });
  });
});
