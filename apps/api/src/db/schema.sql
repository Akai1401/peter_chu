-- Messenger AI Bot Control Center - SQLite Schema

-- Bot State Singleton
CREATE TABLE IF NOT EXISTS bot_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'STOPPED', -- 'RUNNING', 'STOPPED', 'PAUSED', 'EMERGENCY_STOPPED'
  session_status TEXT NOT NULL DEFAULT 'UNKNOWN', -- 'UNKNOWN', 'LOGGED_IN', 'SESSION_EXPIRED', 'UNAUTHENTICATED'
  emergency_stop INTEGER NOT NULL DEFAULT 0,
  dry_run INTEGER NOT NULL DEFAULT 0,
  ai_auto_reply INTEGER NOT NULL DEFAULT 1,
  ai_target_thread TEXT DEFAULT '',
  learned_persona TEXT DEFAULT '',
  active_persona_id TEXT DEFAULT '',
  active_persona_name TEXT DEFAULT '',
  persona_source_thread TEXT DEFAULT '',
  persona_updated_at TEXT DEFAULT '',
  last_heartbeat TEXT,
  lock_holder_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Initialize singleton if not exists
INSERT OR IGNORE INTO bot_state (id, status, session_status, emergency_stop, dry_run, updated_at)
VALUES (1, 'STOPPED', 'UNKNOWN', 0, 0, CURRENT_TIMESTAMP);

-- Reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  target_thread_id TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'MESSAGE', -- 'MESSAGE', 'AUDIO_CALL', 'VIDEO_CALL', 'MESSAGE_AND_CALL'
  call_duration_seconds INTEGER NOT NULL DEFAULT 30,
  max_runs INTEGER NOT NULL DEFAULT 0,
  run_count INTEGER NOT NULL DEFAULT 0,
  schedule_cron TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  window_start TEXT NOT NULL DEFAULT '00:00',
  window_end TEXT NOT NULL DEFAULT '23:59',
  interval_minutes INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Execution logs table
CREATE TABLE IF NOT EXISTS execution_logs (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'SUCCESS', 'DRY_RUN', 'FAILED', 'SKIPPED_DUPLICATE', 'SKIPPED_RATE_LIMITED', etc.
  idempotency_key TEXT NOT NULL,
  message_preview TEXT NOT NULL,
  executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_reminder ON execution_logs(reminder_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_key ON execution_logs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_execution_logs_date ON execution_logs(executed_at);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  details TEXT,
  level TEXT NOT NULL DEFAULT 'INFO'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Singleton Locks (worker singleton lock, rate limiter lock, slot locks)
CREATE TABLE IF NOT EXISTS singleton_locks (
  lock_key TEXT PRIMARY KEY,
  holder_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

-- Test dispatch queue for on-demand sends
CREATE TABLE IF NOT EXISTS test_dispatch_queue (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  target_thread_id TEXT NOT NULL,
  content TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'MESSAGE',
  call_duration_seconds INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);

-- AI Processed Messages for Messenger Auto-Reply Idempotency
CREATE TABLE IF NOT EXISTS ai_processed_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  message_text TEXT NOT NULL,
  reply_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_processed_messages_thread ON ai_processed_messages(thread_id);

-- Persona Profiles for Messenger Auto-Reply Customization
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
