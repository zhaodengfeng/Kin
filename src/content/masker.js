// Kin Sensitive Information Masker (lightweight regex, replaces 12MB+ WASM)
const KinMasker = {
  patterns: [
    { type: 'phone',      regex: /1[3-9]\d{9}/g },
    { type: 'bank',       regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
    { type: 'email',      regex: /[\w.-]+@[\w.-]+\.\w+/g },
    { type: 'idcard',     regex: /\b\d{17}[\dXx]\b/g },
    { type: 'password',   regex: /(?:password|passwd|pwd|密码)[:\s=]+\S+/gi },
    { type: 'privatekey', regex: /0x[0-9a-fA-F]{64}/g },
  ],
  placeholder: '[KIN_{type}_{id}]',

  // Mask sensitive info in text, returns { masked, map }
  mask(text) {
    if (!text || typeof text !== 'string') return { masked: text || '', map: [] };
    const map = [];
    let masked = text;
    for (const { type, regex } of this.patterns) {
      regex.lastIndex = 0;
      masked = masked.replace(regex, (match) => {
        const id = map.length;
        map.push({ id, type, original: match });
        return `[KIN_${type}_${id}]`;
      });
    }
    return { masked, map };
  },

  // Restore placeholders in translated text
  restore(text, map) {
    if (!text || !map || !map.length) return text || '';
    let restored = text;
    for (const { id, type, original } of map) {
      restored = restored.replace(`[KIN_${type}_${id}]`, original);
    }
    return restored;
  }
};
