// Kin Input Box Translation — // trigger + Alt+I
const KinInput = {
  enabled: true,
  active: false,
  panel: null,
  _targetEl: null,
  _buffer: '',
  _bound: false,  // P3-4: prevent duplicate event binding

  init(settings) {
    this.settings = settings;
    this.enabled = settings.inputTranslate !== false;
    if (!this.enabled) return;
    if (!this._bound) { this.bindEvents(); this._bound = true; }
  },

  bindEvents() {
    // Listen for input events to detect // trigger
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (!this.isEditable(el)) return;

      const val = this.getValue(el);
      this._buffer = val;

      // Detect // at the end
      if (val.endsWith('//') && !this.active) {
        this.active = true;
        this._targetEl = el;
        // Remove the // trigger
        this.setValue(el, val.slice(0, -2));
        this._buffer = val.slice(0, -2);
      }
    });

    // After // detected, translate on Space or Enter
    document.addEventListener('keydown', (e) => {
      // Alt+I global shortcut
      if (e.altKey && e.key === 'i') {
        e.preventDefault();
        this.translateActiveInput();
        return;
      }

      // Space or Enter after // trigger
      if (this.active && this._targetEl) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          this.active = false;
          this.translateElement(this._targetEl);
        }
        // Escape cancels
        if (e.key === 'Escape') {
          this.active = false;
          this._targetEl = null;
        }
      }
    });

    // Close panel on outside click
    document.addEventListener('mousedown', (e) => {
      if (this.panel && !this.panel.contains(e.target)) {
        this.closePanel();
      }
    });

    // Close panel on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closePanel();
    });
  },

  async translateActiveInput() {
    const el = document.activeElement;
    if (!this.isEditable(el)) {
      if (typeof KinToast !== 'undefined') KinToast.warning('请先聚焦到一个输入框');
      return;
    }
    const text = this.getValue(el).trim();
    if (!text) return;

    await this.translateElement(el);
  },

  async translateElement(el) {
    const text = this.getValue(el).trim();
    if (!text) return;

    try {
      const targetLang = this.settings?.inputTargetLang || 'en';
      const response = await chrome.runtime.sendMessage({
        type: 'translate',
        data: { texts: [text], to: targetLang }
      });

      if (response?.error) {
        if (typeof KinToast !== 'undefined') KinToast.error(response.error);
        return;
      }

      if (response?.translations?.[0]) {
        this.showCandidate(el, response.translations[0]);
      }
    } catch (e) {
      if (typeof KinToast !== 'undefined') KinToast.error('翻译失败');
    }
  },

  showCandidate(inputEl, translation) {
    this.closePanel();

    const panel = document.createElement('div');
    panel.className = 'kin-input-panel';

    const candidate = document.createElement('div');
    candidate.className = 'kin-input-candidate';
    candidate.textContent = translation;

    const actions = document.createElement('div');
    actions.className = 'kin-input-actions';

    const replaceBtn = document.createElement('button');
    replaceBtn.className = 'kin-input-replace';
    replaceBtn.textContent = '替换';
    replaceBtn.addEventListener('click', () => {
      this.setValue(inputEl, translation);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      this.closePanel();
    });

    const appendBtn = document.createElement('button');
    appendBtn.className = 'kin-input-append';
    appendBtn.textContent = '追加';
    appendBtn.addEventListener('click', () => {
      const current = this.getValue(inputEl);
      this.setValue(inputEl, current + '\n' + translation);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      this.closePanel();
    });

    actions.appendChild(replaceBtn);
    actions.appendChild(appendBtn);
    panel.appendChild(candidate);
    panel.appendChild(actions);

    // Position below input
    const rect = inputEl.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    panel.style.top = (rect.bottom + scrollTop + 4) + 'px';
    panel.style.left = Math.max(10, rect.left + scrollLeft) + 'px';
    panel.style.minWidth = Math.max(180, Math.min(rect.width, 400)) + 'px';

    document.body.appendChild(panel);
    this.panel = panel;
  },

  closePanel() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  },

  getValue(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value || '';
    return el.textContent || '';
  },

  setValue(el, val) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.value = val;
    } else {
      el.textContent = val;
    }
  },

  isEditable(el) {
    return el && (
      (el.tagName === 'INPUT' && (!el.type || el.type === 'text' || el.type === 'search' || el.type === 'url')) ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable
    );
  }
};
