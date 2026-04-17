// Kin Float Ball — Immersive Translate style popup
// Pill button → hover gear → click gear: popup with language row, service, toggles, widgets
const KinFloatBall = {
  el: null,
  panel: null,
  posY: 335,
  settings: {},
  panelVisible: false,
  dragMoved: false,
  dragStartY: 0,
  dragStartPosX: 0,
  dragStartPosY: 0,

  init(opts) {
    this.posY = opts.posY || 335;
    this.settings = opts.settings || {};
    this.loadPosition();
    this.render();
  },

  updateState(opts) {},

  // ========== SVG Icons ==========
  svg: {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    dual: '<svg viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor" font-family="system-ui,sans-serif">A文</text></svg>',
    mono: '<svg viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor" font-family="system-ui,sans-serif">文</text></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    loading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
  },

  // ========== Render ==========
  render() {
    if (this.el?.isConnected) return;

    const c = document.createElement('div');
    c.id = 'kin-fb-container';
    c.className = 'kin-fb-container';
    c.style.setProperty('top', this.posY + 'px', 'important');

    c.innerHTML = `
      <div class="kin-fb-pill-wrapper">
        <div class="kin-fb-side" id="kin-fb-gear" title="设置">${this.svg.gear}</div>
        <div class="kin-fb-btn" id="kin-fb-pill">
          <div class="kin-fb-btn-content">
            <div class="kin-fb-logo" id="kin-fb-logo">K</div>
          </div>
        </div>
        <div class="kin-fb-indicator" id="kin-fb-indicator" style="display:none"></div>
      </div>`;

    document.documentElement.appendChild(c);
    this.el = c;
    this._bindFloatEvents();
  },

  // ========== Float Ball Events ==========
  _bindFloatEvents() {
    const pill = this.el.querySelector('#kin-fb-pill');
    const gear = this.el.querySelector('#kin-fb-gear');
    const wrapper = this.el.querySelector('.kin-fb-pill-wrapper');

    // Hover on wrapper → CSS handles gear visibility
    // Click pill → translate
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.dragMoved) return;
      this.closePanel();
      window.dispatchEvent(new CustomEvent('kin-action', { detail: { action: 'toggle_translate' } }));
    });

    // Click gear → toggle panel
    gear.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.dragMoved) return;
      this.panelVisible ? this.closePanel() : this.openPanel();
    });

    // Drag
    const onMove = (e) => {
      if (Math.abs(e.clientY - this.dragStartY) > 4 || Math.abs(e.clientX - this.dragStartPosX) > 4) {
        this.dragMoved = true;
        this.el.classList.add('dragging');
        this.posY = Math.max(50, Math.min(window.innerHeight - 50, this.dragStartPosY + (e.clientY - this.dragStartY)));
        this.el.style.setProperty('top', this.posY + 'px', 'important');
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.el.classList.remove('dragging');
      this.savePosition();
      setTimeout(() => { this.dragMoved = false; }, 50);
    };
    pill.addEventListener('mousedown', (e) => {
      this.dragMoved = false;
      this.dragStartY = e.clientY;
      this.dragStartPosX = e.clientX;
      this.dragStartPosY = this.posY;
      e.preventDefault();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    const onTouchMove = (e) => {
      if (Math.abs(e.touches[0].clientY - this.dragStartY) > 4) {
        this.dragMoved = true;
        this.el.classList.add('dragging');
        this.posY = Math.max(50, Math.min(window.innerHeight - 50, this.dragStartPosY + (e.touches[0].clientY - this.dragStartY)));
        this.el.style.setProperty('top', this.posY + 'px', 'important');
      }
    };
    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      this.el.classList.remove('dragging');
      this.savePosition();
      setTimeout(() => { this.dragMoved = false; }, 50);
    };
    pill.addEventListener('touchstart', (e) => {
      this.dragMoved = false;
      this.dragStartY = e.touches[0].clientY;
      this.dragStartPosY = this.posY;
      document.addEventListener('touchmove', onTouchMove, { passive: true });
      document.addEventListener('touchend', onTouchEnd);
    }, { passive: true });
  },

  // ========== Open Popup Panel ==========
  openPanel() {
    if (this.panelVisible) return;
    this.panelVisible = true;

    const s = this.settings;
    const src = s.sourceLang || 'auto';
    const tgt = s.targetLang || 'zh-CN';
    const prov = s.translationProvider || 'google';
    const mode = s.translationMode || 'dual';
    const isTranslated = document.body.dataset.kinState === 'dual' || document.body.dataset.kinState === 'translation';
    const host = location.hostname;
    const alwaysUrls = Array.isArray(s.alwaysTranslateUrls) ? s.alwaysTranslateUrls : [];
    const isAlways = alwaysUrls.some(u => host.includes(u) || u.includes(host));

    const panel = document.createElement('div');
    panel.id = 'kin-fb-panel';

    const LANGS = [
      ['auto','自动检测'],['en','English'],['zh-CN','中文'],['ja','日本語'],
      ['ko','한국어'],['fr','Français'],['de','Deutsch'],['es','Español'],['ru','Русский']
    ];
    const TGT_LANGS = [
      ['zh-CN','简体中文'],['zh-TW','繁體中文'],['en','English'],['ja','日本語'],
      ['ko','한국어'],['fr','Français'],['de','Deutsch'],['es','Español'],['ru','Русский']
    ];

    const langOpts = (list, sel) => list.map(([v,n]) =>
      `<option value="${v}" ${v===sel?'selected':''}>${n}</option>`
    ).join('');

    panel.innerHTML = `<div class="kin-fb-popup-container">
      <div class="kin-fb-popup-header">
        <div class="kin-fb-popup-brand"><span class="kin-fb-popup-logo">K</span><span class="kin-fb-popup-name">Kin</span></div>
        <div class="kin-fb-popup-close" id="kin-fb-close"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
      </div>
      <div class="kin-fb-popup-content">

        <!-- Language row -->
        <div class="kin-fb-lang-row">
          <div class="kin-fb-lang-container">
            <select id="kin-fb-source">${langOpts(LANGS, src)}</select>
            <label>源语言</label>
          </div>
          <div class="kin-fb-swap-btn" id="kin-fb-swap">${this.svg.swap}</div>
          <div class="kin-fb-lang-container">
            <select id="kin-fb-target">${langOpts(TGT_LANGS, tgt)}</select>
            <label>目标语言</label>
          </div>
        </div>

        <!-- Service -->
        <div class="kin-fb-service-container">
          <select id="kin-fb-engine"></select>
        </div>

        <!-- Mode toggle + Translate button -->
        <div class="kin-fb-btn-row">
          <div class="kin-fb-mode-btn" id="kin-fb-mode" title="${mode==='dual'?'切换仅译文':'切换双语对照'}">
            ${mode === 'dual' ? this.svg.dual : this.svg.mono}
          </div>
          <button class="kin-fb-main-button" id="kin-fb-go">
            ${isTranslated ? '显示原文' : '翻译'}
          </button>
        </div>

        <!-- Settings toggles -->
        <div class="kin-fb-setting-section">
          <div class="kin-fb-setting-row">
            <span class="kin-fb-setting-label">总是翻译此网站</span>
            <div class="kin-fb-toggle ${isAlways?'checked':''}" id="kin-t-always"><div class="kin-fb-toggle-dot"></div></div>
          </div>
          <div class="kin-fb-setting-row">
            <span class="kin-fb-setting-label">划词翻译</span>
            <div class="kin-fb-toggle ${s.selectionTranslate!==false?'checked':''}" id="kin-t-sel"><div class="kin-fb-toggle-dot"></div></div>
          </div>
          <div class="kin-fb-setting-row">
            <span class="kin-fb-setting-label">悬停翻译</span>
            <div class="kin-fb-toggle ${s.hoverTranslate!==false?'checked':''}" id="kin-t-hover"><div class="kin-fb-toggle-dot"></div></div>
          </div>
          <div class="kin-fb-setting-hint">按住 Ctrl 悬停英文段落即可翻译</div>
        </div>

      </div>

      <!-- Footer -->
      <div class="kin-fb-popup-footer">
        <span class="kin-fb-footer-link" data-act="open_settings">
          ${this.svg.settings}<span>设置</span>
        </span>
        <span class="kin-fb-footer-version">Kin v1.0</span>
      </div>
    </div>`;

    document.documentElement.appendChild(panel);
    this.panel = panel;
    this._positionPanel();
    this._bindPanel();

    // Populate engine list: free providers + configured API providers only
    chrome.runtime.sendMessage({ type: 'get_available_providers' }, (resp) => {
      const engineSel = this.panel?.querySelector('#kin-fb-engine');
      if (!engineSel) return;
      const list = resp?.providers || [
        { id: 'google', name: 'Google 翻译' },
        { id: 'microsoft', name: '微软翻译' }
      ];
      engineSel.innerHTML = '';
      list.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === prov) opt.selected = true;
        engineSel.appendChild(opt);
      });
      if (!list.find(p => p.id === prov) && list.length > 0) {
        engineSel.value = list[0].id;
        this.settings.translationProvider = list[0].id;
        this._save({ translationProvider: list[0].id });
      }
    });

    // Keep gear visible when panel is open
    if (wrapper) wrapper.classList.add('kin-fb-panel-open');
  },

  _positionPanel() {
    if (!this.panel || !this.el) return;
    const rect = this.el.getBoundingClientRect();
    const vh = window.innerHeight;

    this.panel.style.cssText = `
      position:fixed; z-index:2147483601; right:65px;
      ${rect.top + 420 > vh ? 'bottom:20px' : `top:${Math.max(rect.top, 10)}px`}
    `;
  },

  closePanel() {
    if (!this.panelVisible) return;
    this.panelVisible = false;
    if (this.panel) { this.panel.remove(); this.panel = null; }
    if (wrapper) wrapper.classList.remove('kin-fb-panel-open');
  },

  // ========== Panel Events ==========
  _bindPanel() {
    // Close on outside click
    const onOutside = (e) => {
      if (!this.panel?.contains(e.target) && !this.el?.contains(e.target)) {
        this.closePanel();
        document.removeEventListener('mousedown', onOutside);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onOutside), 30);

    // Escape
    const onEsc = (e) => {
      if (e.key === 'Escape') { this.closePanel(); document.removeEventListener('keydown', onEsc); document.removeEventListener('mousedown', onOutside); }
    };
    document.addEventListener('keydown', onEsc);

    // Header close button
    this.panel.querySelector('#kin-fb-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePanel();
    });

    // Translate button
    this.panel.querySelector('#kin-fb-go')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePanel();
      window.dispatchEvent(new CustomEvent('kin-action', { detail: { action: 'toggle_translate' } }));
    });

    // Mode toggle
    this.panel.querySelector('#kin-fb-mode')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('kin-action', { detail: { action: 'toggle_mode' } }));
    });

    // Swap languages
    this.panel.querySelector('#kin-fb-swap')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const srcEl = this.panel.querySelector('#kin-fb-source');
      const tgtEl = this.panel.querySelector('#kin-fb-target');
      if (srcEl && tgtEl && srcEl.value !== 'auto') {
        const tmp = srcEl.value;
        srcEl.value = tgtEl.value;
        tgtEl.value = tmp;
        this._save({ sourceLang: srcEl.value, targetLang: tgtEl.value });
      }
    });

    // Selects
    this.panel.querySelector('#kin-fb-source')?.addEventListener('change', (e) => { this.settings.sourceLang = e.target.value; this._save({ sourceLang: e.target.value }); });
    this.panel.querySelector('#kin-fb-target')?.addEventListener('change', (e) => { this.settings.targetLang = e.target.value; this._save({ targetLang: e.target.value }); });
    this.panel.querySelector('#kin-fb-engine')?.addEventListener('change', (e) => { this.settings.translationProvider = e.target.value; this._save({ translationProvider: e.target.value }); });

    // Toggles
    const bindToggle = (id, key) => {
      const el = this.panel.querySelector('#' + id);
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const on = el.classList.toggle('checked');
        this.settings[key] = on;
        this._save({ [key]: on });
      });
    };
    bindToggle('kin-t-hover', 'hoverTranslate');
    bindToggle('kin-t-sel', 'selectionTranslate');

    // Always translate (special logic)
    const alwaysEl = this.panel.querySelector('#kin-t-always');
    if (alwaysEl) {
      alwaysEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const on = alwaysEl.classList.toggle('checked');
        const host = location.hostname;
        let urls = Array.isArray(this.settings.alwaysTranslateUrls) ? [...this.settings.alwaysTranslateUrls] : [];
        if (on) { if (!urls.includes(host)) urls.push(host); }
        else { urls = urls.filter(u => u !== host); }
        this.settings.alwaysTranslateUrls = urls;
        this._save({ alwaysTranslateUrls: urls });
      });
    }

    // Footer settings link
    this.panel.querySelector('[data-act="open_settings"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'open_options' });
      this.closePanel();
    });
  },

  _save(data) {
    try { chrome.runtime.sendMessage({ type: 'save_settings', data }).catch(() => {}); } catch(e) {}
  },

  // ========== External API ==========
  setTranslating(on) {
    const logo = this.el?.querySelector('#kin-fb-logo');
    if (!logo) return;
    if (on) {
      logo.innerHTML = this.svg.loading;
      logo.classList.add('kin-fb-loading');
      logo.classList.remove('kin-fb-done');
    } else {
      logo.textContent = 'K';
      logo.classList.remove('kin-fb-loading', 'kin-fb-done');
    }
  },

  setTranslated(on) {
    const indicator = this.el?.querySelector('#kin-fb-indicator');
    if (indicator) indicator.style.display = on ? 'block' : 'none';
  },

  loadPosition() {
    try {
      chrome.storage.local.get('floatBallPosY', (d) => {
        if (d.floatBallPosY !== undefined) {
          this.posY = d.floatBallPosY;
          if (this.el) this.el.style.setProperty('top', this.posY + 'px', 'important');
        }
      });
    } catch(e) {}
  },

  savePosition() {
    try { chrome.storage.local.set({ floatBallPosY: this.posY }); } catch(e) {}
  },
};
