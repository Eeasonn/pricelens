#!/usr/bin/env node
/**
 * Optional wrapper for Google's DESIGN.md linter.
 *
 * @google/design.md is pinned in package.json/package-lock.json. The wrapper
 * still supports DESIGNMD_BIN for local tool overrides and `--strict` (or
 * DESIGNMD_REQUIRED=1) for environments that must fail when the CLI is absent.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict') || process.env.DESIGNMD_REQUIRED === '1';
const forwarded = process.argv.slice(2).filter((arg) => arg !== '--strict');
const file = forwarded.some((arg) => arg.endsWith('.md')) ? forwarded : ['DESIGN.md', ...forwarded];
const configuredBin = process.env.DESIGNMD_BIN;
const localCandidates = process.platform === 'win32'
  ? ['designmd.cmd', 'design.md.cmd']
  : ['designmd', 'design.md'];
const localBin = localCandidates
  .map((name) => join(PROJECT, 'node_modules', '.bin', name))
  .find((path) => existsSync(path));

function run(bin, args) {
  return spawnSync(bin, args, { cwd: PROJECT, stdio: 'inherit', env: process.env });
}

if (configuredBin || localBin) {
  const result = run(configuredBin || localBin, ['lint', ...file]);
  process.exit(result.status ?? 1);
}

// --no-install means this wrapper never changes package.json, lockfiles, or
// node_modules on its own. A teammate can opt in by installing the package.
const result = spawnSync('npx', ['--no-install', '@google/design.md', 'lint', ...file], {
  cwd: PROJECT,
  stdio: ['inherit', 'inherit', 'pipe'],
  encoding: 'utf8',
  env: process.env,
});
if (result.stderr) process.stderr.write(result.stderr);
if (result.status === 0) process.exit(0);

const unavailable = /missing packages|no packages|could not determine executable|canceled due to missing|command not found|not found/i.test(result.stderr || '');
if (!unavailable) process.exit(result.status ?? 1);

if (strict) {
  console.error('Google DESIGN.md linter 不可用；请安装 @google/design.md 或设置 DESIGNMD_BIN。');
  process.exit(result.status ?? 1);
}

console.warn('SKIP  Google DESIGN.md linter 未安装；安装 @google/design.md 后重试 `npm run design:lint`。');
process.exit(0);
