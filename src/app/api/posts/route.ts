import { NextRequest, NextResponse } from 'next/server'
import { getPosts, getNewPosts, getBootboard } from '@/app/actions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sinceIdParam = request.nextUrl.searchParams.get('since_id')
  const sinceId = sinceIdParam !== null ? parseInt(sinceIdParam, 10) : null

  const [posts, bootboard] = await Promise.all([
    sinceId !== null && Number.isFinite(sinceId) && sinceId >= 0
      ? getNewPosts(sinceId)
      : getPosts(),
    getBootboard(),
  ])

  return NextResponse.json({ posts, bootboard })
}
