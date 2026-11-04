import { transitionAgent, canApplyFilters } from '../roadshowDemo/agentMachine.js';
import { PROMO_ALERT, FX_ALERT } from '../roadshowDemo/data.js';
import { RECORDING_PLAN, recordingDuration, sectionSource, validateRecordingPlan } from './plan.js';
import { toWebVtt } from './subtitles.js';
import { intelScene, soScene, closingScene, topChrome, initialScenario, updateScenario } from './scenes.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const timers = new Set();
const state = {
  scene: 'agent-fullscreen',
  agentState: 'agent-fullscreen-empty',
  mode: 'fullscreen',
  agentHidden: false,
  messages: [],
  unread: 0,
  scenario: initialScenario(),
  selectedFactor: null,
  recordingIndex: 0,
  recordingPlaying: false,
  directorVisible: true,
};

function later(callback, delay) {
  const timer = setTimeout(() => {
    timers.delete(timer);
    callback();
  }, delay);
  timers.add(timer);
  return timer;
}

function icon(name) {
  const paths = {
    spark: '<path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    alert: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17.5v.1"/>',
    expand: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    send: '<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.spark}</svg>`;
}

function badge(kind) {
  if (kind === 'real') return '<span class="badge real">真实资料</span>';
  if (kind === 'mixed') return '<span class="badge mixed">真实数据 · 模拟规则</span>';
  return '<span class="badge demo">模拟数据</span>';
}

function renderAlert(message) {
  return `<article class="message-alert" data-message-id="${message.id}"><div class="alert-head"><span class="alert-symbol">${icon('alert')}</span><div><b>${message.title}</b><small>${message.time}</small></div><div class="grow"></div>${badge(message.dataStatus)}</div><div class="alert-context">${message.product}</div><div class="alert-headline">${message.headline}</div><ul>${message.details.map((detail) => `<li>${detail}</li>`).join('')}</ul><div class="alert-explain"><b>Price Agent 解释</b><p>${message.explanation}</p></div><div class="alert-actions"><button class="btn primary" data-action="${message.id === 'alert-fx-w42' ? 'intel' : 'locate'}">${message.id === 'alert-fx-w42' ? '进入情报中心' : '查看价格点'}</button><button class="btn" data-action="ask-alert">追问 Agent</button></div></article>`;
}

function renderMessages() {
  return state.messages.map((message) => {
    if (message.kind === 'proactive-alert') return renderAlert(message);
    if (message.kind === 'scenario-summary') return `<div class="agent-answer scenario-summary"><b>已作为情景纳入，而非确认因果</b><p>${message.body}</p></div>`;
    if (message.kind === 'user') return `<div class="user-message">${message.body}</div>`;
    return `<div class="agent-answer">${message.body}</div>`;
  }).join('');
}

function renderAgent() {
  const shell = $('#agentShell');
  shell.className = `agent-shell ${state.mode === 'fullscreen' ? 'fullscreen' : 'dock'}${state.agentHidden ? ' hidden' : ''}`;
  const body = $('#agentBody');
  if (state.mode === 'fullscreen') {
    if (state.agentState === 'agent-fullscreen-empty' || state.agentState === 'agent-fullscreen-listening') {
      body.innerHTML = `<div class="voice-home"><div class="agent-orb">${icon('mic')}</div><div class="eyebrow">PRICELENS · PRICE AGENT</div><h1>从一句话，开始价格分析</h1><p>试着说：“我要查看 R 国的 Pura 90s Pro 价格情况”</p><button class="voice-button ${state.agentState === 'agent-fullscreen-listening' ? 'listening' : ''}" data-action="voice">${icon('mic')}<span>${state.agentState === 'agent-fullscreen-listening' ? '正在聆听…' : '点击开始语音输入'}</span></button><div class="transcript ${state.agentState === 'agent-fullscreen-listening' ? 'active' : ''}" id="transcript">${state.agentState === 'agent-fullscreen-listening' ? '正在识别中文语音…' : '语音识别为确定性模拟，不请求麦克风权限'}</div></div>`;
    } else {
      body.innerHTML = `<div class="full-preview"><div class="eyebrow">TRANSCRIPT CONFIRMED</div><div class="preview-user">我要查看 R 国的 Pura 90s Pro 价格情况。</div><div class="preview-answer"><h2>已为您找到 Pura 90s Pro 全部型号的价格走势</h2><p>并自动带出 iPhone 17 Pro、Samsung S26 Ultra 等竞品。您可以基于实际情况，在筛选器中修改产品。</p><div class="preview-grid"><div><span>国家与产业</span><b>R国 / 手机</b></div><div><span>主分析产品</span><b>Pura 90s Pro · 全部型号</b></div><div><span>自动竞品</span><b>iPhone 17 Pro / S26 Ultra</b></div><div><span>当前口径</span><b>USD · 自动时间范围</b></div></div><button class="btn primary large" data-action="apply">应用到真实看板 ${icon('arrow')}</button><button class="btn large" data-action="reset">重新输入</button></div></div>`;
    }
    return;
  }
  body.innerHTML = `<div class="context"><div>${icon('link')}跟随当前看板<span>每次提问保存快照</span></div><div class="chips"><span class="chip blue">R国 · 手机</span><span class="chip">Pura 90s Pro</span><span class="chip">全部型号</span><span class="chip">USD</span></div></div><div class="messages" role="log" aria-live="off">${renderMessages()}</div><div class="composer"><div class="composer-box"><button data-action="voice-disabled" aria-label="语音输入（模拟）">${icon('mic')}</button><textarea aria-label="向 Price Agent 提问" placeholder="继续询问价格、图表或预警…"></textarea><button class="send" aria-label="发送">${icon('send')}</button></div><small>Copilot 为模拟功能 · 真实页面可正常交互</small></div>`;
}

function renderRealBoard() {
  const board = $('#realBoard');
  if (state.mode === 'fullscreen') {
    board.classList.remove('visible');
    board.innerHTML = '';
    return;
  }
  board.classList.add('visible');
  board.classList.toggle('agent-hidden', state.agentHidden);
  if (state.scene === 'price' || state.scene === 'alerts') {
    board.innerHTML = `<iframe id="realApp" title="真实 PriceLens 系统" src="${sectionSource(state.scene)}" allow="clipboard-read; clipboard-write"></iframe>`;
    return;
  }
  if (state.scene === 'closing') {
    board.innerHTML = closingScene();
    return;
  }
  board.innerHTML = `${topChrome(state.scene)}<div class="scene-content">${state.scene === 'intel' ? intelScene() : soScene(state)}</div>`;
}

function renderDirector() {
  const director = $('#director');
  director.classList.toggle('hidden', !state.directorVisible);
  const shot = RECORDING_PLAN[state.recordingIndex];
  $('#shotProgress').textContent = `${String(state.recordingIndex + 1).padStart(2, '0')} / 14 · ${shot.id} · ${shot.durationMs / 1000}s`;
  $('#recordingTotal').textContent = `${recordingDuration(RECORDING_PLAN) / 1000}s`;
  $('#playRecording').textContent = state.recordingPlaying ? '暂停' : '播放主片';
  $$('#director [data-scene]').forEach((button) => button.classList.toggle('active', button.dataset.scene === state.scene));
}

function startVoice() {
  if (state.agentState !== 'agent-fullscreen-empty') return;
  state.agentState = transitionAgent(state.agentState, 'START_VOICE');
  renderAgent();
  later(() => { $('#transcript').textContent = '“我要查看 R 国的……”'; }, 650);
  later(() => { $('#transcript').textContent = '“我要查看 R 国的 Pura 90s Pro……”'; }, 1300);
  later(() => {
    $('#transcript').textContent = '“我要查看 R 国的 Pura 90s Pro 价格情况。”';
    state.agentState = transitionAgent(state.agentState, 'TRANSCRIPT_READY');
  }, 2050);
  later(() => {
    state.agentState = transitionAgent(state.agentState, 'PREVIEW_READY');
    renderAgent();
  }, 2650);
}

function applyFilters() {
  if (!canApplyFilters(state.agentState)) return;
  state.agentState = transitionAgent(state.agentState, 'APPLY');
  if (!state.messages.some((message) => message.kind === 'user')) {
    state.messages.push({ kind: 'user', body: '我要查看 R 国的 Pura 90s Pro 价格情况。' });
    state.messages.push({ kind: 'answer', body: '<b>已为您找到 Pura 90s Pro 全部型号的价格走势，</b>并自动带出 iPhone 17 Pro、Samsung S26 Ultra 等竞品。您可以基于实际情况，在筛选器中修改产品。' });
  }
  state.mode = 'transitioning';
  renderAgent();
  later(() => {
    state.scene = 'price';
    renderRealBoard();
  }, 120);
  later(() => {
    state.mode = 'dock';
    state.agentState = transitionAgent(state.agentState, 'TRANSITION_COMPLETE');
    renderAgent();
  }, 850);
}

function addAlert(alert) {
  if (state.messages.some((message) => message.id === alert.id)) return;
  state.messages.push(clone(alert));
  state.unread += 1;
  renderAgent();
}

function showChapter(title) {
  if (!title) return;
  const chapter = $('#chapter');
  chapter.textContent = title;
  chapter.classList.add('show');
  later(() => chapter.classList.remove('show'), 850);
}

function setScene(scene) {
  if (scene === 'closing') {
    state.scene = 'closing';
    state.mode = 'dock';
    state.agentHidden = true;
    renderRealBoard();
    renderAgent();
    renderDirector();
    return;
  }
  if (state.mode === 'fullscreen') return;
  const shot = RECORDING_PLAN.find((item) => item.scene === scene);
  if (state.scene !== scene && shot?.transition) showChapter(shot.transition);
  state.mode = 'dock';
  state.agentHidden = false;
  state.scene = scene;
  if (scene === 'alerts') addAlert(PROMO_ALERT);
  if (scene === 'intel') addAlert(FX_ALERT);
  state.unread = 0;
  renderRealBoard();
  renderAgent();
  renderDirector();
}

function applyMarketScenario() {
  updateScenario(state, 'marketFactor', 0.98);
  updateScenario(state, 'competitionFactor', 0.95);
  updateScenario(state, 'tierCompositionFactor', 0.97);
  updateScenario(state, 'inventoryAvailable', 3200);
  state.messages.push({ kind: 'scenario-summary', body: '终端大盘 0.98、竞品格局 0.95、档位构成 0.97、每周可售库存 3,200 台。上述参数仅用于比较预测情景，不能视为本周 SO 下滑的确定解释。' });
  renderAgent();
  $('#soChartContainer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function goToShot(index) {
  if (index >= RECORDING_PLAN.length) {
    state.recordingPlaying = false;
    renderDirector();
    return;
  }
  state.recordingIndex = index;
  const shot = RECORDING_PLAN[index];
  if (shot.scene === 'agent-fullscreen') {
    if (shot.id === 'opening') resetOpening(true);
    if (shot.id === 'voice') startVoice();
  } else if (shot.scene === 'transition') {
    applyFilters();
  } else {
    setScene(shot.scene);
  }
  renderDirector();
  if (state.recordingPlaying) later(() => goToShot(index + 1), shot.durationMs);
}

function playRecording() {
  state.recordingPlaying = !state.recordingPlaying;
  if (state.recordingPlaying) {
    if (state.recordingIndex >= RECORDING_PLAN.length - 1) state.recordingIndex = 0;
    goToShot(state.recordingIndex);
  } else {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
  }
  renderDirector();
}

function resetOpening(preservePlayback = false) {
  const recordingPlaying = preservePlayback ? state.recordingPlaying : false;
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  Object.assign(state, {
    scene: 'agent-fullscreen', agentState: 'agent-fullscreen-empty', mode: 'fullscreen', agentHidden: false,
    messages: [], unread: 0, scenario: initialScenario(), selectedFactor: null,
    recordingPlaying, recordingIndex: 0,
  });
  renderRealBoard();
  renderAgent();
  renderDirector();
}

function toast(text) {
  const element = $('#toast');
  element.textContent = text;
  element.classList.add('show');
  later(() => element.classList.remove('show'), 2400);
}

function downloadVtt() {
  const blob = new Blob([toWebVtt(RECORDING_PLAN)], { type: 'text/vtt;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'price-agent-180s.vtt';
  link.click();
  URL.revokeObjectURL(url);
  toast('已导出 price-agent-180s.vtt');
}

document.addEventListener('click', (event) => {
  const sceneButton = event.target.closest('[data-scene]');
  if (sceneButton) {
    setScene(sceneButton.dataset.scene);
    return;
  }
  const factorButton = event.target.closest('[data-factor]');
  if (factorButton) {
    state.selectedFactor = state.selectedFactor === factorButton.dataset.factor ? null : factorButton.dataset.factor;
    updateScenario(state, '__highlight__', 0);
    const assumption = $('#factorAssumption');
    if (assumption) assumption.textContent = state.selectedFactor ? `已选择因素：${state.selectedFactor} · 当前值仅作为预测情景假设` : '点击因素卡可查看当前假设；修改只影响未来预测段';
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'voice') startVoice();
  if (action === 'apply') applyFilters();
  if (action === 'reset') resetOpening();
  if (action === 'open-agent') {
    state.agentHidden = false;
    state.unread = 0;
    renderAgent();
    renderRealBoard();
  }
  if (action === 'close-agent') {
    state.agentHidden = true;
    renderAgent();
    renderRealBoard();
  }
  if (action === 'intel') setScene('intel');
  if (action === 'fx-alert') addAlert(FX_ALERT);
  if (action === 'locate') toast('已定位真实预警页面的对应产品');
  if (action === 'ask-alert') toast('已将预警上下文带入当前对话');
  if (action === 'apply-scenario') applyMarketScenario();
  if (action === 'replay') updateScenario(state, '__replay__', 0);
  if (action === 'voice-disabled') toast('语音模拟请在开场全屏中演示');
  if (action === 'download-vtt') downloadVtt();
});

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-scenario-key]')) updateScenario(state, event.target.dataset.scenarioKey, event.target.value);
});

$('#playRecording').addEventListener('click', playRecording);
$('#resetRecording').addEventListener('click', () => resetOpening());
$('#titleButton').addEventListener('click', () => showChapter('从价格监控，到持续经营决策'));
$('#hideDirector').addEventListener('click', () => {
  state.directorVisible = !state.directorVisible;
  renderDirector();
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('textarea,input')) return;
  const key = event.key.toLowerCase();
  if (key === '1') setScene('price');
  if (key === '2') setScene('alerts');
  if (key === '3') setScene('intel');
  if (key === '4') setScene('so');
  if (key === 'v') startVoice();
  if (key === 'r') updateScenario(state, '__replay__', 0);
  if (key === 't') showChapter('从价格监控，到持续经营决策');
  if (key === 'h') {
    state.directorVisible = !state.directorVisible;
    renderDirector();
  }
  if (key === 'escape') $('#chapter').classList.remove('show');
});

const validation = validateRecordingPlan(RECORDING_PLAN);
if (!validation.valid) throw new Error(validation.errors.join('；'));
renderRealBoard();
renderAgent();
renderDirector();
