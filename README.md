# Kin — Translate & Read

> Beyond Word. Into Meaning.

A Chrome MV3 extension for elegant page translation and immersive reading — inspired by 沉浸式翻译, built for clarity and speed.

## Features

- **Page Translation** — Translate entire pages with one click, bilingual or translation-only mode
- **Hover Translation** — Hold Ctrl/Cmd and hover over any paragraph to read it translated inline
- **Selection Translation** — Select text to get instant translation in a clean popup
- **Reader Mode** — Distraction-free reading for major news sites (Bloomberg, WSJ, NYTimes, FT, Economist, SCMP, New Yorker)
- **Export** — Screenshot (PNG/JPEG) and PDF export with consistent on-screen styling
- **14+ Translation Providers** — Google, DeepL, OpenAI, Claude, Qwen, Gemini, and more
- **Two Visual Themes** — Kin (warm cream background, golden accent) and Classic (stark newspaper style)

## Install

1. Download the latest release zip from [Releases](https://github.com/zhaodengfeng/Kin/releases)
2. Open `chrome://extensions/` and enable **Developer mode**
3. Click **Load unpacked** and select the extracted folder

Or clone this repo and load `src/` directly:

```bash
git clone https://github.com/zhaodengfeng/Kin.git
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+A` | Toggle page translation |
| `Alt+S` | Toggle bilingual / translation-only mode |
| `Alt+R` | Enter/exit reader mode |

## Supported News Sites

| Site | Reader | Auto-detect |
|------|--------|-------------|
| Bloomberg | Yes | Yes |
| WSJ | Yes | Yes |
| NYTimes | Yes | Yes |
| FT | Yes | Yes |
| The Economist | Yes | Yes |
| SCMP | Yes | Yes |
| The New Yorker | Yes | Yes |

## Architecture

```
src/
├── manifest.json          # MV3 manifest
├── background.js          # Service worker: API calls, settings, message routing
├── providers.js           # 14+ translation provider registry
├── content/
│   ├── index.js           # Entry point: init modules, SPA navigation, action router
│   ├── floatball.js       # Floating action ball + popup panel
│   ├── translator.js      # Page translation: DOM traversal, fragment swap
│   ├── hover.js           # Ctrl-hover paragraph translation
│   ├── selection.js       # Text selection translation
│   ├── toast.js           # Toast notifications
│   └── masker.js          # Sensitive content masking
├── reader/
│   ├── adapters/          # Site-specific content extractors (7 sites)
│   └── renderer.js        # Reader UI, translation, screenshot & PDF export
├── styles/
│   ├── reader.css         # Reader mode themes (Kin + Classic)
│   ├── floatball.css      # Floating ball & popup styles
│   └── ...                # Other component styles
├── options/               # Settings page (4 tabs)
├── popup/                 # Browser toolbar popup
└── lib/                   # dompurify, html2canvas, jspdf
```

## Settings

Access settings via the popup or the gear icon in the floating ball:

- **Translation** — Default provider, target language, always-translate URLs
- **Reader** — Theme preference (Kin / Classic), default mode
- **Rules** — Custom CSS, content rules
- **About** — Version, encrypted settings backup/restore

## Development

```bash
git clone https://github.com/zhaodengfeng/Kin.git
cd Kin/src
# Load this directory in Chrome as unpacked extension
```

## License

MIT
