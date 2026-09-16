import { ReminderService } from './reminder.service.js';
import { BotControlService } from './bot-control.service.js';
import { getUpcomingSlots } from '@messenger/shared';
import type { UpcomingSlot } from '@messenger/shared';

export class ScheduleService {
  private reminderService: ReminderService;
  private botControlService: BotControlService;

  constructor(reminderService?: ReminderService, botControlService?: BotControlService) {
    this.reminderService = reminderService || new ReminderService();
    this.botControlService = botControlService || new BotControlService();
  }

  getUpcomingSlots(limit: number = 20): UpcomingSlot[] {
    const botState = this.botControlService.getBotState();
    if (botState.status !== 'RUNNING') {
      return [];
    }

    const reminders = this.reminderService.getAllReminders().filter((r) => r.active);
    const allSlots: UpcomingSlot[] = [];
    const now = new Date();

    for (const reminder of reminders) {
      if (reminder.maxRuns && reminder.maxRuns > 0) {
        const remaining = reminder.maxRuns - (reminder.runCount || 0);
        if (remaining <= 0) continue;
      }
      const maxSlotsForReminder = (reminder.maxRuns && reminder.maxRuns > 0)
        ? Math.min(5, reminder.maxRuns - (reminder.runCount || 0))
        : 5;

      const slots = getUpcomingSlots(
        now,
        reminder.windowStart,
        reminder.windowEnd,
        reminder.intervalMinutes,
        maxSlotsForReminder
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
