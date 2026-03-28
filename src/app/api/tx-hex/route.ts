export const dynamic = 'force-dynamic';

const WOC_BASE = 'https://api.whatsonchain.com/v1/bsv/main';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const txid = searchParams.get('txid');

  if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
    return new Response('Invalid txid', { status: 400 });
  }

  let lastStatus = 502;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${WOC_BASE}/tx/${txid}/hex`);

      if (res.ok) {
        const hex = await res.text();
        return new Response(hex, {
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      lastStatus = res.status;

      // Retry on rate limit (429) or server errors (5xx)
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      // 404 or other client error — don't retry
      return new Response('Transaction not found', { status: res.status });
    } catch {
      // Network error — retry
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  return new Response('Failed to fetch transaction after retries', { status: lastStatus });
}
