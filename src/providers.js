// Kin - Translation Provider Registry
// Used by background.js (importScripts) and options.html (<script>)

// ============================================
// Provider Registry Pattern (审查报告建议)
// ============================================
class ProviderRegistry {
  static providers = new Map();

  static register(id, config) {
    this.providers.set(id, { id, ...config });
  }

  static get(id) {
    return this.providers.get(id);
  }

  static list() {
    return Array.from(this.providers.values());
  }

  static listByType(type) {
    return this.list().filter(p => p.type === type);
  }

  static freeProviders() {
    return this.list().filter(p => p.type === 'free');
  }

  static apiProviders() {
    return this.list().filter(p => p.type !== 'free');
  }

  static summaryProviders() {
    return this.list().filter(p => p.supportsSummary !== false);
  }
}

// ============================================
// Target Languages (30+ languages, 审查报告 P2-6)
// ============================================
const TARGET_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'en',    name: 'English' },
  { code: 'ja',    name: '日本語' },
  { code: 'ko',    name: '한국어' },
  { code: 'fr',    name: 'Français' },
  { code: 'de',    name: 'Deutsch' },
  { code: 'es',    name: 'Español' },
  { code: 'pt',    name: 'Português' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'it',    name: 'Italiano' },
  { code: 'ru',    name: 'Русский' },
  { code: 'ar',    name: 'العربية' },
  { code: 'hi',    name: 'हिन्दी' },
  { code: 'th',    name: 'ไทย' },
  { code: 'vi',    name: 'Tiếng Việt' },
  { code: 'id',    name: 'Bahasa Indonesia' },
  { code: 'ms',    name: 'Bahasa Melayu' },
  { code: 'tr',    name: 'Türkçe' },
  { code: 'nl',    name: 'Nederlands' },
  { code: 'pl',    name: 'Polski' },
  { code: 'uk',    name: 'Українська' },
  { code: 'sv',    name: 'Svenska' },
  { code: 'da',    name: 'Dansk' },
  { code: 'fi',    name: 'Suomi' },
  { code: 'el',    name: 'Ελληνικά' },
  { code: 'cs',    name: 'Čeština' },
  { code: 'ro',    name: 'Română' },
  { code: 'hu',    name: 'Magyar' },
  { code: 'he',    name: 'עברית' },
];

const LANG_NAMES = {};
TARGET_LANGUAGES.forEach(l => { LANG_NAMES[l.code] = l.name; });

// Fallback for source language auto-detect label
const SOURCE_LANGUAGES = [
  { code: 'auto', name: '自动检测' },
  ...TARGET_LANGUAGES
];

// ============================================
// Provider Registrations
// ============================================

// --- Free providers (no API key needed) ---
ProviderRegistry.register('google', {
  name: 'Google Translate',
  type: 'free',
  supportsSummary: false
});

ProviderRegistry.register('microsoft', {
  name: 'Microsoft Translator',
  type: 'free',
  supportsSummary: false
});

// --- OpenAI-compatible providers ---
ProviderRegistry.register('openai', {
  name: 'OpenAI',
  type: 'openai',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-5.4-mini',
  models: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.4-nano', 'gpt-5.4-2026-03-05', 'gpt-4.1'],
  summaryModel: 'gpt-5.4-mini',
  summaryModels: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.4-nano', 'gpt-5.4-2026-03-05']
});

ProviderRegistry.register('deepseek', {
  name: 'DeepSeek',
  type: 'openai',
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  models: ['deepseek-chat', 'deepseek-reasoner']
});

ProviderRegistry.register('qwen', {
  name: 'Qwen',
  type: 'openai',
  endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  model: 'qwen-mt-plus',
  models: ['qwen-mt-plus', 'qwen-mt-flash', 'qwen-mt-lite', 'qwen-mt-turbo'],
  summaryModel: 'qwen3.6-plus',
  summaryModels: ['qwen3.6-plus', 'qwen3-max', 'qwen3.6-flash', 'qwen3-max-2026-01-23', 'qwen3-max-preview']
});

ProviderRegistry.register('gemini', {
  name: 'Gemini',
  type: 'openai',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  model: 'gemini-3-flash-preview',
  models: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  summaryModel: 'gemini-3-flash-preview',
  summaryModels: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash']
});

ProviderRegistry.register('glm', {
  name: 'GLM',
  type: 'openai',
  endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  model: 'glm-5.1',
  models: ['glm-5.1', 'glm-4.7', 'glm-4.6', 'glm-4.5', 'glm-4-plus', 'glm-4-flash']
});

ProviderRegistry.register('kimi', {
  name: 'Kimi',
  type: 'openai',
  endpoint: 'https://api.moonshot.cn/v1/chat/completions',
  model: 'kimi-k2.5',
  models: ['kimi-k2.5', 'kimi-k2-turbo-preview', 'kimi-k2-thinking', 'kimi-k2-thinking-turbo', 'moonshot-v1-128k', 'moonshot-v1-32k']
});

ProviderRegistry.register('openrouter', {
  name: 'OpenRouter',
  type: 'openai',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'openai/gpt-5.4-mini',
  models: [
    'anthropic/claude-opus-4.7',
    'openai/gpt-5.4',
    'openai/gpt-5.4-mini',
    'google/gemini-3.1-pro-preview',
    'google/gemini-3-flash-preview',
    'qwen/qwen3.6-plus',
    'z-ai/glm-5.1',
    'x-ai/grok-4.20',
    'openrouter/elephant-alpha',
    'google/gemma-4-31b-it:free',
    'z-ai/glm-4.5-air:free',
    'openai/gpt-oss-120b:free'
  ],
  summaryModel: 'openai/gpt-5.4-mini'
});

// --- Claude API providers ---
ProviderRegistry.register('claude', {
  name: 'Claude',
  type: 'claude',
  endpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-sonnet-4-6',
  models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-haiku-4-5'],
  summaryModel: 'claude-opus-4-7',
  summaryModels: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5']
});

// --- DeepL API ---
ProviderRegistry.register('deepl', {
  name: 'DeepL',
  type: 'deepl',
  endpoint: 'https://api-free.deepl.com/v2/translate',
  supportsSummary: false,
  endpoints: {
    free: 'https://api-free.deepl.com/v2/translate',
    pro: 'https://api.deepl.com/v2/translate'
  }
});

// --- Custom providers ---
ProviderRegistry.register('custom_openai', {
  name: 'Custom (OpenAI)',
  type: 'openai',
  endpoint: '',
  model: ''
});

ProviderRegistry.register('custom_claude', {
  name: 'Custom (Claude)',
  type: 'claude',
  endpoint: '',
  model: ''
});

// ============================================
// Backward-compatible PROVIDERS object
// (background.js references PROVIDERS[id])
// ============================================
const PROVIDERS = {};
ProviderRegistry.list().forEach(p => { PROVIDERS[p.id] = p; });
