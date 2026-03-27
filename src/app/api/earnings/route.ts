import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address || address.length === 0) {
    return Response.json({ totalEarned: 0, recentActivity: [] });
  }

  // Sum all payouts to this address
  const total = db.prepare(
    'SELECT COALESCE(SUM(amount_sats), 0) as total FROM payouts WHERE recipient_address = ?'
  ).get(address) as { total: number };

  // Recent incoming payouts (last 10)
  const incoming = db.prepare(
    'SELECT amount_sats, payout_type, txid, created_at FROM payouts WHERE recipient_address = ? ORDER BY created_at DESC LIMIT 10'
  ).all(address) as Array<{ amount_sats: number; payout_type: string; txid: string; created_at: string }>;

  // Recent boots by this user (outgoing) — join payouts to get actual cost per boot event.
  // If payouts exist for a bootboard entry, sum them = actual boot price paid.
  // If no payouts, the boot was free (server paid or pre-payment era).
  const bootSpend = db.prepare(`
    SELECT
      b.id as boot_id,
      b.booted_at as created_at,
      COALESCE(SUM(py.amount_sats), 0) as total_paid
    FROM bootboard b
    LEFT JOIN payouts py ON py.boot_event_id = b.post_id
    WHERE b.boosted_by = ?
    GROUP BY b.id, b.booted_at
    ORDER BY b.booted_at DESC
    LIMIT 10
  `).all(address) as Array<{ boot_id: number; created_at: string; total_paid: number }>;

  // Merge into a unified activity feed
  type Activity = {
    amount: number;
    direction: 'in' | 'out';
    label: string;
    created_at: string;
    txid?: string;
  };

  const activity: Activity[] = [];

  for (const p of incoming) {
    activity.push({
      amount: p.amount_sats,
      direction: 'in',
      label: p.payout_type === 'boost_bonus' ? 'Agentic fairness · your post booted' : 'Agentic fairness',
      created_at: p.created_at,
      txid: p.txid,
    });
  }

  for (const b of bootSpend) {
    activity.push({
      amount: b.total_paid, // 0 = free boot, >0 = paid boot with actual cost
      direction: 'out',
      label: 'Boot',
      created_at: b.created_at,
    });
  }

  // Sort by time descending, take last 10
  activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return Response.json({
    totalEarned: total.total,
    recentActivity: activity.slice(0, 10),
  });
}
