import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getBootPriceForUser, getBootPrice } from '@/services/fairness/pricing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/boot-status?pubkey=<address>
 *
 * Returns the current free boots remaining and boot price for the given identity.
 * Used by Feed.tsx to initialise client-side state on first load.
 */
export async function GET(req: NextRequest) {
  const pubkey = req.nextUrl.searchParams.get('pubkey') ?? ''

  if (!pubkey || pubkey.trim().length === 0) {
    const price = getBootPrice(db)
    return NextResponse.json({ freeBootsRemaining: 0, bootPrice: price, isFree: false })
  }

  const { price, isFree, freeRemaining } = getBootPriceForUser(db, pubkey)

  return NextResponse.json({
    freeBootsRemaining: freeRemaining,
    bootPrice: price > 0 ? price : getBootPrice(db),
    isFree,
  })
}
