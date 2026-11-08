import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, '..', 'dist');
const stablePath = join(DIST, 'index.html');
const iteratePath = join(DIST, 'iterate', 'index.html');

async function readRequired(path, label) {
  await access(path);
  const html = await readFile(path, 'utf8');
  if (!html.trim()) throw new Error(`${label} is empty`);
  return html;
}

const stable = await readRequired(stablePath, 'stable artifact');
const iterate = await readRequired(iteratePath, 'iterate artifact');

if (!stable.includes('<meta name="pricelens-channel" content="stable">')) {
  throw new Error('stable artifact is missing the stable channel marker');
}
if (!iterate.includes('<meta name="pricelens-channel" content="iterate">')) {
  throw new Error('iterate artifact is missing the iterate channel marker');
}
if (stable.includes('PriceLens · 演进版')) throw new Error('stable artifact contains iterate title');
if (!iterate.includes('<title>PriceLens · 演进版</title>')) throw new Error('iterate artifact is missing iterate title');

console.log('[verify:channels] stable and iterate artifacts are correctly branded');
