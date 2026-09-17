import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  isSlotTriggerMinute,
  getCurrentSlotKey,
  generateIdempotencyKey,
  createMessagePreview,
  isSchedulePastDue,
  type BotStatus
} from '@messenger/shared/node';
import { MessengerClient } from '../messenger/playwright-client.js';
import { LockManager } from '../safety/lock-manager.js';
import { RateLimiter } from '../safety/rate-limiter.js';
import { GeminiService, extractReminderPayload } from '../ai/gemini-service.js';

export interface ReminderRow {
  id: string;
  title: string;
  content: string;
  target_thread_id: string;
  action_type?: string;
  call_duration_seconds?: number;
  wake_up_mode?: number;
  ai_generate_message?: number;
  max_runs?: number;
  run_count?: number;
  target_date?: string | null;
  active: number;
  window_start: string;
  window_end: string;
  interval_minutes: number;
  created_at?: string;
}

export class CronRunner {
  private db: Database;
  private messengerClient: MessengerClient;
  private lockManager: LockManager;
  private rateLimiter: RateLimiter;
  private geminiService: GeminiService;
  private workerId: string;
  private timer: NodeJS.Timeout | null = null;
  private testTimer: NodeJS.Timeout | null = null;
  private sessionTimer: NodeJS.Timeout | null = null;
  private aiTimer: NodeJS.Timeout | null = null;
  private proactiveTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isTicking: boolean = false;
  private isProcessingQueue: boolean = false;
  private isCheckingSession: boolean = false;
  private isProcessingAiReply: boolean = false;
  private isProcessingProactive: boolean = false;
  private hasPendingSchedule: boolean = false;

  constructor(
    db: Database,
    messengerClient: MessengerClient,
    lockManager: LockManager,
    rateLimiter: RateLimiter,
    workerId: string = `worker-${randomUUID().substring(0, 8)}`,
    geminiService?: GeminiService
  ) {
    this.db = db;
    this.messengerClient = messengerClient;
    this.lockManager = lockManager;
    this.rateLimiter = rateLimiter;
    this.workerId = workerId;
    this.geminiService = geminiService || new GeminiService();
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

    // Schedule priority: only yield AI Auto-Reply if there are ACTUALLY reminders due right now
    if (this.isProcessingAiReply && this.hasDueReminders()) {
      console.log('[Scheduler] Reminders due while AI reply is processing. Prioritizing schedule execution...');
      this.hasPendingSchedule = true;
      for (let i = 0; i < 30 && this.isProcessingAiReply; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
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
      SELECT status, emergency_stop as emergencyStop, dry_run as dryRun, session_status as sessionStatus,
             ai_target_thread as aiTargetThread
      FROM bot_state
      WHERE id = 1
    `).get() as { status: BotStatus; emergencyStop: number; dryRun: number; sessionStatus?: string; aiTargetThread?: string } | undefined;

    if (!botStateRow) return stats;

    // Update heartbeat
    const nowIso = now.toISOString();
    this.db.prepare(`
      UPDATE bot_state
      SET last_heartbeat = ?, lock_holder_id = ?
      WHERE id = 1
    `).run(nowIso, this.workerId);

    // If Messenger is not connected, immediately stop system so it cannot run
    if (botStateRow.sessionStatus !== 'LOGGED_IN') {
      if (botStateRow.status !== 'STOPPED') {
        this.db.prepare(`
          UPDATE bot_state
          SET status = 'STOPPED', updated_at = CURRENT_TIMESTAMP
          WHERE id = 1
        `).run();
        console.warn(`[Worker] Bot auto-stopped: Messenger session status is ${botStateRow.sessionStatus}`);
      }
      return stats;
    }

    // If bot is stopped or emergency stopped, abort processing
    if (botStateRow.status !== 'RUNNING' || botStateRow.emergencyStop === 1) {
      return stats;
    }

    // 3. Query active reminders
    const reminders = this.db.prepare(`
      SELECT id, title, content, target_thread_id, action_type, call_duration_seconds, wake_up_mode, ai_generate_message, active,
             max_runs, run_count, target_date, window_start, window_end, interval_minutes, created_at
      FROM reminders
      WHERE active = 1
    `).all() as ReminderRow[];

    for (const reminder of reminders) {
      // Check if max runs already reached
      if (reminder.max_runs && reminder.max_runs > 0 && (reminder.run_count || 0) >= reminder.max_runs) {
        this.db.prepare('UPDATE reminders SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(reminder.id);
        stats.skipped += 1;
        continue;
      }

      // Auto-stop if schedule is already past due (expired)
      if (isSchedulePastDue(reminder.target_date, reminder.window_end, reminder.max_runs, reminder.window_start, now)) {
        this.db.prepare('UPDATE reminders SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(reminder.id);
        this.recordAuditLog(
          'REMINDER_EXPIRED',
          'cron_runner',
          `Reminder "${reminder.title}" đã quá giờ chạy (${reminder.window_start}${reminder.target_date ? ` ngày ${reminder.target_date}` : ''}). Hệ thống tự động tắt (stop).`,
          'INFO'
        );
        stats.skipped += 1;
        continue;
      }

      // Check if specific target date is set and does not match today's date in ICT
      if (reminder.target_date) {
        const todayIct = getCurrentSlotKey(now).substring(0, 10);
        if (reminder.target_date !== todayIct) {
          stats.skipped += 1;
          continue;
        }
      }

      stats.processed += 1;

      const effectiveThreadId = (reminder.target_thread_id || '').trim() || (botStateRow.aiTargetThread || '').trim();
      if (!effectiveThreadId) {
        console.warn(`[CronRunner] Skipping reminder "${reminder.title}": No target thread configured.`);
        stats.skipped += 1;
        continue;
      }

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

      // Check Wake-up Mode (Chế độ gọi dậy): If customer has already replied, stop repeating immediately
      if (reminder.wake_up_mode === 1) {
        const recentReply = this.db.prepare(`
          SELECT id, message_text FROM ai_processed_messages
          WHERE thread_id = ? AND created_at >= ?
          ORDER BY created_at DESC LIMIT 1
        `).get(effectiveThreadId, reminder.created_at || '1970-01-01') as { id: string; message_text: string } | undefined;

        let hasReplied = Boolean(recentReply);
        let replySnippet = recentReply?.message_text;

        if (!hasReplied && !this.messengerClient.getDryRun()) {
          try {
            const incoming = await this.messengerClient.getLatestUnreadIncomingMessage(effectiveThreadId);
            if (incoming && incoming.messageText) {
              hasReplied = true;
              replySnippet = incoming.messageText;
            }
          } catch (e: any) {
            console.warn('[CronRunner] Check incoming message for wake-up mode warning:', e.message);
          }
        }

        if (hasReplied) {
          this.db.prepare('UPDATE reminders SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(reminder.id);
          this.recordAuditLog(
            'WAKE_UP_CALL_STOPPED',
            'cron_runner',
            `Lịch gọi dậy "${reminder.title}" tự động dừng do nhận được tin nhắn từ khách: "${(replySnippet || '').slice(0, 50)}"`,
            'INFO'
          );
          stats.skipped += 1;
          continue;
        }
      }

      // Slot key format: "YYYY-MM-DD HH:mm" in ICT
      const slotKey = getCurrentSlotKey(now);
      const idempotencyKey = generateIdempotencyKey(
        reminder.id,
        effectiveThreadId,
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
      const rateCheck = this.rateLimiter.canSend(effectiveThreadId);
      const actionType = reminder.action_type || 'MESSAGE';
      const callDuration = reminder.call_duration_seconds || 25;
      const initialPreview = actionType === 'AUDIO_CALL'
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
          threadId: effectiveThreadId,
          status: 'SKIPPED_RATE_LIMITED',
          idempotencyKey,
          messagePreview: initialPreview,
          details: { reason: rateCheck.reason, slotKey }
        });
        stats.skipped += 1;
        continue;
      }

      // 6. Dispatch action via Playwright client
      let isSuccess = true;
      let errorMsg: string | undefined;
      let effectiveMessageText = reminder.content;

      if (actionType === 'MESSAGE' || actionType === 'MESSAGE_AND_CALL') {
        if (reminder.ai_generate_message === 1 && this.geminiService.isConfigured()) {
          try {
            const persona = this.getActivePersona();
            const dynamicMsg = await this.geminiService.generateDynamicReminderMessage({
              promptDescription: reminder.content,
              persona,
              reminderTitle: reminder.title
            });
            if (dynamicMsg) {
              effectiveMessageText = dynamicMsg;
              console.log(`[CronRunner] Generated dynamic AI message for "${reminder.title}": "${dynamicMsg.slice(0, 50)}"`);
            }
          } catch (aiErr: any) {
            console.warn(`[CronRunner] Failed to generate AI message for "${reminder.title}", falling back to content:`, aiErr.message);
          }
        }

        const sendResult = await this.messengerClient.sendMessage(
          effectiveThreadId,
          effectiveMessageText
        );
        if (!sendResult.dryRun && !sendResult.success) {
          isSuccess = false;
          errorMsg = sendResult.error;
        }
      }

      let callOutcome: 'ANSWERED' | 'DECLINED' | 'NO_ANSWER' | 'TIMED_OUT' | undefined;

      if (isSuccess && (actionType === 'AUDIO_CALL' || actionType === 'MESSAGE_AND_CALL')) {
        const callResult = await this.messengerClient.startCall(
          effectiveThreadId,
          'AUDIO',
          callDuration
        );
        callOutcome = callResult.callOutcome;
        if (!callResult.dryRun && !callResult.success) {
          isSuccess = false;
          errorMsg = callResult.error;
        }
      } else if (isSuccess && actionType === 'VIDEO_CALL') {
        const callResult = await this.messengerClient.startCall(
          effectiveThreadId,
          'VIDEO',
          callDuration
        );
        callOutcome = callResult.callOutcome;
        if (!callResult.dryRun && !callResult.success) {
          isSuccess = false;
          errorMsg = callResult.error;
        }
      }

      // Check Wake-up Mode (Chế độ gọi dậy): If call was answered or declined/hung up, stop repeating
      if (reminder.wake_up_mode === 1 && (callOutcome === 'ANSWERED' || callOutcome === 'DECLINED')) {
        this.db.prepare('UPDATE reminders SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(reminder.id);
        const reason = callOutcome === 'ANSWERED' ? 'nghe máy' : 'tắt máy / từ chối cuộc gọi';
        this.recordAuditLog(
          'WAKE_UP_CALL_COMPLETED',
          'cron_runner',
          `Lịch gọi dậy "${reminder.title}" đã tự động dừng lặp do khách đã ${reason}.`,
          'INFO'
        );
      }

      const execStatus = isSuccess ? 'SUCCESS' : 'FAILED';
      const preview = actionType === 'AUDIO_CALL'
        ? `[Cuộc gọi thoại Messenger (${callDuration}s)]`
        : actionType === 'VIDEO_CALL'
        ? `[Cuộc gọi video Messenger (${callDuration}s)]`
        : actionType === 'MESSAGE_AND_CALL'
        ? `${createMessagePreview(effectiveMessageText)} + [Gọi thoại Messenger]`
        : createMessagePreview(effectiveMessageText);

      this.recordExecutionLog({
        reminderId: reminder.id,
        threadId: effectiveThreadId,
        status: execStatus,
        idempotencyKey,
        messagePreview: preview,
        details: {
          slotKey,
          actionType,
          callOutcome,
          aiGenerated: reminder.ai_generate_message === 1 && effectiveMessageText !== reminder.content,
          effectiveMessage: reminder.ai_generate_message === 1 ? effectiveMessageText : undefined,
          error: errorMsg
        }
      });

      this.rateLimiter.recordSend(effectiveThreadId);
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
    this.hasPendingSchedule = false;
    this.isTicking = false;
  }
}

  private getActivePersona(): any {
    try {
      const botRow = this.db.prepare('SELECT learned_persona FROM bot_state WHERE id = 1').get() as { learned_persona?: string } | undefined;
      if (botRow?.learned_persona) {
        return JSON.parse(botRow.learned_persona);
      }
    } catch {}
    return null;
  }

  private getActiveTargetThread(): string {
    try {
      const row = this.db.prepare('SELECT ai_target_thread FROM bot_state WHERE id = 1').get() as { ai_target_thread?: string } | undefined;
      return (row?.ai_target_thread || '').trim();
    } catch {
      return '';
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

  private recordAuditLog(action: string, actor: string, details: string, level: string = 'INFO'): void {
    try {
      const id = randomUUID();
      this.db.prepare(`
        INSERT INTO audit_logs (id, timestamp, action, actor, details, level)
        VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
      `).run(id, action, actor, details, level);
    } catch (e) {
      console.error('[Worker] Failed to write audit log:', e);
    }
  }

  /**
   * Check and execute on-demand test dispatch requests
   */
  async processTestQueue(): Promise<void> {
    if (this.isProcessingQueue) return;

    // Check if there is actually any pending item FIRST
    if (!this.hasPendingTestQueue()) {
      return;
    }

    if (this.isProcessingAiReply) {
      console.log('[Worker] Test queue item pending while AI reply is in progress. Prioritizing test dispatch...');
      this.hasPendingSchedule = true;
      for (let i = 0; i < 30 && this.isProcessingAiReply; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    this.isProcessingQueue = true;
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

      const actionType = pending.action_type || 'MESSAGE';

      // 1. Special command: CHECK_SESSION
      if (actionType === 'CHECK_SESSION') {
        const sessionStatus = await this.messengerClient.checkSession(false);
        const nextStatus = sessionStatus === 'LOGGED_IN' ? undefined : 'STOPPED';
        if (nextStatus) {
          this.db.prepare(`UPDATE bot_state SET session_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(sessionStatus, nextStatus);
        } else {
          this.db.prepare(`UPDATE bot_state SET session_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(sessionStatus);
        }
        this.db.prepare(`UPDATE test_dispatch_queue SET status = 'COMPLETED', finished_at = ? WHERE id = ?`).run(
          new Date().toISOString(),
          pending.id
        );
        return;
      }

      // 2. Special command: CONNECT_MESSENGER
      if (actionType === 'CONNECT_MESSENGER') {
        await this.messengerClient.openLoginPage();
        // Poll for login success every 2 seconds without reloading the page
        let sessionStatus = 'UNAUTHENTICATED';
        const start = Date.now();
        while (Date.now() - start < 180000) {
          sessionStatus = await this.messengerClient.checkSession(false);
          if (sessionStatus === 'LOGGED_IN') {
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        const isSuccess = sessionStatus === 'LOGGED_IN';
        this.db.prepare(`UPDATE bot_state SET session_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(
          sessionStatus,
          isSuccess ? 'RUNNING' : 'STOPPED'
        );
        this.db.prepare(`UPDATE test_dispatch_queue SET status = ?, error = ?, finished_at = ? WHERE id = ?`).run(
          isSuccess ? 'COMPLETED' : 'FAILED',
          isSuccess ? null : 'Hết thời gian chờ đăng nhập',
          new Date().toISOString(),
          pending.id
        );
        return;
      }

      // 3. Special command: DISCONNECT
      if (actionType === 'DISCONNECT') {
        await this.messengerClient.disconnectSession();
        this.db.prepare(`UPDATE bot_state SET session_status = 'UNAUTHENTICATED', status = 'STOPPED', updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run();
        this.db.prepare(`UPDATE test_dispatch_queue SET status = 'COMPLETED', finished_at = ? WHERE id = ?`).run(
          new Date().toISOString(),
          pending.id
        );
        return;
      }

      // 4. Special command: CHECK_INCOMING
      if (actionType === 'CHECK_INCOMING') {
        const found = await this.checkAndReplyIncomingMessages(true);
        this.db.prepare(`UPDATE test_dispatch_queue SET status = 'COMPLETED', error = ?, finished_at = ? WHERE id = ?`).run(
          found ? 'FOUND_INCOMING' : 'NO_NEW_MESSAGES',
          new Date().toISOString(),
          pending.id
        );
        return;
      }

      // 4b. Special command: LEARN_PERSONA
      if (actionType === 'LEARN_PERSONA') {
        const targetThread = pending.target_thread_id;
        console.log(`[PersonaLearning] Starting persona learning job from thread: ${targetThread}...`);
        try {
          const { outgoingMessages, contextSnippet } =
            await this.messengerClient.extractOutgoingMessagesForLearning(targetThread, 4);

          if (!outgoingMessages || outgoingMessages.length < 2) {
            const errStr = 'Không tìm thấy đủ tin nhắn của bạn (tối thiểu 2 tin nhắn) trong cuộc hội thoại này để học văn phong.';
            this.db.prepare(`UPDATE test_dispatch_queue SET status = 'FAILED', error = ?, finished_at = ? WHERE id = ?`).run(
              errStr,
              new Date().toISOString(),
              pending.id
            );
            this.recordAuditLog('PERSONA_LEARN_FAILED', 'gemini_bot', `Thất bại khi học văn phong: ${errStr}`, 'WARN');
            return;
          }

          console.log(`[PersonaLearning] Analyzing ${outgoingMessages.length} messages with Gemini...`);
          const persona = await this.geminiService.analyzePersonaFromMessages(outgoingMessages, contextSnippet);
          const personaJson = JSON.stringify(persona);
          const nowIso = new Date().toISOString();

          this.db.prepare(`
            UPDATE bot_state
            SET learned_persona = ?, persona_source_thread = ?, persona_updated_at = ?, updated_at = ?
            WHERE id = 1
          `).run(personaJson, targetThread, nowIso, nowIso);

          this.db.prepare(`UPDATE test_dispatch_queue SET status = 'COMPLETED', error = ?, finished_at = ? WHERE id = ?`).run(
            personaJson,
            nowIso,
            pending.id
          );

          this.recordAuditLog(
            'PERSONA_LEARNED',
            'gemini_bot',
            `Đã học thành công văn phong từ hội thoại "${targetThread}": ${persona.styleSummary} (Xưng hô: ${persona.pronouns})`,
            'INFO'
          );
          console.log(`[PersonaLearning] Successfully learned and saved persona from ${targetThread}`);
        } catch (learnErr: any) {
          console.error(`[PersonaLearning] Failed:`, learnErr.message);
          this.db.prepare(`UPDATE test_dispatch_queue SET status = 'FAILED', error = ?, finished_at = ? WHERE id = ?`).run(
            learnErr.message,
            new Date().toISOString(),
            pending.id
          );
          this.recordAuditLog('PERSONA_LEARN_FAILED', 'gemini_bot', `Lỗi khi học văn phong: ${learnErr.message}`, 'ERROR');
        }
        return;
      }

      // 4c. Special command: PROACTIVE_TEST
      if (actionType === 'PROACTIVE_TEST') {
        const targetThread = pending.target_thread_id || '';
        console.log(`[ProactiveChat] Running test proactive message to ${targetThread}...`);
        try {
          const botRow = this.db.prepare(`
            SELECT learned_persona as learnedPersona, proactive_chat_config as proactiveConfig
            FROM bot_state
            WHERE id = 1
          `).get() as any;

          let persona = null;
          if (botRow?.learnedPersona) {
            try {
              persona = JSON.parse(botRow.learnedPersona);
            } catch {}
          }

          let guidance = pending.content || 'Hỏi thăm xem đang làm gì hoặc trêu đùa lầy lội';
          if (botRow?.proactiveConfig) {
            try {
              const parsedConfig = JSON.parse(botRow.proactiveConfig);
              if (parsedConfig.promptGuidance) guidance = parsedConfig.promptGuidance;
            } catch {}
          }

          const proactiveMsg = await this.geminiService.generateProactiveMessage({
            persona,
            guidance
          });

          console.log(`[ProactiveChat] Generated test message: "${proactiveMsg}"`);

          const sendResult = await this.messengerClient.sendMessage(targetThread, proactiveMsg);
          if (!sendResult.success) {
            throw new Error(sendResult.error || 'Failed to send proactive test message');
          }

          const nowIso = new Date().toISOString();
          this.db.prepare(`UPDATE test_dispatch_queue SET status = 'COMPLETED', error = NULL, finished_at = ? WHERE id = ?`).run(
            nowIso,
            pending.id
          );

          this.recordExecutionLog({
            reminderId: 'proactive-test',
            threadId: targetThread,
            status: 'SUCCESS',
            idempotencyKey: `proactive-test-${Date.now()}`,
            messagePreview: `[Chủ động nhắn tin]: ${proactiveMsg}`,
            details: {
              proactive: true,
              test: true,
              message: proactiveMsg
            }
          });

          this.recordAuditLog(
            'PROACTIVE_MESSAGE_SENT',
            'gemini_bot',
            `Đã gửi tin nhắn chủ động tới "${targetThread}": "${proactiveMsg}"`,
            'INFO'
          );
        } catch (proactiveErr: any) {
          console.error(`[ProactiveChat] Test failed:`, proactiveErr.message);
          this.db.prepare(`UPDATE test_dispatch_queue SET status = 'FAILED', error = ?, finished_at = ? WHERE id = ?`).run(
            proactiveErr.message,
            new Date().toISOString(),
            pending.id
          );
        }
        return;
      }

      const callDuration = pending.call_duration_seconds || 25;
      const effectiveTargetThread = (pending.target_thread_id || '').trim() || this.getActiveTargetThread();
      let isSuccess = true;
      let errorMsg: string | undefined;
      let effectiveContent = pending.content;

      if (actionType === 'MESSAGE' || actionType === 'MESSAGE_AND_CALL') {
        try {
          const remRow = this.db.prepare('SELECT title, ai_generate_message FROM reminders WHERE id = ?').get(pending.reminder_id) as { title?: string; ai_generate_message?: number } | undefined;
          if (remRow && remRow.ai_generate_message === 1 && this.geminiService.isConfigured()) {
            const persona = this.getActivePersona();
            const dynamicMsg = await this.geminiService.generateDynamicReminderMessage({
              promptDescription: pending.content,
              persona,
              reminderTitle: remRow.title
            });
            if (dynamicMsg) {
              effectiveContent = dynamicMsg;
              console.log(`[TestQueue] Generated dynamic AI message for "${remRow.title}": "${dynamicMsg.slice(0, 50)}"`);
            }
          }
        } catch (aiErr: any) {
          console.warn('[TestQueue] Error generating dynamic message via AI, using original content:', aiErr.message);
        }

        const sendResult = await this.messengerClient.sendMessage(
          effectiveTargetThread,
          effectiveContent
        );
        if (!sendResult.success) {
          isSuccess = false;
          errorMsg = sendResult.error;
        }
      }

      if (isSuccess && (actionType === 'AUDIO_CALL' || actionType === 'MESSAGE_AND_CALL')) {
        const callResult = await this.messengerClient.startCall(
          effectiveTargetThread,
          'AUDIO',
          callDuration
        );
        if (!callResult.success) {
          isSuccess = false;
          errorMsg = callResult.error;
        }
      } else if (isSuccess && actionType === 'VIDEO_CALL') {
        const callResult = await this.messengerClient.startCall(
          effectiveTargetThread,
          'VIDEO',
          callDuration
        );
        if (!callResult.success) {
          isSuccess = false;
          errorMsg = callResult.error;
        }
      }

      // If action failed due to unauthenticated session, immediately update session_status and STOP bot
      if (!isSuccess && errorMsg && (errorMsg.includes('Phiên đăng nhập') || errorMsg.includes('login') || errorMsg.includes('checkpoint'))) {
        this.db.prepare(`UPDATE bot_state SET session_status = 'UNAUTHENTICATED', status = 'STOPPED', updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run();
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
        ? `${createMessagePreview(effectiveContent)} + [Gọi thoại Messenger]`
        : createMessagePreview(effectiveContent);

      const slotKey = `test-${Date.now()}`;
      const idempotencyKey = generateIdempotencyKey(pending.reminder_id, effectiveTargetThread, slotKey);

      this.recordExecutionLog({
        reminderId: pending.reminder_id,
        threadId: effectiveTargetThread,
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
    } finally {
      this.hasPendingSchedule = false;
      this.isProcessingQueue = false;
    }
  }

  /**
   * Check for unread incoming Messenger messages and reply using Gemini AI
   */
  async checkAndReplyIncomingMessages(isManualTrigger: boolean = false): Promise<boolean> {
    if (this.isProcessingAiReply) {
      return false;
    }

    // PRIORITY RULE: Schedule execution and test dispatches ALWAYS have higher priority than AI Auto-Reply
    if (this.isTicking || (!isManualTrigger && (this.isProcessingQueue || this.hasPendingSchedule))) {
      console.log('[AI-AutoReply] Priority conflict: Schedule execution or test queue is active. Yielding priority to schedule.');
      if (isManualTrigger) {
        this.recordAuditLog(
          'INCOMING_MESSAGE_CHECK',
          'admin_dashboard',
          'Tạm hoãn quét tin nhắn: Hệ thống đang ưu tiên thực thi lịch nhắc nhở (Schedule Execution).',
          'INFO'
        );
      }
      return false;
    }

    if (!isManualTrigger) {
      if (this.hasPendingTestQueue()) {
        console.log('[AI-AutoReply] Priority conflict: Test dispatch queue has pending items. Yielding to test dispatch.');
        return false;
      }

      if (this.hasDueReminders()) {
        console.log('[AI-AutoReply] Priority conflict: Scheduled reminder is due for execution. Yielding priority to schedule execution.');
        return false;
      }
    }

    // Check bot state
    const botState = this.db.prepare(`
      SELECT status, emergency_stop as emergencyStop, dry_run as dryRun, session_status as sessionStatus,
             ai_auto_reply as aiAutoReply, ai_target_thread as aiTargetThread,
             learned_persona as learnedPersona
      FROM bot_state
      WHERE id = 1
    `).get() as {
      status: BotStatus;
      emergencyStop: number;
      dryRun: number;
      sessionStatus?: string;
      aiAutoReply?: number;
      aiTargetThread?: string;
      learnedPersona?: string;
    } | undefined;

    // Bot must be RUNNING, not emergency stopped, and session must be LOGGED_IN
    if (!botState || botState.status !== 'RUNNING' || botState.emergencyStop === 1 || botState.sessionStatus !== 'LOGGED_IN') {
      if (isManualTrigger) {
        this.recordAuditLog(
          'INCOMING_MESSAGE_CHECK',
          'admin_dashboard',
          `Không thể kiểm tra tin nhắn: Bot chưa ở trạng thái RUNNING hoặc Messenger chưa LOGGED_IN (Trạng thái hiện tại: ${botState?.status || 'UNKNOWN'}, Session: ${botState?.sessionStatus || 'UNKNOWN'})`,
          'WARN'
        );
      }
      return false;
    }

    const isAiEnabled = botState.aiAutoReply === undefined || botState.aiAutoReply === 1;

    this.isProcessingAiReply = true;
    try {
      if (botState.aiTargetThread && botState.aiTargetThread.trim()) {
        console.log(`[AI-AutoReply] Checking messages on configured thread: ${botState.aiTargetThread}...`);
      } else {
        console.log('[AI-AutoReply] Checking incoming messages on Messenger Web (all threads)...');
      }

      // 1. Detect unread incoming message via Playwright (targeting specific thread if configured)
      const incoming = await this.messengerClient.getLatestUnreadIncomingMessage(botState.aiTargetThread);
      if (!incoming || !incoming.messageText.trim()) {
        console.log('[AI-AutoReply] Scan complete: No new unread messages.');
        if (isManualTrigger) {
          this.recordAuditLog(
            'INCOMING_MESSAGE_CHECK',
            'admin_dashboard',
            botState.aiTargetThread
              ? `Đã quét hội thoại "${botState.aiTargetThread}": Không có tin nhắn mới từ khách.`
              : 'Đã quét tin nhắn trên Messenger Web: Không có tin nhắn mới nào chưa đọc.',
            'INFO'
          );
        }
        return false;
      }

      const { threadId, messageText, senderName, conversationHistory } = incoming;

      // 2. Deduplication: skip if we successfully processed this exact message recently (45 seconds)
      // to avoid re-triggering while the DOM updates or on consecutive fast scan cycles.
      const alreadyHandled = this.db.prepare(`
        SELECT id FROM ai_processed_messages
        WHERE thread_id = ? AND message_text = ?
          AND created_at >= datetime('now', '-45 seconds')
          AND reply_text NOT LIKE '[ERROR:%' AND reply_text NOT LIKE '[SEND_FAILED:%'
        LIMIT 1
      `).get(threadId, messageText);

      if (alreadyHandled) {
        console.log(`[AI-AutoReply] Message from ${threadId} was already processed, skipping.`);
        if (isManualTrigger) {
          this.recordAuditLog(
            'INCOMING_MESSAGE_CHECK',
            'admin_dashboard',
            `Tin nhắn gần nhất ("${createMessagePreview(messageText)}") đã được xử lý, bỏ qua.`,
            'INFO'
          );
        }
        return false;
      }

      // Also check recent outgoing executions from bot (reminders or calls)
      const cleanSnippet = messageText.trim().slice(0, 30);
      if (cleanSnippet.length > 3) {
        const recentBotSend = this.db.prepare(`
          SELECT id FROM execution_logs
          WHERE thread_id = ?
            AND status = 'SUCCESS'
            AND reminder_id != 'incoming_message'
            AND (message_preview LIKE ? OR details LIKE ?)
            AND executed_at >= datetime('now', '-2 hours')
          LIMIT 1
        `).get(threadId, `%${cleanSnippet}%`, `%${cleanSnippet}%`);

        if (recentBotSend) {
          console.log(`[AI-AutoReply] Message matches recent bot dispatch in thread ${threadId}, skipping.`);
          return false;
        }
      }

      const senderDisplay = senderName ? `${senderName} (${threadId})` : threadId;
      const incomingRecordId = randomUUID();

      // 3. Record incoming message in Audit Logs
      this.recordAuditLog(
        'INCOMING_MESSAGE_RECEIVED',
        senderName || 'messenger_user',
        `Tin nhắn đến từ ${senderDisplay}: "${createMessagePreview(messageText)}"`,
        'INFO'
      );

      console.log(`[Incoming-Message] Received message from ${senderDisplay}: "${messageText.slice(0, 50)}"... (AI Reply: ${isAiEnabled ? 'BẬT' : 'TẮT'})`);

      // 4. If AI Auto-Reply is disabled, record incoming log and finish
      if (!isAiEnabled) {
        this.recordExecutionLog({
          reminderId: 'incoming_message',
          threadId,
          status: 'SUCCESS',
          idempotencyKey: `incoming-${incomingRecordId}`,
          messagePreview: `📩 [Tin nhắn đến] ${senderName || 'Khách'}: "${createMessagePreview(messageText)}" (AI Auto-Reply đang Tắt)`,
          details: {
            actionType: 'INCOMING_MESSAGE',
            senderName: senderName || 'Khách Messenger',
            threadId,
            incomingMessage: messageText,
            aiAutoReply: false,
            timestamp: new Date().toISOString()
          }
        });

        this.db.prepare(`
          INSERT INTO ai_processed_messages (id, thread_id, message_text, reply_text)
          VALUES (?, ?, ?, ?)
        `).run(incomingRecordId, threadId, messageText, '[AI_REPLY_DISABLED]');

        console.log(`[Incoming-Message] Logged message from ${senderDisplay}. AI Auto-Reply is disabled.`);
        return false;
      }

      if (!this.geminiService.isConfigured()) {
        console.warn('[AI-AutoReply] Gemini API key not configured, skipping reply generation.');
        this.recordAuditLog(
          'AI_REPLY_SKIPPED',
          'gemini_bot',
          `Bỏ qua phản hồi vì chưa cấu hình Google Gemini API Key.`,
          'WARN'
        );
        return false;
      }

      // Check priority before calling Gemini
      if (!isManualTrigger && this.hasPendingSchedule && (this.hasDueReminders() || this.hasPendingTestQueue())) {
        console.log('[AI-AutoReply] Yielding priority: Schedule execution requested priority. Aborting AI reply generation.');
        return false;
      }

      // 5. Gather existing active / upcoming reminders for this conversation thread
      const existingRemindersRows = this.db.prepare(`
        SELECT title, action_type, target_date, window_start, active, run_count, max_runs, wake_up_mode
        FROM reminders
        WHERE target_thread_id = ? OR target_thread_id LIKE ?
        ORDER BY created_at DESC
        LIMIT 5
      `).all(threadId, `%${threadId}%`) as Array<{
        title: string;
        action_type: string;
        target_date?: string;
        window_start: string;
        active: number;
        run_count: number;
        max_runs: number;
        wake_up_mode?: number;
      }>;

      let existingRemindersInfo = '';
      if (existingRemindersRows.length > 0) {
        existingRemindersInfo = existingRemindersRows.map((r, i) => {
          const status = r.active === 1 ? 'ĐANG CHỜ CHẠY' : `ĐÃ HOÀN TẤT (${r.run_count}/${r.max_runs} lần)`;
          const modeTag = r.wake_up_mode === 1 ? ' [Chế độ gọi dậy: BẬT]' : '';
          return `${i + 1}. "${r.title}" (${r.action_type}${modeTag}) - Ngày: ${r.target_date || 'Hàng ngày'}, Giờ: ${r.window_start} - Trạng thái: ${status}`;
        }).join('\n');
      }

      // Generate response using Gemini with multi-turn context, database reminder state, image attachments, and learned persona
      let parsedPersona: any = null;
      if (botState.learnedPersona && botState.learnedPersona.trim()) {
        try {
          parsedPersona = JSON.parse(botState.learnedPersona);
        } catch {}
      }

      const imgCount = incoming.imageAttachments?.length || 0;
      console.log(`[AI-AutoReply] Generating Gemini reply for message from ${senderDisplay} with ${conversationHistory?.length || 0} context messages, ${imgCount} images, Persona: ${parsedPersona?.tone || 'Mặc định'}...`);
      let replyText = '';
      let isQuotaFallback = false;
      try {
        replyText = await this.geminiService.generateReply(
          messageText,
          senderName,
          conversationHistory,
          existingRemindersInfo,
          incoming.imageAttachments,
          parsedPersona
        );
      } catch (geminiErr: any) {
        const errMessage = String(geminiErr?.message || '');
        const isQuotaExhausted =
          errMessage.includes('429') ||
          errMessage.includes('RESOURCE_EXHAUSTED') ||
          errMessage.toLowerCase().includes('quota') ||
          errMessage.toLowerCase().includes('rate limit');

        if (isQuotaExhausted) {
          isQuotaFallback = true;
          replyText =
            process.env.AI_QUOTA_REPLY_TEXT ||
            'Hiện tại AI đang tạm hết hạn mức (quota) xử lý hôm nay rồi ạ, lát nữa hoặc mai mình phản hồi lại nha! 😅';
          console.warn(`[AI-AutoReply] Gemini quota exhausted across models. Using fallback quota reply: "${replyText}"`);
          this.recordAuditLog(
            'AI_QUOTA_EXCEEDED',
            'gemini_bot',
            `Hết quota AI từ các model. Phản hồi thông báo hết hạn mức tới ${senderDisplay}.`,
            'WARN'
          );
        } else {
          console.error(`[AI-AutoReply] Gemini generation failed:`, geminiErr.message);
          this.recordAuditLog(
            'AI_REPLY_FAILED',
            'gemini_bot',
            `Lỗi khi Gemini tạo câu trả lời cho ${senderDisplay}: ${geminiErr.message}`,
            'ERROR'
          );
          this.recordExecutionLog({
            reminderId: 'ai_auto_reply',
            threadId,
            status: 'FAILED',
            idempotencyKey: `ai-error-${randomUUID()}`,
            messagePreview: `❌ [AI Lỗi] Không thể tạo câu trả lời: ${geminiErr.message}`,
            details: {
              actionType: 'AI_REPLY_ERROR',
              senderName: senderName || 'Khách Messenger',
              threadId,
              incomingMessage: messageText,
              error: geminiErr.message
            }
          });
          // Don't save failed attempts - allow retry on next cycle
          return false;
        }
      }

      // 5b. Check if AI detected scheduling intent and generated a reminder payload
      const { cleanReplyText, reminderPayload } = extractReminderPayload(replyText);
      replyText = cleanReplyText;

      let createdReminderId: string | null = null;
      if (reminderPayload) {
        try {
          createdReminderId = randomUUID();
          const nowIso = new Date().toISOString();
          const wakeUpModeInt = reminderPayload.wakeUpMode ? 1 : 0;
          this.db.prepare(`
            INSERT INTO reminders (
              id, title, content, target_thread_id, action_type, call_duration_seconds,
              max_runs, run_count, active, window_start, window_end, interval_minutes, target_date,
              wake_up_mode, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            createdReminderId,
            reminderPayload.title,
            reminderPayload.content,
            threadId,
            reminderPayload.actionType,
            25,
            reminderPayload.maxRuns,
            reminderPayload.windowStart,
            reminderPayload.windowEnd,
            reminderPayload.intervalMinutes,
            reminderPayload.targetDate,
            wakeUpModeInt,
            nowIso,
            nowIso
          );

          const modeNotice = reminderPayload.wakeUpMode ? ' [Chế độ gọi dậy: BẬT]' : '';
          console.log(`[AI-AutoReply] Auto-created reminder "${reminderPayload.title}" (${reminderPayload.actionType}${modeNotice}) at ${reminderPayload.windowStart} ${reminderPayload.targetDate} for ${threadId}`);

          this.recordAuditLog(
            'AI_REMINDER_CREATED',
            'gemini_bot',
            `Tự động tạo lịch nhắc "${reminderPayload.title}"${modeNotice} cho khách ${senderDisplay} lúc ${reminderPayload.windowStart} ngày ${reminderPayload.targetDate} (Hình thức: ${reminderPayload.actionType})`,
            'INFO'
          );
        } catch (dbErr: any) {
          console.error('[AI-AutoReply] Failed to insert auto-created reminder:', dbErr.message);
        }
      }

      // Check priority before sending message via Playwright (only abort if an actual reminder is due right now)
      if (!isManualTrigger && this.hasPendingSchedule && this.hasDueReminders()) {
        console.log('[AI-AutoReply] Yielding priority: Urgent scheduled reminder is due. Aborting AI send turn.');
        return false;
      }

      // 6. Send the reply via Messenger
      console.log(`[AI-AutoReply] Sending reply to ${threadId}: "${replyText.slice(0, 50)}"...`);
      const sendResult = await this.messengerClient.sendMessage(threadId, replyText);

      if (!sendResult.dryRun && !sendResult.success) {
        console.warn(`[AI-AutoReply] Failed to send reply:`, sendResult.error);
        this.recordAuditLog(
          'AI_REPLY_FAILED',
          'messenger_client',
          `Lỗi khi gửi tin nhắn trả lời tới ${senderDisplay}: ${sendResult.error}`,
          'ERROR'
        );
        this.recordExecutionLog({
          reminderId: 'ai_auto_reply',
          threadId,
          status: 'FAILED',
          idempotencyKey: `ai-error-${randomUUID()}`,
          messagePreview: `❌ [Gửi tin nhắn thất bại]: ${sendResult.error || 'Unknown error'}`,
          details: {
            actionType: 'AI_REPLY_SEND_ERROR',
            senderName: senderName || 'Khách Messenger',
            threadId,
            incomingMessage: messageText,
            replyContent: replyText,
            error: sendResult.error
          }
        });
        // Don't save failed sends - allow retry on next cycle
        return false;
      }

      // 7. Store in ai_processed_messages with reply text
      const replyRecordId = randomUUID();
      this.db.prepare(`
        INSERT INTO ai_processed_messages (id, thread_id, message_text, reply_text)
        VALUES (?, ?, ?, ?)
      `).run(replyRecordId, threadId, messageText, replyText);

      // 8. Record AI Reply in execution logs & audit logs
      const idempotencyKey = `ai-reply-${replyRecordId}`;
      let previewText: string;
      let actionType: string;

      if (reminderPayload && createdReminderId) {
        actionType = 'AI_REMINDER_CREATED';
        const modeTag = reminderPayload.wakeUpMode ? ' [Gọi dậy]' : '';
        previewText = `📅 [Tự Tạo Lịch Nhắc${modeTag}] "${reminderPayload.title}" (${reminderPayload.windowStart} ${reminderPayload.targetDate} - ${reminderPayload.actionType}) ➔ Khách: "${createMessagePreview(replyText)}"`;
      } else if (isQuotaFallback) {
        actionType = 'AI_QUOTA_REPLY';
        previewText = `⚠️ [AI Hết Quota] Khách: "${createMessagePreview(messageText)}" ➔ Phản hồi: "${createMessagePreview(replyText)}"`;
      } else {
        actionType = 'AI_REPLY';
        previewText = `🤖 [AI Reply] Khách: "${createMessagePreview(messageText)}" ➔ AI: "${createMessagePreview(replyText)}"`;
      }

      this.recordExecutionLog({
        reminderId: createdReminderId || 'ai_auto_reply',
        threadId,
        status: 'SUCCESS',
        idempotencyKey,
        messagePreview: previewText,
        details: {
          actionType,
          senderName: senderName || 'Khách Messenger',
          threadId,
          incomingMessage: messageText,
          replyContent: replyText,
          model: this.geminiService.getModel(),
          isQuotaFallback,
          createdReminderId: createdReminderId || undefined,
          createdReminder: reminderPayload || undefined,
          contextMessagesCount: conversationHistory?.length || 0,
          targetThread: botState.aiTargetThread || undefined,
          timestamp: new Date().toISOString()
        }
      });

      this.recordAuditLog(
        'AI_REPLY_SENT',
        'gemini_bot',
        `Đã gửi trả lời AI tới ${senderDisplay}: "${createMessagePreview(replyText)}"`,
        'INFO'
      );

      console.log(`[AI-AutoReply] Successfully sent AI reply to thread ${threadId}!`);
      return true;
    } catch (err: any) {
      console.error('[AI-AutoReply] Error during auto-reply execution:', err.message);
      this.recordAuditLog(
        'AI_REPLY_FAILED',
        'system',
        `Lỗi hệ thống khi tự động trả lời tin nhắn: ${err.message}`,
        'ERROR'
      );
      return false;
    } finally {
      this.isProcessingAiReply = false;
    }
  }

  /**
   * Periodic check to synchronize actual Messenger session status with DB
   */
  async checkAndSyncSession(): Promise<void> {
    if (this.isTicking || this.isProcessingQueue || this.isCheckingSession) return;
    this.isCheckingSession = true;
    try {
      const status = await this.messengerClient.checkSession(false);
      if (status !== 'LOGGED_IN') {
        this.db.prepare(`UPDATE bot_state SET session_status = ?, status = 'STOPPED', updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(status);
      } else {
        this.db.prepare(`UPDATE bot_state SET session_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(status);
      }
    } catch (err: any) {
      console.warn('[Worker] Periodic session check error:', err.message);
    } finally {
      this.isCheckingSession = false;
    }
  }

  /**
   * Check if any active scheduled reminder is due for execution in the current time slot
   */
  hasDueReminders(now: Date = new Date()): boolean {
    try {
      const reminders = this.db.prepare(`
        SELECT id, title, content, target_thread_id, action_type, call_duration_seconds,
               max_runs, run_count, schedule_cron, target_date, active, window_start,
               window_end, interval_minutes
        FROM reminders
        WHERE active = 1
      `).all() as ReminderRow[];

      if (reminders.length === 0) return false;

      const todayIct = getCurrentSlotKey(now).substring(0, 10);
      const slotKey = getCurrentSlotKey(now);

      for (const reminder of reminders) {
        if (reminder.max_runs && reminder.max_runs > 0 && (reminder.run_count || 0) >= reminder.max_runs) {
          continue;
        }
        if (reminder.target_date && reminder.target_date !== todayIct) {
          continue;
        }
        const isSlot = isSlotTriggerMinute(
          now,
          reminder.window_start,
          reminder.window_end,
          reminder.interval_minutes
        );
        if (!isSlot) continue;

        const idempotencyKey = generateIdempotencyKey(reminder.id, reminder.target_thread_id, slotKey);
        if (!this.lockManager.isSlotLocked(idempotencyKey)) {
          return true; // There is at least one reminder due right now!
        }
      }

      return false;
    } catch (err: any) {
      console.warn('[Worker] hasDueReminders check warning:', err.message);
      return false;
    }
  }

  /**
   * Check if the on-demand test dispatch queue has pending items
   */
  hasPendingTestQueue(): boolean {
    try {
      const count = this.db.prepare(`
        SELECT COUNT(*) as c FROM test_dispatch_queue WHERE status = 'PENDING'
      `).get() as { c: number } | undefined;
      return Boolean(count && count.c > 0);
    } catch {
      return false;
    }
  }

  /**
   * Periodically checks if proactive messaging schedule is due
   * and dispatches a spontaneous conversation starter to the target thread.
   */
  async checkAndTriggerProactiveMessage(): Promise<void> {
    if (this.isProcessingProactive || this.isProcessingAiReply || this.isTicking || this.isProcessingQueue) {
      return;
    }

    try {
      const botRow = this.db.prepare(`
        SELECT status, ai_auto_reply as aiAutoReply, ai_target_thread as aiTargetThread,
               learned_persona as learnedPersona, proactive_chat_config as proactiveConfig
        FROM bot_state
        WHERE id = 1
      `).get() as any;

      if (!botRow || botRow.status !== 'RUNNING') {
        return;
      }

      if (!botRow.proactiveConfig || !botRow.proactiveConfig.trim()) {
        return;
      }

      let config: any = null;
      try {
        config = JSON.parse(botRow.proactiveConfig);
      } catch {
        return;
      }

      if (!config || !config.enabled) {
        return;
      }

      const targetThread = config.targetThread || botRow.aiTargetThread || '';
      if (!targetThread) {
        return;
      }

      // 1. Check active hours in Vietnam Timezone (Asia/Ho_Chi_Minh)
      const now = new Date();
      const vnTimeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      const [currH, currM] = vnTimeStr.split(':').map(Number);
      const currTotalMinutes = (isNaN(currH) ? 0 : currH) * 60 + (isNaN(currM) ? 0 : currM);

      const [startH, startM] = (config.activeHoursStart || '08:00').split(':').map(Number);
      const startTotalMinutes = (isNaN(startH) ? 8 : startH) * 60 + (isNaN(startM) ? 0 : startM);

      const [endH, endM] = (config.activeHoursEnd || '22:30').split(':').map(Number);
      const endTotalMinutes = (isNaN(endH) ? 22 : endH) * 60 + (isNaN(endM) ? 30 : endM);

      if (currTotalMinutes < startTotalMinutes || currTotalMinutes > endTotalMinutes) {
        return;
      }

      const minInterval = Math.max(5, config.minIntervalMinutes || 120);
      const maxInterval = Math.max(minInterval + 5, config.maxIntervalMinutes || 360);

      // 2. Check nextScheduledAt
      if (!config.nextScheduledAt) {
        const randomMinutes = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
        const nextAt = new Date(Date.now() + randomMinutes * 60000).toISOString();
        config.nextScheduledAt = nextAt;
        this.db.prepare(`UPDATE bot_state SET proactive_chat_config = ? WHERE id = 1`).run(JSON.stringify(config));
        console.log(`[ProactiveChat] Initialized next random proactive trigger at: ${nextAt} (${randomMinutes}m from now)`);
        return;
      }

      const scheduledTime = new Date(config.nextScheduledAt).getTime();
      if (Date.now() < scheduledTime) {
        return;
      }

      // 3. Due for proactive message!
      this.isProcessingProactive = true;
      console.log(`[ProactiveChat] Schedule reached! Dispatching proactive message to ${targetThread}...`);

      let persona = null;
      if (botRow.learnedPersona) {
        try {
          persona = JSON.parse(botRow.learnedPersona);
        } catch {}
      }

      const proactiveMsg = await this.geminiService.generateProactiveMessage({
        persona,
        guidance: config.promptGuidance || 'Hỏi thăm bạn bè/khách hàng xem đang làm gì hoặc trêu đùa lầy lội'
      });

      console.log(`[ProactiveChat] Generated proactive message: "${proactiveMsg}"`);
      const sendResult = await this.messengerClient.sendMessage(targetThread, proactiveMsg);

      if (sendResult.success) {
        const nextRandomMinutes = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
        const nextScheduledAt = new Date(Date.now() + nextRandomMinutes * 60000).toISOString();
        const lastSentAt = new Date().toISOString();

        config.lastSentAt = lastSentAt;
        config.nextScheduledAt = nextScheduledAt;
        this.db.prepare(`UPDATE bot_state SET proactive_chat_config = ? WHERE id = 1`).run(JSON.stringify(config));

        this.recordExecutionLog({
          reminderId: 'proactive-chat',
          threadId: targetThread,
          status: 'SUCCESS',
          idempotencyKey: `proactive-${Date.now()}`,
          messagePreview: `[Chủ động nhắn tin]: ${proactiveMsg}`,
          details: {
            proactive: true,
            message: proactiveMsg,
            nextScheduledAt
          }
        });

        this.recordAuditLog(
          'PROACTIVE_MESSAGE_SENT',
          'gemini_bot',
          `Đã chủ động nhắn tin tới "${targetThread}": "${proactiveMsg}". Lần tiếp theo: ${nextScheduledAt}`,
          'INFO'
        );
      } else {
        console.warn(`[ProactiveChat] Failed to send message: ${sendResult.error}`);
        config.nextScheduledAt = new Date(Date.now() + 15 * 60000).toISOString();
        this.db.prepare(`UPDATE bot_state SET proactive_chat_config = ? WHERE id = 1`).run(JSON.stringify(config));
      }
    } catch (err: any) {
      console.error(`[ProactiveChat] Error during proactive execution:`, err.message);
    } finally {
      this.isProcessingProactive = false;
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

    // Periodically verify session status every 30 seconds
    this.sessionTimer = setInterval(() => {
      this.checkAndSyncSession().catch(console.error);
    }, 30000);

    // Periodically check and auto-reply incoming messages with Gemini every 5 seconds
    this.aiTimer = setInterval(() => {
      this.checkAndReplyIncomingMessages().catch(console.error);
    }, 5000);

    // Periodically check and trigger proactive random messaging every 30 seconds
    this.proactiveTimer = setInterval(() => {
      this.checkAndTriggerProactiveMessage().catch(console.error);
    }, 30000);
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
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
      this.sessionTimer = null;
    }
    if (this.aiTimer) {
      clearInterval(this.aiTimer);
      this.aiTimer = null;
    }
    if (this.proactiveTimer) {
      clearInterval(this.proactiveTimer);
      this.proactiveTimer = null;
    }
    this.lockManager.releaseLock('worker_singleton', this.workerId);
    await this.messengerClient.close();
  }
}
