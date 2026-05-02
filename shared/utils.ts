const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref']

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    for (const param of TRACKING_PARAMS) {
      u.searchParams.delete(param)
    }
    return u.toString()
  } catch {
    return url
  }
}

export function cacheKey(url: string): string {
  return `cache_${normalizeUrl(url)}`
}

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const MAX_CACHE_ENTRIES = 50
export const MAX_CONTENT_CHARS = 12_000
export const AVG_WORDS_PER_MIN = 238
