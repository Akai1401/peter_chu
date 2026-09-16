import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { BotControlService } from '../services/bot-control.service.js';
import { BotActionSchema } from '@messenger/shared';
import { getDb } from '../db/database.js';

export function createBotRouter(botService: BotControlService = new BotControlService()): Router {
  const router = Router();

  // GET /api/bot/status
  router.get('/status', (_req, res) => {
    try {
      const state = botService.getBotState();
      res.json({ success: true, data: state });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/bot/action
  router.post('/action', (req, res) => {
    try {
      const parseResult = BotActionSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ success: false, errors: parseResult.error.errors });
        return;
      }

      const { action, actor, reason } = parseResult.data;

      if (action === 'START' || action === 'RESTART') {
        const currentState = botService.getBotState();
        if (currentState.sessionStatus !== 'LOGGED_IN') {
          res.status(400).json({
            success: false,
            error: 'Messenger chưa được kết nối. Vui lòng kết nối Messenger trước khi kích hoạt hệ thống!'
          });
          return;
        }
      }

      const state = botService.updateBotStatus(action, actor, reason);
      res.json({ success: true, data: state });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/bot/dry-run
  router.post('/dry-run', (req, res) => {
    try {
      const { dryRun, actor } = req.body;
      if (typeof dryRun !== 'boolean') {
        res.status(400).json({ success: false, error: 'dryRun must be a boolean' });
        return;
      }
      const state = botService.setDryRun(dryRun, actor || 'admin');
      res.json({ success: true, data: state });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/bot/ai-toggle
  router.post('/ai-toggle', (req, res) => {
    try {
      const { enabled, actor } = req.body;
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ success: false, error: 'enabled must be a boolean' });
        return;
      }
      const state = botService.setAiAutoReply(enabled, actor || 'admin');
      res.json({ success: true, data: state });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/bot/ai-config
  router.post('/ai-config', (req, res) => {
    try {
      const { enabled, targetThread, actor } = req.body;
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        res.status(400).json({ success: false, error: 'enabled must be a boolean' });
        return;
      }
      if (targetThread !== undefined && typeof targetThread !== 'string') {
        res.status(400).json({ success: false, error: 'targetThread must be a string' });
        return;
      }
      const state = botService.setAiConfig({ enabled, targetThread }, actor || 'admin');
      res.json({ success: true, data: state });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/bot/session-check (Legacy status check)
  router.get('/session-check', (_req, res) => {
    try {
      const state = botService.getBotState();
      res.json({
        success: true,
        data: {
          sessionStatus: state.sessionStatus,
          lastHeartbeat: state.lastHeartbeat,
          dryRun: state.dryRun
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/bot/check-session (Active session re-check via Worker)
  router.post('/check-session', async (_req, res) => {
    try {
      const db = getDb();
      const testId = randomUUID();

      db.prepare(`
        INSERT INTO test_dispatch_queue (id, reminder_id, target_thread_id, content, action_type, call_duration_seconds, status)
        VALUES (?, 'system', 'system', 'check-session', 'CHECK_SESSION', 0, 'PENDING')
      `).run(testId);

      // Wait up to 20 seconds for worker to verify
      const start = Date.now();
      let finishedJob: { status: string; error: string | null } | null = null;
      while (Date.now() - start < 20000) {
        await new Promise((r) => setTimeout(r, 600));
        const job = db
          .prepare('SELECT status, error FROM test_dispatch_queue WHERE id = ?')
          .get(testId) as { status: string; error: string | null } | undefined;
        if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) {
          finishedJob = job;
          break;
        }
      }

      const state = botService.getBotState();
      res.json({
        success: true,
        data: {
          sessionStatus: state.sessionStatus,
          lastHeartbeat: state.lastHeartbeat
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/bot/check-incoming (Active incoming message check via Worker)
  router.post('/check-incoming', async (_req, res) => {
    try {
      const db = getDb();
      const testId = randomUUID();

      db.prepare(`
        INSERT INTO test_dispatch_queue (id, reminder_id, target_thread_id, content, action_type, call_duration_seconds, status)
        VALUES (?, 'system', 'system', 'check-incoming', 'CHECK_INCOMING', 0, 'PENDING')
      `).run(testId);

      // Wait up to 25 seconds for worker to scan
      const start = Date.now();
      let finishedJob: { status: string; error: string | null } | null = null;
      while (Date.now() - start < 25000) {
        await new Promise((r) => setTimeout(r, 600));
        const job = db
          .prepare('SELECT status, error FROM test_dispatch_queue WHERE id = ?')
          .get(testId) as { status: string; error: string | null } | undefined;
        if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) {
          finishedJob = job;
          break;
        }
      }

      const result = finishedJob?.error || 'TIMEOUT';
      const hasFound = result === 'FOUND_INCOMING';
      res.json({
        success: true,
        data: {
          result,
          found: hasFound,
          message: hasFound
            ? 'Đã phát hiện và xử lý tin nhắn mới thành công!'
            : 'Đã quét xong: Chưa có tin nhắn mới nào chưa đọc trên Messenger Web.'
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/bot/connect-messenger (Open Chrome to log in Messenger)
  router.post('/connect-messenger', async (_req, res) => {
    try {
      const db = getDb();
      const testId = randomUUID();

      db.prepare(`
        INSERT INTO test_dispatch_queue (id, reminder_id, target_thread_id, content, action_type, call_duration_seconds, status)
        VALUES (?, 'system', 'system', 'connect-messenger', 'CONNECT_MESSENGER', 0, 'PENDING')
      `).run(testId);

      res.json({
        success: true,
        message: 'Đang mở trình duyệt Chrome để đăng nhập Facebook Messenger. Vui lòng đăng nhập trên cửa sổ Chrome vừa mở!'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/bot/disconnect (Log out session and clear cookies)
  router.post('/disconnect', async (_req, res) => {
    try {
      const db = getDb();
      const testId = randomUUID();

      db.prepare(`
        INSERT INTO test_dispatch_queue (id, reminder_id, target_thread_id, content, action_type, call_duration_seconds, status)
        VALUES (?, 'system', 'system', 'disconnect', 'DISCONNECT', 0, 'PENDING')
      `).run(testId);

      botService.updateSessionStatus('UNAUTHENTICATED');

      res.json({
        success: true,
        message: 'Đã ngắt kết nối phiên đăng nhập Messenger.'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
