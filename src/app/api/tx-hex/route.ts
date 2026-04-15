import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const WOC_BASE = "https://api.whatsonchain.com/v1/bsv/main";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
// When WoC returns 404, the tx may be unconfirmed and not yet indexed in the
// mempool view (observed during 0-conf chained sweeps — our own just-broadcast
// parent isn't queryable for a few seconds). Retry 404s a handful of times
// with longer delays before giving up. Keep separate from the 429/5xx retry
// budget so a genuinely missing tx still fails fast after ~6s, not instantly.
const UNCONFIRMED_MAX_RETRIES = 3;
const UNCONFIRMED_RETRY_DELAY_MS = 2000;

// Source tx hex is immutable — cache forever. Eliminates repeated WoC calls
// for the same txid across boots, sweeps, and consolidation. Without this,
// a boot with 15 inputs fires 15 parallel WoC calls, exceeding WoC's ~3 req/s
// rate limit and causing 429 errors.
const _txCache = new Map<string, string>();
const TX_CACHE_MAX = 2000;

export async function GET(request: Request) {
  // Rate limit by IP — 500/min to support UTXO consolidation (many source tx fetches).
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`tx-hex:${ip}`, { limit: 500, windowMs: 60_000 });
  if (!rl.success) {
    return new Response("Rate limit exceeded", { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const txid = searchParams.get("txid");

  if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
    return new Response("Invalid txid", { status: 400 });
  }

  // Check cache first — source tx hex never changes
  const cached = _txCache.get(txid);
  if (cached) {
    return new Response(cached, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  let lastStatus = 502;
  let notFoundRetries = 0;

  for (let attempt = 0; attempt < MAX_RETRIES + UNCONFIRMED_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${WOC_BASE}/tx/${txid}/hex`);

      if (res.ok) {
        const hex = await res.text();

        // Cache for future requests
        if (_txCache.size >= TX_CACHE_MAX) {
          const oldest = _txCache.keys().next().value;
          if (oldest) _txCache.delete(oldest);
        }
        _txCache.set(txid, hex);

        return new Response(hex, {
          headers: { "Content-Type": "text/plain" },
        });
      }

      lastStatus = res.status;

      // Rate limit (429) or server error (5xx) — retry with short backoff.
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      // 404 — may be an unconfirmed parent that WoC hasn't indexed yet.
      // Retry a bounded number of times with longer backoff. After the
      // budget, treat as a real miss and stop to avoid holding the client.
      if (res.status === 404 && notFoundRetries < UNCONFIRMED_MAX_RETRIES) {
        notFoundRetries++;
        await new Promise((r) => setTimeout(r, UNCONFIRMED_RETRY_DELAY_MS));
        continue;
      }

      // Genuine client error (or 404 budget exhausted) — don't retry.
      return new Response("Transaction not found", { status: res.status });
    } catch {
      // Network error — retry with short backoff.
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  return new Response("Failed to fetch transaction after retries", { status: lastStatus });
}
