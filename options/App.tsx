import { useState, useEffect } from 'react'
import type { Provider, StorageConfig } from '../shared/types'

const PROVIDERS: { value: Provider; label: string; hint: string }[] = [
  { value: 'gemini', label: 'Google Gemini 1.5 Flash', hint: 'Free tier — get a key at aistudio.google.com' },
  { value: 'openai', label: 'OpenAI GPT-4o mini', hint: 'Paid — requires billing at platform.openai.com' },
]

const KEY_PATTERNS: Record<Provider, RegExp> = {
  gemini: /^AIza[A-Za-z0-9\-_]{35}/,
  openai: /^sk-[A-Za-z0-9]{20,}/,
}

type Status = 'idle' | 'saved' | 'removed' | 'error'

export default function App() {
  const [provider, setProvider] = useState<Provider>('gemini')
  const [keyInput, setKeyInput] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [maskedKey, setMaskedKey] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    chrome.storage.local.get(['apiProvider', 'apiKey'], (result: Partial<StorageConfig>) => {
      if (result.apiProvider) setProvider(result.apiProvider)
      if (result.apiKey) {
        setHasKey(true)
        setMaskedKey(`••••••••••••${result.apiKey.slice(-4)}`)
      }
    })
  }, [])

  function flash(s: Status, msg = '') {
    setStatus(s)
    setErrorMsg(msg)
    if (s !== 'error') setTimeout(() => setStatus('idle'), 2500)
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const key = keyInput.trim()
    if (!key) { flash('error', 'Enter an API key.'); return }
    if (!KEY_PATTERNS[provider].test(key)) {
      flash('error', `Invalid key format for ${provider === 'gemini' ? 'Gemini (should start with AIza…)' : 'OpenAI (should start with sk-…)'}.`)
      return
    }
    chrome.storage.local.set({ apiProvider: provider, apiKey: key }, () => {
      setHasKey(true)
      setMaskedKey(`••••••••••••${key.slice(-4)}`)
      setKeyInput('')
      flash('saved')
    })
  }

  function handleRemove() {
    chrome.storage.local.remove(['apiKey', 'apiProvider'], () => {
      setHasKey(false)
      setMaskedKey('')
      setKeyInput('')
      flash('removed')
    })
  }

  const currentProvider = PROVIDERS.find(p => p.value === provider)!

  return (
    <div className="max-w-lg mx-auto p-6 bg-white dark:bg-zinc-900 min-h-screen text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold leading-none">AI</span>
          </div>
          <h1 className="font-semibold text-lg">AI Page Summarizer</h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">Configure your AI provider and API key.</p>
      </header>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Provider select */}
        <div>
          <label htmlFor="provider" className="block text-sm font-medium mb-1.5">
            AI Provider
          </label>
          <select
            id="provider"
            value={provider}
            onChange={e => setProvider(e.target.value as Provider)}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {PROVIDERS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{currentProvider.hint}</p>
        </div>

        {/* API key input */}
        <div>
          <label htmlFor="api-key" className="block text-sm font-medium mb-1.5">
            API Key
          </label>
          {hasKey && !keyInput && (
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="font-mono text-zinc-500 dark:text-zinc-400 tracking-widest">{maskedKey}</span>
              <span className="text-green-600 dark:text-green-400 text-xs font-medium">✓ saved</span>
            </div>
          )}
          <input
            id="api-key"
            type="password"
            value={keyInput}
            onChange={e => { setKeyInput(e.target.value); if (status === 'error') setStatus('idle') }}
            placeholder={hasKey ? 'Enter a new key to replace…' : provider === 'gemini' ? 'AIza…' : 'sk-…'}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Status banner */}
        {status === 'error' && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
        )}
        {status === 'saved' && (
          <p role="status" className="text-sm text-green-600 dark:text-green-400">API key saved successfully.</p>
        )}
        {status === 'removed' && (
          <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">Key removed.</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Save Key
          </button>
          {hasKey && (
            <button
              type="button"
              onClick={handleRemove}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
            >
              Remove Key
            </button>
          )}
        </div>
      </form>

      {/* Instructions */}
      <div className="mt-8 rounded-xl border border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
        <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">How to get an API key</p>
        </div>
        <div className="px-4 py-3 space-y-0.5">
          <p className="text-sm font-medium">Google Gemini — Free</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Go to <span className="font-mono text-indigo-600 dark:text-indigo-400">aistudio.google.com</span> → Get API key → Create API key. No billing required.
          </p>
        </div>
        <div className="px-4 py-3 space-y-0.5">
          <p className="text-sm font-medium">OpenAI GPT-4o mini</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Go to <span className="font-mono text-indigo-600 dark:text-indigo-400">platform.openai.com/api-keys</span> → Create new secret key. Requires a paid account.
          </p>
        </div>
      </div>
    </div>
  )
}
