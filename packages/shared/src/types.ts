export type BotStatus = 'RUNNING' | 'STOPPED' | 'PAUSED' | 'EMERGENCY_STOPPED';

export type SessionStatus = 'UNKNOWN' | 'LOGGED_IN' | 'SESSION_EXPIRED' | 'UNAUTHENTICATED';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export type ExecutionStatus =
  | 'SUCCESS'
  | 'DRY_RUN'
  | 'FAILED'
  | 'SKIPPED_DUPLICATE'
  | 'SKIPPED_RATE_LIMITED'
  | 'SKIPPED_OFF_HOURS'
  | 'SKIPPED_BOT_STOPPED';

export interface Reminder {
  id: string;
  title: string;
  content: string;
  targetThreadId: string;
  scheduleCron?: string | null;
  active: boolean;
  windowStart: string; // e.g. "18:00"
  windowEnd: string; // e.g. "22:00"
  intervalMinutes: number; // e.g. 10
  createdAt: string;
  updatedAt: string;
}

export interface BotState {
  status: BotStatus;
  sessionStatus: SessionStatus;
  emergencyStop: boolean;
  dryRun: boolean;
  lastHeartbeat?: string | null;
  lockHolderId?: string | null;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  details?: Record<string, unknown> | string | null;
  level: LogLevel;
}

export interface ExecutionLog {
  id: string;
  reminderId: string;
  threadId: string;
  status: ExecutionStatus;
  idempotencyKey: string;
  messagePreview: string;
  executedAt: string;
  details?: Record<string, unknown> | string | null;
}

export interface UpcomingSlot {
  reminderId: string;
  reminderTitle: string;
  targetThreadId: string;
  slotLocal: string; // "YYYY-MM-DD HH:mm:ss" in Asia/Ho_Chi_Minh
  slotIso: string;
  minutesFromNow: number;
}
