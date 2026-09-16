import type { Database } from 'better-sqlite3';

export class LockManager {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Attempt to acquire a singleton lock with TTL in seconds.
   * If lock already exists and hasn't expired, acquisition fails.
   */
  acquireLock(lockKey: string, holderId: string, ttlSeconds: number = 30): boolean {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const nowIso = now.toISOString();

    // Clean up expired lock for this key first
    this.db.prepare(`
      DELETE FROM singleton_locks
      WHERE lock_key = ? AND expires_at < ?
    `).run(lockKey, nowIso);

    // Try insert or update if held by the same holder
    try {
      const stmt = this.db.prepare(`
        INSERT INTO singleton_locks (lock_key, holder_id, acquired_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(lock_key) DO UPDATE SET
          expires_at = excluded.expires_at,
          acquired_at = excluded.acquired_at
        WHERE singleton_locks.holder_id = excluded.holder_id
      `);
      const result = stmt.run(lockKey, holderId, nowIso, expiresAt);
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  /**
   * Extend the TTL of an already held lock
   */
  renewLock(lockKey: string, holderId: string, ttlSeconds: number = 30): boolean {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    const stmt = this.db.prepare(`
      UPDATE singleton_locks
      SET expires_at = ?
      WHERE lock_key = ? AND holder_id = ?
    `);
    const result = stmt.run(expiresAt, lockKey, holderId);
    return result.changes > 0;
  }

  /**
   * Release lock
   */
  releaseLock(lockKey: string, holderId: string): void {
    this.db.prepare(`
      DELETE FROM singleton_locks
      WHERE lock_key = ? AND holder_id = ?
    `).run(lockKey, holderId);
  }

  /**
   * Atomic idempotency check: returns true if this key has NOT been executed before
   * and marks it as locked to prevent duplicates (cannot be re-acquired by anyone until expired).
   */
  acquireSlotLock(idempotencyKey: string, holderId: string, ttlHours: number = 24): boolean {
    const lockKey = `slot:${idempotencyKey}`;
    const nowIso = new Date().toISOString();

    // 1. Clean up expired lock for this slot first
    this.db.prepare(`
      DELETE FROM singleton_locks
      WHERE lock_key = ? AND expires_at < ?
    `).run(lockKey, nowIso);

    // 2. Check if an execution log already exists with this idempotency key
    const existingLog = this.db.prepare(`
      SELECT id FROM execution_logs
      WHERE idempotency_key = ? AND status IN ('SUCCESS', 'DRY_RUN')
      LIMIT 1
    `).get(idempotencyKey);

    if (existingLog) {
      return false; // Already executed!
    }

    // 3. Atomically acquire exclusive slot lock (fails on conflict!)
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO singleton_locks (lock_key, holder_id, acquired_at, expires_at)
        VALUES (?, ?, ?, ?)
      `);
      const result = stmt.run(lockKey, holderId, now.toISOString(), expiresAt);
      return result.changes > 0;
    } catch {
      // Slot lock already exists/held!
      return false;
    }
  }

  /**
   * Check if a slot is already locked or executed (without acquiring it)
   */
  isSlotLocked(idempotencyKey: string): boolean {
    const lockKey = `slot:${idempotencyKey}`;
    const nowIso = new Date().toISOString();

    const existingLog = this.db.prepare(`
      SELECT id FROM execution_logs
      WHERE idempotency_key = ? AND status IN ('SUCCESS', 'DRY_RUN')
      LIMIT 1
    `).get(idempotencyKey);

    if (existingLog) return true;

    const activeLock = this.db.prepare(`
      SELECT lock_key FROM singleton_locks
      WHERE lock_key = ? AND expires_at >= ?
      LIMIT 1
    `).get(lockKey, nowIso);

    return Boolean(activeLock);
  }
}
