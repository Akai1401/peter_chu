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
  windowStart: string = '18:00',
  windowEnd: string = '22:00'
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
 * e.g. windowStart 18:00, interval 10 => 18:00, 18:10, 18:20, ..., 22:00
 */
export function isSlotTriggerMinute(
  date: Date,
  windowStart: string = '18:00',
  windowEnd: string = '22:00',
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
  windowStart: string = '18:00',
  windowEnd: string = '22:00',
  intervalMinutes: number = 10,
  maxSlots: number = 10
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

    // Step 1 minute forward
    cursor.setMinutes(cursor.getMinutes() + 1);
    scanned += 1;
  }

  return slots;
}
