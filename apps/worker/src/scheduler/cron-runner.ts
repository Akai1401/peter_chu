import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  isSlotTriggerMinute,
  getCurrentSlotKey,
  generateIdempotencyKey,
  createMessagePreview,
  type BotStatus
} from '@messenger/shared';
import { MessengerClient } from '../messenger/playwright-client.js';
import { LockManager } from '../safety/lock-manager.js';
import { RateLimiter } from '../safety/rate-limiter.js';

export interface ReminderRow {
  id: string;
  title: string;
  content: string;
  target_thread_id: string;
  active: number;
  window_start: string;
  window_end: string;
  interval_minutes: number;
}

export class CronRunner {
  private db: Database;
  private messengerClient: MessengerClient;
  private lockManager: LockManager;
  private rateLimiter: RateLimiter;
  private workerId: string;
  private timer: NodeJS.Timeout | null = null;
  private testTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(
    db: Database,
    messengerClient: MessengerClient,
    lockManager: LockManager,
    rateLimiter: RateLimiter,
    workerId: string = `worker-${randomUUID().substring(0, 8)}`
  ) {
    this.db = db;
    this.messengerClient = messengerClient;
    this.lockManager = lockManager;
    this.rateLimiter = rateLimiter;
    this.workerId = workerId;
  }

  getWorkerId(): string {
    return this.workerId;
  }

  /**
   * Run one iteration of schedule checking
   */
  async tick(now: Date = new Date()): Promise<{
    processed: number;
    dispatched: number;
    skipped: number;
  }> {
    const stats = { processed: 0, dispatched: 0, skipped: 0 };

    // 1. Acquire / renew worker singleton lease (TTL 30s)
    const hasLock = this.lockManager.acquireLock('worker_singleton', this.workerId, 30);
    if (!hasLock) {
      // Another worker instance holds the active lease
      return stats;
    }

    // 2. Read bot state
    const botStateRow = this.db.prepare(`
      SELECT status, emergency_stop as emergencyStop, dry_run as dryRun
      FROM bot_state
      WHERE id = 1
    `).get() as { status: BotStatus; emergencyStop: number; dryRun: number } | undefined;

    if (!botStateRow) return stats;

    // Update heartbeat
    const nowIso = now.toISOString();
    this.db.prepare(`
      UPDATE bot_state
      SET last_heartbeat = ?, lock_holder_id = ?
      WHERE id = 1
    `).run(nowIso, this.workerId);

    // If bot is stopped or emergency stopped, abort processing
    if (botStateRow.status !== 'RUNNING' || botStateRow.emergencyStop === 1) {
      return stats;
    }

    // Synchronize dry-run flag from database (single source of truth)
    const isDryRun = Boolean(botStateRow.dryRun);
    this.messengerClient.setDryRun(isDryRun);

    // 3. Query active reminders
    const reminders = this.db.prepare(`
      SELECT id, title, content, target_thread_id, active,
             window_start, window_end, interval_minutes
      FROM reminders
      WHERE active = 1
    `).all() as ReminderRow[];

    for (const reminder of reminders) {
      stats.processed += 1;

      // Check if current minute in Asia/Ho_Chi_Minh matches window and interval
      const isSlot = isSlotTriggerMinute(
        now,
        reminder.window_start,
        reminder.window_end,
        reminder.interval_minutes
      );

      if (!isSlot) {
        stats.skipped += 1;
        continue;
      }

      // Slot key format: "YYYY-MM-DD HH:mm" in ICT
      const slotKey = getCurrentSlotKey(now);
      const idempotencyKey = generateIdempotencyKey(
        reminder.id,
        reminder.target_thread_id,
        slotKey
      );

      // 4. Anti-duplicate singleton slot check
      const lockAcquired = this.lockManager.acquireSlotLock(idempotencyKey, this.workerId, 24);
      if (!lockAcquired) {
        stats.skipped += 1;
        continue; // Already processed for this time slot
      }

      // 5. Rate limiting check
      const rateCheck = this.rateLimiter.canSend(reminder.target_thread_id);
      const preview = createMessagePreview(reminder.content);

      if (!rateCheck.allowed) {
        // Record rate-limited skip
        this.recordExecutionLog({
          reminderId: reminder.id,
          threadId: reminder.target_thread_id,
          status: 'SKIPPED_RATE_LIMITED',
          idempotencyKey,
          messagePreview: preview,
          details: { reason: rateCheck.reason, slotKey }
        });
        stats.skipped += 1;
        continue;
      }

      // 6. Dispatch message via Playwright client (or dry-run mock)
      const sendResult = await this.messengerClient.sendMessage(
        reminder.target_thread_id,
        reminder.content
      );

      const execStatus = sendResult.dryRun
        ? 'DRY_RUN'
        : sendResult.success
        ? 'SUCCESS'
        : 'FAILED';

      this.recordExecutionLog({
        reminderId: reminder.id,
        threadId: reminder.target_thread_id,
        status: execStatus,
        idempotencyKey,
        messagePreview: preview,
        details: {
          slotKey,
          dryRun: sendResult.dryRun,
          error: sendResult.error
        }
      });

      this.rateLimiter.recordSend(reminder.target_thread_id);
      stats.dispatched += 1;
    }

    return stats;
  }

  private recordExecutionLog(data: {
    reminderId: string;
    threadId: string;
    status: string;
    idempotencyKey: string;
    messagePreview: string;
    details?: Record<string, unknown>;
  }): void {
    const id = randomUUID();
    const executedAt = new Date().toISOString();
    const detailsJson = data.details ? JSON.stringify(data.details) : null;

    this.db.prepare(`
      INSERT INTO execution_logs (
        id, reminder_id, thread_id, status, idempotency_key, message_preview, executed_at, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.reminderId,
      data.threadId,
      data.status,
      data.idempotencyKey,
      data.messagePreview,
      executedAt,
      detailsJson
    );
  }

  /**
   * Check and execute on-demand test dispatch requests
   */
  async processTestQueue(): Promise<void> {
    try {
      const pending = this.db.prepare(`
        SELECT id, reminder_id, target_thread_id, content
        FROM test_dispatch_queue
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
        LIMIT 1
      `).get() as { id: string; reminder_id: string; target_thread_id: string; content: string } | undefined;

      if (!pending) return;

      this.db.prepare(`UPDATE test_dispatch_queue SET status = 'PROCESSING' WHERE id = ?`).run(pending.id);

      const botStateRow = this.db.prepare(`
        SELECT status, emergency_stop as emergencyStop, dry_run as dryRun
        FROM bot_state
        WHERE id = 1
      `).get() as { status: BotStatus; emergencyStop: number; dryRun: number } | undefined;

      const isDryRun = Boolean(botStateRow?.dryRun);
      this.messengerClient.setDryRun(isDryRun);

      const sendResult = await this.messengerClient.sendMessage(pending.target_thread_id, pending.content);
      const finishedAt = new Date().toISOString();
      const status = sendResult.dryRun ? 'COMPLETED' : sendResult.success ? 'COMPLETED' : 'FAILED';

      this.db.prepare(`
        UPDATE test_dispatch_queue
        SET status = ?, error = ?, finished_at = ?
        WHERE id = ?
      `).run(status, sendResult.error || null, finishedAt, pending.id);

      // Record in execution logs
      const preview = createMessagePreview(pending.content);
      const slotKey = `test-${Date.now()}`;
      const idempotencyKey = generateIdempotencyKey(pending.reminder_id, pending.target_thread_id, slotKey);

      this.recordExecutionLog({
        reminderId: pending.reminder_id,
        threadId: pending.target_thread_id,
        status: sendResult.dryRun ? 'DRY_RUN' : sendResult.success ? 'SUCCESS' : 'FAILED',
        idempotencyKey,
        messagePreview: preview,
        details: {
          testTrigger: true,
          mode: sendResult.dryRun ? 'DRY_RUN' : 'LIVE',
          error: sendResult.error
        }
      });
    } catch (err: any) {
      console.warn('[Worker] Error processing test queue:', err.message);
    }
  }

  /**
   * Start scheduling loop
   */
  start(intervalMs: number = 30000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run first tick immediately
    this.tick().catch(console.error);

    this.timer = setInterval(() => {
      this.tick().catch(console.error);
    }, intervalMs);

    // Check on-demand test dispatch queue every 1 second
    this.testTimer = setInterval(() => {
      this.processTestQueue().catch(console.error);
    }, 1000);
  }

  /**
   * Stop scheduling loop and release lock
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.testTimer) {
      clearInterval(this.testTimer);
      this.testTimer = null;
    }
    this.lockManager.releaseLock('worker_singleton', this.workerId);
    await this.messengerClient.close();
  }
}
