// Kin Popup Script — Redesigned
document.addEventListener('DOMContentLoaded', async () => {
  const btnTranslate = document.getElementById('btnTranslate');
  const btnTranslateText = document.getElementById('btnTranslateText');
  const btnReader = document.getElementById('btnReader');
  const btnSettings = document.getElementById('btnSettings');
  const btnSwapLang = document.getElementById('btnSwapLang');
  const sourceLang = document.getElementById('sourceLang');
  const targetLang = document.getElementById('targetLang');
  const engineSelect = document.getElementById('engineSelect');
  const btnDual = document.getElementById('btnDual');
  const btnTransOnly = document.getElementById('btnTransOnly');
  const statusText = document.getElementById('statusText');
  const quickInput = document.getElementById('quickInput');
  const btnQuickTranslate = document.getElementById('btnQuickTranslate');
  const quickResult = document.getElementById('quickResult');
  const historySection = document.getElementById('historySection');
  const popupVersion = document.getElementById('popupVersion');

  let pageState = 'idle'; // idle | translating | translated
  let tab = null;
  const MESSAGE_TIMEOUT_MS = 2500;
  const DEFAULT_PROVIDERS = [
    { id: 'google', name: 'Google Translate', type: 'free' },
    { id: 'microsoft', name: 'Microsoft Translator', type: 'free' }
  ];

  const manifest = chrome.runtime.getManifest();
  if (popupVersion && manifest) {
    popupVersion.textContent = manifest.version_name || `v${manifest.version}`;
  }

  function withMessageTimeout(run, fallback, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish(fallback), timeoutMs || MESSAGE_TIMEOUT_MS);
      try {
        run(finish);
      } catch (e) {
        finish(fallback);
      }
    });
  }

  function runtimeMessage(message, fallback, timeoutMs) {
    return withMessageTimeout((finish) => {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('[Kin Popup] runtime message failed:', chrome.runtime.lastError.message);
          finish(fallback);
          return;
        }
        finish(resp == null ? fallback : resp);
      });
    }, fallback, timeoutMs);
  }

  function tabMessage(tabId, message, options) {
    const fallback = options?.fallback;
    const shouldReject = options?.reject !== false;
    return withMessageTimeout((finish) => {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        if (chrome.runtime.lastError) {
          const error = new Error(chrome.runtime.lastError.message);
          finish(shouldReject ? { __kinError: error } : fallback);
          return;
        }
        finish(resp == null ? fallback : resp);
      });
    }, shouldReject ? { __kinError: new Error('请求超时') } : fallback, options?.timeoutMs || MESSAGE_TIMEOUT_MS)
      .then((resp) => {
        if (resp?.__kinError) throw resp.__kinError;
        return resp;
      });
  }

  // P2-7: toggle mode-card disabled state in sync with pageState
  function syncModeCardState() {
    const modeCard = document.querySelector('.mode-card');
    if (!modeCard) return;
    modeCard.classList.toggle('is-disabled', pageState !== 'translated');
  }

  // Populate dropdowns
  populateLanguages();
  syncModeCardState();
  initPopup();

  // ========== Event Listeners ==========

  // Main translate button
  btnTranslate.addEventListener('click', async () => {
    const tabId = tab?.id;
    if (!tabId) {
      setStatus('translating', '正在连接当前页面...');
      return;
    }
    if (pageState === 'idle') {
      pageState = 'translating';
      btnTranslateText.textContent = '翻译中...';
      btnTranslate.disabled = true;
      setStatus('translating', '正在翻译...');
      syncModeCardState();
      try {
        const resp = await tabMessage(tabId, { type: 'toggle_translate' });
        if (resp?.ok === false) throw new Error(resp.error || '翻译失败');
        if (resp?.action === 'reader_opened' || resp?.action === 'reader_already_open') {
          pageState = 'idle';
          btnTranslateText.textContent = '翻译此页面';
          btnTranslate.disabled = false;
          setStatus('translated', '已打开沉浸阅读');
          syncModeCardState();
          return;
        }
      } catch(e) {
        pageState = 'idle';
        btnTranslateText.textContent = '翻译此页面';
        btnTranslate.disabled = false;
        setStatus('error', e.message || '无法连接到此页面');
        return;
      }
      pollTranslationState(tabId);
    } else if (pageState === 'translated') {
      pageState = 'idle';
      btnTranslateText.textContent = '翻译此页面';
      setStatus('idle', '准备就绪');
      syncModeCardState();
      try {
        const resp = await tabMessage(tabId, { type: 'toggle_translate' });
        if (resp?.ok === false) throw new Error(resp.error || '恢复原文失败');
      } catch(e) {
        pageState = 'idle';
        setStatus('error', e.message || '恢复原文失败');
      }
    }
  });

  // Quick input translate
  btnQuickTranslate.addEventListener('click', () => doQuickTranslate());
  quickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doQuickTranslate();
  });

  async function doQuickTranslate() {
    const text = quickInput.value.trim();
    if (!text) return;
    quickResult.style.display = '';
    quickResult.textContent = '翻译中...';
    quickResult.className = 'quick-result';
    try {
      const resp = await runtimeMessage({
        type: 'translate',
        data: { texts: [text], to: targetLang.value || 'zh-CN' }
      }, { error: '翻译请求超时' }, 15000);
      if (resp?.translations?.[0]) {
        quickResult.textContent = resp.translations[0];
      } else if (resp?.error) {
        quickResult.textContent = resp.error;
        quickResult.className = 'quick-result error';
      }
    } catch (e) {
      quickResult.textContent = '翻译失败';
      quickResult.className = 'quick-result error';
    }
  }

  // Reader button
  btnReader?.addEventListener('click', async () => {
    const tabId = tab?.id;
    if (!tabId) {
      setStatus('translating', '正在连接当前页面...');
      return;
    }
    try {
      const resp = await tabMessage(tabId, { type: 'open_reader' });
      if (resp?.ok === false) throw new Error(resp.error || '阅读模式打开失败');
      window.close();
    } catch (e) {
      setStatus('error', e.message || '阅读模式打开失败');
    }
  });

  // Settings button
  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Swap languages
  btnSwapLang.addEventListener('click', () => {
    const s = sourceLang.value;
    const t = targetLang.value;
    sourceLang.value = t;
    targetLang.value = s;
    saveSettings({ sourceLang: t, targetLang: s });
  });

  // Language changes
  sourceLang.addEventListener('change', () => saveSettings({ sourceLang: sourceLang.value }));
  targetLang.addEventListener('change', () => saveSettings({ targetLang: targetLang.value }));

  // Engine change
  engineSelect.addEventListener('change', () => saveSettings({ translationProvider: engineSelect.value }));

  // Mode toggle
  btnDual.addEventListener('click', async () => {
    if (pageState !== 'translated') return;
    const tabId = tab?.id;
    if (!tabId) return;
    try {
      const resp = await tabMessage(tabId, { type: 'set_mode', mode: 'dual' });
      if (resp?.ok === false) throw new Error(resp.error || '切换显示模式失败');
      btnDual.classList.add('active');
      btnTransOnly.classList.remove('active');
      saveSettings({ translationMode: 'dual' });
    } catch (e) {
      setStatus('error', e.message || '切换显示模式失败');
    }
  });
  btnTransOnly.addEventListener('click', async () => {
    if (pageState !== 'translated') return;
    const tabId = tab?.id;
    if (!tabId) return;
    try {
      const resp = await tabMessage(tabId, { type: 'set_mode', mode: 'translation' });
      if (resp?.ok === false) throw new Error(resp.error || '切换显示模式失败');
      btnTransOnly.classList.add('active');
      btnDual.classList.remove('active');
      saveSettings({ translationMode: 'translation' });
    } catch (e) {
      setStatus('error', e.message || '切换显示模式失败');
    }
  });

  // ========== Functions ==========

  async function initPopup() {
    try {
      await populateEngines();

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs?.[0] || null;
      if (!tab) {
        btnTranslate.disabled = true;
        setStatus('error', '未找到当前标签页');
        return;
      }

      // P2-5: Friendly message for restricted URLs where content scripts cannot run
      const restrictedPrefixes = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'brave://', 'view-source:', 'https://chrome.google.com/webstore', 'https://chromewebstore.google.com'];
      const isRestricted = typeof tab.url === 'string' && restrictedPrefixes.some(p => tab.url.startsWith(p));
      if (isRestricted) {
        btnTranslate.disabled = true;
        btnTranslateText.textContent = '当前页面不支持翻译';
        setStatus('error', '浏览器内部页面无法注入脚本');
        if (btnReader) btnReader.style.display = 'none';
      }

      // Load saved settings
      const settings = await getSettings();
      applySettings(settings);

      // Ping content script
      const response = isRestricted ? null : await pingContentScript(tab.id);
      if (response) updateUI(response);
      else syncModeCardState();

      // Load history for news sites
      if (response?.isArticle) loadHistory();
    } catch (e) {
      console.warn('[Kin Popup] init failed:', e.message);
      setStatus('error', '弹窗初始化失败');
    }
  }

  function setStatus(state, text) {
    statusText.textContent = text;
    statusText.className = 'popup-status' + (state !== 'idle' ? ` ${state}` : '');
  }

  function populateLanguages() {
    const langs = typeof TARGET_LANGUAGES !== 'undefined' ? TARGET_LANGUAGES : [
      { code: 'zh-CN', name: '简体中文' }, { code: 'en', name: 'English' },
      { code: 'ja', name: '日本語' }, { code: 'ko', name: '한국어' },
    ];
    const srcLangs = [{ code: 'auto', name: '自动检测' }, ...langs];
    srcLangs.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.code; opt.textContent = l.name;
      sourceLang.appendChild(opt);
    });
    langs.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.code; opt.textContent = l.name;
      targetLang.appendChild(opt);
    });
  }

  function populateEngines() {
    return runtimeMessage({ type: 'get_available_providers' }, { providers: DEFAULT_PROVIDERS }, 1600)
      .then((resp) => {
        const freeGroup = document.getElementById('freeOptgroup');
        const apiGroup = document.getElementById('apiOptgroup');
        const providers = resp?.providers || (typeof ProviderRegistry !== 'undefined'
          ? ProviderRegistry.freeProviders()
          : DEFAULT_PROVIDERS);
        freeGroup.innerHTML = '';
        apiGroup.innerHTML = '';
        let hasApi = false;
        providers.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id; opt.textContent = p.name;
          if (p.type === 'free') freeGroup.appendChild(opt);
          else { apiGroup.appendChild(opt); hasApi = true; }
        });
        // Hide the API optgroup label if no configured providers
        const apiLabel = apiGroup.closest('select')?.querySelectorAll('optgroup')[1];
        if (apiGroup) apiGroup.style.display = hasApi ? '' : 'none';
      });
  }

  async function getSettings() {
    return runtimeMessage({ type: 'get_settings' }, {}, 1600);
  }

  function applySettings(s) {
    if (s.sourceLang) sourceLang.value = s.sourceLang;
    if (s.targetLang) targetLang.value = s.targetLang;
    if (s.translationProvider) engineSelect.value = s.translationProvider;
    if (s.translationMode === 'translation') {
      btnTransOnly.classList.add('active');
      btnDual.classList.remove('active');
    } else {
      btnDual.classList.add('active');
      btnTransOnly.classList.remove('active');
    }
  }

  function saveSettings(data) {
    runtimeMessage({ type: 'save_settings', data }, { ok: false }, 1600);
  }

  async function pingContentScript(tabId) {
    try {
      return await tabMessage(tabId, { type: 'ping' }, { fallback: null, reject: false, timeoutMs: 1200 });
    } catch { return null; }
  }

  function updateUI(resp) {
    if (resp.readerEnabled && resp.isArticle) {
      btnReader.style.display = 'flex';
    }
    if (resp.isArticle) {
      historySection.style.display = 'block';
    }
    if (resp.pageTranslated) {
      pageState = 'translated';
      btnTranslateText.textContent = '显示原文';
      setStatus('translated', '已翻译');
    }
    syncModeCardState();
  }

  function pollTranslationState(tabId) {
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const resp = await tabMessage(tabId, { type: 'ping' }, { fallback: null, reject: false, timeoutMs: 1200 });
        if (resp?.pageTranslated || !resp?.translating) {
          pageState = resp?.pageTranslated ? 'translated' : 'idle';
          btnTranslateText.textContent = resp?.pageTranslated ? '显示原文' : '翻译此页面';
          btnTranslate.disabled = false;
          setStatus(resp?.pageTranslated ? 'translated' : 'idle',
            resp?.pageTranslated ? '已翻译' : '准备就绪');
          syncModeCardState();
          clearInterval(interval);
        }
      } catch {
        pageState = 'idle';
        btnTranslateText.textContent = '翻译此页面';
        btnTranslate.disabled = false;
        setStatus('error', '连接中断');
        clearInterval(interval);
      }
      if (attempts >= maxAttempts) {
        pageState = 'idle';
        btnTranslateText.textContent = '翻译此页面';
        btnTranslate.disabled = false;
        setStatus('error', '翻译超时');
        clearInterval(interval);
      }
    }, 500);
  }

  function loadHistory() {
    chrome.runtime.sendMessage({ type: 'get_history' }, (data) => {
      const list = document.getElementById('historyList');
      const history = data?.history || [];
      list.replaceChildren();
      if (!history.length) {
        list.classList.add('is-empty');
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.textContent = '暂无阅读记录';
        list.appendChild(empty);
        return;
      }
      list.classList.remove('is-empty');
      const frag = document.createDocumentFragment();
      history.slice(0, 5).forEach(item => {
        const row = document.createElement('div');
        row.className = 'history-item';
        const title = document.createElement('span');
        title.className = 'history-item-title';
        title.textContent = item.title || 'Untitled';
        const source = document.createElement('span');
        source.className = 'history-item-source';
        source.textContent = item.source || '';
        row.append(title, source);
        frag.appendChild(row);
      });
      list.appendChild(frag);
    });
  }
});
