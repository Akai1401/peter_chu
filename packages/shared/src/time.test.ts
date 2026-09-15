import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWithinWindow,
  isSlotTriggerMinute,
  getUpcomingSlots,
  timeStringToMinutes,
  getLocalTimeParts
} from './time.js';

test('timeStringToMinutes parses properly', () => {
  assert.equal(timeStringToMinutes('00:00'), 0);
  assert.equal(timeStringToMinutes('18:00'), 18 * 60);
  assert.equal(timeStringToMinutes('22:00'), 22 * 60);
  assert.equal(timeStringToMinutes('23:59'), 23 * 60 + 59);
});

test('getLocalTimeParts returns valid values for Asia/Ho_Chi_Minh', () => {
  // UTC 2026-09-15 11:00:00 is ICT 2026-09-15 18:00:00 (UTC+7)
  const utcDate = new Date('2026-09-15T11:00:00Z');
  const parts = getLocalTimeParts(utcDate);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 9);
  assert.equal(parts.day, 15);
  assert.equal(parts.hour, 18);
  assert.equal(parts.minute, 0);
  assert.equal(parts.second, 0);
});

test('isWithinWindow checks 18:00 - 22:00 in ICT accurately', () => {
  // UTC 10:59:00 => ICT 17:59:00 (outside)
  assert.equal(isWithinWindow(new Date('2026-09-15T10:59:00Z'), '18:00', '22:00'), false);
  // UTC 11:00:00 => ICT 18:00:00 (inside)
  assert.equal(isWithinWindow(new Date('2026-09-15T11:00:00Z'), '18:00', '22:00'), true);
  // UTC 13:30:00 => ICT 20:30:00 (inside)
  assert.equal(isWithinWindow(new Date('2026-09-15T13:30:00Z'), '18:00', '22:00'), true);
  // UTC 15:00:00 => ICT 22:00:00 (inside)
  assert.equal(isWithinWindow(new Date('2026-09-15T15:00:00Z'), '18:00', '22:00'), true);
  // UTC 15:01:00 => ICT 22:01:00 (outside)
  assert.equal(isWithinWindow(new Date('2026-09-15T15:01:00Z'), '18:00', '22:00'), false);
});

test('isSlotTriggerMinute triggers every 10 minutes from 18:00', () => {
  // 18:00 ICT => true
  assert.equal(isSlotTriggerMinute(new Date('2026-09-15T11:00:00Z'), '18:00', '22:00', 10), true);
  // 18:05 ICT => false
  assert.equal(isSlotTriggerMinute(new Date('2026-09-15T11:05:00Z'), '18:00', '22:00', 10), false);
  // 18:10 ICT => true
  assert.equal(isSlotTriggerMinute(new Date('2026-09-15T11:10:00Z'), '18:00', '22:00', 10), true);
  // 21:50 ICT => true
  assert.equal(isSlotTriggerMinute(new Date('2026-09-15T14:50:00Z'), '18:00', '22:00', 10), true);
  // 22:00 ICT => true
  assert.equal(isSlotTriggerMinute(new Date('2026-09-15T15:00:00Z'), '18:00', '22:00', 10), true);
});

test('getUpcomingSlots generates valid upcoming slots', () => {
  // ICT 17:55 (UTC 10:55)
  const fromDate = new Date('2026-09-15T10:55:00Z');
  const slots = getUpcomingSlots(fromDate, '18:00', '22:00', 10, 3);
  assert.equal(slots.length, 3);
  assert.ok(slots[0].slotLocal.includes('18:00'));
  assert.ok(slots[1].slotLocal.includes('18:10'));
  assert.ok(slots[2].slotLocal.includes('18:20'));
});
