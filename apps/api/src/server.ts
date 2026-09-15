import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from root or local
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

import { initDatabase } from './db/database.js';
import { createBotRouter } from './routes/bot.router.js';
import { createReminderRouter } from './routes/reminder.router.js';
import { createLogRouter } from './routes/log.router.js';
import { createScheduleRouter } from './routes/schedule.router.js';

export function createApp() {
  // Ensure DB initialized
  initDatabase();

  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'messenger-ai-bot-api',
      timestamp: new Date().toISOString()
    });
  });

  // API Routes
  app.use('/api/bot', createBotRouter());
  app.use('/api/reminders', createReminderRouter());
  app.use('/api/logs', createLogRouter());
  app.use('/api/schedules', createScheduleRouter());

  // 404 Handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  return app;
}

const isDirectRun =
  process.argv[1] &&
  (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js')) &&
  process.env.NODE_ENV !== 'test';

if (isDirectRun) {
  const port = parseInt(process.env.PORT || '4000', 10);
  const app = createApp();
  app.listen(port, () => {
    console.log(`[API] Messenger AI Bot Control Center API running on http://localhost:${port}`);
    console.log(`[API] DRY_RUN = ${process.env.DRY_RUN !== 'false'}`);
  });
}
