// Kin Background Service Worker
importScripts('providers.js');

const CACHE_VERSION = 'kin-cache-v1';
const CACHE_KEY = 'translationCache';
const CACHE_MAX_ENTRIES = 2000;
const CACHE_STORAGE_LIMIT = 8 * 1024 * 1024; // 8MB safety limit
const EXPORT_IMAGE_FETCH_MAX_BYTES = 15 * 1024 * 1024;
const EXPORT_IMAGE_FETCH_TIMEOUT_MS = 12000;
const LLM_FETCH_TIMEOUT_MS = 90000;

// ============================================
// L1 In-Memory Cache + Preheat (审查 P1-4)
// ============================================
let _memoryCacheEntries = null;
let _memoryCacheLoadedAt = 0;
const MEMORY_CACHE_TTL_MS = 60000;
const L1_MAX = 500;

// L1 preheat on SW wake
chrome.runtime.onStartup.addListener(preheatL1);
chrome.runtime.onInstalled.addListener(preheatL1);

async function preheatL1() {
  try {
    const data = await chrome.storage.local.get(CACHE_KEY);
    const cache = data[CACHE_KEY];
    if (!cache?.entries || cache.version !== CACHE_VERSION) {
      _memoryCacheEntries = {};
      _memoryCacheLoadedAt = Date.now();
      return;
    }
    // Pre-heat L1 with the most recent 200 entries
    const sorted = Object.entries(cache.entries)
      .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
      .slice(0, 200);
    _memoryCacheEntries = Object.fromEntries(sorted);
    _memoryCacheLoadedAt = Date.now();
  } catch (e) {
    _memoryCacheEntries = {};
    _memoryCacheLoadedAt = Date.now();
  }
}

// Debounced cache write
let _pendingCacheEntries = {};
let _cacheFlushTimer = null;
const CACHE_FLUSH_DELAY_MS = 1500;

// ============================================
// API Key Encryption (审查 P1-3)
// ============================================
async function getDeviceKey() {
  const { kin_device_key_jwk } = await chrome.storage.local.get('kin_device_key_jwk');
  if (kin_device_key_jwk) {
    try {
      return await crypto.subtle.importKey(
        'jwk', kin_device_key_jwk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    } catch (e) {
      console.error('[Kin] Failed to import device key, regenerating:', e.message);
    }
  }
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await chrome.storage.local.set({ kin_device_key_jwk: jwk });
  return key;
}

async function encryptApiKey(plaintext) {
  if (!plaintext) return '';
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptApiKey(ciphertext) {
  if (!ciphertext) return '';
  try {
    const key = await getDeviceKey();
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error('[Kin] API key decryption failed:', e.message);
    return '';  // P0-2 fix: return empty instead of corrupted ciphertext
  }
}

// ============================================
// Install & Defaults
// ============================================
chrome.runtime.onInstalled.addListener(() => {
  // Context menus
  chrome.contextMenus.create({ id: 'kin-translate', title: 'Kin - Translate this page', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'kin-reader', title: 'Kin - Reader mode', contexts: ['page'] });

  // Default settings
  const defaults = {
    translationProvider: 'google',
    targetLang: 'zh-CN',
    sourceLang: 'auto',
    translationMode: 'dual',
    translationTheme: 'underline',
    hoverTranslate: true,
    hoverTrigger: 'direct',
    sensitiveMask: true,
    disableReasoning: false,
    readerEnabled: true,
    readerTheme: 'default',
    exportImageFormat: 'jpeg',
    exportQuality: 'balanced',
    longArticleMultiImageExport: false,
    alwaysTranslateUrls: [],
    neverTranslateUrls: [],
    floatBallPosY: 335,
  };
  chrome.storage.local.get(Object.keys(defaults), (existing) => {
    const toSet = {};
    for (const [key, val] of Object.entries(defaults)) {
      if (existing[key] === undefined) toSet[key] = val;
    }
    if (Object.keys(toSet).length > 0) chrome.storage.local.set(toSet);
  });
  migrateStoredModelDefaults();

  // Initialize cache structure
  chrome.storage.local.get(CACHE_KEY, (data) => {
    if (!data[CACHE_KEY] || data[CACHE_KEY].version !== CACHE_VERSION) {
      chrome.storage.local.set({ [CACHE_KEY]: { version: CACHE_VERSION, entries: {} } });
    }
  });
});

async function migrateStoredModelDefaults() {
  const migrations = [
    ['openai_model', ['gpt-4o-mini'], 'gpt-5.4-mini'],
    ['summary_openai_model', ['gpt-4o-mini'], 'gpt-5.4-mini'],
    ['qwen_model', ['qwen-mt-turbo'], 'qwen-mt-plus'],
    ['summary_qwen_model', ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-mt-plus', 'qwen-mt-flash', 'qwen-mt-lite', 'qwen-mt-turbo'], 'qwen3.6-plus'],
    ['gemini_model', ['gemini-2.5-flash'], 'gemini-3-flash-preview'],
    ['summary_gemini_model', ['gemini-2.5-flash'], 'gemini-3-flash-preview'],
    ['glm_model', ['glm-4-flash', 'glm-4.6'], 'glm-5.1'],
    ['summary_glm_model', ['glm-4-flash', 'glm-4.6'], 'glm-5.1'],
    ['kimi_model', ['moonshot-v1-32k'], 'kimi-k2.5'],
    ['summary_kimi_model', ['moonshot-v1-32k'], 'kimi-k2.5'],
    ['openrouter_model', ['nvidia/nemotron-3-super-120b-a12b:free'], 'openai/gpt-5.4-mini'],
    ['summary_openrouter_model', ['nvidia/nemotron-3-super-120b-a12b:free'], 'openai/gpt-5.4-mini'],
    ['claude_model', ['claude-haiku-4-5'], 'claude-sonnet-4-6'],
    ['summary_claude_model', ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'], 'claude-opus-4-7']
  ];
  try {
    const keys = migrations.map(([key]) => key);
    const stored = await chrome.storage.local.get(keys);
    const toSet = {};
    migrations.forEach(([key, oldValues, nextValue]) => {
      if (oldValues.includes(stored[key])) toSet[key] = nextValue;
    });
    if (Object.keys(toSet).length > 0) await chrome.storage.local.set(toSet);
  } catch (e) {
    console.warn('[Kin] Model default migration skipped:', e?.message || e);
  }
}

// ============================================
// Context Menu Handler
// ============================================
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kin-translate') {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle_translate' });
  } else if (info.menuItemId === 'kin-reader') {
    chrome.tabs.sendMessage(tab.id, { type: 'open_reader' });
  }
});

// ============================================
// Command Handler
// ============================================
chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab?.id) return;
  switch (command) {
    case 'toggleTranslatePage':
      chrome.tabs.sendMessage(tab.id, { type: 'toggle_translate' });
      break;
    case 'toggleTranslateMode':
      chrome.tabs.sendMessage(tab.id, { type: 'toggle_mode' });
      break;
    case 'toggleReaderMode':
      chrome.tabs.sendMessage(tab.id, { type: 'open_reader' });
      break;
    case 'toggleHoverTranslate':
      chrome.tabs.sendMessage(tab.id, { type: 'toggle_hover' });
      break;
  }
});

// ============================================
// Message Router (统一消息总线)
// ============================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'translate':
      handleTranslate(msg.data).then(sendResponse).catch(err => {
        sendResponse({ error: err.userMessage || err.message });
      });
      return true;

    case 'summary_generate':
      handleSummary(msg.data).then(sendResponse).catch(err => {
        sendResponse({ error: err.userMessage || err.message });
      });
      return true;

    case 'get_tab_url':
      sendResponse({ url: sender.tab?.url || '' });
      return;

    case 'get_settings': {
      const keys = msg.keys || [
        'translationProvider', 'targetLang', 'sourceLang',
        'translationMode', 'translationTheme',
        'translationStyle', 'customPrompt',
        'hoverTranslate', 'hoverTrigger',
        'selectionTranslate',
        'sensitiveMask', 'disableReasoning', 'readerEnabled', 'readerTheme',
        'exportImageFormat', 'exportQuality',
        'longArticleMultiImageExport',
        'summaryProvider', 'summaryMigrationShown',
        'alwaysTranslateUrls', 'neverTranslateUrls',
        'floatBallPosY'
      ];
      chrome.storage.local.get(keys, (data) => {
        sendResponse(data);
      });
      return true;
    }

    case 'save_settings':
      chrome.storage.local.set(msg.data, () => {
        sendResponse({ ok: true });
      });
      return true;

    case 'fetch_export_image':
      fetchExportImage(msg.data).then(sendResponse).catch(err => {
        sendResponse({ error: err.message || 'Image fetch failed' });
      });
      return true;

    case 'ensure_export_libs':
      ensureExportLibs(sender.tab?.id).then(sendResponse).catch(err => {
        sendResponse({ error: err.message || 'Failed to load export libraries' });
      });
      return true;

    case 'article_opened':
      chrome.storage.local.get('history', (data) => {
        const history = data.history || [];
        const existing = history.findIndex(h => h.url === msg.data.url);
        if (existing !== -1) history.splice(existing, 1);
        history.unshift({ ...msg.data, timestamp: Date.now() });
        if (history.length > 200) history.length = 200;
        chrome.storage.local.set({ history });
      });
      return;

    case 'get_history':
      chrome.storage.local.get('history', (data) => {
        sendResponse({ history: data.history || [] });
      });
      return true;

    case 'get_available_providers': {
      const allProviders = typeof ProviderRegistry !== 'undefined' ? ProviderRegistry.list() : [];
      const freeList = allProviders.filter(p => p.type === 'free');
      const apiList = allProviders.filter(p => p.type !== 'free');
      const apiKeyNames = apiList.map(p => `${p.id}_apiKey`);
      chrome.storage.local.get(apiKeyNames, async (stored) => {
        const results = await Promise.all(apiList.map(async p => {
          const encrypted = stored[`${p.id}_apiKey`];
          if (!encrypted) return null;
          try {
            const key = await decryptApiKey(encrypted);
            return key.trim() ? p : null;
          } catch { return null; }
        }));
        sendResponse({ providers: [...freeList, ...results.filter(Boolean)] });
      });
      return true;
    }

    case 'clear_history':
      chrome.storage.local.set({ history: [] });
      sendResponse({ ok: true });
      return;

    case 'ping':
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
      return;

    case 'open_options':
      chrome.runtime.openOptionsPage();
      return;

    // API Key encryption endpoints (P0-3: provider whitelist validation)
    case 'save_api_key': {
      const _pSave = msg.data?.provider;
      if (!PROVIDERS[_pSave]) { sendResponse({ error: 'Invalid provider' }); return; }
      const _scopeSave = msg.data?.scope === 'summary' ? 'summary' : 'translate';
      if (_scopeSave === 'summary' && PROVIDERS[_pSave].supportsSummary === false) {
        sendResponse({ error: 'Provider does not support summary' });
        return;
      }
      const _prefixSave = getProviderStoragePrefix(_pSave, _scopeSave);
      encryptApiKey(msg.data.key)
        .then(encrypted => {
          chrome.storage.local.set({ [`${_prefixSave}_apiKey`]: encrypted }, () => sendResponse({ ok: true }));
        })
        .catch(err => sendResponse({ error: err.message }));
      return true;
    }

    case 'get_api_key': {
      const _pGet = msg.data?.provider;
      if (!PROVIDERS[_pGet]) { sendResponse({ key: '', error: 'Invalid provider' }); return; }
      const _scopeGet = msg.data?.scope === 'summary' ? 'summary' : 'translate';
      if (_scopeGet === 'summary' && PROVIDERS[_pGet].supportsSummary === false) {
        sendResponse({ key: '', error: 'Provider does not support summary' });
        return;
      }
      const _prefixGet = getProviderStoragePrefix(_pGet, _scopeGet);
      (async () => {
        try {
          const data = await chrome.storage.local.get(`${_prefixGet}_apiKey`);
          const encrypted = data[`${_prefixGet}_apiKey`];
          if (!encrypted) { sendResponse({ key: '' }); return; }
          const key = await decryptApiKey(encrypted);
          sendResponse({ key });
        } catch (e) {
          sendResponse({ key: '', error: e.message });
        }
      })();
      return true;
    }
  }
});

// ============================================
// Lazy Export Library Loader
// ============================================
const _exportLibsLoadedTabs = new Set();
async function ensureExportLibs(tabId) {
  if (!tabId) throw new Error('Missing tab id');
  if (_exportLibsLoadedTabs.has(tabId)) return { ok: true, cached: true };
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['lib/html2canvas.min.js', 'lib/jspdf.umd.min.js']
  });
  _exportLibsLoadedTabs.add(tabId);
  return { ok: true, cached: false };
}
chrome.tabs?.onRemoved?.addListener?.(tabId => _exportLibsLoadedTabs.delete(tabId));
chrome.tabs?.onUpdated?.addListener?.((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') _exportLibsLoadedTabs.delete(tabId);
});

// ============================================
// Image Fetch (for Reader export)
// ============================================
async function fetchExportImage({ url } = {}) {
  const parsed = new URL(String(url || ''));
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Unsupported image URL');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXPORT_IMAGE_FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(parsed.href, {
      credentials: 'omit',
      cache: 'default',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);

  const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  if (!contentType.startsWith('image/')) throw new Error('Fetched URL is not an image');

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > EXPORT_IMAGE_FETCH_MAX_BYTES) throw new Error('Image too large');

  return {
    dataUrl: arrayBufferToDataUrl(arrayBuffer, contentType),
    bytes: arrayBuffer.byteLength,
    contentType
  };
}

function arrayBufferToDataUrl(arrayBuffer, mime) {
  const bytes = new Uint8Array(arrayBuffer);
  // P2-2: Use TextDecoder + btoa instead of String.fromCharCode to avoid stack overflow
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mime || 'application/octet-stream'};base64,${btoa(binary)}`;
}

// ============================================
// Translation Router
// ============================================
async function handleTranslate({ texts, from, to, providerOverride, configOverride, context, contentType, cacheScope }) {
  const settingsKeys = ['translationProvider', 'targetLang', 'translationStyle', 'customPrompt', 'disableReasoning'];
  const allSettings = await chrome.storage.local.get(settingsKeys);
  const finalProvider = providerOverride || allSettings.translationProvider || 'google';

  // P1-2 fix: pre-fetch provider config keys for non-free engines
  if (finalProvider !== 'google' && finalProvider !== 'microsoft') {
    settingsKeys.push(`${finalProvider}_apiKey`, `${finalProvider}_model`, `${finalProvider}_endpoint`);
    // Re-read with the extra keys
    Object.assign(allSettings, await chrome.storage.local.get(
      [`${finalProvider}_apiKey`, `${finalProvider}_model`, `${finalProvider}_endpoint`]
    ));
  }

  // Decrypt API key if needed
  let providerConfig = null;
  if (finalProvider !== 'google' && finalProvider !== 'microsoft') {
    const rawKey = allSettings[`${finalProvider}_apiKey`] || '';
    const decryptedKey = rawKey ? await decryptApiKey(rawKey) : '';
    providerConfig = {
      apiKey: decryptedKey,
      model: allSettings[`${finalProvider}_model`] || '',
      endpoint: allSettings[`${finalProvider}_endpoint`] || '',
      isPlaintext: true
    };
  }
  const mergedConfigOverride = providerConfig && !configOverride ? providerConfig : configOverride;
  const targetLang = to || allSettings.targetLang || 'zh-CN';
  const disableReasoning = allSettings.disableReasoning === true;
  const safeTexts = Array.isArray(texts) ? texts : [];
  const langName = LANG_NAMES[targetLang] || targetLang;

  // Merge translation style into context
  const styleHints = {
    colloquial: 'Translate in a natural, conversational tone.',
    academic: 'Translate in a formal academic style with precise terminology.',
    literary: 'Translate with literary elegance and beautiful expression.',
    concise: 'Translate concisely, keeping it brief and clear.',
    news: 'Translate in a professional news reporting style.',
  };
  const mergedContext = { ...context };
  const style = allSettings.translationStyle;
  if (style === 'custom' && allSettings.customPrompt) {
    mergedContext.style = allSettings.customPrompt;
  } else if (style && styleHints[style]) {
    mergedContext.style = styleHints[style];
  }

  const promptContext = buildPromptContext(mergedContext);
  const providerIdentity = await resolveProviderIdentity(finalProvider, mergedConfigOverride);
  const cacheMeta = {
    provider: finalProvider,
    targetLang,
    contentType: contentType || 'body',
    context: promptContext,
    providerIdentity,
    cacheScope: buildCacheScope(cacheScope)
  };

  try {
    return await translateWithCache({
      texts: safeTexts,
      cacheMeta,
      translateMissing: (missingTexts) => translateProvider({
        texts: missingTexts,
        targetLang,
        langName,
        provider: finalProvider,
        configOverride: mergedConfigOverride,
        promptContext,
        contentType,
        disableReasoning
      })
    });
  } catch (error) {
    const wrapped = new Error(formatTranslationError(finalProvider, error));
    wrapped.userMessage = formatTranslationError(finalProvider, error);
    throw wrapped;
  }
}

// ============================================
// Summary Card Generator (calls configured LLM with structured prompt)
// ============================================
const NON_LLM_PROVIDERS = new Set(['google', 'microsoft', 'deepl']);

async function handleSummary({ text, lang, providerOverride, contextHints, configOverride }) {
  const safeText = String(text || '').trim();
  if (!safeText) throw new Error('文章正文为空');

  const settings = await chrome.storage.local.get(['summaryProvider', 'targetLang']);
  const provider = providerOverride || settings.summaryProvider;
  if (!provider) {
    throw new Error('请先在设置的沉浸阅读页配置摘要模型');
  }

  const meta = PROVIDERS[provider];
  if (!meta || meta.supportsSummary === false || NON_LLM_PROVIDERS.has(provider)) {
    throw new Error(`${providerDisplayName(provider)} 不支持摘要生成，请选择大模型引擎`);
  }

  const targetLang = lang || settings.targetLang || null;
  const langName = targetLang ? (LANG_NAMES[targetLang] || targetLang) : null;
  const cfg = await loadProviderConfig(provider, configOverride || {}, { scope: 'summary' });
  if (!cfg.apiKey) throw new Error('请先配置该摘要引擎的 API Key');
  if (!cfg.endpoint) throw new Error('请先配置该摘要引擎的 Endpoint');

  const model = cfg.model || meta.summaryModel || meta.model || '';
  const systemPrompt = buildSummarySystemPrompt(langName);
  const userPrompt = buildSummaryUserPrompt(safeText, contextHints);

  if (provider === 'claude' || provider === 'custom_claude') {
    return callClaudeSummary({ cfg, model, systemPrompt, userPrompt });
  }
  return callOpenAISummary({ cfg, model, provider, systemPrompt, userPrompt });
}

function buildSummarySystemPrompt(langName) {
  const langLine = langName
    ? `Output language MUST be: ${langName}.`
    : 'Output in the SAME language as the article.';
  return [
    'You are a professional news editor.',
    langLine,
    'Summarize the article.',
    'If the article covers ONE topic/event: write a detailed summary (200-400 chars) split into 2-3 short paragraphs for readability. Separate paragraphs with a blank line (double newline). Each paragraph should cover one aspect (background, key development, significance).',
    'If the article is a digest with MULTIPLE independent topics: write 3-5 bullet points, each 30-80 chars. Start each line with "• ".',
    'Output ONLY the summary text. No labels, no commentary, no formatting markers.',
    'Do NOT start with phrases like "文章指出", "The article states", "据报道" or any meta-commentary. Start directly with the content.'
  ].join('\n');
}

function buildSummaryUserPrompt(text, hints) {
  const meta = [];
  if (hints?.source) meta.push(`Source: ${String(hints.source).slice(0, 80)}`);
  if (hints?.title) meta.push(`Title: ${String(hints.title).slice(0, 240)}`);
  const metaBlock = meta.length ? meta.join('\n') + '\n\n' : '';
  return `${metaBlock}Article body:\n"""\n${text}\n"""`;
}

async function callOpenAISummary({ cfg, model, provider, systemPrompt, userPrompt }) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  const body = {
    model,
    messages,
    temperature: 0.4,
    max_tokens: 1500
  };
  applyOpenAICompatibleModelOptions(provider, model, body);

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/zhaodengfeng/kin';
    headers['X-Title'] = 'Kin';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(cfg.endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`API ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    if (!raw.trim()) throw new Error('LLM 返回为空');
    return { raw };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${providerDisplayName(provider)} 请求超时`);
    throw err;
  } finally { clearTimeout(timeoutId); }
}

async function callClaudeSummary({ cfg, model, systemPrompt, userPrompt }) {
  const body = {
    model,
    max_tokens: 1500,
    temperature: 0.4,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();
    const raw = (data.content?.[0]?.text || '').trim();
    if (!raw) throw new Error('Claude 返回为空');
    return { raw };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Claude 请求超时');
    throw err;
  } finally { clearTimeout(timeoutId); }
}

async function translateProvider({ texts, targetLang, langName, provider, configOverride, promptContext, contentType, disableReasoning }) {
  switch (provider) {
    case 'google':
      return googleTranslate(texts, targetLang);
    case 'microsoft':
      return microsoftTranslate(texts, targetLang);
    case 'deepl':
      return deeplTranslate(texts, targetLang, langName, provider, configOverride);
    case 'claude':
    case 'custom_claude':
      return claudeTranslate(texts, targetLang, langName, provider, configOverride, promptContext, contentType, disableReasoning);
    default:
      return openaiTranslate(texts, targetLang, langName, provider, configOverride, promptContext, contentType, disableReasoning);
  }
}

// ============================================
// Dual-Layer Cache (审查 P1-4 + P2-3)
// ============================================
async function translateWithCache({ texts, cacheMeta, translateMissing }) {
  if (!texts.length) return { translations: [] };
  if (!cacheMeta?.cacheScope?.articleHash) return translateMissing(texts);

  const now = Date.now();
  const cache = await readTranslationCache();
  const translations = new Array(texts.length).fill('');
  const misses = [];
  let cacheHits = 0;

  texts.forEach((text, index) => {
    const original = String(text || '');
    if (!original.trim()) return;
    const key = buildTranslationCacheKey(cacheMeta, original);
    const entry = cache.entries[key];
    if (entry && typeof entry.text === 'string' && entry.text.trim()) {
      translations[index] = entry.text;
      cacheHits++;
      return;
    }
    misses.push({ index, key, text: original });
  });

  if (misses.length === 0) return { translations, cacheHits, cacheMisses: 0 };

  const response = await translateMissing(misses.map(item => item.text));
  const missingTranslations = Array.isArray(response?.translations) ? response.translations : [];

  const newCacheEntries = {};
  misses.forEach((item, idx) => {
    const translated = missingTranslations[idx] || '';
    translations[item.index] = translated;
    if (translated && String(translated).trim()) {
      newCacheEntries[item.key] = { text: translated, createdAt: now };
    }
  });

  await mergeTranslationCacheEntries(newCacheEntries);
  return { translations, cacheHits, cacheMisses: misses.length };
}

async function readTranslationCache(bypassMemory = false) {
  if (!bypassMemory && _memoryCacheEntries && (Date.now() - _memoryCacheLoadedAt) < MEMORY_CACHE_TTL_MS) {
    const merged = Object.keys(_pendingCacheEntries).length > 0
      ? Object.assign({}, _memoryCacheEntries, _pendingCacheEntries)
      : _memoryCacheEntries;
    return { version: CACHE_VERSION, entries: merged };
  }
  try {
    const data = await chrome.storage.local.get(CACHE_KEY);
    const cache = data[CACHE_KEY];
    if (!cache || cache.version !== CACHE_VERSION || !cache.entries || typeof cache.entries !== 'object') {
      _memoryCacheEntries = {};
      _memoryCacheLoadedAt = Date.now();
      return { version: CACHE_VERSION, entries: {} };
    }
    _memoryCacheEntries = cache.entries;
    _memoryCacheLoadedAt = Date.now();
    if (Object.keys(_pendingCacheEntries).length > 0) {
      return { version: cache.version, entries: Object.assign({}, cache.entries, _pendingCacheEntries) };
    }
    return cache;
  } catch (e) {
    return { version: CACHE_VERSION, entries: {} };
  }
}

async function mergeTranslationCacheEntries(newEntries) {
  if (!newEntries || Object.keys(newEntries).length === 0) return;
  Object.assign(_pendingCacheEntries, newEntries);
  if (_memoryCacheEntries) Object.assign(_memoryCacheEntries, newEntries);
  if (_cacheFlushTimer) clearTimeout(_cacheFlushTimer);
  _cacheFlushTimer = setTimeout(() => flushPendingCacheEntries(), CACHE_FLUSH_DELAY_MS);
}

async function flushPendingCacheEntries() {
  _cacheFlushTimer = null;
  const entries = _pendingCacheEntries;
  _pendingCacheEntries = {};
  if (Object.keys(entries).length === 0) return;
  try {
    const cache = await readTranslationCache(true);
    Object.assign(cache.entries, entries);
    pruneTranslationCache(cache);
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
    _memoryCacheEntries = cache.entries;
    _memoryCacheLoadedAt = Date.now();
  } catch (e) {
    Object.assign(_pendingCacheEntries, entries);
    console.warn('[Kin] Cache flush skipped:', e?.message || e);
  }
}

// Periodic flush safety net (P0-1 fix: chrome.alarms instead of setInterval)
chrome.alarms.create('kin-cache-flush', { periodInMinutes: 0.08 }); // ~5s
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'kin-cache-flush' && Object.keys(_pendingCacheEntries).length > 0) {
    flushPendingCacheEntries();
  }
});

// Cache capacity control (审查 P2-3: LRU + capacity check)
function pruneTranslationCache(cache) {
  const entries = Object.entries(cache.entries || {});
  if (entries.length <= CACHE_MAX_ENTRIES) return;
  // Sort by createdAt descending, keep newest 75%
  entries.sort((a, b) => (b[1]?.createdAt || 0) - (a[1]?.createdAt || 0));
  cache.entries = Object.fromEntries(entries.slice(0, Math.floor(CACHE_MAX_ENTRIES * 0.75)));
}

async function checkCacheCapacity() {
  try {
    const bytes = await chrome.storage.local.getBytesInUse(CACHE_KEY);
    if (bytes > CACHE_STORAGE_LIMIT) {
      const cache = await readTranslationCache(true);
      pruneTranslationCache(cache);
      // Extra prune: remove oldest 30%
      const entries = Object.entries(cache.entries || {});
      const removeCount = Math.floor(entries.length * 0.3);
      entries.sort((a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0));
      for (let i = 0; i < removeCount; i++) delete cache.entries[entries[i][0]];
      await chrome.storage.local.set({ [CACHE_KEY]: cache });
      _memoryCacheEntries = cache.entries;
      _memoryCacheLoadedAt = Date.now();
    }
  } catch (e) {
    // P2-1: Log instead of silently swallowing
    console.warn('[Kin] checkCacheCapacity error:', e.message);
  }
}

// Run capacity check periodically (P3-2 fix: chrome.alarms)
chrome.alarms.create('kin-cache-capacity', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'kin-cache-capacity') checkCacheCapacity();
});

// ============================================
// Cache Key Builder
// ============================================
function buildCacheScope(cacheScope = {}) {
  return {
    articleUrl: typeof cacheScope.articleUrl === 'string' ? cacheScope.articleUrl.slice(0, 500) : '',
    articleHash: typeof cacheScope.articleHash === 'string' ? cacheScope.articleHash.slice(0, 80) : ''
  };
}

async function resolveProviderIdentity(provider, override = {}) {
  if (provider === 'google' || provider === 'microsoft') {
    return { model: '', endpoint: '', providerType: PROVIDERS[provider]?.type || '' };
  }
  const cfg = await loadProviderConfig(provider, override);
  return {
    model: cfg.model || PROVIDERS[provider]?.model || '',
    endpoint: cfg.endpoint || PROVIDERS[provider]?.endpoint || '',
    providerType: PROVIDERS[provider]?.type || ''
  };
}

function hashForCache(text = '') {
  let hash = 2166136261;
  const input = String(text);
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(value) {
  if (!value || typeof value !== 'object') return String(value || '');
  return Object.keys(value).sort().map(key => `${key}:${stableStringify(value[key])}`).join('|');
}

function buildTranslationCacheKey(meta, text) {
  const identity = meta.providerIdentity || {};
  const scope = meta.cacheScope || {};
  return [
    CACHE_VERSION,
    meta.provider || '',
    meta.targetLang || '',
    identity.providerType || '',
    identity.model || '',
    identity.endpoint || '',
    meta.contentType || '',
    scope.articleUrl || '',
    scope.articleHash || '',
    hashForCache(stableStringify(meta.context || {})),
    hashForCache(text)
  ].join('|');
}

// ============================================
// Provider Config Loader (with key decryption)
// ============================================
function getProviderStoragePrefix(provider, scope = 'translate') {
  return scope === 'summary' ? `summary_${provider}` : provider;
}

async function loadProviderConfig(provider, override = {}, { scope = 'translate' } = {}) {
  const prefix = getProviderStoragePrefix(provider, scope);
  const keys = [`${prefix}_apiKey`, `${prefix}_model`, `${prefix}_endpoint`];
  const data = await chrome.storage.local.get(keys);
  const rawKey = Object.prototype.hasOwnProperty.call(override, 'apiKey') ? (override.apiKey || '') : (data[`${prefix}_apiKey`] || '');
  let apiKey = '';
  if (rawKey) {
    if (override.isPlaintext === true) {
      apiKey = rawKey;
    } else {
      apiKey = await decryptApiKey(rawKey);
    }
  }
  return {
    apiKey,
    model: Object.prototype.hasOwnProperty.call(override, 'model') ? (override.model || '') : (data[`${prefix}_model`] || ''),
    endpoint: Object.prototype.hasOwnProperty.call(override, 'endpoint') ? (override.endpoint || '') : (data[`${prefix}_endpoint`] || '')
  };
}

// ============================================
// Prompt Building
// ============================================
function buildPromptContext(context = {}) {
  const cleaned = {};
  const entries = [['source', 80], ['title', 240], ['summary', 360], ['terms', 2200]];
  for (const [key, maxLen] of entries) {
    const value = typeof context[key] === 'string' ? context[key].replace(/\s+/g, ' ').trim() : '';
    if (value) cleaned[key] = value.slice(0, maxLen);
  }
  return cleaned;
}

function buildTranslationInput(texts) {
  return texts.map((text, index) => ({ id: index, text: text == null ? '' : String(text) }));
}

function getContentTypeLabel(contentType) {
  switch (contentType) {
    case 'headline': return 'headline';
    case 'standfirst': return 'standfirst';
    case 'heading': return 'section heading';
    default: return 'body';
  }
}

function buildContextBlock(context) {
  const sanitize = (str) => String(str || '').replace(/\n/g, ' ').slice(0, 500);
  const lines = [];
  if (context.source) lines.push(`Source: ${sanitize(context.source)}`);
  if (context.title) lines.push(`Title: ${sanitize(context.title)}`);
  if (context.summary) lines.push(`Standfirst: ${sanitize(context.summary)}`);
  if (context.terms) lines.push(`Full-article terminology hints:\n${String(context.terms || '').slice(0, 2000)}`);
  return lines.length ? `Context:\n${lines.join('\n')}` : '';
}

function buildNewsTranslationPrompt({ provider, model, langName, contentType, context, texts }) {
  const contentLabel = getContentTypeLabel(contentType);
  const input = buildTranslationInput(texts);
  const inputJson = JSON.stringify(input);
  const contextBlock = buildContextBlock(context);
  const isMTModel = typeof model === 'string' && model.startsWith('qwen-mt-');
  const isHeadline = contentType === 'headline';
  const isChinese = /chinese/i.test(langName);

  if (isMTModel) {
    const systemPrompt = isHeadline
      ? `Translate the input news headline into ${langName}. Use the full-article terminology hints to resolve and keep named entities consistent. Return only a JSON array of translated strings.`
      : `Translate the input news ${contentLabel} into ${langName}. Use the full-article terminology hints to resolve and keep named entities consistent. Return only a JSON array of translated strings in the same order as the input array.`;

    const mtUserLines = [
      contextBlock,
      'Use the context only to resolve ambiguity. Do not translate the instructions.',
      'For every person, organization, and place name, choose one target-language form and reuse it consistently across this article.',
    ];
    if (isChinese) {
      mtUserLines.push(
        'For romanized Chinese, Hong Kong, Taiwanese, or other Chinese-origin personal names, infer the most appropriate Chinese-script form from the full article context and known news usage when possible.',
        'If a segment only has a surname or partial name, resolve it against the full-name hints first.',
        'Keep the romanized form only as a last resort when context gives no reasonable basis for a Chinese-script rendering.'
      );
    }
    mtUserLines.push('Input JSON array:', JSON.stringify(texts));
    return { systemPrompt, userPrompt: mtUserLines.filter(Boolean).join('\n\n'), useSystemRole: false };
  }

  const chineseHeadlineRules = isChinese ? `
5. For romanized Chinese, Hong Kong, Taiwanese, or other Chinese-origin personal names, infer the most appropriate Chinese-script form from the article context and known news usage when possible.
6. Resolve surname-only or partial-name mentions against the full-name terminology hints.
7. Keep the romanized form only as a last resort when context gives no reasonable basis for a Chinese-script rendering.
` : '';
  const chineseBodyRules = isChinese ? `
6. For romanized Chinese, Hong Kong, Taiwanese, or other Chinese-origin personal names, infer the most appropriate Chinese-script form from the full article context and known news usage when possible. Do not default to English if the news context supports a Chinese rendering.
7. Resolve surname-only or partial-name mentions against the full-name terminology hints.
8. Keep the romanized form only as a last resort when context gives no reasonable basis for a Chinese-script rendering.
9. Never alternate between different Chinese characters for the same romanized person name in one article.
10. Do not add honorifics such as Ms., Mr. unless they are present in the source text.
` : '';
  const hlJsonRule = isChinese ? 8 : 5;
  const bdQuoteRule = isChinese ? 11 : 6;
  const bdHeadingRule = isChinese ? 12 : 7;
  const bdContextRule = isChinese ? 13 : 8;
  const bdOrderRule = isChinese ? 14 : 9;

  const systemPrompt = isHeadline
    ? `You are a professional native-level news headline translator working into ${langName}.

Rules:
1. Produce a concise, natural, publication-ready news headline.
2. Preserve the original meaning, tone, and news angle.
3. Keep names, numbers, dates, and factual claims accurate.
4. Use one consistent target-language form for every person, organization, and place name across the article.
${chineseHeadlineRules}${hlJsonRule}. Return ONLY valid JSON — no explanations, no markdown fences, no commentary before or after the JSON.

Output format (strictly follow this structure):
{"translations":[{"id":0,"text":"..."}]}`
    : `You are a professional native-level news translator working into ${langName}.

Translate with the standards of a high-quality news desk.

Rules:
1. Return ONLY valid JSON — no explanations, no markdown fences, no commentary before or after the JSON.
2. Preserve facts, numbers, dates, and attributions exactly.
3. Keep the journalistic tone, register, and structure appropriate for news writing.
4. Use the established target-language form for people, organizations, and places when one clearly exists; otherwise preserve the original term.
5. Maintain one consistent target-language rendering for every named entity across all chunks of this article.
${chineseBodyRules}${bdQuoteRule}. Translate quotes faithfully without adding interpretation.
${bdHeadingRule}. Keep section headings concise and news-style.
${bdContextRule}. Use any provided context only to disambiguate meaning; do not introduce information not present in the segment itself.
${bdOrderRule}. Return translations in the same order as the input.

Output format (strictly follow this structure):
{"translations":[{"id":0,"text":"..."},{"id":1,"text":"..."}]}`;

  const userPrompt = [contextBlock, `Translate the following news ${contentLabel} into ${langName}.`, 'Input:', inputJson].filter(Boolean).join('\n\n');
  return { systemPrompt, userPrompt, useSystemRole: true };
}

// ============================================
// Translation Error Formatting
// ============================================
function providerDisplayName(provider) {
  return PROVIDERS[provider]?.name || provider;
}

function formatTranslationError(provider, error) {
  const providerName = providerDisplayName(provider);
  const raw = (error && error.message ? error.message : String(error || '')).trim();
  const lower = raw.toLowerCase();

  if (!raw) return `${providerName} 翻译失败，请稍后重试。`;
  if (lower.includes('incomplete') || lower.includes('incomplete response')) {
    return `${providerName} 翻译结果不完整，请重试或切换到其他翻译服务。`;
  }
  if (provider === 'deepl' && lower.includes('deepl request failed')) {
    return '无法连接到 DeepL。请重载扩展后重试；如果你使用的是 Pro Key，请在设置页切换到 Pro API。';
  }
  if ((lower.includes('configure') || lower.includes('missing') || lower.includes('required')) && lower.includes('api key')) {
    return `未配置 ${providerName} API Key。请先在设置页填写后重试。`;
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('invalid api key') || lower.includes('authentication') || lower.includes('auth failed')) {
    return `${providerName} 认证失败，请检查 API Key 是否正确。`;
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota') || lower.includes('insufficient_quota') || lower.includes('too many requests')) {
    return `${providerName} 请求被限制或额度不足，请稍后重试。`;
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('overloaded') || lower.includes('over capacity')) {
    return `${providerName} 服务繁忙（503），请稍后重试，或切换到其他模型。`;
  }
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('unsupported') || lower.includes('does not exist') || lower.includes('invalid'))) {
    return '当前模型不可用，请改用预设模型或检查自定义模型名称。';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network error') || lower.includes('fetch failed')) {
    return `无法连接到 ${providerName}，请检查网络或 endpoint 设置。`;
  }
  if (lower.includes('empty response') || lower.includes('returned empty response')) {
    return `${providerName} 返回了空结果，请更换模型或稍后重试。`;
  }
  return `${providerName} 翻译失败：${raw.slice(0, 180)}`;
}

// ============================================
// LLM Response Parsing (4-layer JSON extraction)
// ============================================
function stripThinkingTokens(text) {
  if (typeof text !== 'string') return text;
  let cleaned = text.replace(/<think[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<Thought>[\s\S]*?<\/Thought>/gi, '');
  cleaned = cleaned.replace(/<\/?think>/gi, '');
  cleaned = cleaned.replace(/<\/?Thought>/gi, '');
  cleaned = cleaned.replace(/<think[\s\S]*$/gi, '');
  cleaned = cleaned.replace(/<Thought>[\s\S]*$/gi, '');
  return cleaned.trim();
}

function extractTextFromLLMValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => extractTextFromLLMValue(item)).filter(Boolean).join('\n').trim();
  if (typeof value === 'object') {
    for (const key of ['text', 'translation', 'translatedText', 'output_text', 'output', 'content', 'value', 'result']) {
      if (key in value) { const extracted = extractTextFromLLMValue(value[key]); if (extracted) return extracted; }
    }
    if (Array.isArray(value.translations)) {
      const extracted = value.translations.map(item => extractTextFromLLMValue(item)).filter(Boolean).join('\n').trim();
      if (extracted) return extracted;
    }
  }
  return '';
}

function normalizeTranslationItem(item) {
  const text = extractTextFromLLMValue(item);
  if (text) return text;
  if (item == null) return '';
  try { return JSON.stringify(item); } catch { return String(item); }
}

function extractJsonString(content) {
  const trimmed = content.trim();
  try { JSON.parse(trimmed); return trimmed; } catch {}

  let cleaned = trimmed.replace(/^[^{[]*?```(?:json)?\s*\r?\n?/i, '');
  cleaned = cleaned.replace(/\r?\n?\s*```[^}\]]*$/, '').trim();
  try { JSON.parse(cleaned); return cleaned; } catch {}

  const prefixStripped = trimmed.replace(/^[^{[]+/, '').trim();
  if (prefixStripped !== trimmed) { try { JSON.parse(prefixStripped); return prefixStripped; } catch {} }

  const source = cleaned.length < trimmed.length ? cleaned : trimmed;
  const startIdx = Math.min(source.indexOf('{') >= 0 ? source.indexOf('{') : Infinity, source.indexOf('[') >= 0 ? source.indexOf('[') : Infinity);
  if (startIdx < Infinity) {
    const openChar = source[startIdx];
    const closeChar = openChar === '{' ? '}' : ']';
    let depth = 0, inStr = false;
    for (let i = startIdx; i < source.length; i++) {
      const c = source[i];
      if (inStr) { if (c === '\\') { i++; continue; } if (c === '"') { inStr = false; } continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') depth++;
      if (c === '}' || c === ']') depth--;
      if (depth === 0) { const candidate = source.substring(startIdx, i + 1); try { JSON.parse(candidate); return candidate; } catch {} break; }
    }
  }
  return trimmed;
}

function parseJsonLikeTranslationLines(content) {
  const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
  const cleaned = [];
  for (const line of lines) {
    if (/^[\[\]\{\}]$/.test(line)) continue;
    let candidate = line.replace(/^[\[,]\s*/, '').replace(/\s*[,]\s*$/, '').replace(/\s*[\]]\s*$/, '').trim();
    if (!candidate) continue;
    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      try { const obj = JSON.parse(candidate.replace(/,\s*$/, '')); const text = normalizeTranslationItem(obj); if (text) { cleaned.push(text); continue; } } catch {}
    }
    if ((candidate.startsWith('"') && candidate.endsWith('"')) || (candidate.startsWith('`') && candidate.endsWith('`'))) {
      try { const parsed = JSON.parse(candidate.replace(/^`|`$/g, '"')); if (typeof parsed === 'string' && parsed.trim()) { cleaned.push(parsed.trim()); continue; } } catch {}
    }
    candidate = candidate.replace(/^"+|"+$/g, '').trim();
    if (!candidate) continue;
    if (/^[\[\]\{\},:]+$/.test(candidate)) continue;
    if (/^"?(id|text|translation|index)"?\s*:/.test(candidate)) continue;
    cleaned.push(candidate);
  }
  return cleaned;
}

function parseLLMTranslations(rawContent, texts) {
  let translations;
  let content = typeof rawContent === 'string' ? rawContent : extractTextFromLLMValue(rawContent);
  content = stripThinkingTokens(content);
  content = content.replace(/^\uFEFF/, '').trim();

  try {
    const jsonStr = extractJsonString(content);
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      translations = parsed.map(normalizeTranslationItem);
    } else if (parsed && Array.isArray(parsed.translations)) {
      translations = parsed.translations.map(normalizeTranslationItem);
    } else {
      translations = [normalizeTranslationItem(parsed)];
    }
  } catch {
    translations = parseJsonLikeTranslationLines(content);
    if (translations.length === 0) {
      translations = content.split('\n').map(line => line.trim())
        .filter(line => line && !/^[\[\]\{\},:]+$/.test(line) && !/^```/.test(line))
        .map(line => line.replace(/^["'`]+|["'`]+$/g, '').trim()).filter(Boolean);
    }
  }

  if (!Array.isArray(translations)) translations = [normalizeTranslationItem(translations)];
  if (translations.length !== texts.length) {
    try {
      const jsonStr = extractJsonString(stripThinkingTokens(typeof rawContent === 'string' ? rawContent : extractTextFromLLMValue(rawContent)));
      const parsed = JSON.parse(jsonStr);
      const items = Array.isArray(parsed) ? parsed : (parsed?.translations || []);
      if (Array.isArray(items) && items.some(it => it && typeof it === 'object' && 'id' in it)) {
        const aligned = new Array(texts.length).fill('');
        for (const item of items) {
          const id = Number(item?.id);
          if (!isNaN(id) && id >= 0 && id < texts.length) aligned[id] = normalizeTranslationItem(item);
        }
        const alignedCount = aligned.filter(t => t.trim()).length;
        const sequentialCount = translations.slice(0, texts.length).filter(t => String(t || '').trim()).length;
        if (alignedCount >= sequentialCount) translations = aligned;
      }
    } catch {}
  }
  while (translations.length < texts.length) translations.push('');

  // Detect incomplete translations — LLM may have truncated or returned partial results
  // Always throw if any translation is empty; let the renderer handle retry/split
  const nonEmptyCount = translations.slice(0, texts.length).filter(t => String(t).trim()).length;
  if (nonEmptyCount < texts.length) {
    const err = new Error(`LLM returned incomplete translations: ${nonEmptyCount}/${texts.length}`);
    err.partial = true;
    throw err;
  }

  return translations.slice(0, texts.length);
}

// ============================================
// Google Translate (free, no API key)
// ============================================
async function googleTranslate(texts, targetLang) {
  const concurrency = 8;
  const translations = new Array(texts.length);
  let nextIdx = 0;

  const worker = async () => {
    while (true) {
      const idx = nextIdx;
      if (idx >= texts.length) break;
      nextIdx = idx + 1;
      const text = texts[idx];
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) {
            if (attempt < 2 && (resp.status === 429 || resp.status >= 500)) {
              await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt) + Math.random() * 500));
              continue;
            }
            throw new Error(`Google Translate error: ${resp.status}`);
          }
          const data = await resp.json();
          let result = '';
          if (data && data[0]) { for (const part of data[0]) { if (part && part[0]) result += part[0]; } }
          translations[idx] = result || text;
          break;
        } catch (err) {
          if (attempt < 2) { await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt) + Math.random() * 500)); continue; }
          console.warn('[Kin] Google Translate item failed:', err.message);
          translations[idx] = text;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, () => worker()));
  return { translations };
}

// ============================================
// Microsoft Translator (free, Edge token)
// ============================================
let msToken = null;
let msTokenExpiry = 0;
let msTokenPromise = null;

async function getMicrosoftToken() {
  if (msToken && Date.now() < msTokenExpiry) return msToken;
  if (msTokenPromise) return msTokenPromise;

  msTokenPromise = (async () => {
    try {
      if (!msToken) {
        const stored = await chrome.storage.session?.get(['msToken', 'msTokenExpiry']);
        if (stored?.msToken && stored.msTokenExpiry && Date.now() < stored.msTokenExpiry) {
          msToken = stored.msToken;
          msTokenExpiry = stored.msTokenExpiry;
          return msToken;
        }
      }
      const authResp = await fetch('https://edge.microsoft.com/translate/auth');
      if (!authResp.ok) throw new Error('Auth failed');
      msToken = await authResp.text();
      msTokenExpiry = Date.now() + 8 * 60 * 1000;
      chrome.storage.session?.set({ msToken, msTokenExpiry }).catch(() => {});
      return msToken;
    } catch (e) {
      throw new Error('Microsoft Translator auth failed');
    } finally {
      msTokenPromise = null;
    }
  })();
  return msTokenPromise;
}

async function microsoftTranslate(texts, targetLang) {
  const lang = targetLang === 'zh-CN' ? 'zh-Hans' : targetLang === 'zh-TW' ? 'zh-Hant' : targetLang;
  const body = JSON.stringify(texts.map(t => ({ text: t })));

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getMicrosoftToken();
    const response = await fetch(`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${lang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body
    });
    if (response.ok) {
      const data = await response.json();
      return { translations: data.map(d => d.translations?.[0]?.text || '') };
    }
    if (response.status === 401 && attempt === 0) {
      msToken = null; msTokenExpiry = 0;
      chrome.storage.session?.remove(['msToken', 'msTokenExpiry']).catch(() => {});
      continue;
    }
    msToken = null;
    chrome.storage.session?.remove(['msToken', 'msTokenExpiry']).catch(() => {});
    throw new Error(`Microsoft Translator error: ${response.status}`);
  }
}

// ============================================
// OpenAI-compatible Translate
// ============================================
const JSON_MODE_PROVIDERS = new Set(['openai', 'gemini', 'glm', 'kimi']);

function supportsJsonMode(provider, model) {
  if (JSON_MODE_PROVIDERS.has(provider)) return true;
  if (provider === 'openrouter') return (model || '').toLowerCase().includes('openai/');
  if (provider === 'deepseek') return (model || '').toLowerCase() === 'deepseek-chat';
  if (provider === 'qwen') return !(typeof model === 'string' && model.startsWith('qwen-mt-'));
  return false;
}

function applyOpenAICompatibleModelOptions(provider, model, requestBody) {
  const m = String(model || '').toLowerCase();
  if (provider === 'openai' && m.startsWith('gpt-5.4')) {
    requestBody.reasoning_effort = 'none';
  }
  if (provider === 'kimi' && m.startsWith('kimi-k2')) {
    delete requestBody.temperature;
    requestBody.thinking = { type: 'disabled' };
  }
}

async function openaiTranslate(texts, targetLang, langName, provider, configOverride, context, contentType, disableReasoning) {
  const cfg = await loadProviderConfig(provider, configOverride);
  if (!cfg.apiKey) throw new Error('Please configure API Key in settings');
  if (!cfg.endpoint) throw new Error('Please configure API Endpoint in settings');

  const model = cfg.model || PROVIDERS[provider]?.model || '';
  const prompt = buildNewsTranslationPrompt({ provider, model, langName, contentType, context, texts });
  const messages = prompt.useSystemRole
    ? [{ role: 'system', content: prompt.systemPrompt }, { role: 'user', content: prompt.userPrompt }]
    : [{ role: 'user', content: `${prompt.systemPrompt}\n\n${prompt.userPrompt}` }];

  const requestBody = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: Math.max(4096, Math.min(16384, texts.reduce((sum, t) => sum + String(t).length, 0) * 4))
  };
  if (supportsJsonMode(provider, model)) requestBody.response_format = { type: 'json_object' };
  applyOpenAICompatibleModelOptions(provider, model, requestBody);

  // Disable model reasoning for translation (faster, fewer tokens, less truncation)
  if (disableReasoning) {
    const m = model.toLowerCase();
    switch (provider) {
      case 'gemini':
        // Gemini OpenAI-compatible endpoint: thinking is off by default, no param needed
        break;
      case 'qwen':
        requestBody.enable_thinking = false;
        break;
      case 'openrouter':
        if (m.includes('gemini') || m.includes('gem') || m.includes('reason')) {
          requestBody.thinking = { type: 'disabled' };
        }
        break;
      // OpenAI, DeepSeek, GLM, Kimi, custom_openai: no standardized thinking param
      // in their OpenAI-compatible endpoints; default models have no reasoning enabled
    }
  }

  const fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` };
  if (provider === 'openrouter') {
    fetchHeaders['HTTP-Referer'] = 'https://github.com/zhaodengfeng/kin';
    fetchHeaders['X-Title'] = 'Kin';
  }

  for (let attempt = 0; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(cfg.endpoint, { method: 'POST', headers: fetchHeaders, body: JSON.stringify(requestBody), signal: controller.signal });
      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('API returned empty response');
        return { translations: parseLLMTranslations(content, texts) };
      }
      const errText = await response.text();
      const isRetryable = response.status === 503 || response.status === 529 || response.status === 429 || /unavailable|overloaded|rate.?limit/i.test(errText);
      if (attempt < 3 && isRetryable) { await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt) + Math.random() * 1000)); continue; }
      throw new Error(`API error ${response.status}: ${errText.substring(0, 200)}`);
    } catch (err) {
      if (err.name === 'AbortError') { if (attempt < 3) { await new Promise(r => setTimeout(r, 1000)); continue; } throw new Error(`${providerDisplayName(provider)} request timed out`); }
      throw err;
    } finally { clearTimeout(timeoutId); }
  }
}

// ============================================
// Claude API Translate
// ============================================
async function claudeTranslate(texts, targetLang, langName, provider, configOverride, context, contentType, disableReasoning) {
  const cfg = await loadProviderConfig(provider, configOverride);
  if (!cfg.apiKey) throw new Error('Please configure API Key in settings');
  if (!cfg.endpoint) throw new Error('Please configure API Endpoint in settings');

  const model = cfg.model || PROVIDERS[provider]?.model || '';
  const prompt = buildNewsTranslationPrompt({ provider, model, langName, contentType, context, texts });

  for (let attempt = 0; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          temperature: 0.3,
          system: prompt.systemPrompt,
          messages: [{ role: 'user', content: prompt.userPrompt }]
        }),
        signal: controller.signal
      });
      if (response.ok) {
        const data = await response.json();
        const content = Array.isArray(data.content) && data.content[0]?.text ? data.content[0].text : null;
        if (typeof content !== 'string' || !content.trim()) throw new Error('Claude API returned empty response');
        return { translations: parseLLMTranslations(content, texts) };
      }
      const errText = await response.text();
      const isRetryable = response.status === 503 || response.status === 529 || response.status === 429 || /overloaded|rate.?limit/i.test(errText);
      if (attempt < 3 && isRetryable) { await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt) + Math.random() * 1000)); continue; }
      throw new Error(`Claude API error ${response.status}: ${errText.substring(0, 200)}`);
    } catch (err) {
      if (err.name === 'AbortError') { if (attempt < 3) { await new Promise(r => setTimeout(r, 1000)); continue; } throw new Error('Claude request timed out'); }
      throw err;
    } finally { clearTimeout(timeoutId); }
  }
}

// ============================================
// DeepL API Translate (multi-key rotation)
// ============================================
async function deeplTranslate(texts, targetLang, langName, provider, configOverride) {
  const cfg = await loadProviderConfig(provider, configOverride);
  if (!cfg.apiKey) throw new Error('Please configure DeepL API Key in settings');

  // Parse multi-key (newline-separated) for free accounts
  const keys = cfg.apiKey.split('\n').map(k => k.trim()).filter(k => k);
  const endpoint = cfg.endpoint || PROVIDERS.deepl.endpoint;
  const deeplLang = targetLang === 'zh-CN' ? 'ZH-HANS' : targetLang === 'zh-TW' ? 'ZH-HANT' : targetLang.toUpperCase();
  const params = new URLSearchParams();
  texts.forEach(t => params.append('text', t));
  params.append('target_lang', deeplLang);

  // Get current key index from in-memory state or storage
  const keyState = await chrome.storage.local.get('deeplKeyIndex');
  let keyIndex = (keyState.deeplKeyIndex || 0) % Math.max(keys.length, 1);

  const maxAttempts = keys.length > 1 ? keys.length * 2 : 4;
  const exhaustedKeys = new Set();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (keys.length > 1 && exhaustedKeys.size >= keys.length) {
      throw new Error('DeepL error 456: all configured keys have exhausted their quota');
    }
    const currentKey = keys.length > 1 ? keys[keyIndex % keys.length] : cfg.apiKey.trim();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `DeepL-Auth-Key ${currentKey}` },
        body: params.toString(),
        signal: controller.signal
      });
      if (response.ok) {
        const data = await response.json();
        const translations = data.translations?.map(t => t.text || '') || [];
        while (translations.length < texts.length) translations.push('');
        return { translations };
      }
      const errText = await response.text();
      // 456 = quota exceeded, rotate to next key
      if (response.status === 456 && keys.length > 1) {
        exhaustedKeys.add(keyIndex % keys.length);
        keyIndex = (keyIndex + 1) % keys.length;
        await chrome.storage.local.set({ deeplKeyIndex: keyIndex });
        // Don't retry immediately, short delay then try next key
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      const isRetryable = response.status === 429 || response.status === 503 || response.status === 529;
      if (attempt < maxAttempts - 1 && isRetryable) { await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt) + Math.random() * 1000)); continue; }
      throw new Error(`DeepL error ${response.status}: ${errText.substring(0, 200)}`);
    } catch (err) {
      if (err.name === 'AbortError') { if (attempt < maxAttempts - 1) { await new Promise(r => setTimeout(r, 1000)); continue; } throw new Error('DeepL request timed out'); }
      if (err.message?.includes('DeepL error')) throw err;
      throw new Error('DeepL request failed. If you use a Pro key, set the endpoint to https://api.deepl.com/v2/translate in settings.');
    } finally { clearTimeout(timeoutId); }
  }
  throw new Error('DeepL request failed after exhausting all retry attempts');
}

// ============================================
// Encrypted Backup (AES-256-GCM)
// ============================================
// Magic header for v2 backups: "KIN\x02". v1 (legacy) has no header and uses 100k iterations.
const BACKUP_MAGIC_V2 = [0x4B, 0x49, 0x4E, 0x02];
const BACKUP_ITERATIONS_V1 = 100000;
const BACKUP_ITERATIONS_V2 = 310000;

async function deriveBackupKey(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptBackup(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt, BACKUP_ITERATIONS_V2);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data))
  );
  const combined = new Uint8Array(BACKUP_MAGIC_V2.length + salt.length + iv.length + encrypted.byteLength);
  combined.set(BACKUP_MAGIC_V2, 0);
  combined.set(salt, BACKUP_MAGIC_V2.length);
  combined.set(iv, BACKUP_MAGIC_V2.length + salt.length);
  combined.set(new Uint8Array(encrypted), BACKUP_MAGIC_V2.length + salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptBackup(base64Str, password) {
  try {
    const combined = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
    const hasV2Magic = combined.length > BACKUP_MAGIC_V2.length &&
      BACKUP_MAGIC_V2.every((b, i) => combined[i] === b);
    const offset = hasV2Magic ? BACKUP_MAGIC_V2.length : 0;
    const iterations = hasV2Magic ? BACKUP_ITERATIONS_V2 : BACKUP_ITERATIONS_V1;
    const salt = combined.slice(offset, offset + 16);
    const iv = combined.slice(offset + 16, offset + 28);
    const ciphertext = combined.slice(offset + 28);
    const key = await deriveBackupKey(password, salt, iterations);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    return null;
  }
}
