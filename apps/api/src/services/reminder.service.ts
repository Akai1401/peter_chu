import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db/database.js';
import { LogService } from './log.service.js';
import type {
  Reminder,
  CreateReminderInput,
  UpdateReminderInput
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
             schedule_cron as scheduleCron, target_date as targetDate, active,
             window_start as windowStart, window_end as windowEnd,
             interval_minutes as intervalMinutes,
             created_at as createdAt, updated_at as updatedAt
      FROM reminders
      ORDER BY created_at DESC
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
      active: number;
      windowStart: string;
      windowEnd: string;
      intervalMinutes: number;
      createdAt: string;
      updatedAt: string;
    }>;

    return rows.map((r) => ({
      ...r,
      actionType: r.actionType || 'MESSAGE',
      callDurationSeconds: r.callDurationSeconds || 30,
      maxRuns: r.maxRuns || 0,
      runCount: r.runCount || 0,
      targetDate: r.targetDate || null,
      active: Boolean(r.active)
    }));
  }

  getReminderById(id: string): Reminder | null {
    const stmt = this.db.prepare(`
      SELECT id, title, content, target_thread_id as targetThreadId,
             action_type as actionType, call_duration_seconds as callDurationSeconds,
             max_runs as maxRuns, run_count as runCount,
             schedule_cron as scheduleCron, target_date as targetDate, active,
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
      active: Boolean(row.active)
    };
  }

  createReminder(data: CreateReminderInput, actor: string = 'admin'): Reminder {
    const id = randomUUID();
    const now = new Date().toISOString();
    const activeInt = data.active !== false ? 1 : 0;
    const windowStart = data.windowStart || '00:00';
    const windowEnd = data.windowEnd || '23:59';
    const intervalMinutes = data.intervalMinutes ?? 10;
    const actionType = data.actionType || 'MESSAGE';
    const callDurationSeconds = data.callDurationSeconds ?? 30;
    const maxRuns = data.maxRuns ?? 0;
    const targetDate = data.targetDate || null;

    const stmt = this.db.prepare(`
      INSERT INTO reminders (
        id, title, content, target_thread_id, action_type, call_duration_seconds,
        max_runs, run_count, schedule_cron, target_date,
        active, window_start, window_end, interval_minutes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.title,
      data.content,
      data.targetThreadId,
      actionType,
      callDurationSeconds,
      maxRuns,
      0,
      data.scheduleCron || null,
      targetDate,
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
    const targetThreadId = data.targetThreadId ?? existing.targetThreadId;
    const actionType = data.actionType ?? existing.actionType;
    const callDurationSeconds = data.callDurationSeconds ?? existing.callDurationSeconds;
    const maxRuns = data.maxRuns !== undefined ? data.maxRuns : (existing.maxRuns ?? 0);
    const scheduleCron = data.scheduleCron !== undefined ? data.scheduleCron : existing.scheduleCron;
    const targetDate = data.targetDate !== undefined ? data.targetDate : existing.targetDate;
    const activeInt = data.active !== undefined ? (data.active ? 1 : 0) : (existing.active ? 1 : 0);
    const windowStart = data.windowStart ?? existing.windowStart;
    const windowEnd = data.windowEnd ?? existing.windowEnd;
    const intervalMinutes = data.intervalMinutes ?? existing.intervalMinutes;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE reminders
      SET title = ?, content = ?, target_thread_id = ?, action_type = ?,
          call_duration_seconds = ?, max_runs = ?, schedule_cron = ?, target_date = ?,
          active = ?, window_start = ?, window_end = ?, interval_minutes = ?,
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
      scheduleCron,
      targetDate,
      activeInt,
      windowStart,
      windowEnd,
      intervalMinutes,
      now,
      id
    );

    this.logService.logAudit('REMINDER_UPDATE', actor, { reminderId: id, changes: data });
    return this.getReminderById(id);
  }

  toggleReminder(id: string, actor: string = 'admin'): Reminder | null {
    const existing = this.getReminderById(id);
    if (!existing) return null;

    const nextActive = !existing.active;
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE reminders
      SET active = ?, updated_at = ?
      WHERE id = ?
    `).run(nextActive ? 1 : 0, now, id);

    this.logService.logAudit('REMINDER_TOGGLE', actor, {
      reminderId: id,
      previous: existing.active,
      current: nextActive
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
