import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

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

const rootDir = findWorkspaceRoot();

// Load .env
dotenv.config({ path: path.resolve(rootDir, '.env') });
dotenv.config();

import { MessengerClient } from './messenger/playwright-client.js';
import { LockManager } from './safety/lock-manager.js';
import { RateLimiter } from './safety/rate-limiter.js';
import { CronRunner } from './scheduler/cron-runner.js';

function getDbPath(): string {
  const envPath = process.env.DATABASE_PATH || './data/messenger_bot.db';
  return path.isAbsolute(envPath) ? envPath : path.resolve(rootDir, envPath);
}

function initWorkerDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Ensure tables exist even if worker starts before API
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'STOPPED',
      session_status TEXT NOT NULL DEFAULT 'UNKNOWN',
      emergency_stop INTEGER NOT NULL DEFAULT 0,
      dry_run INTEGER NOT NULL DEFAULT 1,
      last_heartbeat TEXT,
      lock_holder_id TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO bot_state (id, status, session_status, emergency_stop, dry_run, updated_at)
    VALUES (1, 'STOPPED', 'UNKNOWN', 0, 1, CURRENT_TIMESTAMP);

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      target_thread_id TEXT NOT NULL,
      action_type TEXT NOT NULL DEFAULT 'MESSAGE',
      call_duration_seconds INTEGER NOT NULL DEFAULT 30,
      schedule_cron TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      window_start TEXT NOT NULL DEFAULT '18:00',
      window_end TEXT NOT NULL DEFAULT '22:00',
      interval_minutes INTEGER NOT NULL DEFAULT 10,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS execution_logs (
      id TEXT PRIMARY KEY,
      reminder_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      message_preview TEXT NOT NULL,
      executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      details TEXT,
      level TEXT NOT NULL DEFAULT 'INFO'
    );

    CREATE TABLE IF NOT EXISTS singleton_locks (
      lock_key TEXT PRIMARY KEY,
      holder_id TEXT NOT NULL,
      acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_dispatch_queue (
      id TEXT PRIMARY KEY,
      reminder_id TEXT NOT NULL,
      target_thread_id TEXT NOT NULL,
      content TEXT NOT NULL,
      action_type TEXT NOT NULL DEFAULT 'MESSAGE',
      call_duration_seconds INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'PENDING',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT
    );
  `);

  try {
    db.exec(`ALTER TABLE reminders ADD COLUMN action_type TEXT NOT NULL DEFAULT 'MESSAGE'`);
  } catch {}
  try {
    db.exec(`ALTER TABLE reminders ADD COLUMN call_duration_seconds INTEGER NOT NULL DEFAULT 30`);
  } catch {}
  try {
    db.exec(`ALTER TABLE test_dispatch_queue ADD COLUMN action_type TEXT NOT NULL DEFAULT 'MESSAGE'`);
  } catch {}
  try {
    db.exec(`ALTER TABLE test_dispatch_queue ADD COLUMN call_duration_seconds INTEGER NOT NULL DEFAULT 30`);
  } catch {}

  return db;
}

async function bootstrapWorker() {
  const dbPath = getDbPath();
  const db = initWorkerDatabase(dbPath);

  const botStateRow = db.prepare('SELECT dry_run FROM bot_state WHERE id = 1').get() as { dry_run: number } | undefined;
  const isDryRun = botStateRow !== undefined ? Boolean(botStateRow.dry_run) : (process.env.DRY_RUN !== 'false');
  console.log(`[Worker] Starting Messenger Bot Worker...`);
  console.log(`[Worker] Database: ${dbPath}`);
  console.log(`[Worker] DRY_RUN Mode: ${isDryRun}`);
  console.log(`[Worker] Timezone: Asia/Ho_Chi_Minh (UTC+7)`);

  const messengerClient = new MessengerClient({
    isDryRun,
    headless: process.env.MESSENGER_HEADLESS === 'true',
    userDataDir: path.resolve(rootDir, process.env.MESSENGER_USER_DATA_DIR || './.messenger-session')
  });

  const lockManager = new LockManager(db);
  const rateLimiter = new RateLimiter(db);
  const cronRunner = new CronRunner(db, messengerClient, lockManager, rateLimiter);

  // Check initial session
  try {
    const sessionStatus = await messengerClient.checkSession();
    db.prepare(`UPDATE bot_state SET session_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(sessionStatus);
    console.log(`[Worker] Initial Session Status: ${sessionStatus}`);
  } catch (err) {
    console.warn(`[Worker] Could not verify session status:`, err);
  }

  // Start cron evaluation loop (evaluates every 20 seconds)
  cronRunner.start(20000);
  console.log(`[Worker] Scheduler running with worker ID: ${cronRunner.getWorkerId()}`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Worker] Received ${signal}. Shutting down worker...`);
    await cronRunner.stop();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrapWorker().catch((err) => {
  console.error('[Worker] Fatal error starting worker:', err);
  process.exit(1);
});
