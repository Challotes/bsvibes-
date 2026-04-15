import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const WOC_BASE = "https://api.whatsonchain.com/v1/bsv/main";
const CACHE_TTL_MS = 10_000;
const CACHE_MAX = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 400;

type CacheEntry = { balance: number; expires: number };
const _balanceCache = new Map<string, CacheEntry>();

export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`balance:${ip}`, { limit: 120, windowMs: 60_000 });
  if (!rl.success) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  const fresh = searchParams.get("fresh") === "1";

  if (!address || !/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
    return new Response(JSON.stringify({ error: "invalid_address" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const cached = _balanceCache.get(address);
  if (!fresh && cached && cached.expires > now) {
    return Response.json({ balance: cached.balance, cached: true });
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${WOC_BASE}/address/${address}/unspent`);

      if (res.ok) {
        const utxos = await res.json();
        const balance = Array.isArray(utxos)
          ? utxos.reduce((s: number, u: { value: number }) => s + u.value, 0)
          : 0;

        if (_balanceCache.size >= CACHE_MAX) {
          const oldest = _balanceCache.keys().next().value;
          if (oldest) _balanceCache.delete(oldest);
        }
        _balanceCache.set(address, { balance, expires: now + CACHE_TTL_MS });

        return Response.json({ balance, cached: false });
      }

      // 429 or 5xx — retry, but serve stale on last attempt
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        if (cached) {
          return Response.json({ balance: cached.balance, cached: true, stale: true });
        }
        return new Response(JSON.stringify({ error: "upstream_busy" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "upstream_error" }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  if (cached) {
    return Response.json({ balance: cached.balance, cached: true, stale: true });
  }
  return new Response(JSON.stringify({ error: "fetch_failed" }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
}
