import { describe, expect, it } from 'vitest';
import { parseAllowedOrigins, parseGlmThinking, parseGatewayConfig, resolveModel } from '../config';
import { testEnv } from './helpers';

describe('parseAllowedOrigins', () => {
  it('splits, trims, lowercases and dedupes the comma separated list', () => {
    expect(parseAllowedOrigins(' https://A.github.io/ ,http://localhost:5173,https://a.github.io ')).toEqual([
      'https://a.github.io',
      'http://localhost:5173',
    ]);
  });

  it('normalizes entries to scheme+host+port (browser Origin never carries a path)', () => {
    expect(parseAllowedOrigins('https://eeasonn.github.io/pricelens,http://localhost:5173,http://localhost:5177')).toEqual([
      'https://eeasonn.github.io',
      'http://localhost:5173',
      'http://localhost:5177',
    ]);
  });

  it('returns null when unconfigured or blank (fail-closed marker)', () => {
    expect(parseAllowedOrigins(undefined)).toBeNull();
    expect(parseAllowedOrigins('  , ')).toBeNull();
  });
});

describe('resolveModel', () => {
  it('allows GLM_MODEL overrides only inside the whitelist (glm-5.3-flash)', () => {
    expect(resolveModel('glm-5.3-flash')).toBe('glm-5.3-flash');
    expect(resolveModel('glm-4.5-flash')).toBe('glm-5.3-flash');
    expect(resolveModel('some-arbitrary-model')).toBe('glm-5.3-flash');
    expect(resolveModel(undefined)).toBe('glm-5.3-flash');
    expect(resolveModel('  glm-5.3-flash  ')).toBe('glm-5.3-flash');
  });
});

describe('parseGlmThinking', () => {
  it('defaults to disabled and only accepts explicit enabled', () => {
    expect(parseGlmThinking(undefined)).toBe('disabled');
    expect(parseGlmThinking('enabled')).toBe('enabled');
    expect(parseGlmThinking(' ENABLED ')).toBe('enabled');
    expect(parseGlmThinking('disabled')).toBe('disabled');
    expect(parseGlmThinking('always')).toBe('disabled');
  });
});

describe('parseGatewayConfig', () => {
  it('applies defaults and clamps rate limit / quota numbers', () => {
    const config = parseGatewayConfig(testEnv({ RATE_LIMIT_MAX: 'not-a-number', QUOTA_DAILY_MAX: '0' }));
    expect(config.rateLimitMax).toBe(20);
    expect(config.rateLimitWindowMs).toBe(60_000);
    expect(config.quotaDailyMax).toBe(0);
    expect(config.apiKey).toBe('test-key');
    expect(config.allowedOrigins).toEqual(['https://eeasonn.github.io']);
    expect(config.thinking).toBe('disabled');
    expect(config.model).toBe('glm-5.3-flash');
  });

  it('treats a blank key as missing', () => {
    expect(parseGatewayConfig(testEnv({ GLM_API_KEY: '   ' })).apiKey).toBeUndefined();
  });
});
