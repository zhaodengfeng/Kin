// Kin Floating Sidebar — Compact card panel for quick translation
const KinSidebar = {
  visible: false,
  panel: null,
  settings: {},

  init(settings) {
    this.settings = settings || {};
  },

  toggle() {
    if (this.visible) this.close();
    else this.open();
  },

  open() {
    if (this.visible) return;
    this.render();
    this.visible = true;
    requestAnimationFrame(() => {
      if (this.panel) this.panel.classList.add('kin-sidebar-open');
    });
  },

  close() {
    if (!this.panel) return;
    this.panel.classList.remove('kin-sidebar-open');
    setTimeout(() => {
      if (this.panel) { this.panel.remove(); this.panel = null; }
    }, 250);
    this.visible = false;
  },

  render() {
    this.panel = document.createElement('div');
    this.panel.className = 'kin-sidebar';
    this.panel.setAttribute('lang', 'zh-CN');

    this.panel.innerHTML = `
      <div class="kin-sidebar-header">
        <div class="kin-sidebar-brand">
          <svg width="32" height="32" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="44" height="44" rx="11" fill="url(#sidebarGrad)"/>
            <path d="M14 10L14 34M14 22L30 10M14 22L30 34" stroke="rgba(255,255,255,0.95)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
            <defs>
              <linearGradient id="sidebarGrad" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#E68B6D"/>
                <stop offset="100%" stop-color="#C86748"/>
              </linearGradient>
            </defs>
          </svg>
          <div>
            <div class="kin-sidebar-title">Kin (金)</div>
            <div class="kin-sidebar-subtitle">快速翻译</div>
          </div>
        </div>
        <button class="kin-sidebar-close" title="关闭">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="kin-sidebar-body">
        <!-- Page actions — most prominent -->
        <div class="kin-sidebar-actions-row">
          <button class="kin-sidebar-primary-btn" data-action="translate_page">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
            <span>翻译网页</span>
          </button>
          <button class="kin-sidebar-secondary-btn" data-action="toggle_mode">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
            <span>双语/仅译文</span>
          </button>
        </div>

        <!-- Quick translate -->
        <div class="kin-sidebar-card">
          <div class="kin-sidebar-section-title">快速翻译</div>
          <div class="kin-sidebar-translate-box">
            <textarea class="kin-sidebar-input" placeholder="输入文字，按 Ctrl+Enter 翻译..." rows="2"></textarea>
            <div class="kin-sidebar-translate-row">
              <select class="kin-sidebar-mini-select" id="kin-sidebar-lang"></select>
              <button class="kin-sidebar-go-btn">翻译</button>
            </div>
            <div class="kin-sidebar-result" style="display:none">
              <div class="kin-sidebar-result-text"></div>
              <button class="kin-sidebar-copy-btn" title="复制译文">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                复制
              </button>
            </div>
          </div>
        </div>

        <!-- Settings -->
        <div class="kin-sidebar-card">
          <div class="kin-sidebar-section-title">偏好设置</div>
          <div class="kin-sidebar-settings-grid">
            <div class="kin-sidebar-field">
              <label>翻译引擎</label>
              <select class="kin-sidebar-mini-select" id="kin-sidebar-engine"></select>
            </div>
            <div class="kin-sidebar-field">
              <label>显示样式</label>
              <select class="kin-sidebar-mini-select" id="kin-sidebar-theme"></select>
            </div>
          </div>
        </div>

        <!-- Bottom links -->
        <div class="kin-sidebar-footer">
          <button class="kin-sidebar-link-btn" data-action="toggle_hover">悬浮翻译</button>
          <span class="kin-sidebar-dot">·</span>
          <button class="kin-sidebar-link-btn" data-action="open_settings">更多设置</button>
        </div>
      </div>`;

    document.body.appendChild(this.panel);
    this.bindEvents();
    this.populateDropdowns();
  },

  bindEvents() {
    // Close
    this.panel.querySelector('.kin-sidebar-close').addEventListener('click', () => this.close());

    // Click outside to close
    const onOutside = (e) => {
      if (this.panel && !this.panel.contains(e.target)) {
        this.close();
        document.removeEventListener('mousedown', onOutside);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onOutside), 100);

    // Escape
    const onKey = (e) => {
      if (e.key === 'Escape') { this.close(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);

    // Action buttons
    this.panel.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        switch (action) {
          case 'translate_page':
            window.dispatchEvent(new CustomEvent('kin-action', { detail: { action: 'toggle_translate' } }));
            break;
          case 'toggle_mode':
            window.dispatchEvent(new CustomEvent('kin-action', { detail: { action: 'toggle_mode' } }));
            break;
          case 'toggle_hover':
            if (typeof KinHover !== 'undefined') {
              KinHover.toggle();
              if (typeof KinToast !== 'undefined') KinToast.info(KinHover.enabled ? '悬浮翻译已启用' : '悬浮翻译已关闭');
            }
            break;
          case 'open_settings':
            chrome.runtime.sendMessage({ type: 'open_options' });
            break;
        }
      });
    });

    // Quick translate
    const input = this.panel.querySelector('.kin-sidebar-input');
    const goBtn = this.panel.querySelector('.kin-sidebar-go-btn');
    goBtn.addEventListener('click', () => this.translateInput());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.translateInput(); }
    });

    // Dropdown saves
    this.panel.querySelector('#kin-sidebar-lang')?.addEventListener('change', (e) => {
      this.settings.targetLang = e.target.value;
      chrome.runtime.sendMessage({ type: 'save_settings', data: { targetLang: e.target.value } }).catch(() => {});
    });
    this.panel.querySelector('#kin-sidebar-engine')?.addEventListener('change', (e) => {
      this.settings.translationProvider = e.target.value;
      chrome.runtime.sendMessage({ type: 'save_settings', data: { translationProvider: e.target.value } }).catch(() => {});
    });
    this.panel.querySelector('#kin-sidebar-theme')?.addEventListener('change', (e) => {
      this.settings.translationTheme = e.target.value;
      chrome.runtime.sendMessage({ type: 'save_settings', data: { translationTheme: e.target.value } }).catch(() => {});
    });
  },

  populateDropdowns() {
    // Languages
    const langSelect = this.panel?.querySelector('#kin-sidebar-lang');
    if (langSelect && typeof TARGET_LANGUAGES !== 'undefined') {
      TARGET_LANGUAGES.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.code; opt.textContent = l.name;
        if (l.code === (this.settings?.targetLang || 'zh-CN')) opt.selected = true;
        langSelect.appendChild(opt);
      });
    }

    // Engines — only free providers + API providers with a saved key
    const engineSelect = this.panel?.querySelector('#kin-sidebar-engine');
    if (engineSelect) {
      const currentProvider = this.settings?.translationProvider || 'google';
      chrome.runtime.sendMessage({ type: 'get_available_providers' }, (resp) => {
        if (!this.panel) return;
        const list = resp?.providers || (typeof ProviderRegistry !== 'undefined'
          ? ProviderRegistry.freeProviders()
          : [{ id: 'google', name: 'Google Translate' }, { id: 'microsoft', name: 'Microsoft Translator' }]);
        engineSelect.innerHTML = '';
        list.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id; opt.textContent = p.name;
          if (p.id === currentProvider) opt.selected = true;
          engineSelect.appendChild(opt);
        });
        // If current provider not in list, fall back to first
        if (!list.find(p => p.id === currentProvider) && list.length > 0) {
          engineSelect.value = list[0].id;
        }
      });
    }

    // Themes
    const themeSelect = this.panel?.querySelector('#kin-sidebar-theme');
    if (themeSelect) {
      const themes = [
        { id: 'underline', name: '下划线' }, { id: 'highlight', name: '高亮' },
        { id: 'dashed', name: '虚线' }, { id: 'wavy', name: '波浪线' },
        { id: 'paper', name: '纸片' }, { id: 'blockquote', name: '引用块' },
        { id: 'marker', name: '荧光笔' }, { id: 'mask', name: '模糊' },
        { id: 'background', name: '背景色' }, { id: 'dotted', name: '点线' },
      ];
      themes.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id; opt.textContent = t.name;
        if (t.id === (this.settings?.translationTheme || 'underline')) opt.selected = true;
        themeSelect.appendChild(opt);
      });
    }
  },

  async translateInput() {
    const input = this.panel?.querySelector('.kin-sidebar-input');
    const resultSection = this.panel?.querySelector('.kin-sidebar-result');
    const resultText = this.panel?.querySelector('.kin-sidebar-result-text');
    if (!input || !resultSection || !resultText) return;

    const text = input.value.trim();
    if (!text) return;

    resultText.textContent = '翻译中...';
    resultText.style.color = '';
    resultSection.style.display = '';

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'translate',
        data: { texts: [text], to: this.settings?.targetLang || 'zh-CN' }
      });
      if (resp?.translations?.[0]) {
        resultText.textContent = resp.translations[0];
        const copyBtn = this.panel.querySelector('.kin-sidebar-copy-btn');
        if (copyBtn) {
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(resp.translations[0]).then(() => {
              if (typeof KinToast !== 'undefined') KinToast.success('已复制');
            });
          };
        }
      } else if (resp?.error) {
        resultText.textContent = '错误: ' + resp.error;
        resultText.style.color = '#FF3B30';
      }
    } catch (e) {
      resultText.textContent = '翻译失败';
      resultText.style.color = '#FF3B30';
    }
  }
};
