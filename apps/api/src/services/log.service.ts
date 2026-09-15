import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { getDb } from '../db/database.js';
import type { AuditLog, ExecutionLog, LogLevel, ExecutionStatus } from '@messenger/shared';

export class LogService {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || getDb();
  }

  logAudit(
    action: string,
    actor: string = 'system',
    details?: Record<string, unknown> | string | null,
    level: LogLevel = 'INFO'
  ): AuditLog {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const detailsJson = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;

    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, timestamp, action, actor, details, level)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, timestamp, action, actor, detailsJson, level);

    return { id, timestamp, action, actor, details, level };
  }

  getAuditLogs(limit: number = 50, offset: number = 0): AuditLog[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, action, actor, details, level
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(limit, offset) as Array<{
      id: string;
      timestamp: string;
      action: string;
      actor: string;
      details: string | null;
      level: LogLevel;
    }>;

    return rows.map((row) => ({
      ...row,
      details: row.details ? this.tryParseJson(row.details) : null
    }));
  }

  logExecution(entry: {
    reminderId: string;
    threadId: string;
    status: ExecutionStatus;
    idempotencyKey: string;
    messagePreview: string;
    details?: Record<string, unknown> | string | null;
  }): ExecutionLog {
    const id = randomUUID();
    const executedAt = new Date().toISOString();
    const detailsJson = entry.details
      ? (typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details))
      : null;

    const stmt = this.db.prepare(`
      INSERT INTO execution_logs (id, reminder_id, thread_id, status, idempotency_key, message_preview, executed_at, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      entry.reminderId,
      entry.threadId,
      entry.status,
      entry.idempotencyKey,
      entry.messagePreview,
      executedAt,
      detailsJson
    );

    return {
      id,
      reminderId: entry.reminderId,
      threadId: entry.threadId,
      status: entry.status,
      idempotencyKey: entry.idempotencyKey,
      messagePreview: entry.messagePreview,
      executedAt,
      details: entry.details
    };
  }

  getExecutionLogs(limit: number = 50, offset: number = 0, reminderId?: string): ExecutionLog[] {
    let query = `
      SELECT id, reminder_id as reminderId, thread_id as threadId, status,
             idempotency_key as idempotencyKey, message_preview as messagePreview,
             executed_at as executedAt, details
      FROM execution_logs
    `;
    const params: (string | number)[] = [];

    if (reminderId) {
      query += ` WHERE reminder_id = ? `;
      params.push(reminderId);
    }

    query += ` ORDER BY executed_at DESC LIMIT ? OFFSET ? `;
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: string;
      reminderId: string;
      threadId: string;
      status: ExecutionStatus;
      idempotencyKey: string;
      messagePreview: string;
      executedAt: string;
      details: string | null;
    }>;

    return rows.map((r) => ({
      ...r,
      details: r.details ? this.tryParseJson(r.details) : null
    }));
  }

  private tryParseJson(val: string): any {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
}
