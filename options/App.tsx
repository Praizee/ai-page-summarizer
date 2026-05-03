import { useState, useEffect } from "react";
import type { Provider, StorageConfig } from "../shared/types";

const PROVIDERS: { value: Provider; label: string; hint: string }[] = [
  {
    value: "gemini",
    label: "Google Gemini 2.0 Flash",
    hint: "Free tier — key stored on your proxy server",
  },
  {
    value: "openai",
    label: "OpenAI GPT-4o mini",
    hint: "Paid — key stored on your proxy server",
  },
  {
    value: "groq",
    label: "Groq (Llama 3.3 70b)",
    hint: "Free tier — key stored on your proxy server",
  },
];

type Status = "idle" | "saved" | "error";

export default function App() {
  const [provider, setProvider] = useState<Provider>("gemini");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    chrome.storage.local.get(
      ["apiProvider"],
      (result: Partial<StorageConfig>) => {
        if (result.apiProvider) setProvider(result.apiProvider);
      },
    );
  }, []);

  function flash(s: Status, msg = "") {
    setStatus(s);
    setErrorMsg(msg);
    if (s !== "error") setTimeout(() => setStatus("idle"), 2000);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    chrome.storage.local.set({ apiProvider: provider }, () => {
      flash("saved");
    });
  }

  const currentProvider = PROVIDERS.find((p) => p.value === provider)!;

  return (
    <div className="max-w-lg mx-auto p-6 bg-white dark:bg-zinc-900 min-h-screen text-zinc-900 dark:text-zinc-100">
      <header className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold leading-none">
              AI
            </span>
          </div>
          <h1 className="font-semibold text-lg">AI Page Summarizer</h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">
          Choose the AI provider used by your proxy server.
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label
            htmlFor="provider"
            className="block text-sm font-medium mb-1.5"
          >
            AI Provider
          </label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {currentProvider.hint}
          </p>
        </div>

        {status === "error" && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errorMsg}
          </p>
        )}
        {status === "saved" && (
          <p
            role="status"
            className="text-sm text-green-600 dark:text-green-400"
          >
            Provider saved successfully.
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Save Provider
          </button>
        </div>
      </form>

      <div className="mt-8 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            About API keys
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            API keys are stored on your remote proxy server, not in this
            extension. Update the proxy environment variables when switching
            providers.
          </p>
        </div>
      </div>
    </div>
  );
}

