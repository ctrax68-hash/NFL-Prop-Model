/**
 * `fetch` with a hard deadline.
 *
 * Every caller in the ingestion layer talks to a third-party host (nflverse's
 * raw CSVs, The Odds API), and a plain `await fetch(url)` has no way to fail
 * on a stuck connection — it just waits. That is fine sitting at a terminal,
 * but on the unattended scheduled scrape (`.github/workflows/scrape-and-store.yml`)
 * the only thing that eventually stopped a hung request was the job's own
 * 15-minute timeout killing the whole run with no error to act on. A 30s
 * per-request deadline turns that into a fast, specific, catchable failure.
 */
export async function fetchWithTimeout(
  url: string | URL,
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
