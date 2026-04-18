// Kin — shared HTML/attribute escape helpers
// Loaded in service worker (importScripts), content scripts, popup, options, reader.
// IMPORTANT: html() is safe inside text nodes only. For `attr="${...}"` use attr().
(function (root) {
  'use strict';

  const ATTR_MAP = { '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' };

  const KinEscape = {
    html(str) {
      if (str === null || str === undefined) return '';
      const d = typeof document !== 'undefined' ? document.createElement('div') : null;
      if (d) { d.textContent = String(str); return d.innerHTML; }
      return String(str).replace(/[&<>]/g, c => ATTR_MAP[c]);
    },
    attr(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&"'<>]/g, c => ATTR_MAP[c]);
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = KinEscape;
  root.KinEscape = KinEscape;
})(typeof self !== 'undefined' ? self : this);
