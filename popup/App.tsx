import { useState, useEffect, useCallback } from "react";
import type { SummaryResult, ErrorCode, ExtResponse } from "../shared/types";
import { cacheKey, CACHE_TTL_MS } from "../shared/utils";
import { Settings } from "lucide-react";

type View = "idle" | "loading" | "error" | "result";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  EXTRACTION_FAIL: "Couldn't extract content from this page.",
  UNSUPPORTED_PAGE: "This page type can't be summarized.",
  API_AUTH_ERROR: "Proxy auth error. Check your server keys.",
  RATE_LIMITED: "Rate limit hit. Wait a moment and try again.",
  NETWORK_ERROR: "Network error. Check your connection.",
  API_ERROR: "AI service error. Try again shortly.",
  PARSE_ERROR: "Unexpected AI response. Try again.",
};

export default function App() {
  const [view, setView] = useState<View>("idle");
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id || !tab.url) return;
      setTabId(tab.id);
      setUrl(tab.url);

      const key = cacheKey(tab.url);
      chrome.storage.local.get(key, (stored) => {
        const cached = stored[key] as SummaryResult | undefined;
        if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
          setResult({ ...cached, fromCache: true });
          setView("result");
        }
      });
    });
  }, []);

  function showError(code: ErrorCode, fallback: string) {
    const message = code === "API_ERROR" ? fallback : ERROR_MESSAGES[code];
    setErrorCode(code);
    setErrorMsg(message ?? fallback);
    setView("error");
  }

  const handleSummarize = useCallback(() => {
    if (tabId === null) return;
    setView("loading");
    chrome.runtime.sendMessage(
      { type: "SUMMARIZE_PAGE", tabId, url },
      (res: ExtResponse) => {
        if (chrome.runtime.lastError) {
          showError("NETWORK_ERROR", chrome.runtime.lastError.message ?? "");
          return;
        }
        if (res.type === "ERROR") {
          showError(res.code, res.message);
        } else if (res.type === "SUMMARY_RESULT") {
          setResult(res);
          setHighlighted(false);
          setView("result");
        }
      },
    );
  }, [tabId, url]);

  function handleHighlight() {
    if (!result || tabId === null) return;
    chrome.runtime.sendMessage(
      {
        type: "HIGHLIGHT_SENTENCES",
        tabId,
        sentences: result.highlightSentences,
      },
      () => setHighlighted(true),
    );
  }

  function handleClear() {
    chrome.runtime.sendMessage({ type: "CLEAR_CACHE", url }, () => {
      setResult(null);
      setHighlighted(false);
      setView("idle");
    });
  }

  return (
    <div className="w-[400px] flex flex-col bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 select-none">
      <Header />

      {view === "idle" && <IdleView onSummarize={handleSummarize} />}
      {view === "loading" && <LoadingView />}
      {view === "error" && (
        <ErrorView
          message={errorMsg}
          code={errorCode}
          onRetry={handleSummarize}
          onSettings={() => chrome.runtime.openOptionsPage()}
        />
      )}
      {view === "result" && result && (
        <ResultView
          result={result}
          highlighted={highlighted}
          onHighlight={handleHighlight}
          onClear={handleClear}
        />
      )}
    </div>
  );
}

// Sub-views
function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center shrink-0">
          <span className="text-white text-[10px] font-bold leading-none">
            AI
          </span>
        </div>
        <span className="text-sm font-semibold">AI Page Summarizer</span>
      </div>
      <button
        type="button"
        onClick={() => chrome.runtime.openOptionsPage()}
        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        title="Settings"
        aria-label="Open settings"
      >
        <Settings />
      </button>
    </header>
  );
}

function IdleView({ onSummarize }: { onSummarize: () => void }) {
  return (
    <div className="p-5 flex flex-col gap-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Get AI-powered bullet points, key insights, and estimated reading time
        for any page.
      </p>
      <button
        type="button"
        onClick={onSummarize}
        className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:ring-offset-zinc-900"
      >
        Summarize This Page
      </button>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="p-5 flex flex-col items-center gap-3 py-12">
      <div className="w-8 h-8 rounded-full border-4 border-zinc-200 dark:border-zinc-700 border-t-indigo-600 animate-spin" />
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Analyzing page…
      </p>
    </div>
  );
}

function ErrorView({
  message,
  code,
  onRetry,
  onSettings,
}: {
  message: string;
  code: ErrorCode | null;
  onRetry: () => void;
  onSettings: () => void;
}) {
  const showSettings = code === "API_AUTH_ERROR";
  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900">
        <span className="text-red-500 shrink-0 mt-0.5" aria-hidden>
          ⚠
        </span>
        <p className="text-sm text-red-700 dark:text-red-300 leading-snug">
          {message}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Retry
        </button>
        {showSettings && (
          <button
            type="button"
            onClick={onSettings}
            className="flex-1 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            Open Settings
          </button>
        )}
      </div>
    </div>
  );
}

function ResultView({
  result,
  highlighted,
  onHighlight,
  onClear,
}: {
  result: SummaryResult;
  highlighted: boolean;
  onHighlight: () => void;
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = [
      `# ${result.title}`,
      `~${result.readingTime} min read · ${result.wordCount.toLocaleString()} words`,
      "",
      "## Summary",
      ...result.summary.map((s) => `• ${s}`),
      "",
      "## Key Insights",
      ...result.insights.map((s) => `→ ${s}`),
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col max-h-[560px] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-200 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full">
      {/* Title + meta */}
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold leading-snug line-clamp-2">
          {result.title}
        </h2>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs text-zinc-400">
            ~{result.readingTime} min read
          </span>
          <span className="text-zinc-200 dark:text-zinc-700 text-xs">·</span>
          <span className="text-xs text-zinc-400">
            {result.wordCount.toLocaleString()} words
          </span>
          {result.fromCache && (
            <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-medium">
              cached
            </span>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-100 dark:border-zinc-800" />

      {/* Summary */}
      <section className="px-4 py-3" aria-label="Summary">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          Summary
        </h3>
        <ul className="space-y-2">
          {result.summary.map((item, i) => (
            <li
              key={i}
              className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300 leading-snug"
            >
              <span className="text-indigo-500 shrink-0 mt-0.5" aria-hidden>
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="border-t border-zinc-100 dark:border-zinc-800" />

      {/* Key insights */}
      <section className="px-4 py-3" aria-label="Key Insights">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
          Key Insights
        </h3>
        <ul className="space-y-2">
          {result.insights.map((item, i) => (
            <li
              key={i}
              className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300 leading-snug"
            >
              <span className="text-indigo-400 shrink-0 mt-0.5" aria-hidden>
                →
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="border-t border-zinc-100 dark:border-zinc-800" />

      {/* Actions */}
      <div className="px-4 py-3 flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={onHighlight}
          disabled={highlighted || result.highlightSentences.length === 0}
          className="flex-1 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 min-w-[130px]"
        >
          {highlighted ? "Highlighted ✓" : "Highlight Key Sections"}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          title="Copy summary"
        >
          {copied ? "✓" : "⎘"}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label="Clear and reset"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

