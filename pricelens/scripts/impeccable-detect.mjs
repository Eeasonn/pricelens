#!/usr/bin/env node
/**
 * Optional Impeccable detector wrapper.
 *
 * The CLI is pinned as a dev dependency for reproducible local and CI runs.
 * IMPECCABLE_BIN remains available for alternate engine installations. Without
 * the CLI this command reports a skip and exits 0; --strict turns the absence
 * into a failure for a dedicated detector job.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict') || process.env.IMPECCABLE_REQUIRED === '1';
const userArgs = process.argv.slice(2).filter((arg) => arg !== '--strict');
const targetArgs = userArgs.length ? userArgs : ['src'];
const localBin = join(PROJECT, 'node_modules', '.bin', process.platform === 'win32' ? 'impeccable.cmd' : 'impeccable');
const configuredBin = process.env.IMPECCABLE_BIN;
const bin = configuredBin || (existsSync(localBin) ? localBin : null);

if (bin) {
  const result = spawnSync(bin, ['detect', ...targetArgs], {
    cwd: PROJECT,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

// Keep a best-effort fallback for environments that intentionally omit dev
// dependencies (for example a lightweight production checkout).
const result = spawnSync('npx', ['--no-install', 'impeccable', 'detect', ...targetArgs], {
  cwd: PROJECT,
  stdio: ['inherit', 'inherit', 'pipe'],
  encoding: 'utf8',
  env: process.env,
});
if (result.stderr) process.stderr.write(result.stderr);
if (result.status === 0 || result.status === 2) process.exit(result.status);

const unavailable = /missing packages|no packages|could not determine executable|canceled due to missing/i.test(result.stderr || '');
if (!unavailable) process.exit(result.status ?? 1);

if (strict) {
  console.error('Impeccable detector 不可用；请先运行 `npx impeccable install` 或设置 IMPECCABLE_BIN。');
  process.exit(result.status ?? 1);
}

console.warn('SKIP  Impeccable detector 未安装；运行 `npx impeccable install` 后重试 `npm run design:detect`。');
process.exit(0);
