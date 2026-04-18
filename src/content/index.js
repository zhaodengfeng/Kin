// Kin Content Script — Entry Point
// Dual-mode: Universal page translation + optional Reader mode for news sites
(function() {
  'use strict';

  // ========== Global State ==========
  let pageTranslated = false;
  let translating = false;
  let currentMode = 'dual';
  let readerEnabled = false;
  let settings = {};
  let adapters = [];
  let currentAdapter = null;
  let lastUrl = location.href;
  let urlChangeTimer = null;
  let _titleObserver = null;
  let _messageListenerBound = false;

  // ========== Settings ==========
  async function loadSettings() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.warn('[Kin] get_settings timed out, using defaults');
        resolve({});
      }, 3000);
      try {
        chrome.runtime.sendMessage({ type: 'get_settings' }, (data) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            console.warn('[Kin] get_settings error:', chrome.runtime.lastError.message);
            resolve({});
            return;
          }
          resolve(data || {});
        });
      } catch (e) {
        clearTimeout(timer);
        resolve({});
      }
    });
  }

  // ========== Adapter Management ==========
  function createAdapters() {
    if (typeof BaseAdapter === 'undefined') return;
    const adaptersList = [];
    try { if (typeof BloombergAdapter !== 'undefined') adaptersList.push(new BloombergAdapter()); } catch(e) { console.warn('[Kin] BloombergAdapter failed:', e.message); }
    try { if (typeof WSJAdapter !== 'undefined') adaptersList.push(new WSJAdapter()); } catch(e) { console.warn('[Kin] WSJAdapter failed:', e.message); }
    try { if (typeof NYTimesAdapter !== 'undefined') adaptersList.push(new NYTimesAdapter()); } catch(e) { console.warn('[Kin] NYTimesAdapter failed:', e.message); }
    try { if (typeof FTAdapter !== 'undefined') adaptersList.push(new FTAdapter()); } catch(e) { console.warn('[Kin] FTAdapter failed:', e.message); }
    try { if (typeof EconomistAdapter !== 'undefined') adaptersList.push(new EconomistAdapter()); } catch(e) { console.warn('[Kin] EconomistAdapter failed:', e.message); }
    try { if (typeof SCMPAdapter !== 'undefined') adaptersList.push(new SCMPAdapter()); } catch(e) { console.warn('[Kin] SCMPAdapter failed:', e.message); }
    try { if (typeof NewYorkerAdapter !== 'undefined') adaptersList.push(new NewYorkerAdapter()); } catch(e) { console.warn('[Kin] NewYorkerAdapter failed:', e.message); }
    adapters = adaptersList;
  }

  function selectAdapter(url) {
    currentAdapter = null;
    for (const adapter of adapters) {
      if (adapter.matches(url)) {
        currentAdapter = adapter;
        break;
      }
    }
  }

  // ========== SPA Navigation Watcher ==========
  function installNavigationWatcher() {
    const origPushState = history.pushState;
    history.pushState = function() {
      origPushState.apply(this, arguments);
      scheduleUrlChange();
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function() {
      origReplaceState.apply(this, arguments);
      scheduleUrlChange();
    };

    window.addEventListener('popstate', () => scheduleUrlChange());
    window.addEventListener('hashchange', () => scheduleUrlChange());

    // Navigation API (Chrome 105+)
    if (window.navigation) {
      window.navigation.addEventListener('navigate', () => setTimeout(scheduleUrlChange, 100));
    }

    // MutationObserver on <title> as fallback
    const titleEl = document.querySelector('title');
    if (titleEl) {
      _titleObserver = new MutationObserver(() => scheduleUrlChange());
      _titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }
  }

  function scheduleUrlChange() {
    // Debounce: only fire if URL actually changed
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    clearTimeout(urlChangeTimer);
    urlChangeTimer = setTimeout(() => onUrlChange(location.href), 300);
  }

  function onUrlChange(url) {
    // Disconnect title observer and re-install for new page (P1-3)
    if (_titleObserver) { _titleObserver.disconnect(); _titleObserver = null; }
    const titleEl = document.querySelector('title');
    if (titleEl) {
      _titleObserver = new MutationObserver(() => scheduleUrlChange());
      _titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    // If page was translated and URL changed (SPA navigation), restore first
    if (pageTranslated && typeof KinTranslator !== 'undefined') {
      KinTranslator._stopDynamicObserver();
      KinTranslator.restore();
      pageTranslated = false;
      translating = false;
      if (typeof KinFloatBall !== 'undefined') {
        KinFloatBall.setTranslating(false);
        KinFloatBall.setTranslated(false);
      }
    }

    if (adapters.length) {
      selectAdapter(url);
      if (typeof KinFloatBall !== 'undefined') {
        KinFloatBall.updateState({
          isNewsSite: !!currentAdapter,
          isArticle: currentAdapter?.isArticlePage() || false,
          readerEnabled: readerEnabled
        });
      }
    }

    // Check always-translate for new URL
    const alwaysUrls = Array.isArray(settings.alwaysTranslateUrls) ? settings.alwaysTranslateUrls : [];
    if (alwaysUrls.length > 0) {
      const host = location.hostname;
      if (alwaysUrls.some(p => host.includes(p) || location.href.includes(p))) {
        setTimeout(() => togglePageTranslation(), 500);
      }
    }
  }

  // ========== Float Ball Action Router ==========
  function installActionRouter() {
    window.addEventListener('kin-action', (e) => {
      const action = e.detail?.action;
      switch (action) {
        case 'toggle_translate':
          togglePageTranslation();
          break;
        case 'toggle_mode':
          toggleTranslationMode();
          break;
        case 'open_reader':
          openReader();
          break;
      }
    });
  }

  // ========== Initialize ==========
  async function init() {
    // CRITICAL: Register message listener FIRST, before any async work.
    // If loadSettings() hangs, at least ping/toggle_translate still respond.
    if (!_messageListenerBound) {
      chrome.runtime.onMessage.addListener(handleMessage);
      _messageListenerBound = true;
    }

    document.documentElement.setAttribute('data-kin-ready', '1');

    try {
      settings = await loadSettings();
    } catch (e) {
      console.warn('[Kin] loadSettings failed, using defaults:', e.message);
      settings = {};
    }

    readerEnabled = settings.readerEnabled === true;
    currentMode = settings.translationMode || 'dual';

    // Detect news site adapters — poll until the second content script loads them
    if (typeof BaseAdapter !== 'undefined') {
      createAdapters();
      selectAdapter(location.href);
    } else {
      let adapterAttempts = 0;
      const waitForAdapters = () => {
        if (typeof BaseAdapter !== 'undefined') {
          createAdapters();
          selectAdapter(location.href);
          if (typeof KinFloatBall !== 'undefined') {
            KinFloatBall.updateState({
              isNewsSite: !!currentAdapter,
              isArticle: currentAdapter?.isArticlePage() || false,
              readerEnabled: readerEnabled
            });
          }
          return;
        }
        adapterAttempts++;
        if (adapterAttempts < 50) setTimeout(waitForAdapters, 200);
      };
      waitForAdapters();
    }

    // Init float ball FIRST — always visible even if other modules fail
    if (typeof KinFloatBall !== 'undefined') {
      try {
        KinFloatBall.init({
          isNewsSite: !!currentAdapter,
          isArticle: currentAdapter?.isArticlePage() || false,
          readerEnabled: readerEnabled,
          posY: settings.floatBallPosY || 335,
          settings: settings,
        });
      } catch (e) {
        console.warn('[Kin] FloatBall init error:', e.message);
      }
    }

    // Install watchers
    installNavigationWatcher();
    installActionRouter();

    // Init modules (each wrapped to prevent cascading failures)
    try { if (typeof KinTranslator !== 'undefined') KinTranslator.init(settings); } catch (e) { console.warn('[Kin] Translator init error:', e.message); }
    try { if (typeof KinHover !== 'undefined') KinHover.init(settings); } catch (e) { console.warn('[Kin] Hover init error:', e.message); }
    try { if (typeof KinSelection !== 'undefined') KinSelection.init(settings); } catch (e) { console.warn('[Kin] Selection init error:', e.message); }
    try { if (typeof KinSidebar !== 'undefined') KinSidebar.init(settings); } catch (e) { console.warn('[Kin] Sidebar init error:', e.message); }

    // Auto-translate for always-translate URLs
    const alwaysUrls = Array.isArray(settings.alwaysTranslateUrls) ? settings.alwaysTranslateUrls : [];
    if (alwaysUrls.length > 0) {
      const host = location.hostname;
      if (alwaysUrls.some(p => host.includes(p) || location.href.includes(p))) {
        setTimeout(() => togglePageTranslation(), 800);
      }
    }
  }

  // ========== Message Handler ==========
  function handleMessage(msg, sender, sendResponse) {
    switch (msg.type) {
      case 'ping':
        sendResponse({
          ok: true,
          isArticle: currentAdapter?.isArticlePage() || false,
          adapter: currentAdapter?.name || null,
          readerEnabled: readerEnabled,
          pageTranslated: pageTranslated,
          translating: translating
        });
        return;

      case 'toggle_translate':
        togglePageTranslation().then(() => sendResponse({ ok: true }));
        return true;

      case 'toggle_mode':
        toggleTranslationMode();
        sendResponse({ ok: true });
        return;

      case 'toggle_hover':
        if (typeof KinHover !== 'undefined') {
          KinHover.toggle();
          KinToast.info(KinHover.enabled ? '悬浮翻译已启用' : '悬浮翻译已关闭');
        }
        sendResponse({ ok: true });
        return;

      case 'open_reader':
        if (currentAdapter) openReader();
        else KinToast.warning('当前页面不支持阅读模式');
        sendResponse({ ok: true });
        return;
    }
  }

  // ========== Page Translation ==========
  async function togglePageTranslation() {
    if (typeof KinTranslator === 'undefined') return;

    if (pageTranslated) {
      KinTranslator.restore();
      pageTranslated = false;
      if (typeof KinFloatBall !== 'undefined') {
        KinFloatBall.setTranslating(false);
        KinFloatBall.setTranslated(false);
      }
    } else {
      // If on a supported news site and reader mode is enabled, open reader instead of inline page translation
      if (currentAdapter && readerEnabled) {
        openReader();
        return;
      }

      translating = true;
      if (typeof KinFloatBall !== 'undefined') KinFloatBall.setTranslating(true);
      try {
        await KinTranslator.translatePage();
        pageTranslated = true;
        if (typeof KinFloatBall !== 'undefined') KinFloatBall.setTranslated(true);
      } catch (e) {
        KinToast.error('翻译失败: ' + (e.message || '未知错误'));
      }
      translating = false;
      if (typeof KinFloatBall !== 'undefined') KinFloatBall.setTranslating(false);
    }
  }

  // ========== Translation Mode Toggle ==========
  function toggleTranslationMode() {
    currentMode = currentMode === 'dual' ? 'translation' : 'dual';
    document.body.dataset.kinState = currentMode === 'dual' ? 'dual' : 'translation';
    KinToast.info(currentMode === 'dual' ? '双语对照模式' : '仅显示译文');
    chrome.runtime.sendMessage({
      type: 'save_settings',
      data: { translationMode: currentMode }
    }).catch(() => {});
  }

  // ========== Reader ==========
  async function openReader() {
    if (!currentAdapter) return;
    if (typeof ReaderRenderer === 'undefined') return;
    if (ReaderRenderer.active) return;

    // Stale overlay cleanup
    const staleOverlay = document.getElementById('kin-reader');
    if (staleOverlay) staleOverlay.remove();
    ReaderRenderer.active = false;
    ReaderRenderer.translated = false;
    ReaderRenderer.overlay = null;

    let paragraphs;
    try {
      paragraphs = currentAdapter.getParagraphs();
    } catch (e) {
      if (typeof KinToast !== 'undefined') KinToast.error('Failed to extract article: ' + e.message);
      return;
    }

    if (!paragraphs || paragraphs.length === 0) {
      if (typeof KinToast !== 'undefined') KinToast.warning('Failed to extract article content');
      return;
    }

    try {
      await ReaderRenderer._loadTheme();
      ReaderRenderer.render({
        title: currentAdapter.getTitle(),
        standfirst: currentAdapter.getStandfirst(),
        author: currentAdapter.getAuthor(),
        date: currentAdapter.getPublishDate(),
        source: currentAdapter.name,
        url: currentAdapter.getURL(),
        featuredImage: currentAdapter.getFeaturedImage(),
        paragraphs: paragraphs,
      });
    } catch (e) {
      if (typeof KinToast !== 'undefined') KinToast.error('Reader failed: ' + e.message);
    }
  }

  // ========== Boot ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
