export type Provider = "gemini" | "openai" | "groq";

export interface StorageConfig {
  apiProvider: Provider;
}

export interface SummaryResult {
  summary: string[];
  insights: string[];
  highlightSentences: string[];
  readingTime: number;
  wordCount: number;
  title: string;
  cachedAt: number;
  provider: Provider;
  fromCache?: boolean;
}

export type ErrorCode =
  | "EXTRACTION_FAIL"
  | "NETWORK_ERROR"
  | "API_AUTH_ERROR"
  | "RATE_LIMITED"
  | "API_ERROR"
  | "PARSE_ERROR"
  | "UNSUPPORTED_PAGE";

export type ExtMessage =
  | { type: "SUMMARIZE_PAGE"; tabId: number; url: string }
  | { type: "CLEAR_CACHE"; url: string }
  | { type: "HIGHLIGHT_SENTENCES"; tabId: number; sentences: string[] }
  | { type: "EXTRACT_CONTENT" }
  | { type: "APPLY_HIGHLIGHTS"; sentences: string[] };

export type ExtResponse =
  | ({ type: "SUMMARY_RESULT" } & SummaryResult)
  | { type: "HIGHLIGHT_DONE" }
  | { type: "OK" }
  | {
      type: "CONTENT_RESULT";
      text: string;
      title: string;
      wordCount: number;
      readingTime: number;
    }
  | { type: "ERROR"; code: ErrorCode; message: string };

