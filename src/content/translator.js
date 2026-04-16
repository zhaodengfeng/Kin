// Kin Universal Page Translator
// DOM traversal, chunked translation, bilingual injection, viewport priority
const KinTranslator = {
  settings: {},
  translatedRefs: [],
  originalNodes: new Map(),   // kinId -> DocumentFragment (original child nodes for restore)
  originalTexts: new Map(),   // kinId -> string (visible text reference)
  _nextId: 0,
  observer: null,
  _pendingCount: 0,
  _totalCount: 0,
  _resolveDone: null,

  // Block elements that can serve as translation units
  TRANSLATABLE: new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'TD', 'TH', 'DD', 'DT', 'BLOCKQUOTE',
    'FIGCAPTION', 'DIV'
  ]),

  // Block-level elements — if any of these appear as children, the parent is a container
  BLOCK_CHILDREN: new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'SECTION', 'ARTICLE',
    'MAIN', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD',
    'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD',
    'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'FORM', 'FIELDSET',
    'DETAILS', 'SUMMARY', 'ADDRESS', 'HR', 'PRE'
  ]),

  // Skip entirely during DOM walk — no recurse into these
  SKIP: new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'PRE', 'SVG', 'MATH',
    'TEXTAREA', 'INPUT', 'SELECT', 'BUTTON',
    'IFRAME', 'OBJECT', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS',
    'FOOTER', 'NAV', 'ASIDE', 'HEADER',
    'FORM', 'FIELDSET', 'DIALOG', 'MENU', 'METER', 'PROGRESS',
    'DETAILS', 'SUMMARY', 'TIME', 'DATA', 'OUTPUT'
  ]),

  init(settings) {
    this.settings = settings;
  },

  // ========== Main Translation ==========
  async translatePage() {
    if (this._pendingCount > 0) return;

    const elements = this.collectTranslatableElements();
    if (!elements.length) {
      if (typeof KinToast !== 'undefined') KinToast.info('页面未发现可翻译内容');
      return;
    }

    document.body.dataset.kinTheme = this.settings.translationTheme || 'underline';
    document.body.dataset.kinState = this.settings.translationMode || 'dual';

    this._totalCount = elements.length;
    this._pendingCount = elements.length;

    // IntersectionObserver: translate viewport elements first
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.translateElement(entry.target);
          this.observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '500px' });

    elements.forEach(el => {
      el.dataset.kinTranslated = 'pending';
      this.observer.observe(el);
    });

    // Fallback: translate any remaining off-screen elements after 3s
    setTimeout(() => {
      document.querySelectorAll('[data-kin-translated="pending"]').forEach(el => {
        if (this.observer) this.observer.unobserve(el);
        this.translateElement(el);
      });
    }, 3000);

    await new Promise((resolve) => { this._resolveDone = resolve; });
  },

  // ========== Collect Translatable Elements ==========
  collectTranslatableElements() {
    const results = [];

    const walk = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName;
      if (this.SKIP.has(tag)) return;
      if (node.dataset.kinTranslated) return;
      if (node.id && node.id.startsWith('kin-')) return;

      // Shadow DOM support
      if (node.shadowRoot) {
        for (const child of node.shadowRoot.children) walk(child);
      }

      if (this.TRANSLATABLE.has(tag) && this._isLeafBlock(node)) {
        const text = this._getVisibleText(node);
        if (text && text.length >= 4 && !/^\d+$/.test(text) && !/^[^\w]+$/.test(text)) {
          // Skip DIVs that look like navigation menus / link lists
          if (tag === 'DIV' && this._isNavLike(node, text)) {
            return; // Skip this node entirely, don't recurse
          }
          results.push(node);
          return; // Leaf block found — don't recurse further
        }
      }

      // Not a leaf block or not translatable — recurse into children
      for (const child of node.children) walk(child);
    };

    walk(document.body);
    return results;
  },

  // A "leaf block" has no block-level child elements — it's an atomic text unit
  _isLeafBlock(el) {
    for (const child of el.children) {
      if (this.BLOCK_CHILDREN.has(child.tagName)) return false;
    }
    return true;
  },

  // Detect navigation menus / link lists — should NOT be translated as a block
  // Indicators: many <a> tags, short text fragments, high link density
  _isNavLike(el, text) {
    const anchors = el.querySelectorAll('a');
    if (anchors.length === 0) return false;

    // If there are 3+ links, it's likely a menu/nav
    if (anchors.length >= 3) return true;

    // If the element has role="menu" or role="navigation" nearby
    if (el.getAttribute('role') === 'menu' || el.getAttribute('role') === 'navigation') return true;
    if (el.getAttribute('aria-label')?.toLowerCase().includes('menu')) return true;
    if (el.getAttribute('aria-label')?.toLowerCase().includes('nav')) return true;

    // If text contains many short fragments separated by newlines (typical of menu dumps)
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length >= 5) {
      const avgLen = text.length / lines.length;
      if (avgLen < 15) return true; // Many short lines = menu
    }

    // If over 60% of the text content is inside <a> tags
    let linkTextLen = 0;
    anchors.forEach(a => { linkTextLen += (a.textContent || '').length; });
    if (text.length > 0 && linkTextLen / text.length > 0.6) return true;

    return false;
  },

  // Extract visible text only, excluding SCRIPT/STYLE/NOSCRIPT content
  _getVisibleText(el) {
    let text = '';
    const walkText = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
        if (tag === 'BR') { text += '\n'; return; }
        for (const child of node.childNodes) walkText(child);
      }
    };
    for (const child of el.childNodes) walkText(child);
    return text.trim();
  },

  // ========== Translate Single Element ==========
  async translateElement(el) {
    if (el.dataset.kinTranslated === 'done' || el.dataset.kinTranslated === 'loading') return;

    const originalText = this._getVisibleText(el);
    if (!originalText || originalText.length < 2) {
      el.dataset.kinTranslated = 'skip';
      this._onElementDone();
      return;
    }

    const kinId = this._nextId++;
    el.dataset.kinId = kinId;
    el.dataset.kinTranslated = 'loading';

    // Save original child nodes into a DocumentFragment for safe restore
    const fragment = document.createDocumentFragment();
    while (el.firstChild) {
      fragment.appendChild(el.firstChild);
    }
    this.originalNodes.set(kinId, fragment);
    this.originalTexts.set(kinId, originalText);

    // Loading spinner
    const spinner = document.createElement('span');
    spinner.className = 'kin-loading-spinner';
    spinner.dataset.kinSpinner = '1';
    el.appendChild(spinner);

    try {
      // Mask sensitive info
      let masked = originalText;
      let map = [];
      if (this.settings.sensitiveMask !== false && typeof KinMasker !== 'undefined') {
        const result = KinMasker.mask(originalText);
        masked = result.masked;
        map = result.map;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'translate',
        data: {
          texts: [masked],
          to: this.settings.targetLang || 'zh-CN',
          contentType: this._getContentType(el),
        }
      });

      if (response?.error) throw new Error(response.error);

      let translation = response?.translations?.[0] || '';
      if (!translation) throw new Error('Empty translation');

      // Restore masked content
      if (map.length > 0 && typeof KinMasker !== 'undefined') {
        translation = KinMasker.restore(translation, map);
      }

      this._injectTranslation(el, kinId, translation);
      el.dataset.kinTranslated = 'done';

      this.translatedRefs.push(new WeakRef(el));
      if (this.translatedRefs.length > 100) this._cleanupRefs();

    } catch (e) {
      el.dataset.kinTranslated = 'error';
      // Restore original content on failure
      while (el.firstChild) el.firstChild.remove();
      const frag = this.originalNodes.get(kinId);
      if (frag) el.appendChild(frag.cloneNode(true));
      console.warn('[Kin] Translation failed:', e.message);
    }

    this._onElementDone();
  },

  _onElementDone() {
    this._pendingCount--;
    if (this._pendingCount <= 0 && this._resolveDone) {
      this._resolveDone();
      this._resolveDone = null;
    }
  },

  // ========== Inject Translation (XSS-safe) ==========
  _injectTranslation(el, kinId, translation) {
    // Remove spinner
    const spinner = el.querySelector('[data-kin-spinner]');
    if (spinner) spinner.remove();

    const originalFragment = this.originalNodes.get(kinId);

    // Original span — clone original content from saved fragment
    const originalSpan = document.createElement('span');
    originalSpan.className = 'kin-original';
    if (originalFragment) {
      originalSpan.appendChild(originalFragment.cloneNode(true));
    }

    // Translation span — textContent for XSS safety
    const translationSpan = document.createElement('span');
    translationSpan.className = 'kin-translation';
    translationSpan.textContent = translation;

    // Wrapper with theme class
    const wrapper = document.createElement('span');
    wrapper.className = 'kin-translation-block-wrapper';
    const theme = this.settings.translationTheme || 'underline';
    wrapper.classList.add(`kin-translation-theme-${theme}`);
    wrapper.appendChild(translationSpan);

    el.appendChild(originalSpan);
    el.appendChild(wrapper);
  },

  // ========== Restore Original Content ==========
  restore() {
    document.querySelectorAll(
      '[data-kin-translated="done"], [data-kin-translated="error"], ' +
      '[data-kin-translated="loading"], [data-kin-translated="pending"]'
    ).forEach(el => {
      const kinId = el.dataset.kinId;
      if (kinId !== undefined) {
        const id = parseInt(kinId);
        const fragment = this.originalNodes.get(id);
        if (fragment) {
          // Clear current content and restore original HTML structure
          while (el.firstChild) el.firstChild.remove();
          el.appendChild(fragment.cloneNode(true));
        }
      }
      delete el.dataset.kinTranslated;
      delete el.dataset.kinId;
    });

    document.body.dataset.kinState = '';
    this.translatedRefs = [];
    this.originalNodes.clear();
    this.originalTexts.clear();
    this._nextId = 0;
    this._pendingCount = 0;
    this._totalCount = 0;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  },

  // ========== Helpers ==========
  _getContentType(el) {
    const tag = el.tagName.toUpperCase();
    if (tag === 'H1') return 'headline';
    if (tag === 'H2' || tag === 'H3' || tag === 'H4') return 'heading';
    return 'body';
  },

  _cleanupRefs() {
    this.translatedRefs = this.translatedRefs.filter(ref => {
      const el = ref.deref();
      return el && el.isConnected;
    });
  },
};
