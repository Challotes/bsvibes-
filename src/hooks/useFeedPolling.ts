'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Post, BootboardData } from '@/types'

interface FeedPollingResult {
  posts: Post[]
  bootboard: BootboardData
}

interface UseFeedPollingOptions {
  initialPosts: Post[]
  initialBootboard: BootboardData
  intervalMs?: number
}

export function useFeedPolling({
  initialPosts,
  initialBootboard,
  intervalMs = 5000,
}: UseFeedPollingOptions) {
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [bootboard, setBootboard] = useState<BootboardData>(initialBootboard)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFetchingRef = useRef(false)
  // Tracks the highest post id we have seen — null means first poll hasn't run yet
  const latestIdRef = useRef<number | null>(
    initialPosts.length > 0 ? initialPosts[0].id : null
  )

  const fetchFeed = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      const latestId = latestIdRef.current
      const url =
        latestId !== null
          ? `/api/posts?since_id=${latestId}`
          : '/api/posts'

      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return
      const data: FeedPollingResult = await res.json()

      setBootboard(data.bootboard)

      if (data.posts.length === 0) {
        // No new posts — nothing to merge
        return
      }

      if (latestId === null) {
        // First incremental poll — replace the full set
        setPosts(data.posts)
      } else {
        // Prepend new posts (they arrive newest-first from the API)
        setPosts(prev => [...data.posts, ...prev])
      }

      // data.posts is ordered DESC, so index 0 is the newest
      const newMax = data.posts[0].id
      if (latestIdRef.current === null || newMax > latestIdRef.current) {
        latestIdRef.current = newMax
      }
    } catch {
      // Silently ignore network errors — stale data is fine
    } finally {
      isFetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    function schedule() {
      timerRef.current = setTimeout(async () => {
        // Only poll when the tab is visible
        if (document.visibilityState === 'visible') {
          await fetchFeed()
        }
        schedule()
      }, intervalMs)
    }

    // Resume polling immediately when tab becomes visible again
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        fetchFeed()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    schedule()

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [fetchFeed, intervalMs])

  return { posts, setPosts, bootboard, setBootboard, refresh: fetchFeed }
}
