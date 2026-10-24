// ============================================================
// 铁律（第十九轮起）：每次构建（npm run build / check）最后一步，
// 把 dist/index.html 单文件版同步覆盖到仓库根 PriceLens.html，
// 保证离线双击交付版永远与源码构建结果一致。
// ============================================================
import { copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(pkgRoot, 'dist', 'index.html');
const dest = join(pkgRoot, '..', 'PriceLens.html');
let distSize = 0;
try {
  distSize = statSync(dist).size;
} catch {
  console.error('[build] 未找到 dist/index.html，请先 npm run build');
  process.exit(1);
}
if (!distSize) {
  console.error('[build] dist/index.html 为空，拒绝同步');
  process.exit(1);
}
copyFileSync(dist, dest);
console.log(`[build] 单文件版已同步 → PriceLens.html（${statSync(dest).size} bytes）`);
