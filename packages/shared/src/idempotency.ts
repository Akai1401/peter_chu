import { createHash } from 'node:crypto';

/**
 * Generate a SHA-256 hash of a string
 */
export function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Generates an idempotency key combining reminder, thread and time slot.
 * Ensures that for any given scheduled time slot (e.g. "2026-09-15 18:10"),
 * the same reminder is NEVER sent twice to the same thread.
 */
export function generateIdempotencyKey(
  reminderId: string,
  threadId: string,
  timeSlot: string
): string {
  const raw = `${reminderId.trim()}:${threadId.trim()}:${timeSlot.trim()}`;
  return hashString(raw);
}

/**
 * Safe message preview for logging
 */
export function createMessagePreview(content: string, maxLength: number = 80): string {
  const singleLine = content.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return singleLine.substring(0, maxLength - 3) + '...';
}
