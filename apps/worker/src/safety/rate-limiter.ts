import type { Database } from 'better-sqlite3';

export interface RateLimiterOptions {
  maxPerHour?: number;
  minSecondsBetween?: number;
}

export class RateLimiter {
  private db: Database;
  private maxPerHour: number;
  private minSecondsBetween: number;
  private lastSendTimes: Map<string, number> = new Map();

  constructor(db: Database, options?: RateLimiterOptions) {
    this.db = db;
    this.maxPerHour = options?.maxPerHour ?? parseInt(process.env.MAX_MESSAGES_PER_HOUR || '10', 10);
    this.minSecondsBetween = options?.minSecondsBetween ?? parseInt(process.env.MIN_SECONDS_BETWEEN_MESSAGES || '5', 10);
  }

  /**
   * Check if sending to thread is permitted under rate limit policies
   */
  canSend(threadId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();

    // 1. Minimum interval check (in-memory)
    const lastSend = this.lastSendTimes.get(threadId) || 0;
    const elapsedSeconds = (now - lastSend) / 1000;
    if (elapsedSeconds < this.minSecondsBetween) {
      return {
        allowed: false,
        reason: `Rate limit: cooldown active. Wait ${Math.ceil(this.minSecondsBetween - elapsedSeconds)}s.`
      };
    }

    // 2. Max per hour check from execution logs in SQLite
    const countRow = this.db.prepare(`
      SELECT COUNT(*) as cnt
      FROM execution_logs
      WHERE thread_id = ? AND status IN ('SUCCESS', 'DRY_RUN') AND datetime(executed_at) >= datetime('now', '-1 hour')
    `).get(threadId) as { cnt: number };

    if (countRow && countRow.cnt >= this.maxPerHour) {
      return {
        allowed: false,
        reason: `Rate limit: exceeded maximum ${this.maxPerHour} messages per hour for thread ${threadId}.`
      };
    }

    return { allowed: true };
  }

  /**
   * Record that a message was sent
   */
  recordSend(threadId: string): void {
    this.lastSendTimes.set(threadId, Date.now());
  }

  /**
   * Reset rate limiter cache (useful for testing)
   */
  reset(): void {
    this.lastSendTimes.clear();
  }
}
