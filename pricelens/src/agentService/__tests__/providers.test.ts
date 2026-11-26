// ============================================================
// Agent 模型服务 · 供应商预置注册表单测：
// 11 家预置顺序（自定义恒最后）/ Anthropic 即将支持不可配置 / 密钥形态 /
// 搜索过滤（custom 仍在最后）/ 服务器与本地预置合并 / 状态语义 / 面板可选模型。
// ============================================================
import { describe, expect, it } from 'vitest';
import {
  CONFIG_STATUS_LABELS,
  CONFIG_STATUS_SHORT_LABELS,
  LOCAL_PROVIDER_PRESETS,
  apiKeyModeOf,
  configStatusOf,
  isConfigurablePreset,
  mergePresets,
  modelChoicesOf,
  providerBadgeColorOf,
  providerInitialOf,
  providerSummaryOf,
  searchProviders,
  sortPresets,
  statusDotColorOf,
  type ProviderPreset,
  type SavedProvider,
} from '../providers';

const ids = (presets: readonly ProviderPreset[]): string[] => presets.map((preset) => preset.id);
const byId = (id: string): ProviderPreset => LOCAL_PROVIDER_PRESETS.find((preset) => preset.id === id)!;

describe('预置注册表 · 首批 11 家', () => {
  it('顺序稳定：自定义永远排最后', () => {
    expect(ids(LOCAL_PROVIDER_PRESETS)).toEqual([
      'zhipu', 'moonshot', 'deepseek', 'bailian', 'siliconflow', 'openai', 'anthropic', 'openrouter', 'ollama', 'lmstudio', 'custom',
    ]);
    expect(LOCAL_PROVIDER_PRESETS[LOCAL_PROVIDER_PRESETS.length - 1]!.custom).toBe(true);
  });

  it('Anthropic 是即将支持的占位：可见但不可配置；其余均可配置', () => {
    const anthropic = byId('anthropic');
    expect(anthropic.comingSoon).toBe(true);
    expect(isConfigurablePreset(anthropic)).toBe(false);
    expect(LOCAL_PROVIDER_PRESETS.filter((preset) => !isConfigurablePreset(preset)).map((preset) => preset.id)).toEqual(['anthropic']);
  });

  it('密钥形态：云端服务商必填 / 自定义可选 / 本机服务不显示', () => {
    expect(apiKeyModeOf(byId('zhipu'))).toBe('required');
    expect(apiKeyModeOf(byId('custom'))).toBe('optional');
    expect(apiKeyModeOf(byId('ollama'))).toBe('none');
    expect(apiKeyModeOf(byId('lmstudio'))).toBe('none');
    // 本机服务地址预填在本机回环
    expect(byId('ollama').defaultBaseUrl).toBe('http://127.0.0.1:11434/v1');
    // 自定义没有默认地址（必须由使用者填写）
    expect(byId('custom').defaultBaseUrl).toBe('');
  });

  it('每家都有一句话说明与单字符徽标，11 家徽标字符互不重复', () => {
    for (const preset of LOCAL_PROVIDER_PRESETS) {
      expect(providerSummaryOf(preset).length).toBeGreaterThan(4);
      expect(providerInitialOf(preset)).toMatch(/^.{1}$/u);
    }
    expect(new Set(LOCAL_PROVIDER_PRESETS.map(providerInitialOf)).size).toBe(LOCAL_PROVIDER_PRESETS.length);
  });

  it('徽标色是稳定的身份色：同一 id 永远同一色，且不与失败 / 已连接状态色混用', () => {
    for (const preset of LOCAL_PROVIDER_PRESETS) {
      expect(providerBadgeColorOf(preset.id)).toBe(providerBadgeColorOf(preset.id));
      expect(providerBadgeColorOf(preset.id)).toMatch(/^#[0-9a-f]{6}$/);
      expect(providerBadgeColorOf(preset.id)).not.toBe(statusDotColorOf('failed'));
    }
  });
});

describe('搜索过滤', () => {
  it('空查询返回全部且 custom 仍在最后', () => {
    const all = searchProviders(LOCAL_PROVIDER_PRESETS, '   ');
    expect(ids(all)).toEqual(ids(LOCAL_PROVIDER_PRESETS));
    expect(ids(all)[all.length - 1]).toBe('custom');
  });

  it('按名称 / id / 模型 ID / 别名命中；多词须全部命中；大小写不敏感', () => {
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, '智谱'))).toEqual(['zhipu']);
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, 'DEEPSEEK'))).toEqual(['deepseek', 'siliconflow']);
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, 'kimi'))).toEqual(['moonshot']);
    // LM Studio 的预置里有 qwen/… 模型，按模型 ID 也应命中
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, 'qwen'))).toEqual(['bailian', 'siliconflow', 'lmstudio']);
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, '本地'))).toEqual(['ollama', 'lmstudio']);
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, '本地 llama'))).toEqual(['ollama']);
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, '本地 qwen'))).toEqual(['lmstudio']);
    // LM Studio 同时有 gpt 与 qwen 模型；没有任何一家同时含 claude 与 llama
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, 'gpt qwen'))).toEqual(['lmstudio']);
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, 'claude llama'))).toEqual([]);
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, '不存在的服务商'))).toEqual([]);
  });

  it('过滤后 custom 仍是最后；只命中 custom 时列表里只有它', () => {
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, '自定义'))).toEqual(['custom']);
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, 'openai 自定义'))).toEqual(['custom']);
    expect(ids(searchProviders(LOCAL_PROVIDER_PRESETS, 'glm 自定义'))).toEqual([]);
  });
});

describe('与服务器预置合并', () => {
  it('服务器顺序乱、缺两家时：按本地顺序排齐并补全，自定义最后', () => {
    const server = [byId('custom'), byId('deepseek'), byId('zhipu')];
    expect(ids(mergePresets(server))).toEqual(ids(LOCAL_PROVIDER_PRESETS));
  });

  it('服务器新增而本地没有的服务商排在自定义之前', () => {
    const extra: ProviderPreset = { ...byId('openai'), id: 'newcomer', name: 'Newcomer', presetModels: [] };
    const merged = mergePresets([...LOCAL_PROVIDER_PRESETS, extra].reverse());
    expect(ids(merged)[merged.length - 1]).toBe('custom');
    expect(ids(merged)[merged.length - 2]).toBe('newcomer');
  });

  it('服务器返回空 / 非法条目时回退本地预置', () => {
    expect(ids(mergePresets([]))).toEqual(ids(LOCAL_PROVIDER_PRESETS));
    expect(ids(mergePresets(undefined))).toEqual(ids(LOCAL_PROVIDER_PRESETS));
    const sorted = sortPresets([byId('lmstudio'), byId('ollama')]);
    expect(ids(sorted)).toEqual(['ollama', 'lmstudio']);
  });
});

describe('状态语义', () => {
  const saved = (patch: Partial<SavedProvider> = {}): SavedProvider => ({
    enabled: true, baseUrl: 'https://api.example.com/v1', models: ['m'], model: 'm', hasKey: true, ...patch,
  });

  it('未配置 / 已保存未测试 / 已连接 / 连接失败 / 已停用', () => {
    expect(configStatusOf(undefined)).toBe('unconfigured');
    expect(configStatusOf(saved())).toBe('saved');
    expect(configStatusOf(saved({ status: 'connected', latencyMs: 300 }))).toBe('connected');
    expect(configStatusOf(saved({ status: 'failed', lastError: 'API Key 无效或已失效' }))).toBe('failed');
    expect(configStatusOf(saved({ enabled: false }))).toBe('disabled');
    for (const status of ['unconfigured', 'disabled', 'saved', 'connected', 'failed'] as const) {
      expect(CONFIG_STATUS_LABELS[status]).not.toBe('');
      expect(CONFIG_STATUS_SHORT_LABELS[status]).not.toBe('');
    }
  });

  it('状态点：失败 = 红、已连接 = 已核实绿、未配置 = 中性灰（状态另有文字）', () => {
    expect(statusDotColorOf('failed')).toBe('#ee0000');
    expect(statusDotColorOf('connected')).toBe('#15803d');
    expect(statusDotColorOf('unconfigured')).toBe(statusDotColorOf('disabled'));
    expect(statusDotColorOf('saved')).not.toBe(statusDotColorOf('failed'));
  });
});

describe('面板可选模型', () => {
  it('只列已启用的服务商，按服务商顺序分组，已保存模型不在列表里也保留', () => {
    const state = {
      service: 'local',
      active: null,
      presets: [...LOCAL_PROVIDER_PRESETS],
      providers: {
        zhipu: { enabled: true, baseUrl: 'a', models: ['glm-a', 'glm-b'], model: 'glm-b', hasKey: true },
        moonshot: { enabled: false, baseUrl: 'b', models: ['kimi-x'], model: 'kimi-x', hasKey: true },
        custom: { enabled: true, baseUrl: 'c', models: [], model: 'my-model', hasKey: false },
      },
    };
    const choices = modelChoicesOf(state);
    expect(choices.map((choice) => `${choice.preset.id}:${choice.model}`)).toEqual(['zhipu:glm-a', 'zhipu:glm-b', 'custom:my-model']);
  });
});
