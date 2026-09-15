import type { Database } from 'better-sqlite3';
import { getDb } from '../db/database.js';
import { LogService } from './log.service.js';
import type { BotState, BotStatus, SessionStatus } from '@messenger/shared';

export class BotControlService {
  private db: Database;
  private logService: LogService;

  constructor(db?: Database, logService?: LogService) {
    this.db = db || getDb();
    this.logService = logService || new LogService(this.db);
  }

  getBotState(): BotState {
    const row = this.db.prepare(`
      SELECT status, session_status as sessionStatus, emergency_stop as emergencyStop,
             dry_run as dryRun, last_heartbeat as lastHeartbeat,
             lock_holder_id as lockHolderId, updated_at as updatedAt
      FROM bot_state
      WHERE id = 1
    `).get() as {
      status: BotStatus;
      sessionStatus: SessionStatus;
      emergencyStop: number;
      dryRun: number;
      lastHeartbeat: string | null;
      lockHolderId: string | null;
      updatedAt: string;
    };

    if (!row) {
      return {
        status: 'STOPPED',
        sessionStatus: 'UNKNOWN',
        emergencyStop: false,
        dryRun: process.env.DRY_RUN !== 'false',
        updatedAt: new Date().toISOString()
      };
    }

    return {
      status: row.status,
      sessionStatus: row.sessionStatus,
      emergencyStop: Boolean(row.emergencyStop),
      dryRun: Boolean(row.dryRun),
      lastHeartbeat: row.lastHeartbeat,
      lockHolderId: row.lockHolderId,
      updatedAt: row.updatedAt
    };
  }

  updateBotStatus(
    action: 'START' | 'STOP' | 'RESTART' | 'EMERGENCY_STOP',
    actor: string = 'admin_ui',
    reason?: string
  ): BotState {
    let nextStatus: BotStatus = 'RUNNING';
    let emergencyStop = 0;

    switch (action) {
      case 'START':
        nextStatus = 'RUNNING';
        emergencyStop = 0;
        break;
      case 'STOP':
        nextStatus = 'STOPPED';
        break;
      case 'RESTART':
        nextStatus = 'RUNNING';
        emergencyStop = 0;
        break;
      case 'EMERGENCY_STOP':
        nextStatus = 'EMERGENCY_STOPPED';
        emergencyStop = 1;
        break;
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE bot_state
      SET status = ?, emergency_stop = ?, updated_at = ?
      WHERE id = 1
    `).run(nextStatus, emergencyStop, now);

    this.logService.logAudit(
      `BOT_${action}`,
      actor,
      { nextStatus, emergencyStop: Boolean(emergencyStop), reason },
      action === 'EMERGENCY_STOP' ? 'WARN' : 'INFO'
    );

    return this.getBotState();
  }

  updateSessionStatus(sessionStatus: SessionStatus): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE bot_state
      SET session_status = ?, updated_at = ?
      WHERE id = 1
    `).run(sessionStatus, now);
  }

  setDryRun(dryRun: boolean, actor: string = 'admin'): BotState {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE bot_state
      SET dry_run = ?, updated_at = ?
      WHERE id = 1
    `).run(dryRun ? 1 : 0, now);

    this.logService.logAudit('BOT_DRY_RUN_TOGGLE', actor, { dryRun });
    return this.getBotState();
  }

  heartbeat(holderId?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE bot_state
      SET last_heartbeat = ?, lock_holder_id = COALESCE(?, lock_holder_id), updated_at = ?
      WHERE id = 1
    `).run(now, holderId || null, now);
  }
}
