// ============================================================
// Agent 模型服务 · 供应商预置注册表生成（Agent 模型服务规范「现成源优先」）
//   供应商 / 模型数据取自 models.dev（SST/opencode 维护，MIT），**禁止手写** Base URL
//   与模型 ID；models.dev 未收录的两项（OpenAI 地址、Ollama 本地地址）取自规范表并
//   标注 baseUrlSource，待官方文档复核。
// 用法：npm run providers:gen -- [--api <本地 api.json 路径>]
//   缺省拉取 https://models.dev/api.json；--api 用本地快照（离线可复跑）。
// 产物：src/agentService/providers.generated.json —— 前端配置界面与本机 Python 服务器
//   （server/agent_gateway.py，部署包内随 server/*.json 携带）共用的单一数据源。
// ============================================================
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pricelensRoot = resolve(here, '..');
const outFile = join(pricelensRoot, 'src', 'agentService', 'providers.generated.json');
const MODELS_DEV_URL = 'https://models.dev/api.json';

const apiFlag = process.argv.indexOf('--api');
let raw;
let sourceUrl = MODELS_DEV_URL;
if (apiFlag >= 0) {
  sourceUrl = `local:${process.argv[apiFlag + 1]}`;
  raw = readFileSync(process.argv[apiFlag + 1]);
} else {
  const res = await fetch(MODELS_DEV_URL, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`models.dev 拉取失败 HTTP ${res.status}`);
  raw = Buffer.from(await res.arrayBuffer());
}
const data = JSON.parse(raw.toString('utf8'));
const sha256 = createHash('sha256').update(raw).digest('hex');

/** 首批预置：只做实际会用到的（规范第 2 节）。source = models.dev 的 provider id；
 *  null = models.dev 无可用条目，地址取规范表。 */
const SPEC = [
  { id: 'zhipu', name: '智谱 BigModel', source: 'zhipuai', requiresKey: true, max: 8, prefer: ['glm-5.3-flash'], extraBody: { thinking: { type: 'disabled' } } },
  { id: 'moonshot', name: 'Kimi / Moonshot', source: 'moonshotai', requiresKey: true, max: 6 },
  { id: 'deepseek', name: 'DeepSeek', source: 'deepseek', requiresKey: true, max: 6 },
  { id: 'bailian', name: '阿里百炼 Qwen', source: 'alibaba-cn', requiresKey: true, max: 8, filter: (id) => /^qwen/i.test(id) },
  { id: 'siliconflow', name: '硅基流动', source: 'siliconflow-cn', requiresKey: true, max: 8 },
  { id: 'openai', name: 'OpenAI', source: 'openai', requiresKey: true, max: 6, baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic', source: 'anthropic', requiresKey: true, protocol: 'anthropic', comingSoon: true },
  { id: 'openrouter', name: 'OpenRouter', source: 'openrouter', requiresKey: true, max: 8 },
  { id: 'ollama', name: 'Ollama（本地）', source: null, requiresKey: false, baseUrl: 'http://127.0.0.1:11434/v1', local: true },
  { id: 'lmstudio', name: 'LM Studio（本地）', source: 'lmstudio', requiresKey: false, max: 6, local: true },
  { id: 'custom', name: '自定义 OpenAI 兼容', source: null, requiresKey: false, baseUrl: '', custom: true },
];

const toModel = (m) => ({
  id: m.id,
  label: m.name || m.id,
  capabilities: [
    ...((m.modalities?.input ?? []).includes('image') ? ['vision'] : []),
    ...(m.reasoning ? ['reasoning'] : []),
    ...(m.tool_call ? ['tools'] : []),
  ],
  ...(m.limit?.context ? { contextWindow: m.limit.context } : {}),
  ...(m.release_date ? { releaseDate: m.release_date } : {}),
});

const isChat = (m) => {
  const input = m.modalities?.input;
  return !input || input.includes('text');
};

function pickModels(entry, spec) {
  if (spec.comingSoon || spec.custom || !spec.source) return [];
  const models = Object.values(entry?.models ?? {}).filter(
    (m) => m.status !== 'deprecated' && isChat(m) && (!spec.filter || spec.filter(m.id)),
  );
  models.sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? '') || a.id.localeCompare(b.id));
  const picked = [];
  for (const id of spec.prefer ?? []) {
    const hit = models.find((m) => m.id === id);
    if (hit) picked.push(hit);
  }
  for (const m of models) {
    if (picked.length >= spec.max) break;
    if (!picked.includes(m)) picked.push(m);
  }
  return picked.map(toModel);
}

const providers = SPEC.map((spec) => {
  const entry = spec.source ? data[spec.source] : undefined;
  const baseUrl = spec.baseUrl ?? entry?.api ?? '';
  if (!spec.custom && !spec.comingSoon && !baseUrl) throw new Error(`预置 ${spec.id} 取不到 Base URL（models.dev 无 api 字段且规范表未给）`);
  return {
    id: spec.id,
    name: spec.name,
    protocol: spec.protocol ?? 'openai-compatible',
    defaultBaseUrl: baseUrl,
    baseUrlSource: spec.baseUrl && !entry?.api ? 'spec-table' : 'models.dev',
    requiresKey: spec.requiresKey,
    optionalKey: spec.id === 'custom',
    ...(entry?.doc ? { docsUrl: entry.doc } : {}),
    presetModels: pickModels(entry, spec),
    fetchModels: spec.protocol !== 'anthropic',
    ...(spec.local ? { local: true } : {}),
    ...(spec.custom ? { custom: true } : {}),
    ...(spec.comingSoon ? { comingSoon: true } : {}),
    ...(spec.extraBody ? { extraBody: spec.extraBody } : {}),
  };
});

const out = {
  _meta: {
    source: 'models.dev',
    sourceUrl,
    sourceSha256: sha256,
    generatedAt: new Date().toISOString(),
    generator: 'scripts/gen_provider_presets.mjs',
    note: '由 models.dev 筛选生成；不要手改，改 SPEC 后重新运行 npm run providers:gen',
  },
  providers,
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
for (const p of providers) {
  console.log(`${p.id.padEnd(12)} ${p.defaultBaseUrl || '(手填)'}  模型 ${p.presetModels.length}${p.comingSoon ? '  （即将支持）' : ''}`);
}
console.log(`[providers:gen] ${providers.length} 家预置 → ${outFile}`);
