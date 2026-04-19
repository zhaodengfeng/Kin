// Kin Options Page Script — Hash routing + Immersive redesign
document.addEventListener('DOMContentLoaded', async () => {
  // ========== Hash-based Tab Navigation ==========
  const navBtns = document.querySelectorAll('.settings-tab');
  const tabs = document.querySelectorAll('.settings-panel');

  function activateTab(tabName) {
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    tabs.forEach(t => {
      const isActive = t.dataset.panel === tabName;
      t.classList.toggle('active', isActive);
      if (isActive) t.removeAttribute('hidden');
      else t.setAttribute('hidden', '');
    });
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
  populateSummaryEngines();
  populateThemes();

  await applySettings(settings);

  // Reveal UI after settings loaded
  document.body.classList.remove('settings-booting');

  // ========== Translation Tab ==========
  const optEngine = document.getElementById('optEngine');
  const providerConfig = document.getElementById('providerConfig');
  const optSummaryEngine = document.getElementById('optSummaryEngine');
  const summaryProviderConfig = document.getElementById('summaryProviderConfig');
  const engineHint = document.getElementById('engineHint'); // may be null in new UI
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

  function supportsSummary(provider) {
    const info = (typeof PROVIDERS !== 'undefined' ? PROVIDERS[provider] : null)
      || (typeof ProviderRegistry !== 'undefined' ? ProviderRegistry.get(provider) : null);
    return !!info && info.supportsSummary !== false;
  }

  function getProviderStoragePrefix(provider, scope = 'translate') {
    return scope === 'summary' ? `summary_${provider}` : provider;
  }

  function getStoredKeys(provider, scope = 'translate') {
    const prefix = getProviderStoragePrefix(provider, scope);
    return [`${prefix}_apiKey`, `${prefix}_model`, `${prefix}_endpoint`, `${prefix}_plan`];
  }

  function escapeAttr(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderProviderConfig(provider, savedConfig, { scope = 'translate', containerId = 'providerConfig' } = {}) {
    const _container = document.getElementById(containerId);
    const info = getProviderInfo(provider);
    if (!info || !_container) return;
    const idPrefix = scope === 'summary' ? 'summary_cfg_' : 'cfg_';
    const modelList = scope === 'summary' ? (info.summaryModels || info.models || []) : (info.models || []);
    const defaultModel = scope === 'summary' ? (info.summaryModel || info.model || '') : (info.model || '');

    if (info.type === 'free') {
      _container.innerHTML = `
        <div class="no-config">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <div style="font-weight:500; color:var(--kin-text-secondary); margin-bottom:4px;">${info.name}</div>
          <div style="font-size:12px; color:var(--kin-text-tertiary);">免费引擎无需配置即可使用</div>
        </div>`;
      return;
    }

    const savedApiKey = savedConfig?.apiKey || '';
    const savedModel = savedConfig?.model || defaultModel || '';
    const savedEndpoint = savedConfig?.endpoint || info.endpoint || '';
    const savedPlan = savedConfig?.plan || getDeepLPlanFromEndpoint(savedEndpoint);

    const eyeOpenSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeOffSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    let fieldsHtml = `
      <div class="field">
        <label>API Key${info.type === 'deepl' ? 's' : ''} <span class="required">*</span></label>
        <div class="input-wrap">
          ${info.type === 'deepl'
            ? `<textarea class="input input-multiline input-masked" id="${idPrefix}apiKey" rows="3" placeholder="每行一个 API Key">${escapeAttr(savedApiKey)}</textarea>`
            : `<input type="password" class="input input-masked" id="${idPrefix}apiKey" value="${escapeAttr(savedApiKey)}" placeholder="输入 API Key">`
          }
          <button type="button" class="toggle-visible" id="${idPrefix}toggleKeyVisibility" title="显示/隐藏">
            ${eyeOpenSvg}
          </button>
        </div>
        ${info.type === 'deepl'
          ? `<p class="field-hint">每行一个 Key，当某个 Key 额度用尽时自动切换到下一个</p>`
          : ``
        }
      </div>`;

    if (info.type !== 'deepl') {
      if (modelList.length > 0) {
        const selectedModel = modelList.includes(savedModel) ? savedModel : (defaultModel || modelList[0] || '');
        const customModel = modelList.includes(savedModel) ? '' : savedModel;
        fieldsHtml += `
          <div class="field">
            <label>预设模型</label>
            <select class="input" id="${idPrefix}model">
              ${modelList.map(model => `<option value="${escapeAttr(model)}" ${model === selectedModel ? 'selected' : ''}>${escapeAttr(model)}</option>`).join('')}
            </select>
            <p class="field-hint">选择一个预设模型，或在下方的自定义模型中覆盖</p>
          </div>
          <div class="field">
            <label>自定义模型名称</label>
            <input type="text" class="input" id="${idPrefix}model_custom" value="${escapeAttr(customModel)}" placeholder="可选：输入自定义模型名称">
            <p class="field-hint">留空则使用预设模型。如果填写，该值将优先使用</p>
          </div>`;
      } else {
        fieldsHtml += `
          <div class="field">
            <label>模型名称</label>
            <input type="text" class="input" id="${idPrefix}model" value="${escapeAttr(savedModel)}" placeholder="输入模型名称">
          </div>`;
      }
    }

    if (info.type === 'deepl') {
      fieldsHtml += `
        <div class="field">
          <label>API Plan</label>
          <select class="input" id="${idPrefix}deeplPlan">
            <option value="free" ${savedPlan === 'free' ? 'selected' : ''}>Free API (api-free.deepl.com)</option>
            <option value="pro" ${savedPlan === 'pro' ? 'selected' : ''}>Pro API (api.deepl.com)</option>
          </select>
          <p class="field-hint">Free 使用 api-free.deepl.com，Pro 使用 api.deepl.com</p>
        </div>`;
    } else if (!info.endpoint) {
      fieldsHtml += `
        <div class="field">
          <label>API Endpoint</label>
          <input type="text" class="input" id="${idPrefix}endpoint" value="${escapeAttr(savedEndpoint)}" placeholder="${escapeAttr(info.endpoint || '输入 API 端点')}">
          <p class="field-hint">自定义服务商必填</p>
        </div>`;
    }

    _container.innerHTML = fieldsHtml;

    if (info.type === 'deepl') {
      const planEl = document.getElementById(`${idPrefix}deeplPlan`);
      const endpointEl = document.getElementById(`${idPrefix}endpoint`);
      if (planEl && endpointEl) {
        let _prevPlan = planEl.value;
        planEl.addEventListener('change', () => {
          // P2-9: Confirm plan switch — endpoint and key format differ between Free/Pro
          const nextPlan = planEl.value;
          const msg = nextPlan === 'pro'
            ? '切换到 DeepL Pro 将使用 api.deepl.com 端点，且需要 Pro 版 API Key。确认继续？'
            : '切换到 DeepL Free 将使用 api-free.deepl.com 端点，且需要 Free 版 API Key。确认继续？';
          if (!confirm(msg)) {
            planEl.value = _prevPlan;
            return;
          }
          _prevPlan = nextPlan;
          endpointEl.value = getDeepLEndpointFromPlan(nextPlan);
        });
      }
    }

    // Toggle API Key visibility
    const toggleBtn = document.getElementById(`${idPrefix}toggleKeyVisibility`);
    const keyInput = document.getElementById(`${idPrefix}apiKey`);
    if (toggleBtn && keyInput) {
      toggleBtn.addEventListener('click', () => {
        const isMasked = keyInput.classList.contains('input-masked');
        if (isMasked) {
          keyInput.classList.remove('input-masked');
          if (keyInput.tagName === 'INPUT') keyInput.type = 'text';
          toggleBtn.innerHTML = eyeOffSvg;
          toggleBtn.title = '隐藏';
        } else {
          keyInput.classList.add('input-masked');
          if (keyInput.tagName === 'INPUT') keyInput.type = 'password';
          toggleBtn.innerHTML = eyeOpenSvg;
          toggleBtn.title = '显示';
        }
      });
    }
  }

  function getDraftConfig(scope = 'translate') {
    const isSummary = scope === 'summary';
    const provider = document.getElementById(isSummary ? 'optSummaryEngine' : 'optEngine').value;
    const info = getProviderInfo(provider);
    const targetLang = document.getElementById('optTargetLang').value;
    const idPrefix = isSummary ? 'summary_cfg_' : 'cfg_';
    const defaultModel = isSummary ? (info.summaryModel || info.model || '') : (info.model || '');

    const apiKeyEl = document.getElementById(`${idPrefix}apiKey`);
    const modelEl = document.getElementById(`${idPrefix}model`);
    const customModelEl = document.getElementById(`${idPrefix}model_custom`);
    const endpointEl = document.getElementById(`${idPrefix}endpoint`);
    const deeplPlanEl = document.getElementById(`${idPrefix}deeplPlan`);

    const apiKey = apiKeyEl
      ? (info.type === 'deepl'
        ? apiKeyEl.value.trim().split('\n').map(k => k.trim()).filter(Boolean).join('\n')
        : apiKeyEl.value.trim())
      : '';
    const customModel = customModelEl ? customModelEl.value.trim() : '';
    const model = customModel || (modelEl ? modelEl.value.trim() : '') || defaultModel || '';
    const deeplPlan = deeplPlanEl ? deeplPlanEl.value : getDeepLPlanFromEndpoint(endpointEl ? endpointEl.value : info.endpoint);
    const endpoint = info.type === 'deepl'
      ? getDeepLEndpointFromPlan(deeplPlan)
      : ((endpointEl ? endpointEl.value.trim() : '') || info.endpoint || '');

    return { provider, providerName: info.name, providerType: info.type, targetLang, apiKey, model, endpoint, deeplPlan, scope };
  }

  function setTestResult(type, message, elementId = 'testResult') {
    const testResult = document.getElementById(elementId);
    if (!testResult) return;
    testResult.className = 'test-result visible';
    if (type) testResult.classList.add(type);
    testResult.textContent = message;
  }

  function clearTestResult(elementId = 'testResult') {
    const testResult = document.getElementById(elementId);
    if (!testResult) return;
    testResult.className = 'test-result';
    testResult.textContent = '';
  }

  async function loadAndRenderConfig(provider, scope = 'translate') {
    const keys = getStoredKeys(provider, scope);
    const prefix = getProviderStoragePrefix(provider, scope);
    if (scope === 'translate' && provider === 'deepl') keys.push('deepl_apiKeys');

    const data = await new Promise(resolve => chrome.storage.local.get(keys, resolve));

    let displayApiKey = '';
    const encKey = data[`${prefix}_apiKey`];
    if (encKey) {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'get_api_key', data: { provider, scope } });
        displayApiKey = resp?.key || '';
      } catch (e) {
        console.error('[Kin] Failed to decrypt API key:', e);
      }
    }

    if (scope === 'translate' && provider === 'deepl' && data.deepl_apiKeys && Array.isArray(data.deepl_apiKeys) && data.deepl_apiKeys.length > 0) {
      const existing = displayApiKey ? displayApiKey.split('\n').map(k => k.trim()).filter(Boolean) : [];
      const merged = new Set([...existing, ...data.deepl_apiKeys]);
      displayApiKey = Array.from(merged).join('\n');
    }

    renderProviderConfig(provider, {
      apiKey: displayApiKey,
      model: data[`${prefix}_model`] || '',
      endpoint: data[`${prefix}_endpoint`] || '',
      plan: data[`${prefix}_plan`] || ''
    }, {
      scope,
      containerId: scope === 'summary' ? 'summaryProviderConfig' : 'providerConfig'
    });

    ;
  }

  async function updateSummaryMigrationBanner() {
    const banner = document.getElementById('summaryMigrationBanner');
    if (!banner) return;

    const data = await chrome.storage.local.get(['summaryProvider', 'summaryMigrationShown', 'translationProvider']);
    const provider = data.translationProvider;
    if (data.summaryProvider || data.summaryMigrationShown || !provider || !supportsSummary(provider)) {
      banner.style.display = 'none';
      return;
    }

    const providerPrefix = getProviderStoragePrefix(provider, 'translate');
    const keyData = await chrome.storage.local.get(`${providerPrefix}_apiKey`);
    banner.style.display = keyData[`${providerPrefix}_apiKey`] ? 'flex' : 'none';
  }

  async function migrateTranslationConfigToSummary() {
    const data = await chrome.storage.local.get(['translationProvider']);
    const provider = data.translationProvider;
    if (!provider || !supportsSummary(provider)) {
      showToast('当前翻译引擎不能用于摘要', 'error');
      return;
    }

    const translatePrefix = getProviderStoragePrefix(provider, 'translate');
    const summaryPrefix = getProviderStoragePrefix(provider, 'summary');
    const info = getProviderInfo(provider);
    const stored = await chrome.storage.local.get([
      `${translatePrefix}_model`,
      `${translatePrefix}_endpoint`
    ]);
    const keyResp = await chrome.runtime.sendMessage({
      type: 'get_api_key',
      data: { provider, scope: 'translate' }
    });
    if (!keyResp?.key) {
      showToast('未读取到可复用的 API Key', 'error');
      return;
    }
    await chrome.runtime.sendMessage({
      type: 'save_api_key',
      data: { provider, key: keyResp.key, scope: 'summary' }
    });

    await new Promise(resolve => chrome.storage.local.set({
      summaryProvider: provider,
      summaryMigrationShown: true,
      [`${summaryPrefix}_model`]: info.summaryModel || stored[`${translatePrefix}_model`] || info.model || '',
      [`${summaryPrefix}_endpoint`]: stored[`${translatePrefix}_endpoint`] || info.endpoint || ''
    }, resolve));

    optSummaryEngine.value = provider;
    await loadAndRenderConfig(provider, 'summary');
    await updateSummaryMigrationBanner();
    showSaveStatus('已复用到摘要设置');
  }

  optEngine.addEventListener('change', async () => {
    const provider = optEngine.value;
    const isFree = provider === 'google' || provider === 'microsoft';
    if (engineHint) engineHint.textContent = isFree ? '免费引擎无需配置即可使用' : '需要配置 API Key 才能使用';

    const btnSave = document.getElementById('btnSaveProvider');
    if (btnSave) btnSave.style.display = isFree ? 'none' : '';

    clearTestResult();
    await loadAndRenderConfig(provider);

    saveSettings({ translationProvider: provider });
  });

  // Provider config input listeners
  providerConfig.addEventListener('input', () => {
    clearTestResult();
    ;
  });
  providerConfig.addEventListener('change', () => {
    clearTestResult();
    ;
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
            data: { provider: draft.provider, key: keys.join('\n'), scope: 'translate' }
          });
        }
        toSet[`${draft.provider}_apiKeys`] = keys.length > 1 ? keys : [];
        toSet[`${draft.provider}_plan`] = draft.deeplPlan;
        toSet[`${draft.provider}_endpoint`] = draft.endpoint;
      } else {
        if (draft.apiKey) {
          await chrome.runtime.sendMessage({
            type: 'save_api_key',
            data: { provider: draft.provider, key: draft.apiKey, scope: 'translate' }
          });
        }
        toSet[`${draft.provider}_model`] = draft.model;
        toSet[`${draft.provider}_endpoint`] = draft.endpoint;
      }
    }

    await new Promise(resolve => chrome.storage.local.set(toSet, resolve));
    showSaveStatus('已保存');
    ;
  });

  optSummaryEngine.addEventListener('change', async () => {
    const provider = optSummaryEngine.value;
    clearTestResult('summaryTestResult');
    await loadAndRenderConfig(provider, 'summary');
    const banner = document.getElementById('summaryMigrationBanner');
    if (banner) banner.style.display = 'none';
    saveSettings({ summaryProvider: provider });
  });

  summaryProviderConfig.addEventListener('input', () => {
    clearTestResult('summaryTestResult');
  });
  summaryProviderConfig.addEventListener('change', () => {
    clearTestResult('summaryTestResult');
  });

  async function saveSummaryDraft() {
    const draft = getDraftConfig('summary');
    const info = getProviderInfo(draft.provider);
    if (!supportsSummary(draft.provider)) {
      showToast('该引擎不支持摘要生成', 'error');
      return false;
    }

    const toSet = { summaryProvider: draft.provider };
    if (info.type !== 'free') {
      if (draft.apiKey) {
        await chrome.runtime.sendMessage({
          type: 'save_api_key',
          data: { provider: draft.provider, key: draft.apiKey, scope: 'summary' }
        });
      }
      const prefix = getProviderStoragePrefix(draft.provider, 'summary');
      toSet[`${prefix}_model`] = draft.model;
      toSet[`${prefix}_endpoint`] = draft.endpoint;
    }

    await new Promise(resolve => chrome.storage.local.set(toSet, resolve));
    showSaveStatus('摘要设置已保存');
    return true;
  }

  document.getElementById('btnSaveSummary').addEventListener('click', async () => {
    await saveSummaryDraft();
  });

  document.getElementById('btnTestSummary').addEventListener('click', async () => {
    const draft = getDraftConfig('summary');
    const sampleText = document.getElementById('summaryTestInput').value.trim();

    if (!sampleText) {
      setTestResult('error', '请先输入一段文章片段。', 'summaryTestResult');
      return;
    }
    if (!supportsSummary(draft.provider)) {
      setTestResult('error', '该引擎不支持摘要生成。', 'summaryTestResult');
      return;
    }

    const btn = document.getElementById('btnTestSummary');
    btn.disabled = true;
    setTestResult('pending', '正在使用当前表单设置测试摘要...', 'summaryTestResult');

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'summary_generate',
        data: {
          text: sampleText,
          lang: draft.targetLang,
          providerOverride: draft.provider,
          contextHints: { title: 'Kin summary configuration test' },
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
        setTestResult('error', `测试失败: ${chrome.runtime.lastError.message}`, 'summaryTestResult');
        return;
      }
      if (!resp) {
        setTestResult('error', '摘要服务未响应。请检查网络连接或 API 配置。', 'summaryTestResult');
        return;
      }
      if (resp?.error) {
        setTestResult('error', resp.error, 'summaryTestResult');
        return;
      }
      if (!resp?.raw) {
        setTestResult('error', '摘要结果为空。请尝试其他模型或检查端点配置。', 'summaryTestResult');
        return;
      }

      setTestResult('success', resp.raw, 'summaryTestResult');
    } catch (e) {
      btn.disabled = false;
      setTestResult('error', `测试失败: ${e.message}`, 'summaryTestResult');
    }
  });

  document.getElementById('btnMigrateSummary').addEventListener('click', migrateTranslationConfigToSummary);
  document.getElementById('btnDismissMigrate').addEventListener('click', async () => {
    await new Promise(resolve => chrome.storage.local.set({ summaryMigrationShown: true }, resolve));
    updateSummaryMigrationBanner();
  });

  // Source / target languages
  document.getElementById('optSourceLang').addEventListener('change', function() {
    saveSettings({ sourceLang: this.value });
  });

  document.getElementById('optTargetLang').addEventListener('change', function() {
    saveSettings({ targetLang: this.value });
    ;
  });

  // Translation style
  const optStyle = document.getElementById('optTranslationStyle');
  const customPromptSection = document.getElementById('customPromptSection');

  optStyle.addEventListener('change', () => {
    if (customPromptSection) customPromptSection.style.display = optStyle.value === 'custom' ? '' : 'none';
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

  function populateSummaryEngines() {
    const select = document.getElementById('optSummaryEngine');
    if (!select) return;
    select.innerHTML = '';
    const providers = typeof ProviderRegistry !== 'undefined'
      ? ProviderRegistry.summaryProviders()
      : [];
    providers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
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
      item.className = 'theme-item';
      item.dataset.theme = id;

      item.innerHTML = `
        <div class="theme-name">${name}</div>
        <span class="theme-preview-line theme-${id}">${previewText}</span>
      `;

      item.addEventListener('click', () => {
        grid.querySelectorAll('.theme-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        saveSettings({ translationTheme: id });
        updateThemePreview(id);
      });

      grid.appendChild(item);
    });
  }

  function updateThemePreview(themeId) {
    const preview = document.querySelector('.preview-translation');
    if (!preview) return;
    Object.keys(THEME_NAMES).forEach(t => preview.classList.remove(`theme-${t}`));
    preview.classList.add(`theme-${themeId}`);
  }


  async function applySettings(s) {
    if (s.translationProvider) {
      document.getElementById('optEngine').value = s.translationProvider;
      const isFree = s.translationProvider === 'google' || s.translationProvider === 'microsoft';
      const hintEl = document.getElementById('engineHint');
      if (hintEl) hintEl.textContent = isFree ? '免费引擎无需配置即可使用' : '需要配置 API Key 才能使用';
      const btnSave = document.getElementById('btnSaveProvider');
      if (btnSave) btnSave.style.display = isFree ? 'none' : '';
      await loadAndRenderConfig(s.translationProvider);
    }
    const summaryProvider = s.summaryProvider && supportsSummary(s.summaryProvider)
      ? s.summaryProvider
      : document.getElementById('optSummaryEngine')?.value;
    if (summaryProvider) {
      document.getElementById('optSummaryEngine').value = summaryProvider;
      await loadAndRenderConfig(summaryProvider, 'summary');
    }
    if (s.sourceLang) document.getElementById('optSourceLang').value = s.sourceLang;
    if (s.targetLang) {
      document.getElementById('optTargetLang').value = s.targetLang;
      ;
    }
    if (s.translationStyle) {
      document.getElementById('optTranslationStyle').value = s.translationStyle;
      if (s.translationStyle === 'custom') {
        const customPromptSectionEl = document.getElementById('customPromptSection');
        if (customPromptSectionEl) customPromptSectionEl.style.display = '';
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
      const item = document.querySelector(`.theme-item[data-theme="${s.translationTheme}"]`);
      if (item) { item.classList.add('active'); updateThemePreview(s.translationTheme); }
    }
    await updateSummaryMigrationBanner();
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
      list.innerHTML = '<div class="field-hint">暂无规则</div>';
      return;
    }
    urls.forEach(url => {
      const item = document.createElement('div');
      item.className = 'rule-item';
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
  const BASE_BACKUP_KEYS = [
    'translationProvider', 'targetLang', 'sourceLang',
    'translationMode', 'translationTheme', 'translationStyle', 'customPrompt',
    'hoverTranslate', 'hoverTrigger',
    'selectionTranslate',
    'sensitiveMask', 'disableReasoning', 'readerEnabled', 'readerTheme',
    'exportImageFormat', 'exportQuality',
    'longArticleMultiImageExport',
    'summaryProvider', 'summaryMigrationShown',
    'alwaysTranslateUrls', 'neverTranslateUrls',
    'floatBallPosY',
  ];
  const BACKUP_KEYS = Array.from(new Set([
    ...BASE_BACKUP_KEYS,
    ...buildProviderBackupKeys(),
    ...buildSummaryBackupKeys()
  ]));

  function buildProviderBackupKeys() {
    const providers = typeof ProviderRegistry !== 'undefined' ? ProviderRegistry.list() : [];
    const keys = [];
    providers.forEach(p => {
      keys.push(`${p.id}_apiKey`, `${p.id}_model`, `${p.id}_endpoint`);
      if (p.id === 'deepl') keys.push('deepl_apiKeys', 'deepl_plan');
    });
    return keys;
  }

  function buildSummaryBackupKeys() {
    const providers = typeof ProviderRegistry !== 'undefined' ? ProviderRegistry.summaryProviders() : [];
    const keys = [];
    providers.forEach(p => {
      keys.push(`summary_${p.id}_apiKey`, `summary_${p.id}_model`, `summary_${p.id}_endpoint`);
    });
    return keys;
  }

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

  // Storage change listener removed — save feedback is shown via the "已保存" button state only

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
