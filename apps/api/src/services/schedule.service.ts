import { ReminderService } from './reminder.service.js';
import { getUpcomingSlots } from '@messenger/shared';
import type { UpcomingSlot } from '@messenger/shared';

export class ScheduleService {
  private reminderService: ReminderService;

  constructor(reminderService?: ReminderService) {
    this.reminderService = reminderService || new ReminderService();
  }

  getUpcomingSlots(limit: number = 20): UpcomingSlot[] {
    const reminders = this.reminderService.getAllReminders().filter((r) => r.active);
    const allSlots: UpcomingSlot[] = [];
    const now = new Date();

    for (const reminder of reminders) {
      const slots = getUpcomingSlots(
        now,
        reminder.windowStart,
        reminder.windowEnd,
        reminder.intervalMinutes,
        5
      );

      for (const slot of slots) {
        allSlots.push({
          reminderId: reminder.id,
          reminderTitle: reminder.title,
          targetThreadId: reminder.targetThreadId,
          slotLocal: slot.slotLocal,
          slotIso: slot.slotIso,
          minutesFromNow: slot.minutesFromNow
        });
      }
    }

    // Sort ascending by ISO time
    allSlots.sort((a, b) => new Date(a.slotIso).getTime() - new Date(b.slotIso).getTime());

    return allSlots.slice(0, limit);
  }
}
