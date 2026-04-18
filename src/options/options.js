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

  await applySettings(settings);

  // ========== Translation Tab ==========
  const optEngine = document.getElementById('optEngine');
  const providerConfig = document.getElementById('providerConfig');
  const engineHint = document.getElementById('engineHint');
  const activeSummaryLine = document.getElementById('activeSummaryLine');
  const saveStatus = document.getElementById('saveStatus');
  const saveStatusText = document.getElementById('saveStatusText');

  let _saveStatusTimer = null;
  function showSaveStatus(message) {
    if (!saveStatus) return;
    if (saveStatusText) saveStatusText.textContent = message;
    saveStatus.classList.add('visible');
    if (_saveStatusTimer) clearTimeout(_saveStatusTimer);
    _saveStatusTimer = setTimeout(() => saveStatus.classList.remove('visible'), 2500);
  }

  function getProviderInfo(provider) {
    return (typeof PROVIDERS !== 'undefined' ? PROVIDERS[provider] : null)
      || (typeof ProviderRegistry !== 'undefined' ? ProviderRegistry.get(provider) : null)
      || { name: provider, type: 'free' };
  }

  function getDeepLPlanFromEndpoint(endpoint) {
    const value = (endpoint || '').trim().toLowerCase();
    if (value.includes('api.deepl.com') && !value.includes('api-free.deepl.com')) return 'pro';
    return 'free';
  }

  function getDeepLEndpointFromPlan(plan) {
    return plan === 'pro'
      ? 'https://api.deepl.com/v2/translate'
      : 'https://api-free.deepl.com/v2/translate';
  }

  function getStoredKeys(provider) {
    return [`${provider}_apiKey`, `${provider}_model`, `${provider}_endpoint`, `${provider}_plan`];
  }

  function escapeAttr(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderProviderConfig(provider, savedConfig) {
    const _container = document.getElementById('providerConfig');
    const info = getProviderInfo(provider);
    if (!info || !_container) return;

    if (info.type === 'free') {
      _container.innerHTML = `
        <div class="kin-config-card">
          <div class="no-config">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <div style="font-weight:500; color:var(--kin-text-secondary); margin-bottom:4px;">${info.name}</div>
            <div style="font-size:12px; color:var(--kin-text-tertiary);">免费引擎无需配置即可使用</div>
          </div>
        </div>`;
      return;
    }

    const savedApiKey = savedConfig?.apiKey || '';
    const savedModel = savedConfig?.model || info.model || '';
    const savedEndpoint = savedConfig?.endpoint || info.endpoint || '';
    const savedPlan = savedConfig?.plan || getDeepLPlanFromEndpoint(savedEndpoint);

    let fieldsHtml = `
      <div class="kin-form-group">
        <label>API Key${info.type === 'deepl' ? 's' : ''} <span class="kin-required">*</span></label>
        ${info.type === 'deepl'
          ? `<textarea class="kin-textarea" id="cfg_apiKey" rows="3" placeholder="每行一个 API Key">${escapeAttr(savedApiKey)}</textarea>
             <p class="kin-hint">每行一个 Key，当某个 Key 额度用尽时自动切换到下一个</p>`
          : `<input type="password" class="kin-input" id="cfg_apiKey" value="${escapeAttr(savedApiKey)}" placeholder="输入 API Key">`
        }
      </div>`;

    if (info.type !== 'deepl') {
      if (info.models && info.models.length > 0) {
        const selectedModel = info.models.includes(savedModel) ? savedModel : (info.model || info.models[0] || '');
        const customModel = info.models.includes(savedModel) ? '' : savedModel;
        fieldsHtml += `
          <div class="kin-form-group">
            <label>预设模型</label>
            <select class="kin-select" id="cfg_model">
              ${info.models.map(model => `<option value="${escapeAttr(model)}" ${model === selectedModel ? 'selected' : ''}>${escapeAttr(model)}</option>`).join('')}
            </select>
            <p class="kin-hint">选择一个预设模型，或在下方的自定义模型中覆盖</p>
          </div>
          <div class="kin-form-group">
            <label>自定义模型名称</label>
            <input type="text" class="kin-input" id="cfg_model_custom" value="${escapeAttr(customModel)}" placeholder="可选：输入自定义模型名称">
            <p class="kin-hint">留空则使用预设模型。如果填写，该值将优先使用</p>
          </div>`;
      } else {
        fieldsHtml += `
          <div class="kin-form-group">
            <label>模型名称</label>
            <input type="text" class="kin-input" id="cfg_model" value="${escapeAttr(savedModel)}" placeholder="输入模型名称">
          </div>`;
      }
    }

    if (info.type === 'deepl') {
      fieldsHtml += `
        <div class="kin-form-group">
          <label>API Plan</label>
          <select class="kin-select" id="cfg_deeplPlan">
            <option value="free" ${savedPlan === 'free' ? 'selected' : ''}>Free API (api-free.deepl.com)</option>
            <option value="pro" ${savedPlan === 'pro' ? 'selected' : ''}>Pro API (api.deepl.com)</option>
          </select>
          <p class="kin-hint">Free 使用 api-free.deepl.com，Pro 使用 api.deepl.com</p>
        </div>
        <details class="kin-advanced-block">
          <summary>高级设置</summary>
          <div class="kin-advanced-content">
            <div class="kin-form-group">
              <label>API Endpoint</label>
              <input type="text" class="kin-input" id="cfg_endpoint" value="${escapeAttr(getDeepLEndpointFromPlan(savedPlan))}" readonly>
              <p class="kin-hint">端点根据选择的 DeepL Plan 自动确定</p>
            </div>
          </div>
        </details>`;
    } else {
      const endpointHint = info.endpoint
        ? '保持默认值即可，除非需要使用自定义端点'
        : '自定义服务商必填';
      fieldsHtml += `
        <details class="kin-advanced-block">
          <summary>高级设置</summary>
          <div class="kin-advanced-content">
            <div class="kin-form-group">
              <label>API Endpoint</label>
              <input type="text" class="kin-input" id="cfg_endpoint" value="${escapeAttr(savedEndpoint)}" placeholder="${escapeAttr(info.endpoint || '输入 API 端点')}">
              <p class="kin-hint">${endpointHint}</p>
            </div>
          </div>
        </details>`;
    }

    const typeLabel = info.type === 'openai'
      ? 'OpenAI-Compatible API'
      : info.type === 'claude'
        ? 'Claude API'
        : info.type === 'deepl'
          ? 'DeepL API'
          : '';

    _container.innerHTML = `
      <div class="kin-config-card">
        <div class="config-header">
          <div>
            <div class="config-title">${info.name}</div>
            <div class="config-subtitle">${typeLabel}</div>
          </div>
        </div>
        ${fieldsHtml}
      </div>`;

    if (info.type === 'deepl') {
      const planEl = document.getElementById('cfg_deeplPlan');
      const endpointEl = document.getElementById('cfg_endpoint');
      if (planEl && endpointEl) {
        planEl.addEventListener('change', () => {
          endpointEl.value = getDeepLEndpointFromPlan(planEl.value);
          renderSummaryStatus();
        });
      }
    }
  }

  function getDraftConfig() {
    const provider = document.getElementById('optEngine').value;
    const info = getProviderInfo(provider);
    const targetLang = document.getElementById('optTargetLang').value;

    const apiKeyEl = document.getElementById('cfg_apiKey');
    const modelEl = document.getElementById('cfg_model');
    const customModelEl = document.getElementById('cfg_model_custom');
    const endpointEl = document.getElementById('cfg_endpoint');
    const deeplPlanEl = document.getElementById('cfg_deeplPlan');

    const apiKey = apiKeyEl
      ? (info.type === 'deepl'
        ? apiKeyEl.value.trim().split('\n').map(k => k.trim()).filter(Boolean).join('\n')
        : apiKeyEl.value.trim())
      : '';
    const customModel = customModelEl ? customModelEl.value.trim() : '';
    const model = customModel || (modelEl ? modelEl.value.trim() : '') || info.model || '';
    const deeplPlan = deeplPlanEl ? deeplPlanEl.value : getDeepLPlanFromEndpoint(endpointEl ? endpointEl.value : info.endpoint);
    const endpoint = info.type === 'deepl'
      ? getDeepLEndpointFromPlan(deeplPlan)
      : ((endpointEl ? endpointEl.value.trim() : '') || info.endpoint || '');

    return { provider, providerName: info.name, providerType: info.type, targetLang, apiKey, model, endpoint, deeplPlan };
  }

  function renderSummaryStatus() {
    const draft = getDraftConfig();
    const info = getProviderInfo(draft.provider);

    let modelLabel = '无需 API Key';
    if (info.type === 'deepl') {
      modelLabel = draft.deeplPlan === 'pro' ? 'Pro API' : 'Free API';
    } else if (info.type !== 'free') {
      modelLabel = draft.model || '未设置';
    }

    const langName = (typeof TARGET_LANGUAGES !== 'undefined'
      ? TARGET_LANGUAGES.find(l => l.code === draft.targetLang)
      : null)?.name || draft.targetLang;

    const summaryEl = document.getElementById('activeSummaryLine');
    if (summaryEl) summaryEl.textContent = `当前: ${draft.providerName} / ${modelLabel} / ${langName}`;
  }

  function setTestResult(type, message) {
    const testResult = document.getElementById('testResult');
    testResult.className = 'kin-test-result visible';
    if (type) testResult.classList.add(type);
    testResult.textContent = message;
  }

  function clearTestResult() {
    const testResult = document.getElementById('testResult');
    testResult.className = 'kin-test-result';
    testResult.textContent = '';
  }

  async function loadAndRenderConfig(provider) {
    const keys = getStoredKeys(provider);
    if (provider === 'deepl') keys.push('deepl_apiKeys');

    const data = await new Promise(resolve => chrome.storage.local.get(keys, resolve));

    let displayApiKey = '';
    const encKey = data[`${provider}_apiKey`];
    if (encKey) {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'get_api_key', data: { provider } });
        displayApiKey = resp?.key || '';
      } catch (e) {
        console.error('[Kin] Failed to decrypt API key:', e);
      }
    }

    if (provider === 'deepl' && data.deepl_apiKeys && Array.isArray(data.deepl_apiKeys) && data.deepl_apiKeys.length > 0) {
      const existing = displayApiKey ? displayApiKey.split('\n').map(k => k.trim()).filter(Boolean) : [];
      const merged = new Set([...existing, ...data.deepl_apiKeys]);
      displayApiKey = Array.from(merged).join('\n');
    }

    renderProviderConfig(provider, {
      apiKey: displayApiKey,
      model: data[`${provider}_model`] || '',
      endpoint: data[`${provider}_endpoint`] || '',
      plan: data[`${provider}_plan`] || ''
    });

    renderSummaryStatus();
  }

  optEngine.addEventListener('change', async () => {
    const provider = optEngine.value;
    const isFree = provider === 'google' || provider === 'microsoft';
    engineHint.textContent = isFree ? '免费引擎无需配置即可使用' : '需要配置 API Key 才能使用';

    const saveToolbar = document.getElementById('saveToolbar');
    if (saveToolbar) saveToolbar.style.display = isFree ? 'none' : 'flex';

    clearTestResult();
    await loadAndRenderConfig(provider);

    saveSettings({ translationProvider: provider });
  });

  // Provider config input listeners
  providerConfig.addEventListener('input', () => {
    clearTestResult();
    renderSummaryStatus();
  });
  providerConfig.addEventListener('change', () => {
    clearTestResult();
    renderSummaryStatus();
  });

  // Save provider config
  document.getElementById('btnSaveProvider').addEventListener('click', async () => {
    const draft = getDraftConfig();
    const info = getProviderInfo(draft.provider);
    const toSet = { translationProvider: draft.provider, targetLang: draft.targetLang };

    if (info.type !== 'free') {
      if (info.type === 'deepl') {
        const keys = draft.apiKey.split('\n').map(k => k.trim()).filter(Boolean);
        if (keys.length > 0) {
          await chrome.runtime.sendMessage({
            type: 'save_api_key',
            data: { provider: draft.provider, key: keys.join('\n') }
          });
        }
        toSet[`${draft.provider}_apiKeys`] = keys.length > 1 ? keys : [];
        toSet[`${draft.provider}_plan`] = draft.deeplPlan;
        toSet[`${draft.provider}_endpoint`] = draft.endpoint;
      } else {
        if (draft.apiKey) {
          await chrome.runtime.sendMessage({
            type: 'save_api_key',
            data: { provider: draft.provider, key: draft.apiKey }
          });
        }
        toSet[`${draft.provider}_model`] = draft.model;
        toSet[`${draft.provider}_endpoint`] = draft.endpoint;
      }
    }

    await new Promise(resolve => chrome.storage.local.set(toSet, resolve));
    showSaveStatus('已保存');
    renderSummaryStatus();
  });

  // Source / target languages
  document.getElementById('optSourceLang').addEventListener('change', function() {
    saveSettings({ sourceLang: this.value });
  });

  document.getElementById('optTargetLang').addEventListener('change', function() {
    saveSettings({ targetLang: this.value });
    renderSummaryStatus();
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

  // Feature toggles
  document.getElementById('optHoverTranslate').addEventListener('change', function() {
    document.getElementById('hoverOptions').style.display = this.checked ? '' : 'none';
    saveSettings({ hoverTranslate: this.checked });
  });

  document.getElementById('optSelectionTranslate').addEventListener('change', function() {
    saveSettings({ selectionTranslate: this.checked });
  });

  document.querySelectorAll('input[name="hoverTrigger"]').forEach(radio => {
    radio.addEventListener('change', function() {
      saveSettings({ hoverTrigger: this.value });
    });
  });

  document.getElementById('optSensitiveMask').addEventListener('change', function() {
    saveSettings({ sensitiveMask: this.checked });
  });

  document.getElementById('optDisableReasoning').addEventListener('change', function() {
    saveSettings({ disableReasoning: this.checked });
  });

  // Translation mode radio cards
  document.querySelectorAll('input[name="translationMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      saveSettings({ translationMode: radio.value });
    });
  });

  // Test translation
  document.getElementById('btnTestTranslate').addEventListener('click', async () => {
    const draft = getDraftConfig();
    const sampleText = document.getElementById('testInput').value.trim();

    if (!sampleText) {
      setTestResult('error', '请先输入一些示例文本。');
      return;
    }

    const btn = document.getElementById('btnTestTranslate');
    btn.disabled = true;
    setTestResult('pending', '正在使用当前表单设置测试翻译...');

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'translate',
        data: {
          texts: [sampleText],
          to: draft.targetLang,
          providerOverride: draft.provider,
          configOverride: {
            apiKey: draft.apiKey,
            model: draft.model,
            endpoint: draft.endpoint,
            isPlaintext: true
          }
        }
      });

      btn.disabled = false;

      if (chrome.runtime.lastError) {
        setTestResult('error', `测试失败: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (!resp) {
        setTestResult('error', '翻译服务未响应。请检查网络连接或 API 配置。');
        return;
      }

      if (resp?.error) {
        setTestResult('error', resp.error);
        return;
      }

      const translated = resp?.translations?.[0] || '';
      if (!translated) {
        setTestResult('error', '翻译结果为空。请尝试其他模型或检查端点配置。');
        return;
      }

      setTestResult('success', translated);
    } catch (e) {
      btn.disabled = false;
      setTestResult('error', `测试失败: ${e.message}`);
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
    const previewText = '这是一个翻译效果的预览示例文本，用于展示不同主题的样式差异。';
    Object.entries(THEME_NAMES).forEach(([id, name]) => {
      const item = document.createElement('div');
      item.className = 'kin-theme-item';
      item.dataset.theme = id;

      item.innerHTML = `
        <div class="kin-theme-name">${name}</div>
        <span class="kin-theme-preview-line kin-theme-${id}">${previewText}</span>
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


  async function applySettings(s) {
    if (s.translationProvider) {
      document.getElementById('optEngine').value = s.translationProvider;
      const isFree = s.translationProvider === 'google' || s.translationProvider === 'microsoft';
      const hintEl = document.getElementById('engineHint');
      if (hintEl) hintEl.textContent = isFree ? '免费引擎无需配置即可使用' : '需要配置 API Key 才能使用';
      const saveToolbar = document.getElementById('saveToolbar');
      if (saveToolbar) saveToolbar.style.display = isFree ? 'none' : 'flex';
      await loadAndRenderConfig(s.translationProvider);
    }
    if (s.sourceLang) document.getElementById('optSourceLang').value = s.sourceLang;
    if (s.targetLang) {
      document.getElementById('optTargetLang').value = s.targetLang;
      renderSummaryStatus();
    }
    if (s.translationStyle) {
      document.getElementById('optTranslationStyle').value = s.translationStyle;
      if (s.translationStyle === 'custom') {
        const customPromptGroupEl = document.getElementById('customPromptGroup');
        if (customPromptGroupEl) customPromptGroupEl.style.display = '';
      }
    }
    if (s.customPrompt) document.getElementById('optCustomPrompt').value = s.customPrompt;
    if (s.hoverTranslate !== undefined) {
      document.getElementById('optHoverTranslate').checked = s.hoverTranslate;
      document.getElementById('hoverOptions').style.display = s.hoverTranslate ? '' : 'none';
    }
    if (s.selectionTranslate !== undefined) document.getElementById('optSelectionTranslate').checked = s.selectionTranslate;
    if (s.hoverTrigger) document.querySelector(`input[name="hoverTrigger"][value="${s.hoverTrigger}"]`).checked = true;
    if (s.sensitiveMask !== undefined) document.getElementById('optSensitiveMask').checked = s.sensitiveMask;
    if (s.disableReasoning !== undefined) document.getElementById('optDisableReasoning').checked = s.disableReasoning;
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
    'openai_apiKey', 'openai_model', 'openai_endpoint',
    'deepseek_apiKey', 'deepseek_model', 'deepseek_endpoint',
    'qwen_apiKey', 'qwen_model', 'qwen_endpoint',
    'gemini_apiKey', 'gemini_model', 'gemini_endpoint',
    'glm_apiKey', 'glm_model', 'glm_endpoint',
    'kimi_apiKey', 'kimi_model', 'kimi_endpoint',
    'openrouter_apiKey', 'openrouter_model', 'openrouter_endpoint',
    'claude_apiKey', 'claude_model', 'claude_endpoint',
    'deepl_apiKey', 'deepl_apiKeys', 'deepl_plan', 'deepl_endpoint',
    'custom_openai_apiKey', 'custom_openai_model', 'custom_openai_endpoint',
    'custom_claude_apiKey', 'custom_claude_model', 'custom_claude_endpoint',
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
