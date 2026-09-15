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
  initDatabase(TEST_DB_PATH);
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

  // 4. Test reminder dispatch (safe DRY_RUN)
  const testRes = await request(app).post(`/api/reminders/${reminderId}/test`);
  assert.equal(testRes.status, 200);
  assert.equal(testRes.body.success, true);
  assert.equal(testRes.body.execution.status, 'DRY_RUN');

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
  assert.equal(execRes.body.data[0].status, 'DRY_RUN');

  // 7. Delete reminder
  const delRes = await request(app).delete(`/api/reminders/${reminderId}`);
  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.success, true);
});
