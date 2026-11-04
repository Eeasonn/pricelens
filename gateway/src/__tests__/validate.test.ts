import { describe, expect, it } from 'vitest';
import { MAX_REQUEST_BYTES, MAX_TEXT_LENGTH, isResponseShape, parseRunRequest } from '../validate';
import { VALID_BASELINE, runsRequestBody } from './helpers';

describe('isResponseShape', () => {
  it('accepts a well-formed baseline', () => {
    expect(isResponseShape(VALID_BASELINE)).toBe(true);
  });

  it('rejects invalid intents, non-object values and bad card kinds', () => {
    expect(isResponseShape(null)).toBe(false);
    expect(isResponseShape('x')).toBe(false);
    expect(isResponseShape([])).toBe(false);
    expect(isResponseShape({ ...VALID_BASELINE, intent: 'sort' })).toBe(false);
    expect(isResponseShape({ ...VALID_BASELINE, cards: [{ kind: 'iframe' }] })).toBe(false);
    expect(isResponseShape({ ...VALID_BASELINE, suggestions: [1] })).toBe(false);
    expect(isResponseShape({ ...VALID_BASELINE, provider: { name: 'x' } })).toBe(false);
  });
});

describe('parseRunRequest', () => {
  it('parses a valid request and derives the run id', () => {
    const result = parseRunRequest(JSON.stringify(runsRequestBody()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.text).toContain('华为');
      expect(result.request.runId).toBe('req-1');
      expect(result.request.baseline.contextFingerprint).toBe('ctx-abc');
    }
  });

  it('prefers runId over clientRequestId', () => {
    const result = parseRunRequest(JSON.stringify(runsRequestBody({ runId: 'run-9' })));
    expect(result.ok && result.request.runId).toBe('run-9');
  });

  it('rejects non-JSON bodies', () => {
    expect(parseRunRequest('not json')).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects missing or blank text', () => {
    expect(parseRunRequest(JSON.stringify(runsRequestBody({ text: undefined })))).toMatchObject({ ok: false, status: 400 });
    expect(parseRunRequest(JSON.stringify(runsRequestBody({ text: '   ' })))).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects overlong text with 413', () => {
    expect(parseRunRequest(JSON.stringify(runsRequestBody({ text: 'a'.repeat(MAX_TEXT_LENGTH + 1) })))).toMatchObject({ ok: false, status: 413 });
  });

  it('rejects oversized bodies before parsing', () => {
    expect(parseRunRequest(JSON.stringify({ text: 'x', baseline: VALID_BASELINE, filler: 'y'.repeat(MAX_REQUEST_BYTES) }))).toMatchObject({ ok: false, status: 413, error: '请求体过大' });
  });

  it('rejects a non-object context', () => {
    expect(parseRunRequest(JSON.stringify(runsRequestBody({ context: ['array'] })))).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects requests without a valid baseline (gateway policy)', () => {
    const missing = parseRunRequest(JSON.stringify({ text: '问一下', clientRequestId: 'r1' }));
    expect(missing).toMatchObject({ ok: false, status: 400 });
    if (!missing.ok) expect(missing.error).toContain('baseline');
    const invalid = parseRunRequest(JSON.stringify(runsRequestBody({ baseline: { intent: 'nope' } })));
    expect(invalid).toMatchObject({ ok: false, status: 400 });
  });
});
