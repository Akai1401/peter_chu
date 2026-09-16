import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/database.js';
import { ReminderService } from '../services/reminder.service.js';
import { BotControlService } from '../services/bot-control.service.js';
import { LogService } from '../services/log.service.js';
import {
  CreateReminderSchema,
  UpdateReminderSchema,
  createMessagePreview,
  generateIdempotencyKey
} from '@messenger/shared';

export function createReminderRouter(
  reminderService: ReminderService = new ReminderService(),
  botService: BotControlService = new BotControlService(),
  logService: LogService = new LogService()
): Router {
  const router = Router();

  // GET /api/reminders
  router.get('/', (_req, res) => {
    try {
      const items = reminderService.getAllReminders();
      res.json({ success: true, data: items });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/reminders/:id
  router.get('/:id', (req, res) => {
    try {
      const item = reminderService.getReminderById(req.params.id);
      if (!item) {
        res.status(404).json({ success: false, error: 'Reminder not found' });
        return;
      }
      res.json({ success: true, data: item });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reminders
  router.post('/', (req, res) => {
    try {
      const parseResult = CreateReminderSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ success: false, errors: parseResult.error.errors });
        return;
      }

      const item = reminderService.createReminder(parseResult.data, req.body.actor || 'admin_ui');
      res.status(201).json({ success: true, data: item });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/reminders/:id
  router.put('/:id', (req, res) => {
    try {
      const parseResult = UpdateReminderSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ success: false, errors: parseResult.error.errors });
        return;
      }

      const updated = reminderService.updateReminder(
        req.params.id,
        parseResult.data,
        req.body.actor || 'admin_ui'
      );
      if (!updated) {
        res.status(404).json({ success: false, error: 'Reminder not found' });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/reminders/:id/toggle
  router.patch('/:id/toggle', (req, res) => {
    try {
      const updated = reminderService.toggleReminder(
        req.params.id,
        req.body.actor || 'admin_ui'
      );
      if (!updated) {
        res.status(404).json({ success: false, error: 'Reminder not found' });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/reminders/:id
  router.delete('/:id', (req, res) => {
    try {
      const deleted = reminderService.deleteReminder(
        req.params.id,
        req.body.actor || 'admin_ui'
      );
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Reminder not found' });
        return;
      }
      res.json({ success: true, message: 'Reminder deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reminders/:id/test
  // Triggers an immediate test delivery for this reminder
  router.post('/:id/test', async (req, res) => {
    try {
      const reminder = reminderService.getReminderById(req.params.id);
      if (!reminder) {
        res.status(404).json({ success: false, error: 'Reminder not found' });
        return;
      }

      const botState = botService.getBotState();
      const isEmergencyStopped = botState.emergencyStop || botState.status === 'EMERGENCY_STOPPED';

      if (isEmergencyStopped) {
        res.status(400).json({
          success: false,
          error: 'Bot is currently EMERGENCY_STOPPED. Cannot send test reminder.'
        });
        return;
      }

      // Safe test simulation - respect botState.dryRun as single source of truth
      const isDryRun = Boolean(botState.dryRun);
      const slotKey = `test-${Date.now()}`;
      const idempotencyKey = generateIdempotencyKey(reminder.id, reminder.targetThreadId, slotKey);
      const preview = createMessagePreview(reminder.content);

      // Record audit
      logService.logAudit('TEST_REMINDER_TRIGGER', req.body.actor || 'admin_ui', {
        reminderId: reminder.id,
        title: reminder.title
      });

      // LIVE MODE: Send real message through worker
      if (botState.sessionStatus !== 'LOGGED_IN') {
        res.status(400).json({
          success: false,
          error: 'Messenger chưa được kết nối. Vui lòng kết nối Messenger trước khi sử dụng tính năng này!'
        });
        return;
      }

      const db = getDb();
      const testId = randomUUID();
      const actionType = req.body.actionType || 'MESSAGE';
      const callDurationSeconds = req.body.callDurationSeconds || reminder.callDurationSeconds || 25;
      const testContent = (reminder.content && reminder.content.trim()) || `[Test] ${reminder.title}`;

      db.prepare(`
        INSERT INTO test_dispatch_queue (id, reminder_id, target_thread_id, content, action_type, call_duration_seconds, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(testId, reminder.id, reminder.targetThreadId, testContent, actionType, callDurationSeconds);

      // Wait up to 35 seconds for worker to process
      const start = Date.now();
      let finishedJob: { status: string; error: string | null } | null = null;

      while (Date.now() - start < 35000) {
        await new Promise((r) => setTimeout(r, 600));
        const job = db
          .prepare('SELECT status, error FROM test_dispatch_queue WHERE id = ?')
          .get(testId) as { status: string; error: string | null } | undefined;

        if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) {
          finishedJob = job;
          break;
        }
      }

      if (!finishedJob) {
        res.status(504).json({
          success: false,
          error: 'Quá thời gian chờ Worker xử lý. Hãy chắc chắn rằng bạn đang chạy "npm run dev:worker"!'
        });
        return;
      }

      if (finishedJob.status === 'FAILED') {
        res.status(400).json({
          success: false,
          error: finishedJob.error || 'Worker gửi tin nhắn thật thất bại.'
        });
        return;
      }

      // Query the execution log generated by worker
      const latestLog = logService.getExecutionLogs(1, 0, reminder.id)[0];

      res.json({
        success: true,
        message: 'Đã thực thi thành công trên Messenger!',
        execution: latestLog
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reminders/:id/call
  // Triggers an immediate voice or video call for this reminder
  router.post('/:id/call', async (req, res) => {
    try {
      const reminder = reminderService.getReminderById(req.params.id);
      if (!reminder) {
        res.status(404).json({ success: false, error: 'Reminder not found' });
        return;
      }

      const botState = botService.getBotState();
      const isEmergencyStopped = botState.emergencyStop || botState.status === 'EMERGENCY_STOPPED';

      if (isEmergencyStopped) {
        res.status(400).json({
          success: false,
          error: 'Bot is currently EMERGENCY_STOPPED. Cannot initiate call.'
        });
        return;
      }

      const isDryRun = Boolean(botState.dryRun);
      const callType = (req.body.callType === 'VIDEO' ? 'VIDEO_CALL' : 'AUDIO_CALL') as 'AUDIO_CALL' | 'VIDEO_CALL';
      const durationSeconds = Number(req.body.durationSeconds || reminder.callDurationSeconds || 25);
      const slotKey = `call-${Date.now()}`;
      const idempotencyKey = generateIdempotencyKey(reminder.id, reminder.targetThreadId, slotKey);
      const callLabel = callType === 'VIDEO_CALL' ? 'Video' : 'Thoại';

      // Record audit
      logService.logAudit('TEST_CALL_TRIGGER', req.body.actor || 'admin_ui', {
        reminderId: reminder.id,
        title: reminder.title,
        callType,
        durationSeconds
      });

      // LIVE MODE: Call through worker
      if (botState.sessionStatus !== 'LOGGED_IN') {
        res.status(400).json({
          success: false,
          error: 'Messenger chưa được kết nối. Vui lòng kết nối Messenger trước khi sử dụng tính năng này!'
        });
        return;
      }

      const db = getDb();
      const testId = randomUUID();

      db.prepare(`
        INSERT INTO test_dispatch_queue (id, reminder_id, target_thread_id, content, action_type, call_duration_seconds, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(testId, reminder.id, reminder.targetThreadId, reminder.content, callType, durationSeconds);

      // Wait for worker to process (duration + 25 seconds overhead)
      const timeoutMs = (durationSeconds + 25) * 1000;
      const start = Date.now();
      let finishedJob: { status: string; error: string | null } | null = null;

      while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 600));
        const job = db
          .prepare('SELECT status, error FROM test_dispatch_queue WHERE id = ?')
          .get(testId) as { status: string; error: string | null } | undefined;

        if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) {
          finishedJob = job;
          break;
        }
      }

      if (!finishedJob) {
        res.status(504).json({
          success: false,
          error: 'Quá thời gian chờ Worker xử lý cuộc gọi. Hãy chắc chắn rằng bạn đang chạy "npm run dev:worker"!'
        });
        return;
      }

      if (finishedJob.status === 'FAILED') {
        res.status(400).json({
          success: false,
          error: finishedJob.error || 'Worker thực hiện cuộc gọi Messenger thất bại.'
        });
        return;
      }

      const latestLog = logService.getExecutionLogs(1, 0, reminder.id)[0];

      res.json({
        success: true,
        message: `Đã thực hiện cuộc gọi ${callLabel} Messenger thành công (${durationSeconds}s)!`,
        execution: latestLog
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
