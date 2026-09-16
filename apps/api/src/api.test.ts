import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './server.js';
import { initDatabase } from './db/database.js';

const TEST_DB_PATH = path.resolve(process.cwd(), 'data/test_api.db');

test.before(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  process.env.DATABASE_PATH = TEST_DB_PATH;
  process.env.DRY_RUN = 'true';
  const db = initDatabase(TEST_DB_PATH);
  db.prepare("UPDATE bot_state SET session_status = 'LOGGED_IN' WHERE id = 1").run();
});

test.after(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

test('API Integration - Health check', async () => {
  const app = createApp();
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('API Integration - Bot Status and Actions', async () => {
  const app = createApp();

  // 1. Get initial status
  const res1 = await request(app).get('/api/bot/status');
  assert.equal(res1.status, 200);
  assert.equal(res1.body.success, true);
  assert.equal(res1.body.data.status, 'STOPPED');

  // 2. Start bot
  const res2 = await request(app)
    .post('/api/bot/action')
    .send({ action: 'START', actor: 'test_suite' });
  assert.equal(res2.status, 200);
  assert.equal(res2.body.data.status, 'RUNNING');

  // 3. Emergency stop
  const res3 = await request(app)
    .post('/api/bot/action')
    .send({ action: 'EMERGENCY_STOP', actor: 'test_suite' });
  assert.equal(res3.status, 200);
  assert.equal(res3.body.data.status, 'EMERGENCY_STOPPED');
  assert.equal(res3.body.data.emergencyStop, true);

  // 4. Restart bot
  const res4 = await request(app)
    .post('/api/bot/action')
    .send({ action: 'RESTART', actor: 'test_suite' });
  assert.equal(res4.status, 200);
  assert.equal(res4.body.data.status, 'RUNNING');
  assert.equal(res4.body.data.emergencyStop, false);

  // 5. Toggle AI Auto-Reply
  const resAiOff = await request(app)
    .post('/api/bot/ai-toggle')
    .send({ enabled: false, actor: 'test_suite' });
  assert.equal(resAiOff.status, 200);
  assert.equal(resAiOff.body.data.aiAutoReply, false);

  const resAiOn = await request(app)
    .post('/api/bot/ai-toggle')
    .send({ enabled: true, actor: 'test_suite' });
  assert.equal(resAiOn.status, 200);
  assert.equal(resAiOn.body.data.aiAutoReply, true);

  // 6. Configure AI target thread via /api/bot/ai-config
  const resAiConfig = await request(app)
    .post('/api/bot/ai-config')
    .send({
      targetThread: 'https://www.facebook.com/messages/t/100040388333156',
      enabled: true,
      actor: 'test_suite'
    });
  assert.equal(resAiConfig.status, 200);
  assert.equal(resAiConfig.body.data.aiTargetThread, 'https://www.facebook.com/messages/t/100040388333156');
  assert.equal(resAiConfig.body.data.aiAutoReply, true);
});

test('API Integration - Reminder CRUD and Test Dispatch', async () => {
  const app = createApp();

  // 1. Create reminder
  const createRes = await request(app)
    .post('/api/reminders')
    .send({
      title: 'Daily Evening Reminder',
      content: 'Hello! This is a test evening reminder.',
      targetThreadId: 't_1234567890',
      windowStart: '18:00',
      windowEnd: '22:00',
      intervalMinutes: 10
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.success, true);
  const reminderId = createRes.body.data.id;
  assert.ok(reminderId);
  assert.equal(createRes.body.data.title, 'Daily Evening Reminder');
  assert.equal(createRes.body.data.active, true);

  // 2. List reminders
  const listRes = await request(app).get('/api/reminders');
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.data));
  assert.ok(listRes.body.data.length >= 1);

  // 3. Toggle reminder
  const toggleRes = await request(app).patch(`/api/reminders/${reminderId}/toggle`);
  assert.equal(toggleRes.status, 200);
  assert.equal(toggleRes.body.data.active, false);

  // Toggle back on
  await request(app).patch(`/api/reminders/${reminderId}/toggle`);

  // 4. Test reminder dispatch (LIVE worker queue)
  const testPromise = request(app).post(`/api/reminders/${reminderId}/test`);
  setTimeout(() => {
    const db = initDatabase(TEST_DB_PATH);
    const item = db.prepare(`SELECT id FROM test_dispatch_queue WHERE reminder_id = ? AND status = 'PENDING'`).get(reminderId) as any;
    if (item) {
      db.prepare(`UPDATE test_dispatch_queue SET status = 'COMPLETED', finished_at = CURRENT_TIMESTAMP WHERE id = ?`).run(item.id);
      db.prepare(`INSERT INTO execution_logs (id, reminder_id, thread_id, status, idempotency_key, message_preview) VALUES ('e_test_1', ?, 't1', 'SUCCESS', 'k1', 'preview')`).run(reminderId);
    }
  }, 200);

  const testRes = await testPromise;
  assert.equal(testRes.status, 200);
  assert.equal(testRes.body.success, true);

  // 5. Query upcoming schedules
  const schedRes = await request(app).get('/api/schedules/upcoming');
  assert.equal(schedRes.status, 200);
  assert.ok(Array.isArray(schedRes.body.data));

  // 6. Query logs
  const auditRes = await request(app).get('/api/logs/audit');
  assert.equal(auditRes.status, 200);
  assert.ok(auditRes.body.data.length > 0);

  const execRes = await request(app).get('/api/logs/execution');
  assert.equal(execRes.status, 200);
  assert.ok(execRes.body.data.length > 0);
  assert.equal(execRes.body.data[0].status, 'SUCCESS');

  // 7. Delete reminder
  const delRes = await request(app).delete(`/api/reminders/${reminderId}`);
  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.success, true);
});

test('API Integration - Persona Profiles CRUD and Activation', async () => {
  const app = createApp();

  // 1. Create a profile
  const createRes = await request(app)
    .post('/api/bot/personas')
    .send({
      name: 'Văn phong thử nghiệm',
      persona: {
        styleSummary: 'Hài hước, lầy lội',
        pronouns: 'tao - mày',
        tone: 'Vui vẻ',
        catchphrases: ['alo', 'ok nha'],
        sampleMessages: ['Alo mày ơi'],
        rawPromptInstruction: 'Nói chuyện kiểu bạn thân.'
      },
      sourceThread: 'https://www.facebook.com/messages/t/test123456',
      makeActive: true
    });

  assert.equal(createRes.status, 200);
  assert.equal(createRes.body.success, true);
  assert.equal(createRes.body.data.name, 'Văn phong thử nghiệm');
  assert.equal(createRes.body.data.isActive, true);
  const profileId = createRes.body.data.id;

  // 2. Get profiles
  const listRes = await request(app).get('/api/bot/personas');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.success, true);
  assert.ok(listRes.body.data.length >= 1);
  const found = listRes.body.data.find((p: any) => p.id === profileId);
  assert.ok(found);
  assert.equal(found.name, 'Văn phong thử nghiệm');
  assert.deepEqual(found.persona.catchphrases, ['alo', 'ok nha']);

  // 3. Verify bot status reflects active persona
  const statusRes = await request(app).get('/api/bot/status');
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.data.activePersonaId, profileId);
  assert.equal(statusRes.body.data.activePersonaName, 'Văn phong thử nghiệm');
  assert.equal(statusRes.body.data.learnedPersona.tone, 'Vui vẻ');

  // 4. Update profile (edit catchphrases, tone, etc.)
  const updateRes = await request(app)
    .put(`/api/bot/personas/${profileId}`)
    .send({
      name: 'Văn phong cập nhật',
      persona: {
        styleSummary: 'Hài hước, lầy lội đã cập nhật',
        pronouns: 'anh - em',
        tone: 'Nhiệt tình',
        catchphrases: ['alo', 'ok em nhé', 'đợi tí'],
        sampleMessages: ['Alo em ơi'],
        rawPromptInstruction: 'Nói chuyện xưng anh gọi em.'
      }
    });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.data.name, 'Văn phong cập nhật');
  assert.deepEqual(updateRes.body.data.persona.catchphrases, ['alo', 'ok em nhé', 'đợi tí']);

  // 5. Create second profile and activate it
  const createRes2 = await request(app)
    .post('/api/bot/personas')
    .send({
      name: 'Văn phong công việc',
      persona: {
        styleSummary: 'Lịch sự, trang trọng',
        pronouns: 'tôi - bạn',
        tone: 'Lịch thiệp',
        catchphrases: ['dạ vâng', 'kính chào'],
        sampleMessages: ['Dạ vâng chào bạn'],
        rawPromptInstruction: 'Lịch sự và chuyên nghiệp.'
      },
      makeActive: false
    });
  const profileId2 = createRes2.body.data.id;
  assert.equal(createRes2.body.data.isActive, false);

  // Activate second profile
  const actRes = await request(app).post(`/api/bot/personas/${profileId2}/activate`);
  assert.equal(actRes.status, 200);
  assert.equal(actRes.body.data.isActive, true);

  // Verify bot status updated to second profile
  const statusRes2 = await request(app).get('/api/bot/status');
  assert.equal(statusRes2.body.data.activePersonaId, profileId2);
  assert.equal(statusRes2.body.data.activePersonaName, 'Văn phong công việc');

  // 6. Delete profile
  const delProfileRes = await request(app).delete(`/api/bot/personas/${profileId}`);
  assert.equal(delProfileRes.status, 200);
  assert.equal(delProfileRes.body.success, true);
});

test('API Integration - Proactive Messaging Configuration & Test Trigger', async () => {
  const app = createApp();

  // 1. Get initial proactive config
  const getRes = await request(app).get('/api/bot/proactive');
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.success, true);
  assert.equal(typeof getRes.body.data.enabled, 'boolean');

  // 2. Update proactive config
  const updateRes = await request(app)
    .post('/api/bot/proactive')
    .send({
      enabled: true,
      targetThread: 'https://www.facebook.com/messages/t/test_proactive_123',
      minIntervalMinutes: 60,
      maxIntervalMinutes: 180,
      activeHoursStart: '09:00',
      activeHoursEnd: '21:00',
      promptGuidance: 'Hỏi thăm đang làm gì hoặc trêu đùa'
    });

  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.success, true);
  assert.equal(updateRes.body.data.enabled, true);
  assert.equal(updateRes.body.data.targetThread, 'https://www.facebook.com/messages/t/test_proactive_123');
  assert.equal(updateRes.body.data.minIntervalMinutes, 60);
  assert.equal(updateRes.body.data.maxIntervalMinutes, 180);
  assert.equal(updateRes.body.data.activeHoursStart, '09:00');

  // 3. Verify bot status includes proactiveChat
  const statusRes = await request(app).get('/api/bot/status');
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.data.proactiveChat.enabled, true);
  assert.equal(statusRes.body.data.proactiveChat.minIntervalMinutes, 60);

  // 4. Trigger proactive test
  const testRes = await request(app)
    .post('/api/bot/proactive/test')
    .send({ targetThread: 'https://www.facebook.com/messages/t/test_proactive_123' });

  assert.equal(testRes.status, 200);
  assert.equal(testRes.body.success, true);
  assert.ok(testRes.body.data.jobId);
});

