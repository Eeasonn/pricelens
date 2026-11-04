import { describe, expect, it } from 'vitest';
import { checkOrigin, resolveRequestOrigin } from '../origins';

const ALLOWLIST = ['https://eeasonn.github.io', 'http://localhost:5174'];

function headersWith(entries: Array<[string, string]>): Headers {
  return new Headers(entries);
}

describe('resolveRequestOrigin', () => {
  it('prefers the Origin header', () => {
    expect(resolveRequestOrigin(headersWith([['origin', 'https://Eeasonn.github.io/']]))).toBe('https://eeasonn.github.io');
  });

  it('normalizes a non-standard path-ful Origin to scheme+host (same口径 as allowlist entries)', () => {
    expect(resolveRequestOrigin(headersWith([['origin', 'https://eeasonn.github.io/pricelens']]))).toBe('https://eeasonn.github.io');
  });

  it('falls back to the Referer origin when Origin is absent', () => {
    expect(resolveRequestOrigin(headersWith([['referer', 'https://eeasonn.github.io/PriceLens/?tab=1']]))).toBe('https://eeasonn.github.io');
  });

  it('treats the literal "null" origin (file://) as missing and uses Referer instead', () => {
    expect(resolveRequestOrigin(headersWith([['origin', 'null'], ['referer', 'http://localhost:5174/']]))).toBe('http://localhost:5174');
    expect(resolveRequestOrigin(headersWith([['origin', 'null']]))).toBeNull();
  });

  it('returns null when neither Origin nor Referer exists', () => {
    expect(resolveRequestOrigin(headersWith([]))).toBeNull();
  });
});

describe('checkOrigin (fail-closed)', () => {
  it('rejects everything when the allowlist is unconfigured', () => {
    const decision = checkOrigin('https://eeasonn.github.io', null);
    expect(decision).toEqual({ allowed: false, origin: 'https://eeasonn.github.io', reason: 'unconfigured' });
    expect(checkOrigin(null, [])).toMatchObject({ allowed: false, reason: 'unconfigured' });
  });

  it('rejects requests without any origin header even when configured', () => {
    expect(checkOrigin(null, ALLOWLIST)).toEqual({ allowed: false, origin: null, reason: 'missing-origin' });
  });

  it('allows exact allowlisted origins', () => {
    expect(checkOrigin('http://localhost:5174', ALLOWLIST)).toEqual({ allowed: true, origin: 'http://localhost:5174', reason: 'allowed' });
  });

  it('rejects origins outside the allowlist', () => {
    expect(checkOrigin('https://evil.example', ALLOWLIST)).toEqual({ allowed: false, origin: 'https://evil.example', reason: 'not-allowlisted' });
  });
});
