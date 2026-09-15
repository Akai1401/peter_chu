import { Router } from 'express';
import { BotControlService } from '../services/bot-control.service.js';
import { BotActionSchema } from '@messenger/shared';

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

  // GET /api/bot/session-check
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

  return router;
}
