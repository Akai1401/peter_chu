import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashString,
  generateIdempotencyKey,
  createMessagePreview
} from './idempotency.js';

test('hashString generates 64-char hex SHA-256', () => {
  const h1 = hashString('hello');
  const h2 = hashString('hello');
  const h3 = hashString('world');

  assert.equal(h1.length, 64);
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

test('generateIdempotencyKey is deterministic and sensitive to slot', () => {
  const k1 = generateIdempotencyKey('rem-1', 'thread-123', '2026-09-15 18:00');
  const k2 = generateIdempotencyKey('rem-1', 'thread-123', '2026-09-15 18:00');
  const k3 = generateIdempotencyKey('rem-1', 'thread-123', '2026-09-15 18:10');

  assert.equal(k1, k2);
  assert.notEqual(k1, k3);
});

test('createMessagePreview truncates long strings properly', () => {
  const shortText = 'Simple test reminder';
  assert.equal(createMessagePreview(shortText, 50), shortText);

  const longText = 'A'.repeat(100);
  const preview = createMessagePreview(longText, 20);
  assert.equal(preview.length, 20);
  assert.ok(preview.endsWith('...'));
});
