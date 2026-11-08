import { cp, mkdir, rm, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, '..', 'dist');
const ASSEMBLE = join(ROOT, '..', '.channels-stable-index.html');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, ['run', script], { cwd: join(ROOT, '..'), stdio: 'inherit', env: process.env });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`))));
  });
}

let stableSaved = false;
try {
  await run('build');
  await cp(join(DIST, 'index.html'), ASSEMBLE);
  stableSaved = true;
  await rm(join(DIST, 'iterate'), { recursive: true, force: true });
  await run('build:iterate');
  await mkdir(join(DIST, 'iterate'), { recursive: true });
  await rename(join(DIST, 'index.html'), join(DIST, 'iterate', 'index.html'));
  await cp(ASSEMBLE, join(DIST, 'index.html'));
} finally {
  if (stableSaved) {
    await cp(ASSEMBLE, join(DIST, 'index.html')).catch(() => {});
  }
  await rm(ASSEMBLE, { force: true });
}

console.log('[build:channels] stable → dist/index.html');
console.log('[build:channels] iterate → dist/iterate/index.html');
