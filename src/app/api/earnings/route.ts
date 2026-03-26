import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address || address.length === 0) {
    return Response.json({ totalEarned: 0, recentPayouts: [] });
  }

  // Sum all payouts to this address
  const total = db.prepare(
    'SELECT COALESCE(SUM(amount_sats), 0) as total FROM payouts WHERE recipient_address = ?'
  ).get(address) as { total: number };

  // Recent payouts (last 10)
  const recent = db.prepare(
    'SELECT amount_sats, payout_type, txid, created_at FROM payouts WHERE recipient_address = ? ORDER BY created_at DESC LIMIT 10'
  ).all(address) as Array<{ amount_sats: number; payout_type: string; txid: string; created_at: string }>;

  return Response.json({
    totalEarned: total.total,
    recentPayouts: recent,
  });
}
