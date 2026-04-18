# Kin Privacy Policy

Effective Date: April 18, 2026

## Overview

Kin is a browser extension that provides web page translation and immersive reading capabilities. This privacy policy explains what data we collect, how we use it, and your rights.

## Data We Store

All data is stored **locally on your device** using Chrome's `chrome.storage.local` API. We do **not** transmit, store, or process your data on any external servers.

### Translation Settings
- Source/target language preferences
- Translation provider selection
- Display mode preferences (dual/translation-only)
- Theme preferences

### API Keys (Optional)
- If you configure third-party translation services (e.g., DeepL, OpenAI, OpenRouter), your API keys are stored locally
- API keys are **encrypted** using AES-GCM before storage
- Keys are only used to make direct API calls to your chosen translation service
- We never have access to your API keys

### Translation Cache
- Recently translated text segments are cached locally to reduce API usage and improve performance
- Cache can be cleared at any time from Settings > Data Management

### Reading History
- Titles and URLs of articles you've opened in reader mode
- History can be cleared at any time from Settings > Data Management

### Website Rules
- URLs you've configured for always/never translate

## Data We Do NOT Collect

- We do **not** collect personal identification information
- We do **not** track your browsing history
- We do **not** sell or share any data with third parties
- We do **not** use analytics or tracking pixels

## Translation API Calls

When you translate content, the text is sent directly to your chosen translation provider:
- **Free providers** (Google Translate, Microsoft Translator): Text is sent to the respective public API
- **API providers** (DeepL, OpenAI, etc.): Text is sent using your own API key to the provider's endpoint

We do not intercept, log, or store translation content beyond the local cache mentioned above.

## Permissions Justification

- **storage**: Save your settings and preferences locally
- **activeTab**: Detect the current page for translation
- **contextMenus**: Provide right-click translation options
- **scripting**: Inject translation UI into web pages
- **alarms**: Schedule periodic cache cleanup
- **host_permissions (`<all_urls>`)**: Enable translation on any website

## Data Retention & Deletion

All data remains on your device until:
- You clear it via Settings > Data Management
- You uninstall the extension
- You reset all data via Settings > Data Management > Danger Zone

## Contact

For privacy concerns, please open an issue on our GitHub repository: https://github.com/zhaodengfeng/Kin

## Changes

We may update this privacy policy. Changes will be reflected in the GitHub repository.
