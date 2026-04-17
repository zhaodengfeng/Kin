// Kin Options Page Script — Hash routing + Immersive redesign
document.addEventListener('DOMContentLoaded', async () => {
  // ========== Hash-based Tab Navigation ==========
  const navBtns = document.querySelectorAll('.kin-nav-link');
  const tabs = document.querySelectorAll('.kin-tab');

  function activateTab(tabName) {
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    tabs.forEach(t => t.classList.toggle('active', t.id === 'tab-' + tabName));
  }

  function getCurrentHash() {
    return location.hash.replace('#', '') || 'translation';
  }

  // Nav button clicks update hash
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      location.hash = btn.dataset.tab;
    });
  });

  // Hash change activates tab
  window.addEventListener('hashchange', () => {
    activateTab(getCurrentHash());
  });

  // Initial activation from hash
  activateTab(getCurrentHash());

  // ========== Load Settings ==========
  const settings = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'get_settings' }, resolve);
  }) || {};

  // Theme names (moved before populateThemes call)
  const THEME_NAMES = {
    underline: '下划线', dashed: '虚线', nativeUnderline: '原生下划线',
    nativeDashed: '原生虚线', dotted: '点线', nativeDotted: '原生点线',
    thinDashed: '细虚线', wavy: '波浪线', highlight: '高亮',
    marker: '马克笔', marker2: '马克笔2', grey: '灰色',
    weakening: '淡化', italic: '斜体', bold: '粗体', paper: '纸片',
    blockquote: '引用', mask: '模糊', opacity: '透明',
    background: '背景色', dashedBorder: '虚线边框', solidBorder: '实线边框',
    dividingLine: '分割线'
  };

  populateSourceLanguages();
  populateTargetLanguages();
  populateEngines();
  populateThemes();

  applySettings(settings);

  // ========== Translation Tab ==========
  const optEngine = document.getElementById('optEngine');
  const providerConfig = document.getElementById('providerConfig');
  const engineHint = document.getElementById('engineHint');
  const deeplAccountGroup = document.getElementById('deeplAccountGroup');
  const deeplKeyGroup = document.getElementById('deeplKeyGroup');
  const singleKeyGroup = document.getElementById('singleKeyGroup');
  const modelGroup = document.getElementById('modelGroup');

  function isDeepl(provider) { return provider === 'deepl'; }

  function updateDeeplUI(provider, accountType) {
    const isFree = accountType === 'free';
    // Show/hide account type selector
    deeplAccountGroup.style.display = isDeepl(provider) ? 'block' : 'none';
    // Show/hide multi-key vs single key
    deeplKeyGroup.style.display = isDeepl(provider) && isFree ? 'block' : 'none';
    singleKeyGroup.style.display = isDeepl(provider) && isFree ? 'none' : 'block';
    // Hide model for deepl
    modelGroup.style.display = isDeepl(provider) ? 'none' : 'block';
  }

  optEngine.addEventListener('change', () => {
    const provider = optEngine.value;
    const isFree = provider === 'google' || provider === 'microsoft';
    providerConfig.style.display = isFree ? 'none' : 'block';
    engineHint.textContent = isFree ? '免费引擎无需配置即可使用' : '需要配置 API Key 才能使用';

    if (isDeepl(provider)) {
      updateDeeplUI(provider, 'free');
      // Load saved account type
      chrome.storage.local.get('deeplAccount', d => {
        const acc = d.deeplAccount || 'free';
        document.querySelector(`input[name="deeplAccount"][value="${acc}"]`).checked = true;
        updateDeeplUI(provider, acc);
      });
    } else {
      updateDeeplUI(provider, '');
    }

    if (!isFree) {
      loadProviderConfig(provider);
      if (!isDeepl(provider)) populateModelSelect(provider);
      autoFillProviderDefaults(provider);
    }
    saveSettings({ translationProvider: provider });
  });
  optEngine.dispatchEvent(new Event('change'));

  // DeepL account type change
  document.querySelectorAll('input[name="deeplAccount"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const provider = optEngine.value;
      updateDeeplUI(provider, this.value);
      // Update endpoint
      const info = typeof PROVIDERS !== 'undefined' ? PROVIDERS.deepl : null;
      if (info?.endpoints) {
        const endpoint = info.endpoints[this.value] || info.endpoints.free;
        document.getElementById('optEndpoint').value = endpoint;
        saveSettings({ deepl_endpoint: endpoint, deeplAccount: this.value });
      }
    });
  });

  // Toggle API key visibility
  document.getElementById('btnToggleKey').addEventListener('click', () => {
    const inp = document.getElementById('optApiKeySingle');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // Save API key (single key providers)
  document.getElementById('optApiKeySingle').addEventListener('change', async function() {
    const provider = optEngine.value;
    const resp = await chrome.runtime.sendMessage({
      type: 'save_api_key',
      data: { provider, key: this.value }
    });
    if (resp?.ok) showToast('API Key 已保存', 'success');
    else if (resp?.error) showToast('保存失败: ' + resp.error, 'error');
  });

  // Save DeepL multi-key
  document.getElementById('optApiKey').addEventListener('change', async function() {
    const keys = this.value.split('\n').map(k => k.trim()).filter(k => k);
    const resp = await chrome.runtime.sendMessage({
      type: 'save_api_key',
      data: { provider: 'deepl', key: keys.join('\n') }
    });
    if (resp?.ok) showToast(`${keys.length} 个 API Key 已保存`, 'success');
    else if (resp?.error) showToast('保存失败: ' + resp.error, 'error');
  });

  document.getElementById('optEndpoint').addEventListener('change', function() {
    saveSettings({ [`${optEngine.value}_endpoint`]: this.value });
  });

  document.getElementById('optModel').addEventListener('change', function() {
    saveSettings({ [`${optEngine.value}_model`]: this.value });
  });

  document.getElementById('optSourceLang').addEventListener('change', function() {
    saveSettings({ sourceLang: this.value });
  });

  document.getElementById('optTargetLang').addEventListener('change', function() {
    saveSettings({ targetLang: this.value });
  });

  // Translation style
  const optStyle = document.getElementById('optTranslationStyle');
  const customPromptGroup = document.getElementById('customPromptGroup');

  optStyle.addEventListener('change', () => {
    customPromptGroup.style.display = optStyle.value === 'custom' ? '' : 'none';
    saveSettings({ translationStyle: optStyle.value });
  });

  document.getElementById('optCustomPrompt').addEventListener('change', function() {
    saveSettings({ customPrompt: this.value });
  });

  // Test API connection
  document.getElementById('btnTestApi').addEventListener('click', async () => {
    const status = document.getElementById('apiTestStatus');
    status.textContent = '测试中...';
    status.style.color = 'var(--kin-text-tertiary)';
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'translate',
        data: { texts: ['Hello'], to: 'zh-CN' }
      });
      if (resp?.translations?.[0]) {
        status.textContent = '连接成功';
        status.style.color = 'var(--kin-success)';
      } else {
        status.textContent = '失败: ' + (resp?.error || '未知错误');
        status.style.color = 'var(--kin-error)';
      }
    } catch (e) {
      status.textContent = '连接失败';
      status.style.color = 'var(--kin-error)';
    }
  });

  // Feature toggles
  document.getElementById('optHoverTranslate').addEventListener('change', function() {
    document.getElementById('hoverOptions').style.display = this.checked ? '' : 'none';
    saveSettings({ hoverTranslate: this.checked });
  });

  document.getElementById('optSelectionTranslate').addEventListener('change', function() {
    saveSettings({ selectionTranslate: this.checked });
  });

  // Fix: use querySelectorAll for all radio buttons
  document.querySelectorAll('input[name="hoverTrigger"]').forEach(radio => {
    radio.addEventListener('change', function() {
      saveSettings({ hoverTrigger: this.value });
    });
  });

  document.getElementById('optSensitiveMask').addEventListener('change', function() {
    saveSettings({ sensitiveMask: this.checked });
  });

  // Translation mode radio cards
  document.querySelectorAll('input[name="translationMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      saveSettings({ translationMode: radio.value });
    });
  });

  // Test translation
  document.getElementById('btnTestTranslate').addEventListener('click', async () => {
    const text = document.getElementById('testInput').value.trim();
    if (!text) return;
    const resultEl = document.getElementById('testResult');
    resultEl.textContent = '翻译中...';
    resultEl.style.color = '';
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'translate',
        data: { texts: [text], to: settings.targetLang || 'zh-CN' }
      });
      if (resp?.error) {
        resultEl.textContent = '错误: ' + resp.error;
        resultEl.style.color = 'var(--kin-error)';
      } else if (resp?.translations?.[0]) {
        resultEl.textContent = resp.translations[0];
        resultEl.style.color = '';
      }
    } catch (e) {
      resultEl.textContent = '翻译失败: ' + e.message;
      resultEl.style.color = 'var(--kin-error)';
    }
  });

  // ========== Reader Tab ==========
  document.getElementById('optReaderEnabled').addEventListener('change', function() {
    document.getElementById('readerSettings').style.display = this.checked ? '' : 'none';
    saveSettings({ readerEnabled: this.checked });
  });

  document.getElementById('optReaderTheme').addEventListener('change', function() {
    saveSettings({ readerTheme: this.value });
  });

  document.getElementById('optExportFormat').addEventListener('change', function() {
    saveSettings({ exportImageFormat: this.value });
  });

  document.getElementById('optExportQuality').addEventListener('change', function() {
    saveSettings({ exportQuality: this.value });
  });

  document.getElementById('optMultiImage').addEventListener('change', function() {
    saveSettings({ longArticleMultiImageExport: this.checked });
  });

  // ========== Rules Tab ==========
  renderRules('alwaysTranslateUrls', settings.alwaysTranslateUrls || [], 'alwaysTranslateList');
  renderRules('neverTranslateUrls', settings.neverTranslateUrls || [], 'neverTranslateList');

  document.getElementById('btnAddAlways').addEventListener('click', () => {
    addRule('alwaysTranslateUrls', 'addAlwaysUrl', 'alwaysTranslateList');
  });

  document.getElementById('btnAddNever').addEventListener('click', () => {
    addRule('neverTranslateUrls', 'addNeverUrl', 'neverTranslateList');
  });

  // ========== About Tab ==========
  loadCacheStats();
  document.getElementById('btnClearCache').addEventListener('click', async () => {
    await chrome.storage.local.remove('translationCache');
    showToast('缓存已清除', 'success');
    loadCacheStats();
  });

  document.getElementById('btnExportBackup').addEventListener('click', exportBackup);
  document.getElementById('btnImportBackup').addEventListener('click', importBackup);

  document.getElementById('btnClearHistory').addEventListener('click', async () => {
    if (confirm('确定要清空所有阅读历史吗？')) {
      await chrome.runtime.sendMessage({ type: 'clear_history' });
      showToast('阅读历史已清空', 'success');
    }
  });

  document.getElementById('btnResetAll').addEventListener('click', async () => {
    if (confirm('确定要重置所有设置吗？此操作不可撤销。')) {
      await chrome.storage.local.clear();
      location.reload();
    }
  });

  // ========== Functions ==========

  function populateSourceLanguages() {
    const select = document.getElementById('optSourceLang');
    const langs = typeof TARGET_LANGUAGES !== 'undefined' ? TARGET_LANGUAGES : [
      { code: 'zh-CN', name: '简体中文' }, { code: 'en', name: 'English' },
    ];
    const opt = document.createElement('option');
    opt.value = 'auto'; opt.textContent = '自动检测';
    select.appendChild(opt);
    langs.forEach(l => {
      const o = document.createElement('option');
      o.value = l.code; o.textContent = l.name;
      select.appendChild(o);
    });
  }

  function populateTargetLanguages() {
    const select = document.getElementById('optTargetLang');
    const langs = typeof TARGET_LANGUAGES !== 'undefined' ? TARGET_LANGUAGES : [
      { code: 'zh-CN', name: '简体中文' }, { code: 'en', name: 'English' },
    ];
    langs.forEach(l => {
      const o = document.createElement('option');
      o.value = l.code; o.textContent = l.name;
      select.appendChild(o);
    });
  }

  function populateEngines() {
    const freeGroup = document.getElementById('optFreeEngines');
    const apiGroup = document.getElementById('optApiEngines');
    const providers = typeof ProviderRegistry !== 'undefined' ? ProviderRegistry.list() : [];
    providers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      if (p.type === 'free') freeGroup.appendChild(opt);
      else apiGroup.appendChild(opt);
    });
  }

  function populateModelSelect(provider) {
    const select = document.getElementById('optModel');
    select.innerHTML = '';
    const info = typeof PROVIDERS !== 'undefined' ? PROVIDERS[provider] : null;
    if (info?.models) {
      info.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        select.appendChild(opt);
      });
    }
    const custom = document.createElement('option');
    custom.value = ''; custom.textContent = '(自定义模型)';
    select.appendChild(custom);
  }

  function populateThemes() {
    const grid = document.getElementById('themeGrid');
    Object.entries(THEME_NAMES).forEach(([id, name]) => {
      const item = document.createElement('div');
      item.className = 'kin-theme-item';
      item.dataset.theme = id;

      item.innerHTML = `
        <div class="kin-theme-name">${name}</div>
        <span class="kin-theme-preview-line kin-theme-${id}">译文预览</span>
      `;

      item.addEventListener('click', () => {
        grid.querySelectorAll('.kin-theme-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        saveSettings({ translationTheme: id });
        updateThemePreview(id);
      });

      grid.appendChild(item);
    });
  }

  function updateThemePreview(themeId) {
    const preview = document.querySelector('.kin-preview-translation');
    if (!preview) return;
    Object.keys(THEME_NAMES).forEach(t => preview.classList.remove(`kin-theme-${t}`));
    preview.classList.add(`kin-theme-${themeId}`);
  }

  async function loadProviderConfig(provider) {
    const keys = [`${provider}_apiKey`, `${provider}_model`, `${provider}_endpoint`];
    const data = await new Promise(resolve => chrome.storage.local.get(keys, resolve));

    const encKey = data[`${provider}_apiKey`] || '';
    let apiKey = '';
    if (encKey) {
      const resp = await chrome.runtime.sendMessage({ type: 'get_api_key', data: { provider } });
      apiKey = resp?.key || '';
    }

    if (isDeepl(provider)) {
      // DeepL uses textarea for multi-key
      document.getElementById('optApiKey').value = apiKey;
    } else {
      document.getElementById('optApiKeySingle').value = apiKey;
    }

    const savedEndpoint = data[`${provider}_endpoint`] || '';
    const endpointInput = document.getElementById('optEndpoint');
    const defaultEndpoint = typeof PROVIDERS !== 'undefined' ? PROVIDERS[provider]?.endpoint : '';
    endpointInput.value = savedEndpoint || defaultEndpoint || '';
    endpointInput.placeholder = defaultEndpoint || '自定义端点';

    if (!isDeepl(provider)) {
      const savedModel = data[`${provider}_model`] || '';
      const defaultModel = typeof PROVIDERS !== 'undefined' ? PROVIDERS[provider]?.model : '';
      document.getElementById('optModel').value = savedModel || defaultModel || '';
    }
  }

  function autoFillProviderDefaults(provider) {
    const info = typeof PROVIDERS !== 'undefined' ? PROVIDERS[provider] : null;
    if (!info) return;

    const endpointInput = document.getElementById('optEndpoint');

    if (!endpointInput.value && info.endpoint) {
      endpointInput.value = info.endpoint;
      saveSettings({ [`${provider}_endpoint`]: info.endpoint });
    }
    if (info.endpoint) endpointInput.placeholder = info.endpoint;

    // Skip model for DeepL
    if (isDeepl(provider)) return;

    const modelSelect = document.getElementById('optModel');
    if (info.model && modelSelect.options.length > 0) {
      let found = false;
      for (const opt of modelSelect.options) {
        if (opt.value === info.model) { opt.selected = true; found = true; break; }
      }
      if (!found) {
        const opt = document.createElement('option');
        opt.value = info.model; opt.textContent = info.model;
        opt.selected = true;
        modelSelect.insertBefore(opt, modelSelect.firstChild);
      }
    }
  }

  function applySettings(s) {
    if (s.translationProvider) document.getElementById('optEngine').value = s.translationProvider;
    if (s.sourceLang) document.getElementById('optSourceLang').value = s.sourceLang;
    if (s.targetLang) document.getElementById('optTargetLang').value = s.targetLang;
    if (s.translationStyle) {
      document.getElementById('optTranslationStyle').value = s.translationStyle;
      if (s.translationStyle === 'custom') customPromptGroup.style.display = '';
    }
    if (s.customPrompt) document.getElementById('optCustomPrompt').value = s.customPrompt;
    if (s.hoverTranslate !== undefined) {
      document.getElementById('optHoverTranslate').checked = s.hoverTranslate;
      document.getElementById('hoverOptions').style.display = s.hoverTranslate ? '' : 'none';
    }
    if (s.selectionTranslate !== undefined) document.getElementById('optSelectionTranslate').checked = s.selectionTranslate;
    if (s.hoverTrigger) document.querySelector(`input[name="hoverTrigger"][value="${s.hoverTrigger}"]`).checked = true;
    if (s.sensitiveMask !== undefined) document.getElementById('optSensitiveMask').checked = s.sensitiveMask;
    if (s.translationMode) {
      const radio = document.querySelector(`input[name="translationMode"][value="${s.translationMode}"]`);
      if (radio) radio.checked = true;
    }
    if (s.readerEnabled !== undefined) {
      document.getElementById('optReaderEnabled').checked = s.readerEnabled;
      document.getElementById('readerSettings').style.display = s.readerEnabled ? '' : 'none';
    }
    if (s.readerTheme) document.getElementById('optReaderTheme').value = s.readerTheme;
    if (s.exportImageFormat) document.getElementById('optExportFormat').value = s.exportImageFormat;
    if (s.exportQuality) document.getElementById('optExportQuality').value = s.exportQuality;
    if (s.longArticleMultiImageExport !== undefined) document.getElementById('optMultiImage').checked = s.longArticleMultiImageExport;
    if (s.translationTheme) {
      const item = document.querySelector(`.kin-theme-item[data-theme="${s.translationTheme}"]`);
      if (item) { item.classList.add('active'); updateThemePreview(s.translationTheme); }
    }
    // DeepL account type
    if (s.deeplAccount) {
      const radio = document.querySelector(`input[name="deeplAccount"][value="${s.deeplAccount}"]`);
      if (radio) radio.checked = true;
      updateDeeplUI(s.translationProvider || 'deepl', s.deeplAccount);
    }
  }

  let _saveTimer = null;
  function saveSettings(data) {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'save_settings', data });
    }, 300);
  }

  async function loadCacheStats() {
    const el = document.getElementById('cacheStats');
    try {
      const data = await chrome.storage.local.get('translationCache');
      const cache = data.translationCache;
      if (!cache?.entries) { el.textContent = '0 条'; return; }
      const count = Object.keys(cache.entries).length;
      const bytes = await chrome.storage.local.getBytesInUse('translationCache');
      const kb = (bytes / 1024).toFixed(1);
      el.textContent = `${count} 条 / ${kb} KB`;
    } catch {
      el.textContent = '未知';
    }
  }

  function renderRules(key, urls, listId) {
    const list = document.getElementById(listId);
    list.innerHTML = '';
    if (!urls.length) {
      list.innerHTML = '<div class="kin-hint">暂无规则</div>';
      return;
    }
    urls.forEach(url => {
      const item = document.createElement('div');
      item.className = 'kin-rule-item';
      item.innerHTML = `<span>${escapeHtml(url)}</span><button data-url="${escapeHtml(url)}" data-key="${key}">删除</button>`;
      item.querySelector('button').addEventListener('click', function() {
        removeRule(this.dataset.key, this.dataset.url, listId);
      });
      list.appendChild(item);
    });
  }

  async function addRule(key, inputId, listId) {
    const input = document.getElementById(inputId);
    const url = input.value.trim();
    if (!url) return;
    const data = await new Promise(resolve => chrome.storage.local.get(key, resolve));
    const list = data[key] || [];
    if (!list.includes(url)) {
      list.push(url);
      saveSettings({ [key]: list });
    }
    input.value = '';
    renderRules(key, list, listId);
  }

  async function removeRule(key, url, listId) {
    const data = await new Promise(resolve => chrome.storage.local.get(key, resolve));
    const list = (data[key] || []).filter(u => u !== url);
    saveSettings({ [key]: list });
    renderRules(key, list, listId);
  }

  // ========== Backup ==========
  const BACKUP_KEYS = [
    'translationProvider', 'targetLang', 'sourceLang',
    'translationMode', 'translationTheme', 'translationStyle', 'customPrompt',
    'hoverTranslate', 'hoverTrigger',
    'selectionTranslate',
    'sensitiveMask', 'readerEnabled', 'readerTheme',
    'exportImageFormat', 'exportQuality',
    'longArticleMultiImageExport',
    'alwaysTranslateUrls', 'neverTranslateUrls',
    'floatBallPosY',
    'deeplAccount',
  ];

  async function deriveBackupKey(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptBackup(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data))
    );
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  async function decryptBackup(base64Str, password) {
    const combined = Uint8Array.from(atob(base64Str), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);
    const key = await deriveBackupKey(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  async function exportBackup() {
    const password = await showPasswordModal('设置备份密码');
    if (!password) return;
    const data = await new Promise(resolve => chrome.storage.local.get(BACKUP_KEYS, resolve));
    data._backupVersion = '1.0.0';
    try {
      const encrypted = await encryptBackup(data, password);
      const blob = new Blob([encrypted], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kin-backup-${new Date().toISOString().slice(0, 10)}.kinbackup`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast('导出失败: ' + e.message, 'error');
    }
  }

  async function importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kinbackup';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const password = await showPasswordModal('输入备份密码');
      if (!password) return;
      try {
        const data = await decryptBackup(text.trim(), password);
        const toRestore = {};
        for (const key of BACKUP_KEYS) {
          if (data[key] !== undefined) toRestore[key] = data[key];
        }
        await new Promise(resolve => chrome.storage.local.set(toRestore, resolve));
        showToast('导入成功，正在刷新...', 'success');
        setTimeout(() => location.reload(), 1000);
      } catch {
        showToast('导入失败: 密码错误或文件损坏', 'error');
      }
    };
    input.click();
  }

  function showPasswordModal(title) {
    return new Promise((resolve) => {
      const modal = document.getElementById('backupModal');
      const titleEl = document.getElementById('modalTitle');
      const passwordEl = document.getElementById('modalPassword');
      const confirmBtn = document.getElementById('modalConfirm');
      const cancelBtn = document.getElementById('modalCancel');

      titleEl.textContent = title;
      passwordEl.value = '';
      modal.style.display = 'flex';
      passwordEl.focus();

      const cleanup = () => {
        modal.style.display = 'none';
        confirmBtn.replaceWith(confirmBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        document.removeEventListener('keydown', onKey);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') { cleanup(); resolve(null); }
        if (e.key === 'Enter') { const pwd = passwordEl.value; cleanup(); resolve(pwd || null); }
      };

      document.addEventListener('keydown', onKey);
      document.getElementById('modalConfirm').addEventListener('click', () => {
        const pwd = passwordEl.value; cleanup(); resolve(pwd || null);
      });
      document.getElementById('modalCancel').addEventListener('click', () => {
        cleanup(); resolve(null);
      });
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showToast(msg, type = 'info') {
    const existing = document.querySelector('.kin-options-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'kin-options-toast';
    toast.textContent = msg;
    const colors = { success: '#34C759', error: '#FF3B30', info: '#007AFF', warning: '#FF9500' };
    Object.assign(toast.style, {
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: '500',
      color: '#fff', background: colors[type] || colors.info,
      zIndex: '10000', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      transition: 'opacity 0.3s',
    });
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
  }
});
