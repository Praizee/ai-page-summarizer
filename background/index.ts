import type {
  ExtMessage,
  ExtResponse,
  SummaryResult,
  StorageConfig,
  Provider,
  ErrorCode,
} from "../shared/types";
import { cacheKey, CACHE_TTL_MS, MAX_CACHE_ENTRIES } from "../shared/utils";

// Message router
chrome.runtime.onMessage.addListener(
  (msg: ExtMessage, _sender, sendResponse: (r: ExtResponse) => void) => {
    if (msg.type === "SUMMARIZE_PAGE") {
      handleSummarizePage(msg.tabId, msg.url).then(sendResponse);
      return true;
    }
    if (msg.type === "CLEAR_CACHE") {
      storageRemove(cacheKey(msg.url)).then(() => sendResponse({ type: "OK" }));
      return true;
    }
    if (msg.type === "HIGHLIGHT_SENTENCES") {
      chrome.tabs.sendMessage(
        msg.tabId,
        { type: "APPLY_HIGHLIGHTS", sentences: msg.sentences },
        () => sendResponse({ type: "HIGHLIGHT_DONE" }),
      );
      return true;
    }
  },
);

// Core handler
async function handleSummarizePage(
  tabId: number,
  url: string,
): Promise<ExtResponse> {
  const key = cacheKey(url);

  // Cache hit
  const cached = await storageGetOne<SummaryResult>(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { type: "SUMMARY_RESULT", ...cached, fromCache: true };
  }

  // Load API config
  const store = (await storageGetMany([
    "apiProvider",
    "apiKey",
  ])) as Partial<StorageConfig>;
  if (!store.apiKey) {
    return fail("NO_API_KEY", "No API key set. Open Settings to add one.");
  }
  const provider: Provider = store.apiProvider ?? "gemini";

  // Extract page content (inject content script if needed)
  let extraction: ExtResponse;
  try {
    extraction = await sendToTab(tabId, { type: "EXTRACT_CONTENT" });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      extraction = await sendToTab(tabId, { type: "EXTRACT_CONTENT" });
    } catch {
      return fail("UNSUPPORTED_PAGE", "This page type can't be summarized.");
    }
  }

  if (extraction.type === "ERROR") return extraction;
  if (extraction.type !== "CONTENT_RESULT")
    return fail("EXTRACTION_FAIL", "Unexpected content result.");

  const { text, title, wordCount, readingTime } = extraction;

  // Call AI
  const result = await fetchSummary(
    provider,
    store.apiKey,
    buildPrompt(text, title),
  );
  if ("error" in result) return result.error;

  // Persist to cache
  const entry: SummaryResult = {
    ...result,
    readingTime,
    wordCount,
    title,
    cachedAt: Date.now(),
    provider,
  };
  await writeCache(key, entry);

  return { type: "SUMMARY_RESULT", ...entry, fromCache: false };
}

// AI integration
function buildPrompt(text: string, title: string): string {
  return `You are a webpage summarizer. Respond ONLY with valid JSON — no markdown, no code fences.

The JSON must contain exactly these keys:
- "summary": array of 4–6 concise bullet strings covering the main points
- "insights": array of 2–3 key takeaway strings
- "highlightSentences": array of 3–5 verbatim sentences copied exactly from the article

Title: ${title}

Article:
${text}`;
}

type AiSuccess = {
  summary: string[];
  insights: string[];
  highlightSentences: string[];
};
type AiResult = AiSuccess | { error: ExtResponse };

async function fetchSummary(
  provider: Provider,
  apiKey: string,
  prompt: string,
): Promise<AiResult> {
  try {
    let raw: string;

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful webpage summarizer. Always respond with valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 800,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) return { error: httpError(res.status) };
      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      raw = data.choices[0].message.content;
    } else if (provider === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful webpage summarizer. Always respond with valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 800,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) return { error: httpError(res.status) };
      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      raw = data.choices[0].message.content;
    } else {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 800,
              responseMimeType: "application/json",
            },
          }),
        },
      );
      if (!res.ok) return { error: httpError(res.status) };
      const data = (await res.json()) as {
        candidates: { content: { parts: { text: string }[] } }[];
      };
      raw = data.candidates[0].content.parts[0].text;
    }

    const parsed: unknown = JSON.parse(raw);
    const validated = validateAiResponse(parsed);
    if (!validated)
      return {
        error: fail("PARSE_ERROR", "Unexpected response structure from AI."),
      };
    return validated;
  } catch (e) {
    if (e instanceof TypeError)
      return {
        error: fail("NETWORK_ERROR", "Network error. Check your connection."),
      };
    return { error: fail("PARSE_ERROR", "Failed to parse AI response.") };
  }
}

function validateAiResponse(data: unknown): AiSuccess | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.summary) || !Array.isArray(d.insights)) return null;
  return {
    summary: d.summary.filter((s): s is string => typeof s === "string"),
    insights: d.insights.filter((s): s is string => typeof s === "string"),
    highlightSentences: Array.isArray(d.highlightSentences)
      ? d.highlightSentences.filter((s): s is string => typeof s === "string")
      : [],
  };
}

// Caching
async function writeCache(key: string, entry: SummaryResult): Promise<void> {
  await storageSet({ [key]: entry });

  const all = await storageGetAll();
  const entries = Object.entries(all)
    .filter(([k]) => k.startsWith("cache_"))
    .map(([k, v]) => ({ key: k, cachedAt: (v as SummaryResult).cachedAt ?? 0 }))
    .sort((a, b) => a.cachedAt - b.cachedAt);

  if (entries.length > MAX_CACHE_ENTRIES) {
    const stale = entries
      .slice(0, entries.length - MAX_CACHE_ENTRIES)
      .map((e) => e.key);
    await storageRemove(stale);
  }
}

// Storage (Promise-based API)
async function storageGetOne<T>(key: string): Promise<T | null> {
  const r = await chrome.storage.local.get(key);
  return (r[key] as T) ?? null;
}

function storageGetMany(keys: string[]): Promise<Record<string, unknown>> {
  return chrome.storage.local.get(keys);
}

function storageGetAll(): Promise<Record<string, unknown>> {
  return chrome.storage.local.get(null);
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return chrome.storage.local.set(items);
}

function storageRemove(keys: string | string[]): Promise<void> {
  return chrome.storage.local.remove(Array.isArray(keys) ? keys : [keys]);
}

// Misc
function sendToTab(tabId: number, msg: ExtMessage): Promise<ExtResponse> {
  return new Promise((resolve, reject) =>
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError)
        reject(new Error(chrome.runtime.lastError.message));
      else resolve(response as ExtResponse);
    }),
  );
}

function fail(code: ErrorCode, message: string): ExtResponse {
  return { type: "ERROR", code, message };
}

function httpError(status: number): ExtResponse {
  if (status === 401 || status === 403)
    return fail("API_AUTH_ERROR", "Invalid API key. Check Settings.");
  if (status === 429)
    return fail("RATE_LIMITED", "Rate limit hit. Wait a moment and try again.");
  return fail("API_ERROR", `AI service error (${status}). Try again.`);
}

