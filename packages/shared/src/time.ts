export const TIMEZONE_VN = 'Asia/Ho_Chi_Minh';
export const VN_OFFSET_MINUTES = 7 * 60; // UTC+7 = +420 minutes

export interface LocalTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  formatted: string;
}

/**
 * Returns date parts in Asia/Ho_Chi_Minh timezone
 */
export function getLocalTimeParts(date: Date = new Date()): LocalTimeParts {
  // Use Intl.DateTimeFormat for robust timezone extraction
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_VN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date);
  const find = (type: string) => parts.find((p) => p.type === type)?.value || '0';

  const year = parseInt(find('year'), 10);
  const month = parseInt(find('month'), 10);
  const day = parseInt(find('day'), 10);
  const hour = parseInt(find('hour'), 10);
  const minute = parseInt(find('minute'), 10);
  const second = parseInt(find('second'), 10);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatted = `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;

  return { year, month, day, hour, minute, second, formatted };
}

/**
 * Parse "HH:mm" to total minutes from midnight
 */
export function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

/**
 * Check if the given date in Asia/Ho_Chi_Minh falls between windowStart and windowEnd (inclusive)
 * e.g. "18:00" to "22:00"
 */
export function isWithinWindow(
  date: Date,
  windowStart: string = '00:00',
  windowEnd: string = '23:59'
): boolean {
  const parts = getLocalTimeParts(date);
  const currentMinutes = parts.hour * 60 + parts.minute;
  const startMinutes = timeStringToMinutes(windowStart);
  const endMinutes = timeStringToMinutes(windowEnd);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  // If window crosses midnight (e.g. 22:00 to 02:00)
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

/**
 * Check if current time matches the interval from windowStart
 * e.g. windowStart 00:00, interval 10 => 00:00, 00:10, 00:20, ..., 23:50
 */
export function isSlotTriggerMinute(
  date: Date,
  windowStart: string = '00:00',
  windowEnd: string = '23:59',
  intervalMinutes: number = 10
): boolean {
  if (!isWithinWindow(date, windowStart, windowEnd)) {
    return false;
  }

  const parts = getLocalTimeParts(date);
  const currentMinutes = parts.hour * 60 + parts.minute;
  const startMinutes = timeStringToMinutes(windowStart);

  const diff = currentMinutes - startMinutes;
  return diff >= 0 && diff % intervalMinutes === 0;
}

/**
 * Get the current slot key string: "YYYY-MM-DD HH:mm" in ICT
 */
export function getCurrentSlotKey(date: Date = new Date()): string {
  const { year, month, day, hour, minute } = getLocalTimeParts(date);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
}

/**
 * Calculate upcoming run slots for a reminder in Asia/Ho_Chi_Minh
 */
export function getUpcomingSlots(
  fromDate: Date = new Date(),
  windowStart: string = '00:00',
  windowEnd: string = '23:59',
  intervalMinutes: number = 10,
  maxSlots: number = 10,
  targetDate?: string | null
): Array<{ slotLocal: string; slotIso: string; minutesFromNow: number }> {
  const slots: Array<{ slotLocal: string; slotIso: string; minutesFromNow: number }> = [];
  const startMinutes = timeStringToMinutes(windowStart);
  const endMinutes = timeStringToMinutes(windowEnd);

  // Scan up to 7 days ahead
  const cursor = new Date(fromDate.getTime());
  cursor.setSeconds(0, 0);

  // Round up cursor to next whole minute
  if (fromDate.getSeconds() > 0) {
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  const maxScanMinutes = 7 * 24 * 60;
  let scanned = 0;

  while (slots.length < maxSlots && scanned < maxScanMinutes) {
    const parts = getLocalTimeParts(cursor);
    const currMin = parts.hour * 60 + parts.minute;

    let inWindow = false;
    if (startMinutes <= endMinutes) {
      inWindow = currMin >= startMinutes && currMin <= endMinutes;
    } else {
      inWindow = currMin >= startMinutes || currMin <= endMinutes;
    }

    if (inWindow) {
      let dateMatch = true;
      if (targetDate) {
        const pad = (n: number) => n.toString().padStart(2, '0');
        const cursorDateStr = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
        if (cursorDateStr !== targetDate) {
          dateMatch = false;
        }
      }

      if (dateMatch) {
        const diff = (currMin >= startMinutes ? currMin - startMinutes : currMin + 24 * 60 - startMinutes);
        if (diff % intervalMinutes === 0) {
          const minutesDiff = Math.round((cursor.getTime() - fromDate.getTime()) / (60 * 1000));
          slots.push({
            slotLocal: `${parts.formatted.substring(0, 16)} ICT`,
            slotIso: cursor.toISOString(),
            minutesFromNow: Math.max(0, minutesDiff)
          });
        }
      }
    }

    // Step 1 minute forward
    cursor.setMinutes(cursor.getMinutes() + 1);
    scanned += 1;
  }

  return slots;
}

export type ReminderQueueStatus =
  | 'QUEUED'              // Ready and in upcoming queue
  | 'PAST_DUE'            // Lịch chạy đã quá thời gian
  | 'COMPLETED'           // Đã chạy đủ số lần tối đa
  | 'BOT_STOPPED'         // Bot Engine đang tắt
  | 'SESSION_DISCONNECTED'// Chưa kết nối Messenger
  | 'PAUSED';             // Đang tạm dừng

export interface ReminderDiagnosis {
  status: ReminderQueueStatus;
  isPastDue: boolean;
  isCompleted: boolean;
  canQueue: boolean;
  reason: string;
}

/**
 * Check if a reminder schedule is already in the past (expired).
 */
export function isSchedulePastDue(
  targetDate?: string | null,
  windowEnd: string = '23:59',
  maxRuns: number = 0,
  windowStart: string = '00:00',
  fromDate: Date = new Date()
): boolean {
  const parts = getLocalTimeParts(fromDate);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const todayStr = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  const currentMinutes = parts.hour * 60 + parts.minute;
  const endMinutes = timeStringToMinutes(windowEnd);

  // If specific target date is set
  if (targetDate) {
    if (targetDate < todayStr) return true;
    if (targetDate === todayStr && endMinutes < currentMinutes) return true;
    return false;
  }

  // If no target date, but it's a single run (maxRuns === 1 or windowStart === windowEnd)
  const isSingleRun = maxRuns === 1 || windowStart === windowEnd;
  if (isSingleRun && endMinutes < currentMinutes) {
    return true;
  }

  return false;
}

/**
 * Audit and diagnose why a reminder is or is not queuing/running
 */
export function diagnoseReminder(
  reminder: {
    active: boolean;
    maxRuns?: number;
    runCount?: number;
    targetDate?: string | null;
    windowStart: string;
    windowEnd: string;
  },
  botStatus?: string,
  sessionStatus?: string,
  now: Date = new Date()
): ReminderDiagnosis {
  const isCompleted = Boolean(
    reminder.maxRuns && reminder.maxRuns > 0 && (reminder.runCount || 0) >= reminder.maxRuns
  );

  const isPastDue = isSchedulePastDue(
    reminder.targetDate,
    reminder.windowEnd,
    reminder.maxRuns || 0,
    reminder.windowStart,
    now
  );

  if (isCompleted) {
    return {
      status: 'COMPLETED',
      isPastDue,
      isCompleted: true,
      canQueue: false,
      reason: `Completed ${reminder.runCount || 0}/${reminder.maxRuns} runs`
    };
  }

  if (isPastDue) {
    return {
      status: 'PAST_DUE',
      isPastDue: true,
      isCompleted: false,
      canQueue: false,
      reason: `Schedule (${reminder.windowStart}${reminder.targetDate ? ` on ${reminder.targetDate}` : ''}) is past due`
    };
  }

  if (!reminder.active) {
    return {
      status: 'PAUSED',
      isPastDue: false,
      isCompleted: false,
      canQueue: false,
      reason: 'Reminder is paused'
    };
  }

  if (botStatus && botStatus !== 'RUNNING') {
    return {
      status: 'BOT_STOPPED',
      isPastDue: false,
      isCompleted: false,
      canQueue: false,
      reason: 'Bot Engine is stopped (Requires "Start Engine")'
    };
  }

  if (sessionStatus && sessionStatus !== 'LOGGED_IN') {
    return {
      status: 'SESSION_DISCONNECTED',
      isPastDue: false,
      isCompleted: false,
      canQueue: false,
      reason: 'Messenger session is not connected'
    };
  }

  return {
    status: 'QUEUED',
    isPastDue: false,
    isCompleted: false,
    canQueue: true,
    reason: 'Ready in upcoming queue'
  };
}

