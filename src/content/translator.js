// Kin Universal Page Translator
// DOM traversal, chunked translation, bilingual injection, viewport priority
// v2: MutationObserver, inline variable placeholders, notranslate, error UI
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

  // Batch translation config
  BATCH_SIZE: 10,
  CONCURRENT_BATCHES: 5,      // increased from 2 for faster large-page translation
  VIEWPORT_MARGIN: 800,

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
    'DETAILS', 'SUMMARY', 'ADDRESS', 'HR', 'PRE',
    'HEADER', 'FOOTER', 'NAV', 'ASIDE'
  ]),

  // Skip entirely during DOM walk — no recurse into these
  SKIP: new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'PRE', 'SVG', 'MATH',
    'TEXTAREA', 'INPUT', 'SELECT', 'BUTTON',
    'IFRAME', 'OBJECT', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS',
    'FORM', 'FIELDSET', 'DIALOG', 'MENU', 'METER', 'PROGRESS',
    'DETAILS', 'SUMMARY', 'TIME', 'DATA', 'OUTPUT'
  ]),

  // Inline elements preserved as {k0} placeholders during translation
  INLINE_VARS: new Set([
    'CODE', 'TT', 'IMG', 'SUP', 'SUB', 'SAMP', 'KBD', 'VAR'
  ]),

  // MutationObserver for dynamic content (SPA, infinite scroll, AJAX)
  _dynamicObserver: null,
  _mutationQueue: [],
  _mutationTimer: null,
  _isDynamicTranslation: false,
  MUTATION_DEBOUNCE: 600,

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

    // Sort by document order to ensure top-to-bottom translation
    elements.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });

    // Mark all as pending
    elements.forEach(el => {
      el.dataset.kinTranslated = 'pending';
    });

    // Split into viewport-first groups
    const viewportEls = [];
    const belowEls = [];
    for (const el of elements) {
      if (this._isInViewport(el, this.VIEWPORT_MARGIN)) {
        viewportEls.push(el);
      } else {
        belowEls.push(el);
      }
    }

    // Preserve document order within each group
    const orderedElements = [...viewportEls, ...belowEls];

    // Build batches
    const batches = [];
    for (let i = 0; i < orderedElements.length; i += this.BATCH_SIZE) {
      batches.push(orderedElements.slice(i, i + this.BATCH_SIZE));
    }

    this._totalCount = elements.length;
    this._pendingCount = elements.length;

    // Translate with concurrency control
    await this._translateBatches(batches, this.CONCURRENT_BATCHES);

    await new Promise((resolve) => { this._resolveDone = resolve; });

    // Start watching for dynamic content changes after initial translation
    this._startDynamicObserver();
  },

  // ========== Concurrent Batch Queue ==========
  async _translateBatches(batches, concurrency) {
    let index = 0;
    const errors = [];

    const runNext = async () => {
      if (index >= batches.length) return;
      const batch = batches[index++];
      try {
        await this._translateBatch(batch);
      } catch (e) {
        errors.push(e);
        console.warn('[Kin] Batch failed:', e.message);
      }
      await runNext();
    };

    const workers = Array(Math.min(concurrency, batches.length))
      .fill()
      .map(() => runNext());

    await Promise.all(workers);

    if (errors.length > 0 && !this._isDynamicTranslation && typeof KinToast !== 'undefined') {
      KinToast.warning(`${errors.length} 批翻译失败`);
    }
  },

  // ========== Translate a Single Batch ==========
  async _translateBatch(elements) {
    const items = [];

    // 1. Prepare all elements: save originals, assign kinId, extract variables
    for (const el of elements) {
      if (el.dataset.kinTranslated === 'done' || el.dataset.kinTranslated === 'loading') {
        this._onElementDone();
        continue;
      }

      // Extract text with inline variable placeholders
      const { text: originalText, vars } = this._extractTextWithVars(el);
      if (!originalText || originalText.length < 2) {
        el.dataset.kinTranslated = 'skip';
        this._onElementDone();
        continue;
      }

      const kinId = this._nextId++;
      el.dataset.kinId = kinId;
      el.dataset.kinTranslated = 'loading';

      // Save original child nodes
      const fragment = document.createDocumentFragment();
      while (el.firstChild) {
        fragment.appendChild(el.firstChild);
      }
      this.originalNodes.set(kinId, fragment);
      this.originalTexts.set(kinId, originalText);

      // Restore original content immediately so user sees no blank
      el.appendChild(fragment.cloneNode(true));

      items.push({ el, kinId, text: originalText, vars });
    }

    if (!items.length) return;

    // 2. Batch masking
    const textsToTranslate = [];
    const maskMaps = [];
    for (const item of items) {
      if (this.settings.sensitiveMask !== false && typeof KinMasker !== 'undefined') {
        const result = KinMasker.mask(item.text);
        textsToTranslate.push(result.masked);
        maskMaps.push(result.map);
      } else {
        textsToTranslate.push(item.text);
        maskMaps.push([]);
      }
    }

    // 3. Single API call for the entire batch
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'translate',
        data: {
          texts: textsToTranslate,
          to: this.settings.targetLang || 'zh-CN',
          contentType: 'body',
        }
      });

      if (response?.error) throw new Error(response.error);

      const translations = Array.isArray(response?.translations) ? response.translations : [];

      // 4. Inject results in document order
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let translation = translations[i] || '';

        if (!translation) {
          // Empty translation — restore original + show error hint
          this._showErrorHint(item.el, item.kinId, '翻译结果为空');
          this._onElementDone();
          continue;
        }

        // Restore masked content
        if (maskMaps[i]?.length > 0 && typeof KinMasker !== 'undefined') {
          translation = KinMasker.restore(translation, maskMaps[i]);
        }

        this._injectTranslation(item.el, item.kinId, translation, item.vars);
        item.el.dataset.kinTranslated = 'done';
        this.translatedRefs.push(new WeakRef(item.el));
        if (this.translatedRefs.length > 100) this._cleanupRefs();

        this._onElementDone();
      }

    } catch (e) {
      // Batch failed — restore all originals with error hints
      const errorMsg = e.message || '翻译失败';
      for (const item of items) {
        this._showErrorHint(item.el, item.kinId, errorMsg);
        this._onElementDone();
      }
      console.warn('[Kin] Batch translation failed:', e.message);
      throw e;
    }
  },

  _onElementDone() {
    if (this._isDynamicTranslation) return;
    this._pendingCount--;
    if (this._pendingCount <= 0 && this._resolveDone) {
      this._resolveDone();
      this._resolveDone = null;
    }
  },

  // ========== Viewport Detection ==========
  _isInViewport(el, margin = 0) {
    const rect = el.getBoundingClientRect();
    const top = rect.top - margin;
    const bottom = rect.bottom + margin;
    const h = window.innerHeight || document.documentElement.clientHeight;
    return bottom > 0 && top < h;
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

      // notranslate recognition
      if (this._isNoTranslate(node)) return;

      // Skip our own injected elements
      if (node.classList?.contains('kin-original')) return;
      if (node.classList?.contains('kin-translation-block-wrapper')) return;
      if (node.classList?.contains('kin-translation')) return;
      if (node.classList?.contains('kin-error-hint')) return;

      // Shadow DOM support
      if (node.shadowRoot) {
        for (const child of node.shadowRoot.children) walk(child);
      }

      if (this.TRANSLATABLE.has(tag) && this._isLeafBlock(node)) {
        const text = this._getVisibleText(node);
        if (text && text.length >= 4 && !/^\d+$/.test(text) && !/^[^\w]+$/.test(text)) {
          // Skip DIVs that look like navigation menus / link lists
          if (tag === 'DIV' && this._isNavLike(node, text)) {
            return;
          }
          results.push(node);
          return;
        }
      }

      // Not a leaf block or not translatable — recurse into children
      for (const child of node.children) walk(child);
    };

    walk(document.body);
    return results;
  },

  _isLeafBlock(el) {
    for (const child of el.children) {
      if (this.BLOCK_CHILDREN.has(child.tagName)) return false;
    }
    return true;
  },

  // ========== notranslate Detection ==========
  _isNoTranslate(el) {
    if (el.getAttribute && el.getAttribute('translate') === 'no') return true;
    if (el.classList && el.classList.contains('notranslate')) return true;
    return false;
  },

  // ========== Inline Variable Placeholder System ==========
  _extractTextWithVars(el) {
    const vars = [];
    let text = '';

    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
        if (tag === 'BR') { text += '\n'; return; }

        // Replace inline code-like elements with placeholders
        if (this.INLINE_VARS.has(tag)) {
          const idx = vars.length;
          vars.push(node.cloneNode(true));
          text += `{k${idx}}`;
          return;
        }

        for (const child of node.childNodes) walk(child);
      }
    };

    for (const child of el.childNodes) walk(child);
    return { text: text.trim(), vars };
  },

  // Build translation DOM with restored inline variable elements
  _buildTranslationDom(translationText, vars) {
    if (!vars || !vars.length) {
      const span = document.createElement('span');
      span.textContent = translationText;
      return span;
    }

    const fragment = document.createDocumentFragment();
    const parts = translationText.split(/\{k(\d+)\}/);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        if (parts[i]) fragment.appendChild(document.createTextNode(parts[i]));
      } else {
        const varIdx = parseInt(parts[i]);
        if (varIdx < vars.length) {
          fragment.appendChild(vars[varIdx].cloneNode(true));
        }
      }
    }
    return fragment;
  },

  // ========== Inject Translation (XSS-safe) ==========
  _injectTranslation(el, kinId, translation, vars) {
    const spinner = el.querySelector('[data-kin-spinner]');
    if (spinner) spinner.remove();

    const originalFragment = this.originalNodes.get(kinId);
    const theme = this.settings.translationTheme || 'underline';

    const originalSpan = document.createElement('span');
    originalSpan.className = 'kin-original';
    if (originalFragment) {
      originalSpan.appendChild(originalFragment.cloneNode(true));
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'kin-translation-block-wrapper';
    wrapper.classList.add(`kin-translation-theme-${theme}`);

    // Build translation content with variable restoration
    const translationContent = this._buildTranslationDom(translation, vars);
    wrapper.appendChild(translationContent);

    el.appendChild(originalSpan);
    el.appendChild(wrapper);
  },

  // ========== Error Hint ==========
  _showErrorHint(el, kinId, errorMsg) {
    el.dataset.kinTranslated = 'error';

    // Remove any existing spinner
    const spinner = el.querySelector('[data-kin-spinner]');
    if (spinner) spinner.remove();

    // Restore original content
    const fragment = this.originalNodes.get(kinId);
    if (fragment) {
      while (el.firstChild) el.firstChild.remove();
      el.appendChild(fragment.cloneNode(true));
    }

    // Add error hint after element
    const existingHint = el.querySelector('.kin-error-hint');
    if (existingHint) existingHint.remove();

    const hint = document.createElement('span');
    hint.className = 'kin-error-hint';
    hint.title = errorMsg;
    hint.textContent = '⚠';
    el.appendChild(hint);
  },

  // ========== MutationObserver for Dynamic Content ==========
  _startDynamicObserver() {
    if (this._dynamicObserver) return;

    this._dynamicObserver = new MutationObserver((mutations) => {
      this._handleMutations(mutations);
    });

    this._dynamicObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  },

  _stopDynamicObserver() {
    if (this._dynamicObserver) {
      this._dynamicObserver.disconnect();
      this._dynamicObserver = null;
    }
    clearTimeout(this._mutationTimer);
    this._mutationTimer = null;
    this._mutationQueue = [];
  },

  _handleMutations(mutations) {
    // Collect added nodes, filtering out our own DOM changes
    let hasNewContent = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (this._isOurNode(node)) continue;
        if (node.nodeType === Node.ELEMENT_NODE) {
          hasNewContent = true;
          break;
        }
      }
      if (hasNewContent) break;
    }
    if (!hasNewContent) return;

    this._mutationQueue.push(...mutations);
    clearTimeout(this._mutationTimer);
    this._mutationTimer = setTimeout(() => this._processMutations(), this.MUTATION_DEBOUNCE);
  },

  _isOurNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.id?.startsWith('kin-')) return true;
    if (node.classList?.contains('kin-original')) return true;
    if (node.classList?.contains('kin-translation-block-wrapper')) return true;
    if (node.classList?.contains('kin-translation')) return true;
    if (node.classList?.contains('kin-error-hint')) return true;
    if (node.classList?.contains('kin-loading-spinner')) return true;
    if (node.dataset?.kinTranslated) return true;
    return false;
  },

  _processMutations() {
    const pending = this._mutationQueue;
    this._mutationQueue = [];

    if (!pending.length) return;

    // Collect all new element nodes
    const newRoots = [];
    for (const mutation of pending) {
      for (const node of mutation.addedNodes) {
        if (this._isOurNode(node)) continue;
        if (node.nodeType === Node.ELEMENT_NODE && node.isConnected) {
          newRoots.push(node);
        }
      }
    }

    if (!newRoots.length) return;

    // Find translatable elements within new nodes
    const newElements = [];
    for (const root of newRoots) {
      this._collectFromSubtree(root, newElements);
    }

    if (!newElements.length) return;

    // Sort by document order
    newElements.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });

    this._translateDynamicElements(newElements);
  },

  // Collect translatable elements from a subtree (reuses same logic as collectTranslatableElements)
  _collectFromSubtree(root, results) {
    const walk = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      if (!node.isConnected) return;
      const tag = node.tagName;
      if (this.SKIP.has(tag)) return;
      if (node.dataset.kinTranslated) return;
      if (node.id && node.id.startsWith('kin-')) return;
      if (this._isNoTranslate(node)) return;
      if (node.classList?.contains('kin-original')) return;
      if (node.classList?.contains('kin-translation-block-wrapper')) return;
      if (node.classList?.contains('kin-error-hint')) return;

      if (node.shadowRoot) {
        for (const child of node.shadowRoot.children) walk(child);
      }

      if (this.TRANSLATABLE.has(tag) && this._isLeafBlock(node)) {
        const text = this._getVisibleText(node);
        if (text && text.length >= 4 && !/^\d+$/.test(text) && !/^[^\w]+$/.test(text)) {
          if (tag === 'DIV' && this._isNavLike(node, text)) return;
          results.push(node);
          return;
        }
      }

      for (const child of node.children) walk(child);
    };

    // Check the root itself
    walk(root);
  },

  async _translateDynamicElements(elements) {
    if (!elements.length) return;

    this._isDynamicTranslation = true;
    elements.forEach(el => { el.dataset.kinTranslated = 'pending'; });

    const batches = [];
    for (let i = 0; i < elements.length; i += this.BATCH_SIZE) {
      batches.push(elements.slice(i, i + this.BATCH_SIZE));
    }

    try {
      await this._translateBatches(batches, Math.min(this.CONCURRENT_BATCHES, 2));
    } finally {
      this._isDynamicTranslation = false;
    }
  },

  // ========== Restore Original Content ==========
  restore() {
    // Stop dynamic observer
    this._stopDynamicObserver();

    document.querySelectorAll(
      '[data-kin-translated="done"], [data-kin-translated="error"], ' +
      '[data-kin-translated="loading"], [data-kin-translated="pending"]'
    ).forEach(el => {
      const kinId = el.dataset.kinId;
      if (kinId !== undefined) {
        const id = parseInt(kinId);
        const fragment = this.originalNodes.get(id);
        if (fragment) {
          while (el.firstChild) el.firstChild.remove();
          el.appendChild(fragment.cloneNode(true));
        }
      }
      delete el.dataset.kinTranslated;
      delete el.dataset.kinId;
    });

    // Remove error hints
    document.querySelectorAll('.kin-error-hint').forEach(el => el.remove());

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
  _isNavLike(el, text) {
    const anchors = el.querySelectorAll('a');
    if (anchors.length === 0) return false;
    if (anchors.length >= 3) return true;
    if (el.getAttribute('role') === 'menu' || el.getAttribute('role') === 'navigation') return true;
    if (el.getAttribute('aria-label')?.toLowerCase().includes('menu')) return true;
    if (el.getAttribute('aria-label')?.toLowerCase().includes('nav')) return true;

    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length >= 5) {
      const avgLen = text.length / lines.length;
      if (avgLen < 15) return true;
    }

    let linkTextLen = 0;
    anchors.forEach(a => { linkTextLen += (a.textContent || '').length; });
    if (text.length > 0 && linkTextLen / text.length > 0.6) return true;

    return false;
  },

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
