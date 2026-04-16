// Kin Toast Notification System (审查 P3-6: 统一提示)
const KinToast = {
  _container: null,

  _ensureContainer() {
    if (this._container?.isConnected) return;
    this._container = document.createElement('div');
    this._container.id = 'kin-toast-container';
    this._container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;pointer-events:none;display:flex;flex-direction:column;gap:8px;';
    document.documentElement.appendChild(this._container);
  },

  show(message, type = 'info', duration = 3000) {
    this._ensureContainer();
    const toast = document.createElement('div');
    toast.className = `kin-toast kin-toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      pointer-events:auto;
      padding:10px 16px;
      border-radius:8px;
      font-size:13px;
      font-family:system-ui,-apple-system,sans-serif;
      line-height:1.4;
      max-width:320px;
      word-break:break-word;
      box-shadow:0 4px 12px rgba(0,0,0,0.15);
      opacity:0;
      transform:translateX(20px);
      transition:all 300ms ease;
    `;
    // Type-specific styles
    const styles = {
      info:    'background:#1A1A1A;color:#F5F5F5;',
      success: 'background:#34C759;color:#FFFFFF;',
      error:   'background:#FF3B30;color:#FFFFFF;',
      warning: 'background:#FF9500;color:#FFFFFF;',
    };
    toast.style.cssText += styles[type] || styles.info;

    this._container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  info(msg, duration) { this.show(msg, 'info', duration); },
  success(msg, duration) { this.show(msg, 'success', duration); },
  error(msg, duration) { this.show(msg, 'error', duration || 5000); },
  warning(msg, duration) { this.show(msg, 'warning', duration); },
};
