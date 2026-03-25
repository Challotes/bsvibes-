import { NextResponse } from 'next/server'
import { getPosts, getBootboard } from '@/app/actions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [posts, bootboard] = await Promise.all([getPosts(), getBootboard()])
  return NextResponse.json({ posts, bootboard })
}
