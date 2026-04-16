// Kin Selection Translation — Select text → translate icon → popup
const KinSelection = {
  enabled: true,
  icon: null,
  popup: null,
  _bound: false,
  _hideTimer: null,

  init(settings) {
    this.settings = settings;
    this.enabled = settings.selectionTranslate !== false;
    if (!this.enabled) return;
    if (!this._bound) { this.bindEvents(); this._bound = true; }
  },

  bindEvents() {
    // Show icon after text selection
    document.addEventListener('mouseup', (e) => {
      if (this._isKinElement(e.target)) return;
      // Delay to allow selection to finalize
      setTimeout(() => {
        if (this.popup) return; // popup visible, don't show icon
        const sel = window.getSelection();
        const text = sel?.toString().trim();
        if (text && text.length >= 2 && text.length <= 5000) {
          this.showIcon(sel, e);
        } else {
          this.hideIcon();
        }
      }, 10);
    });

    // Hide on click outside
    document.addEventListener('mousedown', (e) => {
      if (this._isKinElement(e.target)) return;
      if (this.icon && !this.icon.contains(e.target)) {
        this.hideIcon();
      }
      if (this.popup && !this.popup.contains(e.target)) {
        this.hidePopup();
      }
    });

    // Hide on scroll
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        this.hideIcon();
        this.hidePopup();
      }, 150);
    }, { passive: true });

    // Hide on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.hideIcon(); this.hidePopup(); }
    });
  },

  _isKinElement(el) {
    if (!el) return false;
    const id = el.id || '';
    const cls = typeof el.className === 'string' ? el.className : '';
    return id.startsWith('kin-') || cls.includes('kin-selection') || cls.includes('kin-sidebar');
  },

  showIcon(selection, event) {
    this.hideIcon();

    const icon = document.createElement('div');
    icon.className = 'kin-selection-icon';
    icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>';

    {
      // Position at mouse cursor bottom-right
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
      icon.style.top = (event.clientY + scrollTop + 12) + 'px';
      icon.style.left = (event.clientX + scrollLeft + 12) + 'px';
    }

    icon.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = window.getSelection()?.toString().trim();
      if (text) this.translateSelection(text);
    });

    document.body.appendChild(icon);
    this.icon = icon;
  },

  hideIcon() {
    if (this.icon) {
      this.icon.remove();
      this.icon = null;
    }
  },

  async translateSelection(text) {
    this.hideIcon();

    // Get selection rect for popup positioning
    let targetRect;
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        targetRect = sel.getRangeAt(0).getBoundingClientRect();
      }
    } catch { /* ignore */ }

    if (!targetRect) {
      targetRect = { top: 100, bottom: 120, left: 100, width: 200 };
    }

    // Show loading state
    this.showPopup(targetRect, null, true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'translate',
        data: {
          texts: [text],
          to: this.settings?.targetLang || 'zh-CN',
          from: this.settings?.sourceLang || 'auto'
        }
      });

      if (response?.translations?.[0]) {
        this.showPopup(targetRect, response.translations[0], false, text);
      } else if (response?.error) {
        this.showPopup(targetRect, response.error, false, null, true);
      }
    } catch (e) {
      this.showPopup(targetRect, '翻译失败: ' + (e.message || ''), false, null, true);
    }
  },

  showPopup(rect, translation, isLoading, original, isError) {
    this.hidePopup();

    const popup = document.createElement('div');
    popup.className = 'kin-selection-popup';

    if (isLoading) {
      popup.innerHTML = '<div class="kin-selection-loading"><span class="kin-selection-spinner"></span>翻译中...</div>';
    } else if (isError) {
      popup.innerHTML = `<div class="kin-selection-error">${this._esc(translation)}</div>`;
    } else {
      popup.innerHTML = `
        <div class="kin-selection-translation">${this._esc(translation)}</div>
        <div class="kin-selection-actions">
          <button class="kin-selection-copy" title="复制译文">${copyIcon()}</button>
          <button class="kin-selection-replace" title="替换选中文本">替换</button>
        </div>`;

      // Copy button
      popup.querySelector('.kin-selection-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(translation).catch(() => {});
        this.hidePopup();
      });

      // Replace button
      popup.querySelector('.kin-selection-replace').addEventListener('click', () => {
        this._replaceSelection(translation);
        this.hidePopup();
      });
    }

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    const maxWidth = 340;
    const pageWidth = window.innerWidth;

    let top = rect.bottom + scrollTop + 8;
    let left = rect.left + scrollLeft;

    // Clamp to viewport
    if (left + maxWidth > pageWidth) left = pageWidth - maxWidth - 10;
    if (left < 10) left = 10;

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
    popup.style.maxWidth = maxWidth + 'px';

    document.body.appendChild(popup);
    this.popup = popup;
  },

  hidePopup() {
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
  },

  _replaceSelection(text) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    sel.removeAllRanges();
  },

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};

function copyIcon() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
}
