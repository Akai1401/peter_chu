import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export function getDbPath(): string {
  const envPath = process.env.DATABASE_PATH || './data/messenger_bot.db';
  return path.isAbsolute(envPath)
    ? envPath
    : path.resolve(findWorkspaceRoot(), envPath);
}

export function initDatabase(dbPath?: string): Database.Database {
  const finalPath = dbPath || getDbPath();
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(finalPath);

  // Enable WAL mode for high concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Load and run schema
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }

  // Safe migrations for newly added columns
  try {
    db.exec(`ALTER TABLE reminders ADD COLUMN action_type TEXT NOT NULL DEFAULT 'MESSAGE'`);
  } catch {}
  try {
    db.exec(`ALTER TABLE reminders ADD COLUMN call_duration_seconds INTEGER NOT NULL DEFAULT 30`);
  } catch {}
  try {
    db.exec(`ALTER TABLE reminders ADD COLUMN max_runs INTEGER NOT NULL DEFAULT 0`);
  } catch {}
  try {
    db.exec(`ALTER TABLE reminders ADD COLUMN run_count INTEGER NOT NULL DEFAULT 0`);
  } catch {}
  try {
    db.exec(`ALTER TABLE reminders ADD COLUMN target_date TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE test_dispatch_queue ADD COLUMN action_type TEXT NOT NULL DEFAULT 'MESSAGE'`);
  } catch {}
  try {
    db.exec(`ALTER TABLE test_dispatch_queue ADD COLUMN call_duration_seconds INTEGER NOT NULL DEFAULT 30`);
  } catch {}
  try {
    db.exec(`ALTER TABLE bot_state ADD COLUMN ai_auto_reply INTEGER NOT NULL DEFAULT 1`);
  } catch {}
  try {
    db.exec(`ALTER TABLE bot_state ADD COLUMN ai_target_thread TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE bot_state ADD COLUMN learned_persona TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE bot_state ADD COLUMN active_persona_id TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE bot_state ADD COLUMN active_persona_name TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE bot_state ADD COLUMN persona_source_thread TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE bot_state ADD COLUMN persona_updated_at TEXT DEFAULT ''`);
  } catch {}
  try {
    db.exec(`ALTER TABLE bot_state ADD COLUMN proactive_chat_config TEXT DEFAULT ''`);
  } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS persona_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      persona TEXT NOT NULL,
      source_thread TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_persona_profiles_active ON persona_profiles(is_active);
  `);

  return db;
}

// Global shared DB instance for API service
let sharedDb: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!sharedDb) {
    sharedDb = initDatabase();
  }
  return sharedDb;
}
