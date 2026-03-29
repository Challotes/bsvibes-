import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Walk the migration chain to collect all addresses ever associated with an identity.
 *
 * The migrations table records key rotations as: from_pubkey → to_pubkey.
 * Payouts record both recipient_pubkey and recipient_address.
 *
 * Strategy:
 * 1. Seed: find all pubkeys recorded in payouts for the given address.
 * 2. Walk backwards through migrations: for each known pubkey, find any
 *    migration where to_pubkey = that pubkey, then add from_pubkey to the set.
 * 3. Also walk forwards: find any migration where from_pubkey = known pubkey,
 *    add to_pubkey (covers restore-from-device using an old key).
 * 4. Collect all addresses from payouts for the full pubkey set.
 *
 * This means earnings history survives security upgrades and cross-device restores.
 */
function resolveAllAddresses(address: string): string[] {
  const allAddresses = new Set<string>([address]);
  const allPubkeys = new Set<string>();

  // Seed: find pubkeys associated with this address from payouts
  const seedPubkeys = db.prepare(
    'SELECT DISTINCT recipient_pubkey FROM payouts WHERE recipient_address = ?'
  ).all(address) as Array<{ recipient_pubkey: string }>;

  for (const row of seedPubkeys) {
    allPubkeys.add(row.recipient_pubkey);
  }

  // BFS over migration chain (both directions)
  const queue = [...allPubkeys];
  while (queue.length > 0) {
    const pubkey = queue.shift()!;

    // Walk backwards: who migrated TO this pubkey?
    const predecessors = db.prepare(
      'SELECT from_pubkey FROM migrations WHERE to_pubkey = ?'
    ).all(pubkey) as Array<{ from_pubkey: string }>;

    for (const row of predecessors) {
      if (!allPubkeys.has(row.from_pubkey)) {
        allPubkeys.add(row.from_pubkey);
        queue.push(row.from_pubkey);
      }
    }

    // Walk forwards: what did this pubkey migrate to?
    const successors = db.prepare(
      'SELECT to_pubkey FROM migrations WHERE from_pubkey = ?'
    ).all(pubkey) as Array<{ to_pubkey: string }>;

    for (const row of successors) {
      if (!allPubkeys.has(row.to_pubkey)) {
        allPubkeys.add(row.to_pubkey);
        queue.push(row.to_pubkey);
      }
    }
  }

  // Collect all addresses for the full pubkey set
  if (allPubkeys.size > 0) {
    const pubkeyList = [...allPubkeys];
    const placeholders = pubkeyList.map(() => '?').join(', ');
    const addressRows = db.prepare(
      `SELECT DISTINCT recipient_address FROM payouts WHERE recipient_pubkey IN (${placeholders})`
    ).all(...pubkeyList) as Array<{ recipient_address: string }>;

    for (const row of addressRows) {
      allAddresses.add(row.recipient_address);
    }
  }

  return [...allAddresses];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address || address.length === 0) {
    return Response.json({ totalEarned: 0, recentActivity: [] });
  }

  // Resolve all addresses in this identity's migration chain so earnings
  // history survives security upgrades and cross-device restores.
  const allAddresses = resolveAllAddresses(address);
  const placeholders = allAddresses.map(() => '?').join(', ');

  // Sum all payouts across the full address chain
  const total = db.prepare(
    `SELECT COALESCE(SUM(amount_sats), 0) as total FROM payouts WHERE recipient_address IN (${placeholders})`
  ).get(...allAddresses) as { total: number };

  // Recent incoming payouts (last 10) across chain
  const incoming = db.prepare(
    `SELECT amount_sats, payout_type, txid, created_at FROM payouts WHERE recipient_address IN (${placeholders}) ORDER BY created_at DESC LIMIT 10`
  ).all(...allAddresses) as Array<{ amount_sats: number; payout_type: string; txid: string; created_at: string }>;

  // Recent boots by this user (outgoing) — across all known addresses in chain.
  // is_free = 1 → server paid (free boot grant) → show as 0 cost to user.
  // is_free = 0 → user paid → sum payouts to get actual amount spent.
  // Note: free boots still have payouts recorded (server→contributors) but those
  // are not the user's money, so we zero them out here via the is_free flag.
  const bootSpend = db.prepare(`
    SELECT
      b.id as boot_id,
      b.booted_at as created_at,
      b.is_free,
      CASE WHEN b.is_free = 1 THEN 0 ELSE COALESCE(SUM(py.amount_sats), 0) END as total_paid
    FROM bootboard b
    LEFT JOIN payouts py ON py.boot_event_id = b.id
    WHERE b.boosted_by IN (${placeholders})
    GROUP BY b.id, b.booted_at, b.is_free
    ORDER BY b.booted_at DESC
    LIMIT 10
  `).all(...allAddresses) as Array<{ boot_id: number; created_at: string; is_free: number; total_paid: number }>;

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
      label: p.payout_type === 'boost_bonus' ? 'Agentic split · your post featured' : 'Agentic split',
      created_at: p.created_at,
      txid: p.txid,
    });
  }

  for (const b of bootSpend) {
    activity.push({
      amount: b.total_paid, // 0 = free boot, >0 = paid boot with actual cost
      direction: 'out',
      label: 'Boot featured',
      created_at: b.created_at,
    });
  }

  // Sort by time descending, take last 10
  activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Cumulative earnings history for the sparkline chart (last 30 data points)
  // Query across the full address chain so history survives upgrades.
  const earningsHistory = db.prepare(`
    SELECT created_at as t, amount_sats
    FROM payouts
    WHERE recipient_address IN (${placeholders})
    ORDER BY created_at ASC
  `).all(...allAddresses) as Array<{ t: string; amount_sats: number }>;

  let cumulative = 0;
  const history = earningsHistory.map((row) => {
    cumulative += row.amount_sats;
    return { t: row.t, cumulative };
  });

  // Keep last 30 points for chart (reduce noise on large datasets)
  const chartHistory = history.length > 30
    ? history.filter((_, i, arr) => i === arr.length - 1 || i % Math.ceil(arr.length / 30) === 0)
    : history;

  return Response.json({
    totalEarned: total.total,
    recentActivity: activity.slice(0, 10),
    earningsHistory: chartHistory,
  });
}
