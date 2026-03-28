import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { calculateWeights } from '@/services/fairness/weights'
import { calculateSplit } from '@/services/fairness/split'
import { getBootPrice } from '@/services/fairness/pricing'
import { getServerAddress } from '@/services/bsv/wallet'

interface BootConfirmBody {
  postId: number
  txid: string
  booterPubkey: string
  booterName: string
}

export async function POST(req: NextRequest) {
  let body: BootConfirmBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { postId, txid, booterPubkey, booterName } = body

  if (!Number.isInteger(postId) || postId <= 0) {
    return NextResponse.json({ error: 'Invalid postId' }, { status: 400 })
  }
  if (typeof txid !== 'string' || txid.trim().length === 0) {
    return NextResponse.json({ error: 'Missing txid' }, { status: 400 })
  }

  // Validate txid format: must be exactly 64 hex characters
  if (!/^[a-fA-F0-9]{64}$/.test(txid.trim())) {
    return NextResponse.json({ error: 'Invalid txid format' }, { status: 400 })
  }

  // Verify the transaction exists on-chain via WhatsOnChain
  try {
    const wocRes = await fetch(
      `https://api.whatsonchain.com/v1/bsv/main/tx/${txid.trim()}`,
      { headers: { 'Accept': 'application/json' } }
    )
    if (!wocRes.ok) {
      console.warn(`[BSVibes] boot-confirm: txid ${txid.slice(0, 16)}… not found on-chain (HTTP ${wocRes.status})`)
      return NextResponse.json(
        { error: 'Transaction not found on-chain — please wait for confirmation and retry' },
        { status: 400 }
      )
    }
    // Transaction exists — we could optionally verify outputs contain expected addresses here
  } catch (err) {
    console.error('[BSVibes] boot-confirm: WhatsOnChain verification failed', err)
    return NextResponse.json(
      { error: 'Could not verify transaction — please try again' },
      { status: 502 }
    )
  }

  if (typeof booterPubkey !== 'string' || booterPubkey.trim().length === 0) {
    return NextResponse.json({ error: 'Missing booterPubkey' }, { status: 400 })
  }
  // booterName defaults to booterPubkey if not provided (backward compat)
  const displayName = (typeof booterName === 'string' && booterName.trim().length > 0)
    ? booterName.trim()
    : booterPubkey

  // Validate the post exists and has a pubkey (so we can pay the creator)
  const post = db.prepare(
    'SELECT id, pubkey FROM posts WHERE id = ?'
  ).get(postId) as { id: number; pubkey: string | null } | undefined

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }
  if (!post.pubkey) {
    return NextResponse.json({ error: 'Post is unsigned — cannot be booted' }, { status: 422 })
  }

  const platformAddress = getServerAddress()
  if (!platformAddress) {
    return NextResponse.json({ error: 'Server wallet not configured' }, { status: 503 })
  }

  // Recalculate the split at current prices so we have accurate payout records
  const bootPrice = getBootPrice(db)
  const weights = calculateWeights(db)

  let creatorAddress: string
  try {
    const { PublicKey } = await import('@bsv/sdk')
    creatorAddress = PublicKey.fromString(post.pubkey).toAddress().toString()
  } catch {
    return NextResponse.json({ error: 'Invalid creator pubkey' }, { status: 422 })
  }

  const split = calculateSplit(
    bootPrice,
    post.pubkey,
    creatorAddress,
    platformAddress,
    weights,
  )

  // All SQLite writes wrapped in a single transaction
  db.transaction(() => {
    // Close the current bootboard holder
    db.prepare(`
      UPDATE bootboard SET held_until = datetime('now')
      WHERE held_until IS NULL
    `).run()

    // Insert the new bootboard entry.
    // boosted_by = BSV address (used for activity feed queries by address)
    // boosted_by_name = human-readable display name (anon_XXXX)
    const bootboardInsert = db.prepare(`
      INSERT INTO bootboard (post_id, boosted_by, boosted_by_name) VALUES (?, ?, ?)
    `).run(postId, booterPubkey, displayName)

    // Use the unique bootboard row ID as bootEventId so multiple boots on the
    // same post each get their own payout set — prevents double-counting in earnings.
    const bootEventId = bootboardInsert.lastInsertRowid as number

    // Update or create boot_grants (paid boot — increment total_boots only)
    const existing = db.prepare(
      'SELECT pubkey FROM boot_grants WHERE pubkey = ?'
    ).get(booterPubkey)

    if (existing) {
      db.prepare(
        'UPDATE boot_grants SET total_boots = total_boots + 1 WHERE pubkey = ?'
      ).run(booterPubkey)
    } else {
      db.prepare(
        'INSERT INTO boot_grants (pubkey, free_boots_used, total_boots) VALUES (?, 0, 1)'
      ).run(booterPubkey)
    }

    // Record payouts for the audit trail
    if (split.platform.sats > 0) {
      db.prepare(
        'INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(bootEventId, 'platform', split.platform.address, split.platform.sats, 'platform', txid)
    }

    if (split.creatorBonus.sats > 0) {
      db.prepare(
        'INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(bootEventId, split.creatorBonus.pubkey, split.creatorBonus.address, split.creatorBonus.sats, 'boost_bonus', txid)
    }

    for (const recipient of split.pool) {
      if (recipient.sats > 0) {
        db.prepare(
          'INSERT INTO payouts (boot_event_id, recipient_pubkey, recipient_address, amount_sats, payout_type, txid) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(bootEventId, recipient.pubkey, recipient.address, recipient.sats, 'pool_share', txid)
      }
    }
  })()

  return NextResponse.json({ success: true })
}
