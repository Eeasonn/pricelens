import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = Number(process.env.PORT || 8787);
const model = process.env.ARK_MODEL || 'doubao-seed-evolving';
const baseUrl = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/plan/v3').replace(/\/$/, '');
const apiKey = process.env.ARK_API_KEY;
const MAX_REQUEST_BYTES = 512_000;
const MAX_TEXT_LENGTH = 4_000;
const UPSTREAM_TIMEOUT_MS = 20_000;

const jsonHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, accept',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'cache-control': 'no-store',
};

const agentInstructions = `你是 PriceLens 的真实方舟 Agent，负责帮助价格分析师理解当前看板。
你必须只输出一个 JSON 对象，不要 Markdown，不要代码围栏。字段必须是：
{"summary":"中文简洁结论","suggestions":["最多3条后续问题"],"intent":"filter|query|forecast_explain|alert|clarify"}
本地确定性引擎已经给出 baseline：其中的数字、平台、产品和预警事实已经过数据引擎计算，不得编造、修改或补算数字。
你的任务是结合用户问题和 baseline，改写一段清楚的中文结论，并给出最多三条有用的后续问题。
如果用户要求改变筛选，必须保留“先预览、确认后应用”的语义；如果是预警解释，必须区分触发事实和待核查原因，不把相关性写成确定因果。`;

function sendJson(res, status, payload) {
  res.writeHead(status, { ...jsonHeaders, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendSse(res, payload, runId) {
  res.writeHead(200, { ...jsonHeaders, 'content-type': 'text/event-stream; charset=utf-8', connection: 'keep-alive' });
  const now = new Date().toISOString();
  const startedEvent = { id: `${runId}-started`, runId, sequence: 1, type: 'run.started', status: 'running', timestamp: now, message: '服务端 Agent 已接收请求', provenance: payload.provenance };
  const completedEvent = { id: `${runId}-completed`, runId, sequence: 2, type: 'run.completed', status: 'completed', timestamp: new Date().toISOString(), message: '服务端 Agent 已完成运行', provenance: payload.provenance };
  res.write(`event: run.status\ndata: ${JSON.stringify({ event: startedEvent })}\n\n`);
  res.write(`event: response\ndata: ${JSON.stringify({ type: 'response', response: payload })}\n\n`);
  res.write(`event: run.completed\ndata: ${JSON.stringify({ event: completedEvent })}\n\n`);
  res.end();
}

function readBody(req, limit = MAX_REQUEST_BYTES) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    let exceeded = false;
    req.on('data', (chunk) => {
      if (exceeded) return;
      size += chunk.length;
      if (size > limit) {
        exceeded = true;
        reject(new Error('请求体过大'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function baselineOf(body) {
  const baseline = body?.baseline;
  if (!isResponseShape(baseline)) {
    return { intent: 'clarify', summary: '当前请求没有确定性基线结果。', steps: [], cards: [], citations: [], suggestions: [], contextFingerprint: body?.context?.fingerprint || 'ctx-remote' };
  }
  return baseline;
}

function isResponseShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!['filter', 'query', 'forecast_explain', 'alert', 'clarify'].includes(value.intent)) return false;
  if (typeof value.summary !== 'string' || typeof value.contextFingerprint !== 'string') return false;
  if (!Array.isArray(value.steps) || !Array.isArray(value.cards) || !Array.isArray(value.citations) || !Array.isArray(value.suggestions)) return false;
  if (value.provider !== undefined && (!value.provider || typeof value.provider !== 'object' || typeof value.provider.name !== 'string' || typeof value.provider.model !== 'string')) return false;
  return value.suggestions.every((item) => typeof item === 'string')
    && value.cards.every((item) => item && typeof item === 'object' && ['filter', 'table', 'chart', 'alert', 'forecast_explanation'].includes(item.kind));
}

function compactContext(body, baseline) {
  const state = body?.context?.state || {};
  return {
    userText: String(body?.text || '').slice(0, MAX_TEXT_LENGTH),
    page: body?.context?.page,
    state: {
      countryCode: state.countryCode,
      industry: state.industry,
      rangeStart: state.rangeStart,
      rangeEnd: state.rangeEnd,
      currency: state.currency,
      granularity: state.granularity,
      agg: state.agg,
      priceTypes: state.priceTypes,
      mains: Array.isArray(state.mains) ? state.mains.slice(0, 50) : [],
    },
    alerts: Array.isArray(body?.context?.alerts) ? body.context.alerts.slice(0, 20) : [],
    baseline,
  };
}

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  return output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('');
}

function parseModelJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const first = fenced.indexOf('{');
  const last = fenced.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    const value = JSON.parse(fenced.slice(first, last + 1));
    if (!value || typeof value !== 'object') return null;
    return value;
  } catch {
    return null;
  }
}

async function callArk(body, baseline) {
  if (!apiKey) throw new Error('服务端未配置 ARK_API_KEY');
  const prompt = JSON.stringify(compactContext(body, baseline));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: agentInstructions,
        input: prompt,
        max_output_tokens: 500,
        store: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`方舟请求失败（${response.status}）`);
  const payload = await response.json();
  return parseModelJson(outputText(payload));
}

async function handleRun(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    sendJson(res, message === '请求体过大' ? 413 : 400, { error: message || '请求体必须是合法 JSON' });
    return;
  }
  if (typeof body?.text !== 'string' || !body.text.trim()) {
    sendJson(res, 400, { error: '缺少用户问题' });
    return;
  }
  if (body.text.length > MAX_TEXT_LENGTH) {
    sendJson(res, 413, { error: `用户问题不能超过 ${MAX_TEXT_LENGTH} 个字符` });
    return;
  }
  if (body.context !== undefined && (!body.context || typeof body.context !== 'object' || Array.isArray(body.context))) {
    sendJson(res, 400, { error: 'context 必须是对象' });
    return;
  }
  const baseline = baselineOf(body);
  try {
    const modelResult = await callArk(body, baseline);
    const intent = ['filter', 'query', 'forecast_explain', 'alert', 'clarify'].includes(modelResult?.intent) ? modelResult.intent : baseline.intent;
    const suggestions = Array.isArray(modelResult?.suggestions) ? modelResult.suggestions.filter((item) => typeof item === 'string').slice(0, 3) : baseline.suggestions;
    const response = {
      ...baseline,
      intent,
      summary: typeof modelResult?.summary === 'string' && modelResult.summary.trim() ? modelResult.summary.trim() : baseline.summary,
      suggestions: suggestions.length ? suggestions : baseline.suggestions,
      provider: { name: 'Ark Agent Plan', model },
      provenance: {
        ...(baseline.provenance || {}),
        source: 'ark-agent-plan',
        provider: 'Ark Agent Plan',
        model,
        generatedAt: new Date().toISOString(),
      },
    };
    sendSse(res, response, String(body.runId || body.clientRequestId || `run-${Date.now()}`));
  } catch (error) {
    // 不把上游响应体或授权信息写入日志；客户端可选择重试或继续使用离线适配器。
    console.error('[agent] upstream request failed:', error instanceof Error ? error.message : 'unknown error');
    sendJson(res, 502, { error: '方舟 Agent 暂时不可用', fallback: baseline });
  }
}

async function handleStatic(req, res, pathname) {
  if (pathname !== '/' && pathname !== '/PriceLens.html') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  try {
    const file = await readFile(resolve(root, 'PriceLens.html'));
    res.writeHead(200, { ...jsonHeaders, 'content-type': 'text/html; charset=utf-8' });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: 'PriceLens.html 不存在，请先 npm run build' });
  }
}

export function createAgentServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'OPTIONS') { res.writeHead(204, jsonHeaders); res.end(); return; }
    if (req.method === 'GET' && url.pathname === '/api/agent/health') { sendJson(res, 200, { ok: Boolean(apiKey), model, provider: 'Ark Agent Plan' }); return; }
    if (req.method === 'POST' && url.pathname === '/api/agent/runs') { await handleRun(req, res); return; }
    if (req.method === 'GET') { await handleStatic(req, res, url.pathname); return; }
    sendJson(res, 405, { error: 'Method not allowed' });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createAgentServer().listen(port, '127.0.0.1', () => {
    console.log(`[agent] PriceLens server listening at http://127.0.0.1:${port}`);
    console.log(`[agent] model=${model} key=${apiKey ? 'configured' : 'missing'}`);
  });
}
