import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { LockManager } from './safety/lock-manager.js';
import { RateLimiter } from './safety/rate-limiter.js';
import { MessengerClient } from './messenger/playwright-client.js';
import { CronRunner } from './scheduler/cron-runner.js';
import { GeminiService } from './ai/gemini-service.js';

const TEST_DB = path.resolve(process.cwd(), 'data/test_worker.db');

function setupTestDb(): Database.Database {
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
  const dir = path.dirname(TEST_DB);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(TEST_DB);
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'STOPPED',
      session_status TEXT NOT NULL DEFAULT 'UNKNOWN',
      emergency_stop INTEGER NOT NULL DEFAULT 0,
      dry_run INTEGER NOT NULL DEFAULT 1,
      ai_auto_reply INTEGER NOT NULL DEFAULT 1,
      ai_target_thread TEXT DEFAULT '',
      last_heartbeat TEXT,
      lock_holder_id TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO bot_state (id, status, session_status, emergency_stop, dry_run, ai_auto_reply, ai_target_thread) VALUES (1, 'RUNNING', 'LOGGED_IN', 0, 1, 1, '');

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      target_thread_id TEXT NOT NULL,
      action_type TEXT NOT NULL DEFAULT 'MESSAGE',
      call_duration_seconds INTEGER NOT NULL DEFAULT 30,
      max_runs INTEGER NOT NULL DEFAULT 0,
      run_count INTEGER NOT NULL DEFAULT 0,
      schedule_cron TEXT,
      target_date TEXT,
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

    CREATE TABLE IF NOT EXISTS singleton_locks (
      lock_key TEXT PRIMARY KEY,
      holder_id TEXT NOT NULL,
      acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      action TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      details TEXT,
      level TEXT NOT NULL DEFAULT 'INFO'
    );

    CREATE TABLE IF NOT EXISTS ai_processed_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      message_text TEXT NOT NULL,
      reply_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

test('LockManager - acquire, renew, release and deduplication', () => {
  const db = setupTestDb();
  const lock = new LockManager(db);

  // Holder 1 acquires
  assert.equal(lock.acquireLock('worker_singleton', 'holder-1', 10), true);

  // Holder 2 fails to acquire while active
  assert.equal(lock.acquireLock('worker_singleton', 'holder-2', 10), false);

  // Holder 1 can renew
  assert.equal(lock.renewLock('worker_singleton', 'holder-1', 10), true);

  // Holder 1 releases
  lock.releaseLock('worker_singleton', 'holder-1');

  // Now holder 2 can acquire
  assert.equal(lock.acquireLock('worker_singleton', 'holder-2', 10), true);

  // Slot lock deduplication test: must not allow same holder to re-acquire the same slot lock
  assert.equal(lock.acquireSlotLock('test-slot-key-1', 'holder-1', 24), true);
  assert.equal(lock.acquireSlotLock('test-slot-key-1', 'holder-1', 24), false);
  assert.equal(lock.acquireSlotLock('test-slot-key-1', 'holder-2', 24), false);

  db.close();
});

test('RateLimiter - cooldown and max per hour enforcement', () => {
  const db = setupTestDb();
  const limiter = new RateLimiter(db, { minSecondsBetween: 5, maxPerHour: 2 });
  const thread = 'thread_test_99';

  // 1. Initial send allowed
  const check1 = limiter.canSend(thread);
  assert.equal(check1.allowed, true);
  limiter.recordSend(thread);

  // 2. Immediate second send blocked by cooldown
  const check2 = limiter.canSend(thread);
  assert.equal(check2.allowed, false);
  assert.ok(check2.reason?.includes('cooldown'));

  // Reset in-memory timestamp for test
  limiter.reset();

  // Insert 2 logs in SQLite for this thread
  db.prepare(`
    INSERT INTO execution_logs (id, reminder_id, thread_id, status, idempotency_key, message_preview, executed_at)
    VALUES ('l1', 'r1', ?, 'DRY_RUN', 'k1', 'msg1', CURRENT_TIMESTAMP),
           ('l2', 'r1', ?, 'DRY_RUN', 'k2', 'msg2', CURRENT_TIMESTAMP)
  `).run(thread, thread);

  // 3. Max per hour exceeded
  const check3 = limiter.canSend(thread);
  assert.equal(check3.allowed, false);
  assert.ok(check3.reason?.includes('exceeded maximum'));
  db.close();
});

test('MessengerClient - DRY_RUN mode behaves safely without browser', async () => {
  const client = new MessengerClient({ isDryRun: true });

  const session = await client.checkSession();
  assert.equal(session, 'LOGGED_IN');

  const sendResult = await client.sendMessage('test_thread_123', 'Safe test message');
  assert.equal(sendResult.success, true);
  assert.equal(sendResult.dryRun, true);
  assert.equal(sendResult.threadId, 'test_thread_123');
  assert.equal(sendResult.message, 'Safe test message');

  await client.close();
});

test('CronRunner - handles schedule, deduplication, and emergency stop', async () => {
  const db = setupTestDb();
  const client = new MessengerClient({ isDryRun: true });
  const lock = new LockManager(db);
  const limiter = new RateLimiter(db, { minSecondsBetween: 0, maxPerHour: 100 });
  const runner = new CronRunner(db, client, lock, limiter, 'test-worker-1');

  // Insert a test reminder
  db.prepare(`
    INSERT INTO reminders (id, title, content, target_thread_id, window_start, window_end, interval_minutes, active)
    VALUES ('r_test_1', 'Evening Reminder', 'Don’t forget today!', 't_abc', '18:00', '22:00', 10, 1)
  `).run();

  // 1. Tick outside slot (17:00 ICT = 10:00 UTC) => skipped
  const outTime = new Date('2026-09-15T10:00:00Z');
  const resOut = await runner.tick(outTime);
  assert.equal(resOut.dispatched, 0);

  // 2. Tick inside slot (18:00 ICT = 11:00 UTC) => dispatched
  const slotTime = new Date('2026-09-15T11:00:00Z');
  const resIn = await runner.tick(slotTime);
  assert.equal(resIn.dispatched, 1);

  // Verify execution log created
  const logRow = db.prepare(`SELECT * FROM execution_logs WHERE reminder_id = 'r_test_1'`).get() as any;
  assert.ok(logRow);
  assert.equal(logRow.status, 'SUCCESS');

  // 3. Second tick at same slot time => deduplication prevents sending
  const resDup = await runner.tick(slotTime);
  assert.equal(resDup.dispatched, 0);

  // 4. Emergency stopped test
  db.prepare(`UPDATE bot_state SET status = 'EMERGENCY_STOPPED', emergency_stop = 1 WHERE id = 1`).run();
  const nextSlotTime = new Date('2026-09-15T11:10:00Z');
  const resEm = await runner.tick(nextSlotTime);
  assert.equal(resEm.dispatched, 0);

  await runner.stop();
  db.close();

  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
});

test('CronRunner - enforces max_runs and auto-deactivates reminder', async () => {
  const db = setupTestDb();
  const client = new MessengerClient({ isDryRun: true });
  const lock = new LockManager(db);
  const limiter = new RateLimiter(db, { minSecondsBetween: 0, maxPerHour: 100 });
  const runner = new CronRunner(db, client, lock, limiter, 'test-worker-2');

  db.prepare(`
    INSERT INTO reminders (id, title, content, target_thread_id, window_start, window_end, interval_minutes, active, max_runs, run_count)
    VALUES ('r_test_max', 'Max Runs Test', 'Once only', 't_max', '18:00', '22:00', 10, 1, 1, 0)
  `).run();

  const slot1 = new Date('2026-09-15T11:00:00Z');
  const res1 = await runner.tick(slot1);
  assert.equal(res1.dispatched, 1);

  const rowAfter = db.prepare(`SELECT active, run_count FROM reminders WHERE id = 'r_test_max'`).get() as any;
  assert.equal(rowAfter.run_count, 1);
  assert.equal(rowAfter.active, 0);

  const slot2 = new Date('2026-09-15T11:10:00Z');
  const res2 = await runner.tick(slot2);
  assert.equal(res2.dispatched, 0);

  await runner.stop();
  db.close();
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
});

test('CronRunner - auto-stops bot and halts processing when Messenger is not connected', async () => {
  const db = setupTestDb();
  db.prepare(`UPDATE bot_state SET status = 'RUNNING', session_status = 'UNAUTHENTICATED' WHERE id = 1`).run();

  const client = new MessengerClient({ isDryRun: true });
  const lock = new LockManager(db);
  const limiter = new RateLimiter(db, { minSecondsBetween: 0, maxPerHour: 100 });
  const runner = new CronRunner(db, client, lock, limiter, 'test-worker-unauth');

  db.prepare(`
    INSERT INTO reminders (id, title, content, target_thread_id, window_start, window_end, interval_minutes, active)
    VALUES ('r_test_unauth', 'Unauth Test', 'Should not run', 't_unauth', '18:00', '22:00', 10, 1)
  `).run();

  const slot = new Date('2026-09-15T11:00:00Z');
  const res = await runner.tick(slot);
  assert.equal(res.dispatched, 0);

  const botStateRow = db.prepare(`SELECT status FROM bot_state WHERE id = 1`).get() as any;
  assert.equal(botStateRow.status, 'STOPPED');

  await runner.stop();
  db.close();
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
});

test('CronRunner - checkAndReplyIncomingMessages automatically responds to incoming messages with Gemini', async () => {
  const db = setupTestDb();
  db.prepare(`UPDATE bot_state SET status = 'RUNNING', session_status = 'LOGGED_IN' WHERE id = 1`).run();

  const client = new MessengerClient({ isDryRun: true });
  // Mock getLatestUnreadIncomingMessage
  let simulatedIncoming: { threadId: string; senderName?: string; messageText: string } | null = {
    threadId: 't_user_123',
    senderName: 'Nguyen Van A',
    messageText: 'Chào bạn, gói dịch vụ giá bao nhiêu?'
  };
  client.getLatestUnreadIncomingMessage = async () => simulatedIncoming;

  let sentMessages: Array<{ threadId: string; message: string }> = [];
  client.sendMessage = async (threadId: string, message: string) => {
    sentMessages.push({ threadId, message });
    return {
      success: true,
      dryRun: true,
      threadId,
      message,
      timestamp: new Date().toISOString()
    };
  };

  const gemini = new GeminiService({ apiKey: 'dummy_key' });
  gemini.generateReply = async (input: string) => `Chào bạn! Giá gói dịch vụ là 100k/tháng ạ (cho: ${input})`;

  const lock = new LockManager(db);
  const limiter = new RateLimiter(db, { minSecondsBetween: 0, maxPerHour: 100 });
  const runner = new CronRunner(db, client, lock, limiter, 'test-worker-ai', gemini);

  // 1. First run: processes and replies
  const replied = await runner.checkAndReplyIncomingMessages();
  assert.equal(replied, true);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].threadId, 't_user_123');
  assert.ok(sentMessages[0].message.includes('100k/tháng'));

  // Verify record in SQLite ai_processed_messages
  const savedRow = db.prepare(`SELECT * FROM ai_processed_messages WHERE thread_id = 't_user_123'`).get() as any;
  assert.ok(savedRow);
  assert.equal(savedRow.message_text, 'Chào bạn, gói dịch vụ giá bao nhiêu?');

  // Verify execution log
  const logRow = db.prepare(`SELECT * FROM execution_logs WHERE reminder_id = 'ai_auto_reply'`).get() as any;
  assert.ok(logRow);
  assert.equal(logRow.status, 'SUCCESS');

  // 2. Second run with same message: should be ignored (deduplicated)
  const repliedSecond = await runner.checkAndReplyIncomingMessages();
  assert.equal(repliedSecond, false);
  assert.equal(sentMessages.length, 1); // No new message sent

  // 3. If bot is stopped: should not reply
  db.prepare(`UPDATE bot_state SET status = 'STOPPED' WHERE id = 1`).run();
  simulatedIncoming = {
    threadId: 't_user_456',
    messageText: 'Alo bạn ơi?'
  };
  const repliedStopped = await runner.checkAndReplyIncomingMessages();
  assert.equal(repliedStopped, false);
  assert.equal(sentMessages.length, 1);

  // 4. If AI auto reply is toggled OFF (ai_auto_reply = 0): should not reply even if bot is RUNNING
  db.prepare(`UPDATE bot_state SET status = 'RUNNING', ai_auto_reply = 0 WHERE id = 1`).run();
  simulatedIncoming = {
    threadId: 't_user_789',
    messageText: 'Có ai ở đó không?'
  };
  const repliedDisabled = await runner.checkAndReplyIncomingMessages();
  assert.equal(repliedDisabled, false);
  assert.equal(sentMessages.length, 1);

  await runner.stop();
  db.close();
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
});

test('CronRunner - schedule execution takes strict priority over AI Auto-Reply when conflicts occur', async () => {
  const db = setupTestDb();
  db.prepare(`UPDATE bot_state SET status = 'RUNNING', session_status = 'LOGGED_IN' WHERE id = 1`).run();

  const client = new MessengerClient({ isDryRun: true });
  const simulatedIncoming = {
    threadId: 't_user_conflict',
    senderName: 'Nguyen Van Conflict',
    messageText: 'Khách gửi tin nhắn đúng lúc lịch chạy'
  };
  client.getLatestUnreadIncomingMessage = async () => simulatedIncoming;

  const sentMessages: Array<{ threadId: string; message: string }> = [];
  client.sendMessage = async (threadId: string, message: string) => {
    sentMessages.push({ threadId, message });
    return {
      success: true,
      dryRun: true,
      threadId,
      message,
      timestamp: new Date().toISOString()
    };
  };

  const gemini = new GeminiService({ apiKey: 'dummy_key' });
  gemini.generateReply = async () => 'AI Reply';

  const lock = new LockManager(db);
  const limiter = new RateLimiter(db, { minSecondsBetween: 0, maxPerHour: 100 });
  const runner = new CronRunner(db, client, lock, limiter, 'test-worker-priority', gemini);

  // 1. Insert an active reminder due at all times (window 00:00 - 23:59, interval 1 min)
  db.prepare(`
    INSERT INTO reminders (id, title, content, target_thread_id, window_start, window_end, interval_minutes, active)
    VALUES ('r_priority_1', 'Priority Reminder', 'Lịch nhắc quan trọng!', 't_scheduled_target', '00:00', '23:59', 1, 1)
  `).run();

  // Verify that hasDueReminders recognizes this reminder is due
  assert.equal(runner.hasDueReminders(), true);

  // 2. Since schedule is due right now, AI Auto-Reply must yield priority and return false without sending
  const aiResult = await runner.checkAndReplyIncomingMessages();
  assert.equal(aiResult, false);
  assert.equal(sentMessages.length, 0); // AI did NOT send!

  // 3. Now execute the scheduled reminder via tick()
  const tickResult = await runner.tick();
  assert.equal(tickResult.dispatched, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].threadId, 't_scheduled_target');
  assert.equal(sentMessages[0].message, 'Lịch nhắc quan trọng!');

  // 4. Now that schedule has executed for this slot, hasDueReminders is false
  assert.equal(runner.hasDueReminders(), false);

  // 5. AI Auto-Reply can now safely run
  const aiResultAfter = await runner.checkAndReplyIncomingMessages();
  assert.equal(aiResultAfter, true);
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[1].threadId, 't_user_conflict');

  await runner.stop();
  db.close();
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
});

