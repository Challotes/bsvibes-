/**
 * Simple in-memory rate limiter using a sliding window approach.
 * Not suitable for multi-process deployments — use Redis for that.
 * Fine for a single Next.js server process as a first line of defense.
 */

interface RateLimitEntry {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 60 seconds to prevent unbounded memory growth.
let cleanupScheduled = false

function scheduleCleanup(windowMs: number) {
  if (cleanupScheduled) return
  cleanupScheduled = true
  setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter(ts => ts > cutoff)
      if (entry.timestamps.length === 0) {
        store.delete(key)
      }
    }
  }, 60_000)
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window. */
  limit: number
  /** Sliding window duration in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  success: boolean
  /** Requests remaining in the current window. */
  remaining: number
  /** Milliseconds until the oldest request in the window expires. */
  resetMs: number
}

/**
 * Check and record a rate-limited action.
 *
 * @param key     Unique identifier for the caller (e.g. author name, action label).
 * @param config  Limit and window configuration.
 */
export function rateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const { limit, windowMs } = config

  scheduleCleanup(windowMs)

  const now = Date.now()
  const cutoff = now - windowMs

  let entry = store.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  // Drop timestamps outside the current window.
  entry.timestamps = entry.timestamps.filter(ts => ts > cutoff)

  const count = entry.timestamps.length

  if (count >= limit) {
    // Oldest timestamp tells us when the window next frees a slot.
    const oldest = entry.timestamps[0]
    return {
      success: false,
      remaining: 0,
      resetMs: oldest + windowMs - now,
    }
  }

  entry.timestamps.push(now)

  return {
    success: true,
    remaining: limit - entry.timestamps.length,
    resetMs: 0,
  }
}
