import { HttpException } from '@nestjs/common';

export interface RateLimiter {
  check(key: string): void;
}

/**
 * Fixed-window in-memory rate limiter (docs/features/04-sessions-attempts.md NFR).
 * 10/min/IP for public join; documented for a Redis swap when we scale beyond one instance.
 */
export function createRateLimiter(
  limit: number,
  windowMs: number,
): RateLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string): void {
      const now = Date.now();
      const entry = entries.get(key);
      if (!entry || entry.resetAt <= now) {
        if (entry) entries.delete(key);
        entries.set(key, { count: 1, resetAt: now + windowMs });
        // opportunistic eviction of stale entries to bound memory
        if (entries.size > 500) {
          for (const [k, v] of entries) {
            if (v.resetAt <= now) entries.delete(k);
          }
        }
        return;
      }
      entry.count += 1;
      if (entry.count > limit) {
        throw new HttpException('too_many_requests', 429);
      }
    },
  };
}
