import type { Database } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db/database.js';
import { LogService } from './log.service.js';
import type { BotState, BotStatus, SessionStatus, LearnedPersona, PersonaProfile, ProactiveChatConfig } from '@messenger/shared';

function findWorkspaceRoot(): string {
  let curr = process.cwd();
  while (curr !== path.dirname(curr)) {
    const pkgPath = path.join(curr, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.workspaces) return curr;
      } catch {}
    }
    curr = path.dirname(curr);
  }
  return process.cwd();
}

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
             dry_run as dryRun, ai_auto_reply as aiAutoReply, ai_target_thread as aiTargetThread,
             learned_persona as learnedPersona,
             active_persona_id as activePersonaId,
             active_persona_name as activePersonaName,
             persona_source_thread as personaSourceThread,
             persona_updated_at as personaUpdatedAt,
             proactive_chat_config as proactiveChatConfig,
             last_heartbeat as lastHeartbeat, lock_holder_id as lockHolderId, updated_at as updatedAt
      FROM bot_state
      WHERE id = 1
    `).get() as {
      status: BotStatus;
      sessionStatus: SessionStatus;
      emergencyStop: number;
      dryRun: number;
      aiAutoReply?: number;
      aiTargetThread?: string;
      learnedPersona?: string;
      activePersonaId?: string;
      activePersonaName?: string;
      personaSourceThread?: string;
      personaUpdatedAt?: string;
      proactiveChatConfig?: string;
      lastHeartbeat: string | null;
      lockHolderId: string | null;
      updatedAt: string;
    };

    const defaultProactiveConfig: ProactiveChatConfig = {
      enabled: false,
      targetThread: '',
      minIntervalMinutes: 120,
      maxIntervalMinutes: 360,
      activeHoursStart: '08:00',
      activeHoursEnd: '22:30',
      promptGuidance: 'Hỏi thăm bạn bè/khách hàng đang làm gì đó, trêu đùa lầy lội hoặc rủ đi cafe/ăn uống',
      lastSentAt: null,
      nextScheduledAt: null
    };

    if (!row) {
      return {
        status: 'STOPPED',
        sessionStatus: 'UNKNOWN',
        emergencyStop: false,
        dryRun: process.env.DRY_RUN !== 'false',
        aiAutoReply: true,
        aiTargetThread: '',
        learnedPersona: null,
        activePersonaId: null,
        activePersonaName: null,
        personaSourceThread: '',
        personaUpdatedAt: '',
        proactiveChat: defaultProactiveConfig,
        updatedAt: new Date().toISOString()
      };
    }

    let parsedPersona: LearnedPersona | null = null;
    if (row.learnedPersona && row.learnedPersona.trim()) {
      try {
        parsedPersona = JSON.parse(row.learnedPersona);
      } catch {}
    }

    let parsedProactive: ProactiveChatConfig = { ...defaultProactiveConfig };
    if (row.proactiveChatConfig && row.proactiveChatConfig.trim()) {
      try {
        const loaded = JSON.parse(row.proactiveChatConfig);
        parsedProactive = { ...defaultProactiveConfig, ...loaded };
      } catch {}
    }

    return {
      status: row.status,
      sessionStatus: row.sessionStatus,
      emergencyStop: Boolean(row.emergencyStop),
      dryRun: Boolean(row.dryRun),
      aiAutoReply: row.aiAutoReply === undefined || row.aiAutoReply === null ? true : Boolean(row.aiAutoReply),
      aiTargetThread: row.aiTargetThread || '',
      learnedPersona: parsedPersona,
      activePersonaId: row.activePersonaId || null,
      activePersonaName: row.activePersonaName || null,
      personaSourceThread: row.personaSourceThread || '',
      personaUpdatedAt: row.personaUpdatedAt || '',
      proactiveChat: parsedProactive,
      lastHeartbeat: row.lastHeartbeat,
      lockHolderId: row.lockHolderId,
      updatedAt: row.updatedAt
    };
  }

  getPersonaProfiles(): PersonaProfile[] {
    const rows = this.db.prepare(`
      SELECT id, name, persona, source_thread as sourceThread, is_active as isActive, created_at as createdAt, updated_at as updatedAt
      FROM persona_profiles
      ORDER BY updated_at DESC
    `).all() as any[];

    return rows.map((r) => {
      let parsed: LearnedPersona;
      try {
        parsed = JSON.parse(r.persona);
      } catch {
        parsed = {
          styleSummary: '',
          pronouns: '',
          tone: '',
          catchphrases: [],
          sampleMessages: [],
          rawPromptInstruction: ''
        };
      }
      return {
        id: r.id,
        name: r.name,
        persona: parsed,
        sourceThread: r.sourceThread || '',
        isActive: Boolean(r.isActive),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      };
    });
  }

  createPersonaProfile(data: {
    name: string;
    persona: LearnedPersona;
    sourceThread?: string;
    makeActive?: boolean;
  }): PersonaProfile {
    const id = `persona_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();
    const name = data.name.trim() || 'Văn phong mới';
    const makeActive = Boolean(data.makeActive);

    if (makeActive) {
      this.db.prepare(`UPDATE persona_profiles SET is_active = 0`).run();
    }

    this.db.prepare(`
      INSERT INTO persona_profiles (id, name, persona, source_thread, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      JSON.stringify(data.persona),
      data.sourceThread || '',
      makeActive ? 1 : 0,
      nowIso,
      nowIso
    );

    if (makeActive) {
      this.db.prepare(`
        UPDATE bot_state
        SET learned_persona = ?,
            active_persona_id = ?,
            active_persona_name = ?,
            persona_source_thread = ?,
            persona_updated_at = ?,
            updated_at = ?
        WHERE id = 1
      `).run(
        JSON.stringify(data.persona),
        id,
        name,
        data.sourceThread || '',
        nowIso,
        nowIso
      );
    }

    this.logService.logAudit(
      'PERSONA_PROFILE_CREATED',
      'admin_dashboard',
      { id, name, makeActive }
    );

    return {
      id,
      name,
      persona: data.persona,
      sourceThread: data.sourceThread || '',
      isActive: makeActive,
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }

  updatePersonaProfile(
    id: string,
    data: { name?: string; persona?: LearnedPersona; sourceThread?: string }
  ): PersonaProfile {
    const existing = this.db.prepare(`
      SELECT id, name, persona, source_thread as sourceThread, is_active as isActive, created_at as createdAt, updated_at as updatedAt
      FROM persona_profiles
      WHERE id = ?
    `).get(id) as any;

    if (!existing) {
      throw new Error(`Không tìm thấy bộ cấu hình văn phong với ID: ${id}`);
    }

    const nowIso = new Date().toISOString();
    const updatedName = data.name !== undefined ? data.name.trim() : existing.name;
    const updatedPersona = data.persona !== undefined ? data.persona : JSON.parse(existing.persona);
    const updatedSource = data.sourceThread !== undefined ? data.sourceThread : (existing.sourceThread || '');

    this.db.prepare(`
      UPDATE persona_profiles
      SET name = ?, persona = ?, source_thread = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updatedName,
      JSON.stringify(updatedPersona),
      updatedSource,
      nowIso,
      id
    );

    if (existing.isActive) {
      this.db.prepare(`
        UPDATE bot_state
        SET learned_persona = ?,
            active_persona_name = ?,
            persona_source_thread = ?,
            persona_updated_at = ?,
            updated_at = ?
        WHERE id = 1
      `).run(
        JSON.stringify(updatedPersona),
        updatedName,
        updatedSource,
        nowIso,
        nowIso
      );
    }

    this.logService.logAudit(
      'PERSONA_PROFILE_UPDATED',
      'admin_dashboard',
      { id, name: updatedName }
    );

    return {
      id,
      name: updatedName,
      persona: updatedPersona,
      sourceThread: updatedSource,
      isActive: Boolean(existing.isActive),
      createdAt: existing.createdAt,
      updatedAt: nowIso
    };
  }

  activatePersonaProfile(id: string): PersonaProfile {
    const existing = this.db.prepare(`
      SELECT id, name, persona, source_thread as sourceThread, created_at as createdAt, updated_at as updatedAt
      FROM persona_profiles
      WHERE id = ?
    `).get(id) as any;

    if (!existing) {
      throw new Error(`Không tìm thấy bộ cấu hình văn phong với ID: ${id}`);
    }

    const nowIso = new Date().toISOString();
    this.db.prepare(`UPDATE persona_profiles SET is_active = 0`).run();
    this.db.prepare(`UPDATE persona_profiles SET is_active = 1, updated_at = ? WHERE id = ?`).run(nowIso, id);

    let parsedPersona: LearnedPersona;
    try {
      parsedPersona = JSON.parse(existing.persona);
    } catch {
      throw new Error('Dữ liệu văn phong trong bộ cấu hình này không hợp lệ');
    }

    this.db.prepare(`
      UPDATE bot_state
      SET learned_persona = ?,
          active_persona_id = ?,
          active_persona_name = ?,
          persona_source_thread = ?,
          persona_updated_at = ?,
          updated_at = ?
      WHERE id = 1
    `).run(
      existing.persona,
      id,
      existing.name,
      existing.sourceThread || '',
      nowIso,
      nowIso
    );

    this.logService.logAudit(
      'PERSONA_PROFILE_ACTIVATED',
      'admin_dashboard',
      { id, name: existing.name }
    );

    return {
      id,
      name: existing.name,
      persona: parsedPersona,
      sourceThread: existing.sourceThread || '',
      isActive: true,
      createdAt: existing.createdAt,
      updatedAt: nowIso
    };
  }

  deletePersonaProfile(id: string): void {
    const existing = this.db.prepare(`
      SELECT id, name, is_active as isActive
      FROM persona_profiles
      WHERE id = ?
    `).get(id) as any;

    if (!existing) {
      return;
    }

    this.db.prepare(`DELETE FROM persona_profiles WHERE id = ?`).run(id);

    if (existing.isActive) {
      const nowIso = new Date().toISOString();
      this.db.prepare(`
        UPDATE bot_state
        SET learned_persona = '',
            active_persona_id = '',
            active_persona_name = '',
            persona_source_thread = '',
            persona_updated_at = '',
            updated_at = ?
        WHERE id = 1
      `).run(nowIso);
    }

    this.logService.logAudit(
      'PERSONA_PROFILE_DELETED',
      'admin_dashboard',
      { id, name: existing.name }
    );
  }

  updatePersona(persona: any | null, sourceThread?: string): void {
    const nowIso = new Date().toISOString();
    const personaJson = persona ? JSON.stringify(persona) : '';
    
    // Check if there is an active profile
    const activeProfile = this.db.prepare(`
      SELECT id, name FROM persona_profiles WHERE is_active = 1
    `).get() as { id: string; name: string } | undefined;

    if (persona && activeProfile) {
      this.db.prepare(`
        UPDATE persona_profiles
        SET persona = ?, source_thread = ?, updated_at = ?
        WHERE id = ?
      `).run(personaJson, sourceThread || '', nowIso, activeProfile.id);
    } else if (persona && !activeProfile) {
      // Auto-create a profile
      const newId = `persona_${Date.now()}`;
      const newName = persona.styleSummary ? `Văn phong ${persona.tone || 'cá nhân'}` : 'Văn phong mặc định';
      this.db.prepare(`
        INSERT INTO persona_profiles (id, name, persona, source_thread, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(newId, newName, personaJson, sourceThread || '', nowIso, nowIso);

      this.db.prepare(`
        UPDATE bot_state
        SET learned_persona = ?, active_persona_id = ?, active_persona_name = ?, persona_source_thread = ?, persona_updated_at = ?, updated_at = ?
        WHERE id = 1
      `).run(personaJson, newId, newName, sourceThread || '', nowIso, nowIso);
      return;
    } else if (!persona) {
      // Reset
      this.db.prepare(`UPDATE persona_profiles SET is_active = 0`).run();
    }

    this.db.prepare(`
      UPDATE bot_state
      SET learned_persona = ?,
          active_persona_id = ?,
          active_persona_name = ?,
          persona_source_thread = ?,
          persona_updated_at = ?,
          updated_at = ?
      WHERE id = 1
    `).run(
      personaJson,
      persona && activeProfile ? activeProfile.id : '',
      persona && activeProfile ? activeProfile.name : '',
      sourceThread || '',
      persona ? nowIso : '',
      nowIso
    );

    this.logService.logAudit(
      persona ? 'PERSONA_UPDATED' : 'PERSONA_RESET',
      'admin_dashboard',
      { summary: persona?.styleSummary || '', sourceThread }
    );
  }

  updateBotStatus(
    action: 'START' | 'STOP' | 'RESTART' | 'EMERGENCY_STOP',
    actor: string = 'admin_ui',
    reason?: string
  ): BotState {
    if (action === 'START' || action === 'RESTART') {
      const currentState = this.getBotState();
      if (currentState.sessionStatus !== 'LOGGED_IN') {
        throw new Error('Không thể khởi động hệ thống: Messenger chưa kết nối. Vui lòng kết nối Messenger trước.');
      }
    }

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
    let sessionStatus: SessionStatus | undefined;

    if (!dryRun) {
      const sessionDir = path.resolve(
        findWorkspaceRoot(),
        process.env.MESSENGER_USER_DATA_DIR || './.messenger-session'
      );
      if (!fs.existsSync(sessionDir) || fs.readdirSync(sessionDir).length === 0) {
        sessionStatus = 'UNAUTHENTICATED';
      }
    }

    if (sessionStatus) {
      this.db.prepare(`
        UPDATE bot_state
        SET dry_run = ?, session_status = ?, updated_at = ?
        WHERE id = 1
      `).run(dryRun ? 1 : 0, sessionStatus, now);
    } else {
      this.db.prepare(`
        UPDATE bot_state
        SET dry_run = ?, updated_at = ?
        WHERE id = 1
      `).run(dryRun ? 1 : 0, now);
    }

    this.logService.logAudit('BOT_DRY_RUN_TOGGLE', actor, { dryRun, sessionStatus });
    return this.getBotState();
  }

  setAiConfig(config: { enabled?: boolean; targetThread?: string }, actor: string = 'admin_ui'): BotState {
    const updates: string[] = [];
    const params: any[] = [];

    if (config.enabled !== undefined) {
      updates.push('ai_auto_reply = ?');
      params.push(config.enabled ? 1 : 0);
    }

    if (config.targetThread !== undefined) {
      updates.push('ai_target_thread = ?');
      params.push(config.targetThread.trim());
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      this.db.prepare(`
        UPDATE bot_state
        SET ${updates.join(', ')}
        WHERE id = 1
      `).run(...params);

      this.logService.logAudit('AI_CONFIG_UPDATED', actor, {
        aiAutoReply: config.enabled,
        aiTargetThread: config.targetThread
      });
    }

    return this.getBotState();
  }

  setAiAutoReply(enabled: boolean, actor: string = 'admin_ui'): BotState {
    return this.setAiConfig({ enabled }, actor);
  }

  getProactiveConfig(): ProactiveChatConfig {
    const state = this.getBotState();
    return state.proactiveChat || {
      enabled: false,
      targetThread: '',
      minIntervalMinutes: 120,
      maxIntervalMinutes: 360,
      activeHoursStart: '08:00',
      activeHoursEnd: '22:30',
      promptGuidance: 'Hỏi thăm bạn bè/khách hàng đang làm gì đó, trêu đùa lầy lội hoặc rủ đi cafe/ăn uống',
      lastSentAt: null,
      nextScheduledAt: null
    };
  }

  updateProactiveConfig(updates: Partial<ProactiveChatConfig>, actor: string = 'admin_ui'): ProactiveChatConfig {
    const current = this.getProactiveConfig();
    const merged: ProactiveChatConfig = {
      ...current,
      ...updates
    };

    // Safety clamps on intervals
    if (merged.minIntervalMinutes < 5) merged.minIntervalMinutes = 5;
    if (merged.maxIntervalMinutes < merged.minIntervalMinutes) {
      merged.maxIntervalMinutes = merged.minIntervalMinutes + 30;
    }

    const serialized = JSON.stringify(merged);
    this.db.prepare(`
      UPDATE bot_state
      SET proactive_chat_config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(serialized);

    this.logService.logAudit('PROACTIVE_CONFIG_UPDATED', actor, {
      enabled: merged.enabled,
      targetThread: merged.targetThread,
      minIntervalMinutes: merged.minIntervalMinutes,
      maxIntervalMinutes: merged.maxIntervalMinutes,
      activeHoursStart: merged.activeHoursStart,
      activeHoursEnd: merged.activeHoursEnd
    });

    return merged;
  }

  triggerProactiveTest(targetThread?: string, actor: string = 'admin_ui'): { success: boolean; jobId: string } {
    const config = this.getProactiveConfig();
    const target = targetThread || config.targetThread || this.getBotState().aiTargetThread || '';
    const jobId = `test-${Date.now()}`;

    this.db.prepare(`
      INSERT INTO test_dispatch_queue (id, reminder_id, target_thread_id, content, action_type, status)
      VALUES (?, ?, ?, ?, 'PROACTIVE_TEST', 'PENDING')
    `).run(jobId, 'proactive-test', target, config.promptGuidance || 'Hỏi thăm đang làm gì hoặc trêu đùa');

    this.logService.logAudit('PROACTIVE_TEST_TRIGGERED', actor, {
      jobId,
      targetThread: target
    });

    return { success: true, jobId };
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
