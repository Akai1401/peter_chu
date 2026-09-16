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

export type ReminderActionType = 'MESSAGE' | 'AUDIO_CALL' | 'VIDEO_CALL' | 'MESSAGE_AND_CALL';

export interface Reminder {
  id: string;
  title: string;
  content: string;
  targetThreadId: string;
  actionType: ReminderActionType;
  callDurationSeconds: number;
  maxRuns?: number;
  runCount?: number;
  scheduleCron?: string | null;
  targetDate?: string | null; // e.g. "2026-09-17"
  active: boolean;
  windowStart: string; // e.g. "18:00"
  windowEnd: string; // e.g. "22:00"
  intervalMinutes: number; // e.g. 10
  createdAt: string;
  updatedAt: string;
}

export interface LearnedPersona {
  styleSummary: string;
  pronouns: string;
  tone: string;
  catchphrases: string[];
  sampleMessages: string[];
  rawPromptInstruction: string;
}

export interface PersonaProfile {
  id: string;
  name: string;
  persona: LearnedPersona;
  sourceThread?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProactiveChatConfig {
  enabled: boolean;
  targetThread: string; // Target thread URL or thread ID
  minIntervalMinutes: number; // Minimum wait interval in minutes
  maxIntervalMinutes: number; // Maximum wait interval in minutes
  activeHoursStart: string; // e.g. "08:00"
  activeHoursEnd: string; // e.g. "22:30"
  promptGuidance: string; // Guidance for conversation starter e.g. hỏi thăm đang làm gì, trêu đùa
  lastSentAt?: string | null;
  nextScheduledAt?: string | null;
}

export interface BotState {
  status: BotStatus;
  sessionStatus: SessionStatus;
  emergencyStop: boolean;
  dryRun: boolean;
  aiAutoReply?: boolean;
  aiTargetThread?: string;
  learnedPersona?: LearnedPersona | null;
  activePersonaId?: string | null;
  activePersonaName?: string | null;
  personaSourceThread?: string;
  personaUpdatedAt?: string;
  proactiveChat?: ProactiveChatConfig | null;
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
