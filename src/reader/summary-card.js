/* Kin - Summary Card module
 * Generates a shareable PNG card with AI-summarized news content + QR code.
 * All card layout uses INLINE styles — html2canvas cannot reliably load external CSS.
 */
(function () {
  'use strict';

  const THEMES = {
    default: {
      headerStart: '#E68B6D', headerEnd: '#C86748',
      cardBg: '#FBF0EB', surface: '#FFFFFF',
      text: '#1C1917', textSoft: '#6B6560', textMuted: '#9E9891',
      border: '#E8E4DF', accent: '#D97559',
      pillBg: 'rgba(217,117,89,0.13)', footerBg: '#FAF9F7'
    },
    parchment: {
      headerStart: '#A0896A', headerEnd: '#8B7355',
      cardBg: '#F5F2EB', surface: '#FFFFFF',
      text: '#2D2D2D', textSoft: '#5A5040', textMuted: '#9C907E',
      border: '#DDD8CE', accent: '#8B7355',
      pillBg: 'rgba(139,115,85,0.13)', footerBg: '#F0EBE0'
    },
    classic: {
      headerStart: '#222222', headerEnd: '#111111',
      cardBg: '#FAFAFA', surface: '#FFFFFF',
      text: '#111111', textSoft: '#333333', textMuted: '#777777',
      border: '#DDDDDD', accent: '#111111',
      pillBg: 'rgba(0,0,0,0.08)', footerBg: '#F2F2F2'
    }
  };

  const TRACKING_PARAMS = [/^utm_/i,/^mc_/i,/^fbclid$/i,/^gclid$/i,/^msclkid$/i,/^yclid$/i,/^icid$/i,/^cmpid$/i,/^_ga$/i,/^ref$/i,/^spm$/i,/^scid$/i];
  const QR_URL_MAX_BYTES = 130;

  function byteLen(s) { try { return new TextEncoder().encode(s).length; } catch { return s.length; } }

  function cleanURL(rawUrl) {
    try {
      const u = new URL(rawUrl);
      const drop = [];
      u.searchParams.forEach((_, k) => { if (TRACKING_PARAMS.some(rx => rx.test(k))) drop.push(k); });
      drop.forEach(k => u.searchParams.delete(k));
      u.hash = '';
      let result = u.toString();
      if (byteLen(result) > QR_URL_MAX_BYTES) { u.search = ''; result = u.toString(); }
      if (byteLen(result) > QR_URL_MAX_BYTES) { result = u.origin + u.pathname.slice(0, QR_URL_MAX_BYTES - u.origin.length - 1); }
      return result;
    } catch { return (rawUrl || '').slice(0, QR_URL_MAX_BYTES); }
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function extractOriginalText(article) {
    const parts = [];
    if (article?.standfirst) parts.push(article.standfirst);
    (article?.paragraphs || []).forEach(p => { if (p?.text && p.type !== 'image') parts.push(p.text); });
    return parts.join('\n\n').trim();
  }

  function truncateForLLM(text, max) {
    max = max || 5000;
    if (!text || text.length <= max) return text;
    return text.slice(0, Math.floor(max * 0.65)) + '\n\n[...]\n\n' + text.slice(-Math.floor(max * 0.30));
  }

  function safeJsonParse(raw) {
    if (!raw) return null;
    let s = String(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
    const start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const candidate = s.slice(start, end + 1);
    // 1. Direct parse
    try { return JSON.parse(candidate); } catch {}
    // 2. Fix unescaped control chars inside JSON string values, then parse
    try { return JSON.parse(fixJsonStrings(candidate)); } catch {}
    return null;
  }

  // Escape literal \n \r \t that LLMs put inside JSON string values
  function fixJsonStrings(s) {
    let out = '', inStr = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (c === '\\' && i + 1 < s.length) { out += c + s[++i]; continue; }
        if (c === '"') { inStr = false; out += c; continue; }
        if (c === '\n') { out += '\\n'; continue; }
        if (c === '\r') { out += '\\r'; continue; }
        if (c === '\t') { out += '\\t'; continue; }
        out += c;
      } else {
        if (c === '"') inStr = true;
        out += c;
      }
    }
    return out;
  }

  function normalizeSummary(parsed, fallback) {
    if (!parsed) return fallback;
    const type = (parsed.type === 'list' || parsed.type === 'paragraph') ? parsed.type : null;
    if (!type) return fallback;
    if (type === 'paragraph' && typeof parsed.content === 'string' && parsed.content.trim())
      return { type: 'paragraph', content: parsed.content.trim(), source: 'ai' };
    if (type === 'list' && Array.isArray(parsed.content)) {
      const items = parsed.content.map(x => String(x || '').trim()).filter(Boolean);
      if (items.length) return { type: 'list', content: items.slice(0, 6), source: 'ai' };
    }
    return fallback;
  }

  function buildFallbackSummary(article) {
    if (article?.standfirst)
      return { type: 'paragraph', content: String(article.standfirst).slice(0, 200), source: 'extract' };
    const text = extractOriginalText(article);
    if (text) return { type: 'paragraph', content: text.slice(0, 200) + (text.length > 200 ? '…' : ''), source: 'extract' };
    return { type: 'paragraph', content: '（无可用内容）', source: 'extract' };
  }

  const SUMMARY_LIMITS = {
    paragraphPreferredChunkChars: 220,
    paragraphMaxChunks: 3,
    listItems: 5
  };

  function normalizeSummaryText(text) {
    return String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function splitSummaryParagraphs(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
    let paragraphs = normalized.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (paragraphs.length <= 1) {
      paragraphs = normalized.split(/\n/).map(s => s.trim()).filter(Boolean);
    }
    if (paragraphs.length <= 1 && normalized.length > SUMMARY_LIMITS.paragraphPreferredChunkChars) {
      const chunks = [];
      let rest = normalized;
      while (rest.length > SUMMARY_LIMITS.paragraphPreferredChunkChars && chunks.length < SUMMARY_LIMITS.paragraphMaxChunks - 1) {
        const window = rest.slice(0, SUMMARY_LIMITS.paragraphPreferredChunkChars + 60);
        const candidates = ['。', '！', '？', '.', '!', '?', '；', ';'];
        let cut = -1;
        candidates.forEach(mark => {
          const idx = window.lastIndexOf(mark);
          if (idx >= SUMMARY_LIMITS.paragraphPreferredChunkChars * 0.45) cut = Math.max(cut, idx + 1);
        });
        if (cut < 0) cut = SUMMARY_LIMITS.paragraphPreferredChunkChars;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) chunks.push(rest);
      paragraphs = chunks;
    }
    return paragraphs.slice(0, SUMMARY_LIMITS.paragraphMaxChunks);
  }

  function enforceSummaryLimits(summary) {
    if (!summary) return summary;
    if (summary.type === 'list') {
      const items = (Array.isArray(summary.content) ? summary.content : [])
        .map(item => normalizeSummaryText(item))
        .filter(Boolean)
        .slice(0, SUMMARY_LIMITS.listItems);
      return { ...summary, content: items.length ? items : ['摘要内容不可用。'] };
    }
    const content = normalizeSummaryText(summary.content);
    const paragraphs = splitSummaryParagraphs(content)
      .filter(Boolean);
    return { ...summary, type: 'paragraph', content: paragraphs.join('\n\n') || '摘要内容不可用。' };
  }

  async function callSummaryLLM(payload) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'summary_generate', data: payload }, resp => {
        if (chrome.runtime.lastError) { resolve({ error: chrome.runtime.lastError.message }); return; }
        resolve(resp || { error: 'No response' });
      });
    });
  }

  // ─── Inline-style card builder ───────────────────────────────────────────────
  const CARD_W = 400;
  const FONT_TITLE = "'Noto Serif SC','Source Han Serif SC','Songti SC','SimSun',serif";
  const FONT_BODY = "'Noto Sans SC','Source Han Sans SC','PingFang SC','Microsoft YaHei',sans-serif";
  const FONT_SANS = FONT_BODY;
  const FONT_SERIF = FONT_TITLE;

  const SOURCE_NAMES_ZH = {
    'bloomberg': '彭博', 'wsj': '华尔街日报', 'wall street journal': '华尔街日报',
    'nytimes': '纽约时报', 'new york times': '纽约时报', 'nyt': '纽约时报',
    'ft': '金融时报', 'financial times': '金融时报',
    'economist': '经济学人', 'the economist': '经济学人',
    'scmp': '南华早报', 'south china morning post': '南华早报',
    'new yorker': '纽约客', 'the new yorker': '纽约客'
  };
  const SOURCE_NAMES_EN = {
    'bloomberg': 'Bloomberg', 'wsj': 'The Wall Street Journal',
    'nytimes': 'The New York Times', 'nyt': 'The New York Times',
    'ft': 'Financial Times', 'economist': 'The Economist',
    'scmp': 'South China Morning Post', 'new yorker': 'The New Yorker'
  };

  function resolveSourceName(raw, useChinese) {
    if (!raw) return '';
    const lower = raw.toLowerCase().replace(/[\s\-_.]+/g, ' ').trim();
    const map = useChinese ? SOURCE_NAMES_ZH : SOURCE_NAMES_EN;
    for (const [key, name] of Object.entries(map)) {
      if (lower.includes(key) || key.includes(lower)) return name;
    }
    return raw;
  }

  // Strip meta-commentary phrases from AI output
  const META_PREFIXES = [
    /(?:文章|报道|该文|本文|这篇)\s*(指出|提到|提到|显示|认为|强调|分析|表示|揭示|称)/,
    /(?:According to the article|The article (?:states|notes|points out|suggests|highlights|reports)|It is reported that|据报道|消息称)/,
    /^(?:Overall|In summary|In conclusion|总而言之|综上所述|总的来说)[,，:：]?\s*/
  ];
  function stripMetaCommentary(text) {
    if (!text) return text;
    // Process each paragraph line
    return text.split('\n').map(line => {
      let s = line;
      for (const rx of META_PREFIXES) {
        s = s.replace(rx, '').trim();
      }
      return s;
    }).join('\n').replace(/\n{2,}/g, '\n').trim();
  }

  // Fix name dots: "唐纳德.特朗普" → "唐纳德·特朗普"
  function fixNameDots(title) {
    if (!title) return title;
    return title.replace(/([\u4e00-\u9fff\u3400-\u4dbf])\.([\u4e00-\u9fff\u3400-\u4dbf])/g, '$1·$2');
  }

  // Calculate best title font size
  const TITLE_AREA_W = CARD_W - 40 - 48; // 400 - margin*2 - padding*2 = 312
  const TITLE_MAX_SIZE = 20;
  const TITLE_MIN_SIZE = 16;

  function calcTitleSize(title) {
    if (!title) return TITLE_MAX_SIZE;
    const canvas = document.createElement('canvas').getContext('2d');
    canvas.font = `600 ${TITLE_MAX_SIZE}px ${FONT_TITLE}`;
    const fullWidth = canvas.measureText(title).width;
    if (fullWidth <= TITLE_AREA_W) return TITLE_MAX_SIZE; // fits in one line

    const lineHeight = TITLE_MAX_SIZE * 1.4;
    const estLines = Math.ceil(fullWidth / TITLE_AREA_W);
    if (estLines > 2) return TITLE_MAX_SIZE; // 3+ lines, don't shrink

    // 2 lines: check if second line is short (< 40% of width)
    const secondLineWidth = fullWidth - TITLE_AREA_W;
    if (secondLineWidth < TITLE_AREA_W * 0.4) {
      // Short tail → shrink to fit one line
      const ratio = TITLE_AREA_W / fullWidth;
      const shrunk = Math.floor(TITLE_MAX_SIZE * ratio);
      return Math.max(shrunk, TITLE_MIN_SIZE);
    }
    // Balanced 2-line wrap → keep original size
    return TITLE_MAX_SIZE;
  }

  function el(tag, style, attrs) {
    const node = document.createElement(tag);
    if (style) node.style.cssText = style;
    if (attrs) Object.entries(attrs).forEach(([k,v]) => {
      if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    return node;
  }

  function buildCardElement(data, themeKey) {
    const T = THEMES[themeKey] || THEMES.default;
    const headerBg = themeKey === 'classic'
      ? T.headerStart
      : `linear-gradient(135deg, ${T.headerStart}, ${T.headerEnd})`;

    // ── Root card with subtle tinted background ──
    const tintBg = themeKey === 'classic' ? '#F0F0F0' : (themeKey === 'parchment' ? '#F0EBE0' : '#F8F0EA');
    const card = el('div',
      `width:${CARD_W}px;min-width:${CARD_W}px;max-width:${CARD_W}px;font-family:${FONT_SANS};background:${tintBg};` +
      `border-radius:0;overflow:hidden;box-sizing:border-box;` +
      `box-shadow:0 8px 32px rgba(28,25,23,.10),0 4px 8px rgba(28,25,23,.06);`
    );

    // ── Top: centered Kin logo ──
    const topLogo = el('div',
      `text-align:center;padding:20px 0 12px;`
    );
    const svgLogoLarge = `<svg width="40" height="40" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="44" height="44" rx="11" fill="url(#cardLogoGrad)"/>` +
      `<path d="M14 10L14 34M14 22L30 10M14 22L30 34" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<defs><linearGradient id="cardLogoGrad" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0%" stop-color="${T.headerStart}"/><stop offset="100%" stop-color="${T.headerEnd}"/>` +
      `</linearGradient></defs></svg>`;
    topLogo.innerHTML = svgLogoLarge;
    card.appendChild(topLogo);

    // ── White rounded content card ──
    const whiteCard = el('div',
      `margin:0 20px;padding:22px 24px 16px;background:#FFFFFF;` +
      `border-radius:12px;box-sizing:border-box;overflow:hidden;`
    );

    const titleSize = calcTitleSize(fixNameDots(data.title));
    const titleEl = el('h1',
      `margin:0 0 8px;padding:0;font-family:${FONT_TITLE};font-size:${titleSize}px;font-weight:600;` +
      `line-height:1.4;letter-spacing:-0.02em;text-align:center;color:${T.text};`,
      { text: fixNameDots(data.title) }
    );
    whiteCard.appendChild(titleEl);

    // Date + decorative divider
    if (data.date) {
      const dateLine = el('div',
        `text-align:center;margin-bottom:6px;font-size:12px;color:${T.textMuted};font-variant-numeric:tabular-nums;`,
        { text: data.date }
      );
      whiteCard.appendChild(dateLine);
    }
    const divider = el('div',
      `text-align:center;margin:0 auto 14px;font-size:10px;color:${T.accent};letter-spacing:6px;line-height:1;`,
      { text: '—— ◆ ——' }
    );
    whiteCard.appendChild(divider);

    // Summary body
    if (data.summary.type === 'paragraph') {
      const paragraphs = splitSummaryParagraphs(data.summary.content);
      paragraphs.forEach((text, i) => {
        const p = el('p',
          `margin:0 0 ${i < paragraphs.length - 1 ? '6px' : '0'};font-family:${FONT_BODY};font-size:14px;font-weight:300;line-height:1.7;color:${T.text};` +
          `letter-spacing:-0.01em;word-break:break-word;overflow-wrap:break-word;text-align:justify;text-indent:2em;` +
          `width:100%;box-sizing:border-box;`,
          { text }
        );
        whiteCard.appendChild(p);
      });
    } else {
      const ol = el('ol', 'margin:0;padding:0;list-style:none;');
      data.summary.content.slice(0, SUMMARY_LIMITS.listItems).forEach((item, i) => {
        const li = el('li', 'display:flex;align-items:baseline;gap:8px;margin-bottom:8px;');
        const num = el('span',
          `flex:0 0 22px;font-family:${FONT_SERIF};font-size:16px;font-weight:700;` +
          `color:${T.accent};line-height:1;`,
          { text: (i + 1) + '.' }
        );
        const txt = el('span',
          `flex:1 1 auto;font-family:${FONT_BODY};font-size:14px;font-weight:300;line-height:1.7;color:${T.text};word-break:break-word;`,
          { text: item }
        );
        li.appendChild(num); li.appendChild(txt);
        ol.appendChild(li);
      });
      whiteCard.appendChild(ol);
    }

    // Source attribution line
    const sourceName = resolveSourceName(data.source, data.useChinese);
    if (sourceName) {
      const sourceLine = el('div',
        `text-align:right;margin-top:10px;font-size:12px;color:${T.textMuted};` +
        `font-style:italic;`,
        { text: `—— ${sourceName}` }
      );
      whiteCard.appendChild(sourceLine);
    }

    // QR section inside white card
    const qrRow = el('div',
      `display:flex;align-items:center;justify-content:space-between;` +
      `margin-top:10px;padding-top:8px;border-top:1px solid #F0EEEB;` +
      `width:100%;box-sizing:border-box;`
    );
    const qrHint = el('span',
      `font-size:11px;color:${T.textMuted};letter-spacing:.01em;`,
      { text: '长按扫码阅读原文 →' }
    );
    const qrBox = el('div',
      `flex:0 0 auto;width:56px;height:56px;background:#FFFFFF;` +
      `border-radius:6px;border:1px solid #EEEAE5;padding:3px;` +
      `display:flex;align-items:center;justify-content:center;box-sizing:border-box;`,
      { html: data.qrSvg }
    );
    const qrSvgEl = qrBox.querySelector('svg');
    if (qrSvgEl) qrSvgEl.style.cssText = 'width:100%;height:100%;display:block;';
    qrRow.appendChild(qrHint); qrRow.appendChild(qrBox);
    whiteCard.appendChild(qrRow);

    card.appendChild(whiteCard);

    // ── Gap between white card and footer ──
    const gap = el('div', `height:14px;background:${tintBg};`);
    card.appendChild(gap);

    // ── Footer brand bar ──
    const footer = el('div',
      `display:flex;align-items:center;justify-content:center;gap:8px;` +
      `padding:18px 24px;background:${headerBg};box-sizing:border-box;`
    );
    const svgLogoSmall = `<svg width="20" height="20" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="44" height="44" rx="11" fill="rgba(255,255,255,0.20)"/>` +
      `<path d="M14 10L14 34M14 22L30 10M14 22L30 34" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`;
    const footBrand = el('div',
      `font-family:${FONT_SANS};font-size:12px;font-weight:500;` +
      `color:rgba(255,255,255,.9);letter-spacing:.08em;display:flex;align-items:center;gap:8px;`
    );
    footBrand.innerHTML = svgLogoSmall;
    const footText = el('span', '', { text: 'Kin · 金  ·  Beyond Word · Into Meaning.' });
    footBrand.appendChild(footText);
    footer.appendChild(footBrand);

    card.appendChild(footer);

    return card;
  }

  // ─── html2canvas Export ───────────────────────────────────────────────────────
  async function ensureExportLibs() {
    if (window.html2canvas) return;
    const res = await new Promise(r => chrome.runtime.sendMessage({ type: 'ensure_export_libs' }, r));
    if (res?.error) throw new Error('无法加载导出库：' + res.error);
  }

  async function renderCardToCanvas(cardEl) {
    await ensureExportLibs();
    if (!window.html2canvas) throw new Error('html2canvas 未就绪');
    // Force layout recalc before capture
    void cardEl.offsetWidth;
    const captureHeight = Math.ceil(Math.max(cardEl.offsetHeight, cardEl.scrollHeight, cardEl.getBoundingClientRect().height));
    return window.html2canvas(cardEl, {
      backgroundColor: null,
      scale: 3,
      useCORS: true,
      logging: false,
      width: CARD_W,
      height: captureHeight,
      windowWidth: CARD_W,
      windowHeight: captureHeight,
      scrollX: 0,
      scrollY: 0
    });
  }

  function downloadCanvasAsPNG(canvas, filename) {
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  function safeFilename(title) {
    const t = String(title || 'kin-card')
      .replace(/[\\/:*?"<>|\n\r\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0, 40);
    return `kin-${t || 'card'}.png`;
  }

  async function copyCanvasToClipboard(canvas) {
    try {
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      if (!blob) return false;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch { return false; }
  }

  function mountOffscreen(cardEl) {
    // Force exact width on card so html2canvas reads it correctly offscreen
    cardEl.style.display = 'block';
    cardEl.style.width = CARD_W + 'px';
    cardEl.style.minWidth = CARD_W + 'px';
    cardEl.style.maxWidth = CARD_W + 'px';
    const stage = document.createElement('div');
    stage.style.cssText = `position:fixed;left:-${CARD_W + 200}px;top:8px;width:${CARD_W}px;display:block;pointer-events:none;z-index:-1;`;
    stage.appendChild(cardEl);
    document.documentElement.appendChild(stage);
    return stage;
  }

  // ─── Get full datetime from original page ─────────────────────────────────────
  function extractFullDate() {
    const selectors = ['time', '[itemprop="datePublished"]', '[class*="date"]', '[class*="time"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const dt = el.getAttribute('datetime') || el.getAttribute('content');
        if (dt) {
          const d = new Date(dt);
          if (!isNaN(d.getTime())) {
            const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const h = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            return `${y}-${m}-${day} ${h}:${min} ${weekdays[d.getDay()]}`;
          }
        }
      }
    }
    return null;
  }

  // ─── Extract translated content from reader DOM ───────────────────────────────
  function extractTranslatedText() {
    const reader = document.getElementById('kin-reader');
    if (!reader) return '';
    const parts = [];
    reader.querySelectorAll('.kin-r-paragraph').forEach(p => {
      const t = p.querySelector('.kin-r-translation');
      if (t) parts.push(t.textContent.trim());
    });
    return parts.join('\n\n').trim();
  }

  function hasTranslatedReaderContent() {
    const reader = document.getElementById('kin-reader');
    if (!reader) return false;
    return !!reader.querySelector('.kin-r-title .kin-r-translation, .kin-r-standfirst .kin-r-translation, .kin-r-paragraph .kin-r-translation');
  }

  function getTranslatedTitle() {
    const reader = document.getElementById('kin-reader');
    if (!reader) return null;
    const titleEl = reader.querySelector('.kin-r-title');
    if (!titleEl) return null;
    const t = titleEl.querySelector('.kin-r-translation');
    const translated = t ? t.textContent.trim() : '';
    if (translated) return translated;
    if (titleEl.classList.contains('kin-r-translated')) {
      const original = titleEl.querySelector('.kin-r-original');
      const fallback = String(titleEl.textContent || '').replace(String(original?.textContent || ''), '').trim();
      if (fallback) return fallback;
    }
    return null;
  }

  // ─── Data Builder ─────────────────────────────────────────────────────────────
  // opts: { translated: bool, translateMode: 'bilingual'|'target' }
  async function buildCardData(article, opts) {
    opts = opts || {};
    const url = cleanURL(article.url || location.href);
    if (!window.KinQR) throw new Error('QR 库未加载');
    const matrix = window.KinQR.encode(url, { ecLevel: 'L' });
    const qrSvg = window.KinQR.renderSVG(matrix, { moduleSize: 6, quietZone: 4, fg: '#1C1917', bg: '#FFFFFF' });

    const useTranslated = opts.translated === true || hasTranslatedReaderContent();
    let summaryLang = null;
    let cardTitle = article.title || '';
    let textForLLM = '';

    if (useTranslated) {
      summaryLang = await new Promise(r => chrome.storage.local.get('targetLang', d => r(d.targetLang || 'zh-CN')));
      const translatedTitle = getTranslatedTitle();
      if (translatedTitle) cardTitle = translatedTitle;
      const translatedBody = extractTranslatedText();
      console.log('[Kin Summary] translated mode, title:', cardTitle.slice(0, 40), 'body len:', translatedBody.length);
      textForLLM = truncateForLLM(translatedBody || extractOriginalText(article));
    } else {
      console.log('[Kin Summary] original mode');
      textForLLM = truncateForLLM(extractOriginalText(article));
    }

    let summary;
    try {
      const resp = await callSummaryLLM({
        text: textForLLM,
        lang: summaryLang,
        contextHints: { source: article.source, title: cardTitle }
      });
      console.log('[Kin Summary] LLM resp keys:', Object.keys(resp || {}), 'raw preview:', String(resp?.raw || '').slice(0, 300));
      if (resp?.error) throw new Error(resp.error);
      const raw = (resp?.raw || resp?.content || '').trim();
      if (raw) {
        const cleaned = stripMetaCommentary(raw);
        // Detect list vs paragraph from AI output
        const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
        const bulletLines = lines.filter(l => /^[•\-\*]\s/.test(l) || /^\d+[.)]\s/.test(l));
        if (bulletLines.length >= 3) {
          const items = bulletLines.map(l => l.replace(/^[•\-\*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);
          summary = enforceSummaryLimits({ type: 'list', content: items, source: 'ai' });
        } else {
          summary = enforceSummaryLimits({ type: 'paragraph', content: cleaned.replace(/[•\-\*]\s/g, '').replace(/\n{2,}/g, '\n').trim(), source: 'ai' });
        }
        console.log('[Kin Summary] parsed as', summary.type, 'len:', summary.type === 'paragraph' ? summary.content.length : summary.content.length + ' items');
      }
    } catch (e) {
      console.warn('[Kin Summary] AI failed:', e.message);
    }
    if (!summary) {
      summary = enforceSummaryLimits({ type: 'paragraph', content: textForLLM.slice(0, 400), source: 'extract' });
    }
    summary = enforceSummaryLimits(summary);

    // Format date: prefer full datetime from page DOM, fallback to article.date
    let dateText = extractFullDate();
    if (!dateText && article.date) {
      try {
        const d = new Date(article.date.replace(/([A-Z][a-z]{2})\.?/g, '$1'));
        if (!isNaN(d.getTime())) {
          const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const h = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          dateText = `${y}-${m}-${day} ${h}:${min} ${weekdays[d.getDay()]}`;
        }
      } catch {}
    }
    if (!dateText) dateText = article.date || '';

    return {
      title: cardTitle,
      source: article.source || '',
      useChinese: useTranslated,
      date: dateText,
      url, qrSvg, summary
    };
  }

  async function exportCard(cardData, themeKey) {
    const cardEl = buildCardElement(cardData, themeKey);
    const stage = mountOffscreen(cardEl);
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = await renderCardToCanvas(cardEl);
      const copied = await copyCanvasToClipboard(canvas);
      downloadCanvasAsPNG(canvas, safeFilename(cardData.title));
      if (copied) console.log('[Kin Summary] image copied to clipboard');
    } finally {
      stage.remove();
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  window.KinSummaryCard = {
    generate: async function (article, themeKey, opts) {
      const data = await buildCardData(article, opts);
      await exportCard(data, themeKey);
    }
  };
})();
