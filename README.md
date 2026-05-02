# AI Page Summarizer

A Chrome Extension (Manifest V3) that extracts content from any webpage and generates a structured AI summary — bullet points, key insights, estimated reading time, and optional in-page highlights.

Built with **Vite · React 18 · TypeScript · Tailwind CSS**.

---

## Demo

> Load the extension, navigate to any article, click the icon, and hit **Summarize This Page**.

---

## Installation

> This is a local extension and is **not** published to the Chrome Web Store.

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [pnpm](https://pnpm.io) — `npm i -g pnpm`
- Google Chrome (or Chromium-based browser)

### 1. Clone and build

```bash
git clone <repo-url>
cd ai-page-summarizer
pnpm install
pnpm build
```

This produces a `dist/` folder — that is the installable extension.

### 2. Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `dist/` folder from this project

The extension icon will appear in your toolbar.

### 3. Add your API key

1. Click the extension icon → click **⚙ Settings** (or right-click the icon → *Options*)
2. Select your AI provider:
   - **Google Gemini 2.0 Flash** — free tier, recommended. Get a key at [aistudio.google.com](https://aistudio.google.com) → *Get API key* → *Create API key*
   - **OpenAI GPT-4o mini** — paid, requires billing at [platform.openai.com](https://platform.openai.com/api-keys)
3. Paste your key and click **Save Key**

### 4. Use it

Navigate to any article or webpage, click the extension icon, and press **Summarize This Page**.

---

## Features

| Feature | Details |
|---|---|
| **AI Summary** | 4–6 bullet points covering the main points |
| **Key Insights** | 2–3 high-level takeaways |
| **Reading time** | Estimated from word count (238 wpm average) |
| **In-page highlights** | Marks key sentences directly on the page |
| **Copy to clipboard** | One-click copy of the full summary |
| **Summary cache** | Results cached per URL for 24 hours — no duplicate API calls |
| **Dark mode** | Follows OS preference via `prefers-color-scheme` |
| **Provider choice** | Gemini (free) or OpenAI — switchable in Settings |

---

## Architecture

```
dist/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker — AI calls, caching, message routing
├── content.js             # Content script — page extraction, highlight injection
├── popup/index.html       # Popup UI entry point (React app)
└── options/index.html     # Settings page entry point (React app)
```

### Three-layer design

```
┌─────────────────────────────────────────────────────┐
│  Popup (React)                                      │
│  • 4-state UI: idle → loading → result / error      │
│  • Sends messages to background                     │
│  • Never touches the API key                        │
└───────────────────────┬─────────────────────────────┘
                        │ chrome.runtime.sendMessage
┌───────────────────────▼─────────────────────────────┐
│  Background Service Worker                          │
│  • Checks cache before every API call               │
│  • Reads API key from chrome.storage.local          │
│  • Calls Gemini / OpenAI                            │
│  • Writes result to cache                           │
│  • Forwards highlight requests to content script   │
└─────────┬────────────────────────────┬──────────────┘
          │ chrome.tabs.sendMessage    │
┌─────────▼──────────────┐  ┌─────────▼──────────────┐
│  Content Script        │  │  chrome.storage.local  │
│  • Extracts page text  │  │  • API key             │
│  • Applies highlights  │  │  • Summary cache       │
│  • Uses Readability.js │  │  (max 50 entries, LRU) │
└────────────────────────┘  └────────────────────────┘
```

### Message flow

```
popup        background            content script
  │                │                     │
  ├─SUMMARIZE_PAGE→│                     │
  │                ├──check cache        │
  │                ├─EXTRACT_CONTENT────→│
  │                │←CONTENT_RESULT──────┤
  │                ├──fetch AI API       │
  │                ├──write cache        │
  │←SUMMARY_RESULT─┤                     │
  │                │                     │
  ├─HIGHLIGHT──────►│                     │
  │                ├─APPLY_HIGHLIGHTS───→│
  │                │                    (injects <mark> tags)
```

### Build pipeline

Vite handles the build in two passes triggered by a single `pnpm build`:

1. **React apps** — `popup/index.html` and `options/index.html` are built as standard Vite multi-page apps with Tailwind via PostCSS
2. **Extension scripts** — a `closeBundle` Vite plugin builds `background/index.ts` and `content/index.ts` as self-contained **IIFE bundles** (format: `iife`, `inlineDynamicImports: true`), so each is a single file with no external chunk dependencies

---

## AI Integration

### Provider: Google Gemini 2.0 Flash (default)

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=<key>
```

- `responseMimeType: "application/json"` enforces structured JSON output
- `temperature: 0.3` for factual, consistent summaries
- `maxOutputTokens: 800`

### Provider: OpenAI GPT-4o mini

```
POST https://api.openai.com/v1/chat/completions
```

- `response_format: { type: "json_object" }` enforces JSON
- `temperature: 0.3`, `max_tokens: 800`

### Prompt design

The prompt instructs the model to return a JSON object with three keys:

```json
{
  "summary": ["bullet 1", "bullet 2", ...],
  "insights": ["insight 1", ...],
  "highlightSentences": ["verbatim sentence from article", ...]
}
```

`highlightSentences` are verbatim sentences from the original text — the content script uses these to locate and mark the exact text in the DOM.

### Content extraction

Page text is extracted by the content script using [Mozilla Readability](https://github.com/mozilla/readability) — the same engine that powers Firefox Reader View. Fallback chain if Readability can't parse the page:

```
Readability → <main> / <article> / [role="main"] → document.body.innerText
```

Text is truncated to **12,000 characters** (~3,000 tokens) before being sent to the AI to control cost and latency.

---

## Security

| Concern | Decision |
|---|---|
| **API key storage** | Stored only in `chrome.storage.local` — inaccessible to webpage scripts. Never hardcoded, never passed to popup or content script. |
| **API key in memory** | The background service worker reads the key into a local variable only for the duration of the fetch call. |
| **XSS in popup** | React renders all AI text as JSX text nodes — escaped by default. No `dangerouslySetInnerHTML` anywhere. |
| **XSS in highlights** | DOM manipulation uses `splitText()`, `insertBefore()`, `createTextNode()` only — no `innerHTML` with AI-returned strings. |
| **Remote scripts** | `@mozilla/readability` is bundled by Vite at build time. No runtime CDN fetches. |
| **Permissions** | Minimal: `storage`, `activeTab`, `scripting`. No `tabs` (broad permission), no `host_permissions`. |
| **Content isolation** | Content scripts run in Chrome's isolated world — the host page's JavaScript cannot reach `chrome.storage` or communicate with the extension directly. |

---

## Trade-offs

**User-supplied API key vs. proxy server**
The extension asks users to enter their own key rather than proxying through a backend. This means zero hosting cost and no server to maintain, but requires users to have an API account. A proxy would hide the key entirely but adds infrastructure complexity and a cost surface.

**Readability vs. raw DOM scraping**
Readability produces clean article text and skips navbars, sidebars, and ads, which significantly improves summary quality. The trade-off is that it may fail on SPAs or heavily JS-rendered pages — the fallback to `<main>` / `<article>` / `document.body` handles these cases.

**IIFE bundles for background/content**
Background and content scripts are built as IIFE bundles (all dependencies inlined) rather than ES modules with shared chunks. This avoids Chrome's content script module resolution limitations and keeps each script fully self-contained. The trade-off is slightly larger file sizes — `content.js` is ~35 kB because Readability is inlined.

**12,000 character limit**
Truncating content to ~3,000 tokens keeps API costs low and responses fast (< 3 seconds on average). Very long articles lose their tail, but in practice the most important content appears early.

**24-hour cache TTL with LRU eviction at 50 entries**
Cache avoids redundant API calls on revisited pages. 24 hours is short enough that stale summaries are rare. LRU eviction at 50 entries keeps `chrome.storage.local` usage under ~250 kB.

---

## Development

```bash
pnpm dev      # watch mode — rebuilds on every file change
pnpm build    # production build → dist/
```

After any code change in watch mode, go to `chrome://extensions` and click the **↺ reload** button on the extension card to pick up the new `dist/`.
