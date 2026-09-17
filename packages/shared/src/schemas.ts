import { z } from 'zod';

export const TimeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm format (00:00 to 23:59)');

export const CreateReminderSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  content: z.string().max(2000).default(''),
  targetThreadId: z.string().min(1, 'Target Messenger Thread ID or URL is required').max(200),
  actionType: z.enum(['MESSAGE', 'AUDIO_CALL', 'VIDEO_CALL', 'MESSAGE_AND_CALL']).default('MESSAGE'),
  callDurationSeconds: z.number().int().min(5).max(300).default(30),
  maxRuns: z.number().int().min(0).default(0),
  scheduleCron: z.string().optional().nullable(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  wakeUpMode: z.boolean().default(false),
  aiGenerateMessage: z.boolean().default(false),
  active: z.boolean().default(true),
  windowStart: TimeStringSchema.default('00:00'),
  windowEnd: TimeStringSchema.default('23:59'),
  intervalMinutes: z.number().int().min(1).max(1440).default(10)
});

export const UpdateReminderSchema = CreateReminderSchema.partial().extend({
  resetRunCount: z.boolean().optional()
});

export const BotActionSchema = z.object({
  action: z.enum(['START', 'STOP', 'RESTART', 'EMERGENCY_STOP']),
  actor: z.string().default('admin_ui'),
  reason: z.string().optional()
});

export const TestReminderSchema = z.object({
  reminderId: z.string().min(1),
  overrideDryRun: z.boolean().optional()
});

export type CreateReminderInput = z.infer<typeof CreateReminderSchema>;
export type UpdateReminderInput = z.infer<typeof UpdateReminderSchema>;
export type BotActionInput = z.infer<typeof BotActionSchema>;
export type TestReminderInput = z.infer<typeof TestReminderSchema>;
