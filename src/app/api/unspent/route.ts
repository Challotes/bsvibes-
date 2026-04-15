import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const WOC_BASE = "https://api.whatsonchain.com/v1/bsv/main";
const CACHE_TTL_MS = 3_000;
const CACHE_MAX = 1000;
const MAX_RETRIES = 4;
const RETRY_DELAYS_MS = [500, 1000, 2000, 3000];

type CacheEntry = { body: string; expires: number };
const _unspentCache = new Map<string, CacheEntry>();

export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`unspent:${ip}`, { limit: 180, windowMs: 60_000 });
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
  const cached = _unspentCache.get(address);
  if (!fresh && cached && cached.expires > now) {
    return new Response(cached.body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${WOC_BASE}/address/${address}/unspent`);

      if (res.ok) {
        const body = await res.text();

        if (_unspentCache.size >= CACHE_MAX) {
          const oldest = _unspentCache.keys().next().value;
          if (oldest) _unspentCache.delete(oldest);
        }
        _unspentCache.set(address, { body, expires: now + CACHE_TTL_MS });

        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 3000));
          continue;
        }
        if (cached) {
          return new Response(cached.body, {
            status: 200,
            headers: { "Content-Type": "application/json", "X-Stale": "1" },
          });
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
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 3000));
      }
    }
  }

  if (cached) {
    return new Response(cached.body, {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Stale": "1" },
    });
  }
  return new Response(JSON.stringify({ error: "fetch_failed" }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
}
