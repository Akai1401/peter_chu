import { Router } from 'express';
import { LogService } from '../services/log.service.js';

export function createLogRouter(logService: LogService = new LogService()): Router {
  const router = Router();

  // GET /api/logs/audit
  router.get('/audit', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const logs = logService.getAuditLogs(limit, offset);
      res.json({ success: true, data: logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/logs/execution
  router.get('/execution', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const reminderId = req.query.reminderId as string | undefined;

      const logs = logService.getExecutionLogs(limit, offset, reminderId);
      res.json({ success: true, data: logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
