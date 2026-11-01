#!/usr/bin/env node
/**
 * PriceLens design-system contract check.
 *
 * This deliberately uses Node's standard library only. It keeps the design
 * contract useful in CI even when the optional Impeccable CLI is not installed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(PROJECT, '..');
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL  ${message}`);
}

function pass(message) {
  console.log(`PASS  ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`WARN  ${message}`);
}

function readText(path, label) {
  if (!existsSync(path)) {
    fail(`${label} 不存在：${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

console.log('[design] PriceLens design-system contract');

const design = readText(join(PROJECT, 'DESIGN.md'), 'DESIGN.md');
const productPath = existsSync(join(PROJECT, 'PRODUCT.md')) ? join(PROJECT, 'PRODUCT.md') : join(REPO, 'PRODUCT.md');
const product = readText(productPath, 'PRODUCT.md');
const tokens = readText(join(PROJECT, 'src', 'theme', 'tokens.ts'), 'tokens.ts');
const configPaths = [
  join(REPO, '.impeccable', 'config.json'),
  join(PROJECT, '.impeccable', 'config.json'),
];

if (design) {
  if (design.trim().length < 400) fail('DESIGN.md 过短；请记录可执行的色彩、字体、布局和组件规则。');
  else pass('DESIGN.md 已记录正式设计语言');

  for (const [label, pattern] of [
    ['token 真源引用', /tokens\.ts|设计 token/i],
    ['颜色规则', /颜色|color/i],
    ['字体规则', /字体|typography|font/i],
    ['布局或间距规则', /布局|间距|spacing|layout/i],
    ['组件规则', /组件|component/i],
  ]) {
    if (pattern.test(design)) pass(`DESIGN.md 包含${label}`);
    else fail(`DESIGN.md 缺少${label}`);
  }
}

if (product) {
  if (product.trim().length < 240) warn('PRODUCT.md 内容较短；可补充受众、核心任务和业务边界。');
  else pass('PRODUCT.md 已记录产品上下文');
  if (/PriceLens/i.test(product)) pass('PRODUCT.md 指向 PriceLens');
  else fail('PRODUCT.md 未明确产品名称 PriceLens');
}

if (tokens) {
  for (const name of ['color', 'brandColor', 'font', 'fontSize', 'space', 'radius', 'shadow']) {
    if (new RegExp(`export\\s+const\\s+${name}\\b`).test(tokens)) pass(`tokens.ts 导出 ${name}`);
    else fail(`tokens.ts 缺少导出 ${name}`);
  }
  if (/export\s+const\s+BRAND_EXTENDED_PALETTE/.test(tokens)) {
    warn('tokens.ts 含扩展品牌色板；新增品牌需确认是否属于正式产品色。');
  }
}

for (const configPath of configPaths) {
  const label = configPath.slice(REPO.length + 1);
  const configText = readText(configPath, label);
  if (!configText) continue;
  try {
    const config = JSON.parse(configText);
    if (configPath === configPaths[0]) {
      if (!Array.isArray(config.projectRoots) || !config.projectRoots.includes('pricelens')) {
        fail(`${label} 的 projectRoots 必须包含 pricelens`);
      } else pass(`${label} projectRoots 指向 pricelens`);
    }
    if (config.detector?.designSystem?.enabled === false) {
      fail(`${label} 的 Impeccable design-system 检查被关闭；正式 CI 不应关闭。`);
    } else pass(`${label} 的 Impeccable design-system 检查已启用`);
  } catch (error) {
    fail(`${label} 不是合法 JSON：${error.message}`);
  }
}

if (warnings.length) console.log(`\n${warnings.length} 个提醒不会阻断检查。`);
if (failures.length) {
  console.error(`\n设计契约失败：${failures.length} 项`);
  process.exit(1);
}
console.log('\n设计契约通过。');
