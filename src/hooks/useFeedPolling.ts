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

  const fetchFeed = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      const res = await fetch('/api/posts', { cache: 'no-store' })
      if (!res.ok) return
      const data: FeedPollingResult = await res.json()
      setPosts(data.posts)
      setBootboard(data.bootboard)
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

  return { posts, setPosts, bootboard, setBootboard }
}
