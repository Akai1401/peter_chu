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
  action_type?: string;
  call_duration_seconds?: number;
  max_runs?: number;
  run_count?: number;
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
  private isTicking: boolean = false;

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
    if (this.isTicking) {
      return stats;
    }
    this.isTicking = true;

    try {
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

    // 3. Query active reminders
    const reminders = this.db.prepare(`
      SELECT id, title, content, target_thread_id, action_type, call_duration_seconds, active,
             max_runs, run_count, window_start, window_end, interval_minutes
      FROM reminders
      WHERE active = 1
    `).all() as ReminderRow[];

    for (const reminder of reminders) {
      // Check if max runs already reached
      if (reminder.max_runs && reminder.max_runs > 0 && (reminder.run_count || 0) >= reminder.max_runs) {
        this.db.prepare('UPDATE reminders SET active = 0 WHERE id = ?').run(reminder.id);
        stats.skipped += 1;
        continue;
      }

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

      // Re-check current run_count from DB to prevent race conditions
      const currentReminder = this.db.prepare('SELECT active, max_runs, run_count FROM reminders WHERE id = ?').get(reminder.id) as { active: number; max_runs: number; run_count: number } | undefined;
      if (!currentReminder || currentReminder.active !== 1 || (currentReminder.max_runs > 0 && currentReminder.run_count >= currentReminder.max_runs)) {
        stats.skipped += 1;
        continue;
      }

      // Immediately reserve this execution run in DB to avoid parallel executions
      const nextRunCount = (currentReminder.run_count || 0) + 1;
      const willDeactivate = currentReminder.max_runs > 0 && nextRunCount >= currentReminder.max_runs;
      this.db.prepare('UPDATE reminders SET run_count = ?, active = ? WHERE id = ?').run(
        nextRunCount,
        willDeactivate ? 0 : 1,
        reminder.id
      );

      // 5. Rate limiting check
      const rateCheck = this.rateLimiter.canSend(reminder.target_thread_id);
      const actionType = reminder.action_type || 'MESSAGE';
      const callDuration = reminder.call_duration_seconds || 25;
      const preview = actionType === 'AUDIO_CALL'
        ? `[Cuộc gọi thoại Messenger (${callDuration}s)]`
        : actionType === 'VIDEO_CALL'
        ? `[Cuộc gọi video Messenger (${callDuration}s)]`
        : actionType === 'MESSAGE_AND_CALL'
        ? `${createMessagePreview(reminder.content)} + [Gọi thoại Messenger]`
        : createMessagePreview(reminder.content);

      if (!rateCheck.allowed) {
        // Rollback reservation if rate-limited
        this.db.prepare('UPDATE reminders SET run_count = MAX(0, run_count - 1), active = ? WHERE id = ?').run(
          currentReminder.active,
          reminder.id
        );

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

      // 6. Dispatch action via Playwright client
      let isSuccess = true;
      let errorMsg: string | undefined;

      if (actionType === 'MESSAGE' || actionType === 'MESSAGE_AND_CALL') {
        const sendResult = await this.messengerClient.sendMessage(
          reminder.target_thread_id,
          reminder.content
        );
        if (!sendResult.dryRun && !sendResult.success) {
          isSuccess = false;
          errorMsg = sendResult.error;
        }
      }

      if (isSuccess && (actionType === 'AUDIO_CALL' || actionType === 'MESSAGE_AND_CALL')) {
        const callResult = await this.messengerClient.startCall(
          reminder.target_thread_id,
          'AUDIO',
          callDuration
        );
        if (!callResult.dryRun && !callResult.success) {
          isSuccess = false;
          errorMsg = callResult.error;
        }
      } else if (isSuccess && actionType === 'VIDEO_CALL') {
        const callResult = await this.messengerClient.startCall(
          reminder.target_thread_id,
          'VIDEO',
          callDuration
        );
        if (!callResult.dryRun && !callResult.success) {
          isSuccess = false;
          errorMsg = callResult.error;
        }
      }

      const execStatus = isSuccess ? 'SUCCESS' : 'FAILED';

      this.recordExecutionLog({
        reminderId: reminder.id,
        threadId: reminder.target_thread_id,
        status: execStatus,
        idempotencyKey,
        messagePreview: preview,
        details: {
          slotKey,
          actionType,
          error: errorMsg
        }
      });

      this.rateLimiter.recordSend(reminder.target_thread_id);
      stats.dispatched += 1;

      if (!isSuccess) {
        // Rollback reservation if execution failed
        this.db.prepare('UPDATE reminders SET run_count = MAX(0, run_count - 1), active = ? WHERE id = ?').run(
          currentReminder.active,
          reminder.id
        );
      }
    }

    return stats;
  } finally {
    this.isTicking = false;
  }
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
        SELECT id, reminder_id, target_thread_id, content, action_type, call_duration_seconds
        FROM test_dispatch_queue
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
        LIMIT 1
      `).get() as {
        id: string;
        reminder_id: string;
        target_thread_id: string;
        content: string;
        action_type?: string;
        call_duration_seconds?: number;
      } | undefined;

      if (!pending) return;

      this.db.prepare(`UPDATE test_dispatch_queue SET status = 'PROCESSING' WHERE id = ?`).run(pending.id);

      const botStateRow = this.db.prepare(`
        SELECT status, emergency_stop as emergencyStop, dry_run as dryRun
        FROM bot_state
        WHERE id = 1
      `).get() as { status: BotStatus; emergencyStop: number; dryRun: number } | undefined;

      const actionType = pending.action_type || 'MESSAGE';
      const callDuration = pending.call_duration_seconds || 25;

      let isSuccess = true;
      let errorMsg: string | undefined;

      if (actionType === 'MESSAGE' || actionType === 'MESSAGE_AND_CALL') {
        const sendResult = await this.messengerClient.sendMessage(pending.target_thread_id, pending.content);
        if (!sendResult.success) {
          isSuccess = false;
          errorMsg = sendResult.error;
        }
      }

      if (isSuccess && (actionType === 'AUDIO_CALL' || actionType === 'MESSAGE_AND_CALL')) {
        const callResult = await this.messengerClient.startCall(
          pending.target_thread_id,
          'AUDIO',
          callDuration
        );
        if (!callResult.success) {
          isSuccess = false;
          errorMsg = callResult.error;
        }
      } else if (isSuccess && actionType === 'VIDEO_CALL') {
        const callResult = await this.messengerClient.startCall(
          pending.target_thread_id,
          'VIDEO',
          callDuration
        );
        if (!callResult.success) {
          isSuccess = false;
          errorMsg = callResult.error;
        }
      }

      const finishedAt = new Date().toISOString();
      const status = isSuccess ? 'COMPLETED' : 'FAILED';

      this.db.prepare(`
        UPDATE test_dispatch_queue
        SET status = ?, error = ?, finished_at = ?
        WHERE id = ?
      `).run(status, errorMsg || null, finishedAt, pending.id);

      // Record in execution logs
      const preview = actionType === 'AUDIO_CALL'
        ? `[Cuộc gọi thoại Messenger (${callDuration}s)]`
        : actionType === 'VIDEO_CALL'
        ? `[Cuộc gọi video Messenger (${callDuration}s)]`
        : actionType === 'MESSAGE_AND_CALL'
        ? `${createMessagePreview(pending.content)} + [Gọi thoại Messenger]`
        : createMessagePreview(pending.content);

      const slotKey = `test-${Date.now()}`;
      const idempotencyKey = generateIdempotencyKey(pending.reminder_id, pending.target_thread_id, slotKey);

      this.recordExecutionLog({
        reminderId: pending.reminder_id,
        threadId: pending.target_thread_id,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        idempotencyKey,
        messagePreview: preview,
        details: {
          testTrigger: true,
          actionType,
          mode: 'LIVE',
          error: errorMsg
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
