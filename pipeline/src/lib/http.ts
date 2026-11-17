export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// 403 is deliberately NOT retried: it is usually a bot challenge (Cloudflare "Just a moment..."),
// and we respect those instead of hammering or working around them.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with a browser User-Agent, 20 s timeout and up to 2 retries on network errors / 429 / 5xx.
 * Throws on any other non-2xx status.
 */
export async function httpGet(
  fetchFn: typeof globalThis.fetch,
  url: string,
  { retries = 2, retryDelayMs = 1500 }: { retries?: number; retryDelayMs?: number } = {},
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs * attempt);
    try {
      const res = await fetchFn(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      if (!RETRYABLE.has(res.status)) break;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
