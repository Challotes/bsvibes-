export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const txid = searchParams.get('txid');

  if (!txid || !/^[a-fA-F0-9]{64}$/.test(txid)) {
    return new Response('Invalid txid', { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/hex`
    );
    if (!res.ok) {
      return new Response('Transaction not found', { status: res.status });
    }
    const hex = await res.text();
    return new Response(hex, {
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch {
    return new Response('Failed to fetch transaction', { status: 502 });
  }
}
