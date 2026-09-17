import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db/database.js';
import { LogService } from './log.service.js';
import {
  type Reminder,
  type CreateReminderInput,
  type UpdateReminderInput,
  isSchedulePastDue
} from '@messenger/shared';

export class ReminderService {
  private db: Database;
  private logService: LogService;

  constructor(db?: Database, logService?: LogService) {
    this.db = db || getDb();
    this.logService = logService || new LogService(this.db);
  }

  getAllReminders(): Reminder[] {
    const stmt = this.db.prepare(`
      SELECT id, title, content, target_thread_id as targetThreadId,
             action_type as actionType, call_duration_seconds as callDurationSeconds,
             max_runs as maxRuns, run_count as runCount,
             schedule_cron as scheduleCron, target_date as targetDate,
             wake_up_mode as wakeUpMode, ai_generate_message as aiGenerateMessage, active,
             window_start as windowStart, window_end as windowEnd,
             interval_minutes as intervalMinutes,
             created_at as createdAt, updated_at as updatedAt
      FROM reminders
      ORDER BY datetime(created_at) DESC, rowid DESC
    `);
    const rows = stmt.all() as Array<{
      id: string;
      title: string;
      content: string;
      targetThreadId: string;
      actionType: any;
      callDurationSeconds: number;
      maxRuns?: number;
      runCount?: number;
      scheduleCron: string | null;
      targetDate?: string | null;
      wakeUpMode?: number;
      aiGenerateMessage?: number;
      active: number;
      windowStart: string;
      windowEnd: string;
      intervalMinutes: number;
      createdAt: string;
      updatedAt: string;
    }>;

    return rows.map((r) => {
      let activeBool = Boolean(r.active);
      const isPast = isSchedulePastDue(r.targetDate, r.windowEnd, r.maxRuns, r.windowStart);
      if (activeBool && isPast) {
        this.db.prepare('UPDATE reminders SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(r.id);
        activeBool = false;
      }

      return {
        ...r,
        actionType: r.actionType || 'MESSAGE',
        callDurationSeconds: r.callDurationSeconds || 30,
        maxRuns: r.maxRuns || 0,
        runCount: r.runCount || 0,
        targetDate: r.targetDate || null,
        wakeUpMode: Boolean(r.wakeUpMode),
        aiGenerateMessage: Boolean(r.aiGenerateMessage),
        active: activeBool
      };
    });
  }

  getReminderById(id: string): Reminder | null {
    const stmt = this.db.prepare(`
      SELECT id, title, content, target_thread_id as targetThreadId,
             action_type as actionType, call_duration_seconds as callDurationSeconds,
             max_runs as maxRuns, run_count as runCount,
             schedule_cron as scheduleCron, target_date as targetDate,
             wake_up_mode as wakeUpMode, ai_generate_message as aiGenerateMessage, active,
             window_start as windowStart, window_end as windowEnd,
             interval_minutes as intervalMinutes,
             created_at as createdAt, updated_at as updatedAt
      FROM reminders
      WHERE id = ?
    `);
    const row = stmt.get(id) as {
      id: string;
      title: string;
      content: string;
      targetThreadId: string;
      actionType: any;
      callDurationSeconds: number;
      maxRuns?: number;
      runCount?: number;
      scheduleCron: string | null;
      targetDate?: string | null;
      wakeUpMode?: number;
      aiGenerateMessage?: number;
      active: number;
      windowStart: string;
      windowEnd: string;
      intervalMinutes: number;
      createdAt: string;
      updatedAt: string;
    } | undefined;

    if (!row) return null;
    return {
      ...row,
      actionType: row.actionType || 'MESSAGE',
      callDurationSeconds: row.callDurationSeconds || 30,
      maxRuns: row.maxRuns || 0,
      runCount: row.runCount || 0,
      targetDate: row.targetDate || null,
      wakeUpMode: Boolean(row.wakeUpMode),
      aiGenerateMessage: Boolean(row.aiGenerateMessage),
      active: Boolean(row.active)
    };
  }

  getGlobalTargetThread(): string {
    try {
      const row = this.db.prepare('SELECT ai_target_thread as aiTargetThread FROM bot_state WHERE id = 1').get() as any;
      return (row?.aiTargetThread || '').trim();
    } catch {
      return '';
    }
  }

  createReminder(data: CreateReminderInput, actor: string = 'admin'): Reminder {
    const id = randomUUID();
    const now = new Date().toISOString();
    const activeInt = data.active !== undefined ? (data.active ? 1 : 0) : 1;
    const windowStart = data.windowStart || '00:00';
    const windowEnd = data.windowEnd || '23:59';
    const intervalMinutes = data.intervalMinutes ?? 10;
    const actionType = data.actionType || 'MESSAGE';
    const callDurationSeconds = data.callDurationSeconds ?? 30;
    const maxRuns = data.maxRuns ?? 0;
    const targetDate = data.targetDate || null;
    const wakeUpModeInt = data.wakeUpMode ? 1 : 0;
    const aiGenerateMessageInt = data.aiGenerateMessage ? 1 : 0;

    let targetThreadId = (data.targetThreadId || '').trim();
    if (!targetThreadId) {
      targetThreadId = this.getGlobalTargetThread();
    }
    if (!targetThreadId) {
      throw new Error('Vui lòng nhập Target Thread ID hoặc cấu hình Target Thread chung trước!');
    }

    const stmt = this.db.prepare(`
      INSERT INTO reminders (
        id, title, content, target_thread_id, action_type, call_duration_seconds,
        max_runs, run_count, schedule_cron, target_date, wake_up_mode, ai_generate_message,
        active, window_start, window_end, interval_minutes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.title,
      data.content,
      targetThreadId,
      actionType,
      callDurationSeconds,
      maxRuns,
      0,
      data.scheduleCron || null,
      targetDate,
      wakeUpModeInt,
      aiGenerateMessageInt,
      activeInt,
      windowStart,
      windowEnd,
      intervalMinutes,
      now,
      now
    );

    const created = this.getReminderById(id)!;
    this.logService.logAudit('REMINDER_CREATE', actor, { reminderId: id, title: data.title });
    return created;
  }

  updateReminder(id: string, data: UpdateReminderInput, actor: string = 'admin'): Reminder | null {
    const existing = this.getReminderById(id);
    if (!existing) return null;

    const title = data.title ?? existing.title;
    const content = data.content ?? existing.content;
    let targetThreadId = data.targetThreadId !== undefined ? data.targetThreadId.trim() : existing.targetThreadId;
    if (!targetThreadId) {
      targetThreadId = this.getGlobalTargetThread() || existing.targetThreadId;
    }
    const actionType = data.actionType ?? existing.actionType;
    const callDurationSeconds = data.callDurationSeconds ?? existing.callDurationSeconds;
    const maxRuns = data.maxRuns !== undefined ? data.maxRuns : (existing.maxRuns ?? 0);
    const scheduleCron = data.scheduleCron !== undefined ? data.scheduleCron : existing.scheduleCron;
    const targetDate = data.targetDate !== undefined ? data.targetDate : existing.targetDate;
    const wakeUpModeInt = data.wakeUpMode !== undefined ? (data.wakeUpMode ? 1 : 0) : (existing.wakeUpMode ? 1 : 0);
    const aiGenerateMessageInt = data.aiGenerateMessage !== undefined ? (data.aiGenerateMessage ? 1 : 0) : (existing.aiGenerateMessage ? 1 : 0);
    const activeInt = data.active !== undefined ? (data.active ? 1 : 0) : (existing.active ? 1 : 0);
    const windowStart = data.windowStart ?? existing.windowStart;
    const windowEnd = data.windowEnd ?? existing.windowEnd;
    const intervalMinutes = data.intervalMinutes ?? existing.intervalMinutes;
    const now = new Date().toISOString();

    // Auto-reset run_count when:
    // 1. Explicitly requested via resetRunCount
    // 2. Schedule changed (maxRuns, targetDate, windowStart, windowEnd)
    // 3. Reminder is re-activated when it was already completed (runCount >= maxRuns)
    const isCompleted = Boolean(existing.maxRuns && existing.maxRuns > 0 && (existing.runCount || 0) >= existing.maxRuns);
    const scheduleChanged =
      (data.maxRuns !== undefined && data.maxRuns !== existing.maxRuns) ||
      (data.targetDate !== undefined && data.targetDate !== existing.targetDate) ||
      (data.windowStart !== undefined && data.windowStart !== existing.windowStart) ||
      (data.windowEnd !== undefined && data.windowEnd !== existing.windowEnd);

    const shouldResetRunCount =
      data.resetRunCount === true ||
      scheduleChanged ||
      (data.active === true && isCompleted);

    const runCount = shouldResetRunCount ? 0 : (existing.runCount || 0);

    const stmt = this.db.prepare(`
      UPDATE reminders
      SET title = ?, content = ?, target_thread_id = ?, action_type = ?,
          call_duration_seconds = ?, max_runs = ?, run_count = ?, schedule_cron = ?, target_date = ?,
          wake_up_mode = ?, ai_generate_message = ?, active = ?, window_start = ?, window_end = ?, interval_minutes = ?,
          updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      title,
      content,
      targetThreadId,
      actionType,
      callDurationSeconds,
      maxRuns,
      runCount,
      scheduleCron,
      targetDate,
      wakeUpModeInt,
      aiGenerateMessageInt,
      activeInt,
      windowStart,
      windowEnd,
      intervalMinutes,
      now,
      id
    );

    this.logService.logAudit('REMINDER_UPDATE', actor, {
      reminderId: id,
      changes: data,
      resetRunCount: shouldResetRunCount
    });
    return this.getReminderById(id);
  }

  toggleReminder(id: string, actor: string = 'admin'): Reminder | null {
    const existing = this.getReminderById(id);
    if (!existing) return null;

    const nextActive = !existing.active;
    const now = new Date().toISOString();

    if (nextActive) {
      const isPastDue = isSchedulePastDue(existing.targetDate, existing.windowEnd, existing.maxRuns, existing.windowStart);
      if (isPastDue) {
        throw new Error(`Lịch chạy (${existing.windowStart}) đã quá thời gian hiện tại. Vui lòng chọn thời gian mới!`);
      }
    }

    // If restarting an already completed reminder, reset run_count to 0 so it can run again
    const isCompleted = Boolean(existing.maxRuns && existing.maxRuns > 0 && (existing.runCount || 0) >= existing.maxRuns);
    const shouldResetRunCount = nextActive && isCompleted;

    if (shouldResetRunCount) {
      this.db.prepare(`
        UPDATE reminders
        SET active = ?, run_count = 0, updated_at = ?
        WHERE id = ?
      `).run(1, now, id);
    } else {
      this.db.prepare(`
        UPDATE reminders
        SET active = ?, updated_at = ?
        WHERE id = ?
      `).run(nextActive ? 1 : 0, now, id);
    }

    this.logService.logAudit('REMINDER_TOGGLE', actor, {
      reminderId: id,
      previous: existing.active,
      current: nextActive,
      resetRunCount: shouldResetRunCount
    });

    return this.getReminderById(id);
  }

  deleteReminder(id: string, actor: string = 'admin'): boolean {
    const existing = this.getReminderById(id);
    if (!existing) return false;

    this.db.prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
    this.logService.logAudit('REMINDER_DELETE', actor, { reminderId: id, title: existing.title });
    return true;
  }
}
