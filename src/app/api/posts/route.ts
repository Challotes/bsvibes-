import { NextRequest, NextResponse } from 'next/server'
import { getPosts, getNewPosts, getBootboard, getUpdatedPosts } from '@/app/actions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sinceIdParam = request.nextUrl.searchParams.get('since_id')
  const sinceId = sinceIdParam !== null ? parseInt(sinceIdParam, 10) : null
  // Client sends IDs of posts it has that are missing tx_id (chain icon)
  const pendingTxParam = request.nextUrl.searchParams.get('pending_tx')

  const pendingIds: number[] = pendingTxParam
    ? pendingTxParam.split(',').map(Number).filter(Number.isFinite).slice(0, 100)
    : []

  const [posts, bootboard, updated] = await Promise.all([
    sinceId !== null && Number.isFinite(sinceId) && sinceId >= 0
      ? getNewPosts(sinceId)
      : getPosts(),
    getBootboard(),
    pendingIds.length > 0 ? getUpdatedPosts(pendingIds) : Promise.resolve([]),
  ])

  return NextResponse.json({ posts, bootboard, updated })
}
