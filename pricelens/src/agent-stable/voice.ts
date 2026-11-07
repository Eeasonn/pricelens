export interface VoiceInputResult { transcript: string; confidence?: number }
export interface VoiceInputAdapter {
  readonly name: string;
  readonly available: boolean;
  listen(signal?: AbortSignal): Promise<VoiceInputResult>;
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function browserCtor(): SpeechRecognitionCtor | null {
  const scope = globalThis as typeof globalThis & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function createBrowserVoiceAdapter(): VoiceInputAdapter {
  const Ctor = browserCtor();
  return {
    name: '浏览器语音输入',
    available: Ctor != null,
    listen(signal) {
      if (!Ctor) return Promise.reject(new Error('当前浏览器不支持语音输入'));
      return new Promise((resolve, reject) => {
        const recognition = new Ctor();
        recognition.lang = 'zh-CN'; recognition.interimResults = false; recognition.maxAlternatives = 1;
        let settled = false;
        const finishSuccess = (value: VoiceInputResult) => { if (settled) return; settled = true; recognition.stop(); resolve(value); };
        const finishError = (error: Error) => { if (settled) return; settled = true; recognition.stop(); reject(error); };
        recognition.onresult = (event) => { const first = event.results[0]?.[0]; finishSuccess({ transcript: first?.transcript ?? '', confidence: first?.confidence }); };
        recognition.onerror = (event) => finishError(new Error(event.error || '语音识别失败'));
        recognition.onend = () => { if (!settled) finishError(new Error('没有识别到语音')); };
        signal?.addEventListener('abort', () => finishError(new DOMException('语音输入已取消', 'AbortError')), { once: true });
        recognition.start();
      });
    },
  };
}

/** 方舟 Agent Plan 代理适配器：前端只访问同源服务端代理，API Key 不进入 bundle。 */
export function createArkVoiceAdapter(options: { endpoint: string; fetcher?: typeof fetch }): VoiceInputAdapter {
  const fetcher = options.fetcher ?? fetch;
  return {
    name: '方舟 Agent Plan',
    available: Boolean(options.endpoint),
    async listen(signal) {
      const response = await fetcher(options.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: 'zh-CN' }), signal });
      if (!response.ok) throw new Error(`语音服务异常（${response.status}）`);
      const data = await response.json() as { transcript?: string; confidence?: number };
      if (!data.transcript) throw new Error('方舟没有返回可用转写');
      return { transcript: data.transcript, confidence: data.confidence };
    },
  };
}

export function defaultVoiceAdapter(): VoiceInputAdapter {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const arkProxy = env?.VITE_ARK_VOICE_PROXY;
  if (arkProxy) return createArkVoiceAdapter({ endpoint: arkProxy });
  return createBrowserVoiceAdapter();
}
