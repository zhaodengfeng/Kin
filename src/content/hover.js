// Kin Hover Translation — Ctrl/Cmd+hover or direct hover tooltip
const KinHover = {
  enabled: true,
  triggerMode: 'ctrl',
  tooltip: null,
  debounceTimer: null,
  lastBlock: null,
  _bound: false,

  init(settings) {
    this.settings = settings;
    this.enabled = settings.hoverTranslate !== false;
    if (!this.enabled) return;
    if (!this._bound) { this.bindEvents(); this._bound = true; }
  },

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.hideTooltip();
  },

  bindEvents() {
    document.addEventListener('mouseover', (e) => {
      if (!this.enabled) return;
      if (!e.ctrlKey && !e.metaKey) return;

      const block = this.findTranslatableBlock(e.target);
      if (!block) return;
      if (block === this.lastBlock) return; // same block, skip

      const text = this._getText(block);
      if (text.length < 3) return;

      this.lastBlock = block;
      this.scheduleTranslate(block, text);
    });

    document.addEventListener('mouseout', (e) => {
      const block = this.findTranslatableBlock(e.target);
      if (block && block === this.lastBlock) {
        clearTimeout(this.debounceTimer);
        this.lastBlock = null;
        // Delay hide so user can see tooltip
        setTimeout(() => this.hideTooltip(), 300);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideTooltip();
    });

    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => this.hideTooltip(), 100);
    }, { passive: true });
  },

  _getText(el) {
    return (el.textContent || '').trim();
  },

  scheduleTranslate(block, text) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.translateBlock(block, text);
    }, 300);
  },

  async translateBlock(block, text) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'translate',
        data: { texts: [text], to: this.settings?.targetLang || 'zh-CN' }
      });
      if (response?.translations?.[0]) {
        this.showTooltip(block, response.translations[0]);
      }
    } catch (e) {
      // Silent for hover UX
    }
  },

  showTooltip(block, translation) {
    this.hideTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'kin-hover-tooltip';
    tooltip.textContent = translation;

    const rect = block.getBoundingClientRect();
    tooltip.style.position = 'fixed';
    tooltip.style.top = (rect.bottom + 8) + 'px';
    tooltip.style.left = Math.max(10, rect.left) + 'px';
    tooltip.style.maxWidth = Math.max(200, Math.min(rect.width, 500)) + 'px';
    tooltip.style.zIndex = '2147483590';

    document.body.appendChild(tooltip);
    this.tooltip = tooltip;

    this._autoHideTimer = setTimeout(() => this.hideTooltip(), 5000);
  },

  hideTooltip() {
    clearTimeout(this._autoHideTimer);
    if (this.tooltip) { this.tooltip.remove(); this.tooltip = null; }
    this.lastBlock = null;
  },

  findTranslatableBlock(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.id && el.id.startsWith('kin-')) return null;
      if (el.className && typeof el.className === 'string' && el.className.includes('kin-')) return null;
      if (/^(P|H[1-6]|LI|BLOCKQUOTE|TD|TH|DD|DT|FIGCAPTION)$/.test(el.tagName)) return el;
      // DIV: only if it's a leaf block (no block children) and has enough text
      if (el.tagName === 'DIV' && this._isLeafDiv(el)) return el;
      el = el.parentElement;
    }
    return null;
  },

  _isLeafDiv(el) {
    const blockTags = /^(P|H[1-6]|DIV|SECTION|ARTICLE|MAIN|UL|OL|LI|DL|BLOCKQUOTE|TABLE|FIGURE|FORM|HEADER|FOOTER|NAV|ASIDE)$/;
    for (const child of el.children) {
      if (blockTags.test(child.tagName)) return false;
    }
    const text = (el.textContent || '').trim();
    return text.length >= 3 && text.length <= 2000;
  }
};
