// Kin Popup Script — Redesigned
document.addEventListener('DOMContentLoaded', async () => {
  const btnTranslate = document.getElementById('btnTranslate');
  const btnTranslateText = document.getElementById('btnTranslateText');
  const btnReader = document.getElementById('btnReader');
  const btnSettings = document.getElementById('btnSettings');
  const btnSwapLang = document.getElementById('btnSwapLang');
  const btnSidebar = document.getElementById('btnSidebar');
  const sourceLang = document.getElementById('sourceLang');
  const targetLang = document.getElementById('targetLang');
  const engineSelect = document.getElementById('engineSelect');
  const btnDual = document.getElementById('btnDual');
  const btnTransOnly = document.getElementById('btnTransOnly');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const quickInput = document.getElementById('quickInput');
  const btnQuickTranslate = document.getElementById('btnQuickTranslate');
  const quickResult = document.getElementById('quickResult');
  const historySection = document.getElementById('historySection');

  let pageState = 'idle'; // idle | translating | translated

  // Populate dropdowns
  populateLanguages();
  await populateEngines();

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Load saved settings
  const settings = await getSettings();
  applySettings(settings);

  // Ping content script
  const response = await pingContentScript(tab.id);
  if (response) updateUI(response);

  // Load history for news sites
  if (response?.isArticle) loadHistory();

  // ========== Event Listeners ==========

  // Main translate button
  btnTranslate.addEventListener('click', async () => {
    if (pageState === 'idle') {
      pageState = 'translating';
      btnTranslateText.textContent = '翻译中...';
      btnTranslate.disabled = true;
      setStatus('translating', '正在翻译...');
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'toggle_translate' });
      } catch(e) {
        pageState = 'idle';
        btnTranslateText.textContent = '翻译此页面';
        btnTranslate.disabled = false;
        setStatus('error', '无法连接到此页面');
        return;
      }
      pollTranslationState(tab.id);
    } else if (pageState === 'translated') {
      pageState = 'idle';
      btnTranslateText.textContent = '翻译此页面';
      setStatus('idle', '准备就绪');
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'toggle_translate' });
      } catch(e) {
        pageState = 'idle';
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
    quickResult.className = 'kin-quick-result';
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'translate',
        data: { texts: [text], to: targetLang.value || 'zh-CN' }
      });
      if (resp?.translations?.[0]) {
        quickResult.textContent = resp.translations[0];
      } else if (resp?.error) {
        quickResult.textContent = resp.error;
        quickResult.className = 'kin-quick-result error';
      }
    } catch (e) {
      quickResult.textContent = '翻译失败';
      quickResult.className = 'kin-quick-result error';
    }
  }

  // Reader button
  btnReader?.addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { type: 'open_reader' });
    window.close();
  });

  // Settings button
  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Sidebar button
  btnSidebar?.addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle_sidebar' });
    window.close();
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
  btnDual.addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle_mode' });
    btnDual.classList.add('active');
    btnTransOnly.classList.remove('active');
  });
  btnTransOnly.addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle_mode' });
    btnTransOnly.classList.add('active');
    btnDual.classList.remove('active');
  });

  // ========== Functions ==========

  function setStatus(state, text) {
    statusDot.className = 'kin-status-dot' + (state !== 'idle' ? ` ${state}` : '');
    statusText.textContent = text;
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
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'get_available_providers' }, (resp) => {
        const freeGroup = document.getElementById('freeOptgroup');
        const apiGroup = document.getElementById('apiOptgroup');
        const providers = resp?.providers || (typeof ProviderRegistry !== 'undefined'
          ? ProviderRegistry.freeProviders()
          : [{ id: 'google', name: 'Google Translate', type: 'free' }, { id: 'microsoft', name: 'Microsoft Translator', type: 'free' }]);
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
        resolve();
      });
    });
  }

  async function getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'get_settings' }, (data) => resolve(data || {}));
    });
  }

  function applySettings(s) {
    if (s.sourceLang) sourceLang.value = s.sourceLang;
    if (s.targetLang) targetLang.value = s.targetLang;
    if (s.translationProvider) engineSelect.value = s.translationProvider;
    if (s.translationMode === 'translation') {
      btnTransOnly.classList.add('active');
      btnDual.classList.remove('active');
    }
  }

  function saveSettings(data) {
    chrome.runtime.sendMessage({ type: 'save_settings', data });
  }

  async function pingContentScript(tabId) {
    try {
      return await chrome.tabs.sendMessage(tabId, { type: 'ping' });
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
  }

  function pollTranslationState(tabId) {
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
        if (resp?.pageTranslated || !resp?.translating) {
          pageState = resp?.pageTranslated ? 'translated' : 'idle';
          btnTranslateText.textContent = resp?.pageTranslated ? '显示原文' : '翻译此页面';
          btnTranslate.disabled = false;
          setStatus(resp?.pageTranslated ? 'translated' : 'idle',
            resp?.pageTranslated ? '已翻译' : '准备就绪');
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
      if (!history.length) { list.innerHTML = '<div style="font-size:11px;color:#999">暂无阅读记录</div>'; return; }
      list.innerHTML = history.slice(0, 5).map(item =>
        `<div class="kin-history-item">
          <span class="kin-history-item-title">${escapeHtml(item.title || 'Untitled')}</span>
          <span class="kin-history-item-source">${escapeHtml(item.source || '')}</span>
        </div>`
      ).join('');
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
});
