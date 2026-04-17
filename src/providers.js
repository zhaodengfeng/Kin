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
  type: 'free'
});

ProviderRegistry.register('microsoft', {
  name: 'Microsoft Translator',
  type: 'free'
});

// --- OpenAI-compatible providers ---
ProviderRegistry.register('openai', {
  name: 'OpenAI',
  type: 'openai',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo']
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
  model: 'qwen-mt-turbo',
  models: ['qwen-mt-plus', 'qwen-mt-turbo']
});

ProviderRegistry.register('gemini', {
  name: 'Gemini',
  type: 'openai',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  model: 'gemini-2.5-flash',
  models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite-preview']
});

ProviderRegistry.register('glm', {
  name: 'GLM',
  type: 'openai',
  endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  model: 'glm-4-flash',
  models: ['glm-4-plus', 'glm-4-flash']
});

ProviderRegistry.register('kimi', {
  name: 'Kimi',
  type: 'openai',
  endpoint: 'https://api.moonshot.cn/v1/chat/completions',
  model: 'moonshot-v1-32k',
  models: ['moonshot-v1-32k', 'moonshot-v1-128k']
});

ProviderRegistry.register('openrouter', {
  name: 'OpenRouter',
  type: 'openai',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'nvidia/nemotron-3-super-120b-a12b:free',
  models: [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'google/gemma-4-31b-it:free',
    'z-ai/glm-4.5-air:free',
    'openai/gpt-oss-120b:free',
    'google/gemini-2.5-flash',
    'deepseek/deepseek-chat-v3-0324',
    'openai/gpt-4.1-nano'
  ]
});

// --- Claude API providers ---
ProviderRegistry.register('claude', {
  name: 'Claude',
  type: 'claude',
  endpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-haiku-4-5',
  models: ['claude-sonnet-4-6', 'claude-haiku-4-5']
});

// --- DeepL API ---
ProviderRegistry.register('deepl', {
  name: 'DeepL',
  type: 'deepl',
  endpoint: 'https://api-free.deepl.com/v2/translate',
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
