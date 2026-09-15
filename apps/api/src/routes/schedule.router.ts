import { Router } from 'express';
import { ScheduleService } from '../services/schedule.service.js';

export function createScheduleRouter(scheduleService: ScheduleService = new ScheduleService()): Router {
  const router = Router();

  // GET /api/schedules/upcoming
  router.get('/upcoming', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
      const slots = scheduleService.getUpcomingSlots(limit);
      res.json({ success: true, data: slots });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
