import React from 'react';
import { CalendarClock, Hash } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDurationMinutes, type UpcomingSlot, type Reminder, type BotState } from '@messenger/shared';

interface Props {
  slots: UpcomingSlot[];
  reminders?: Reminder[];
  botState?: BotState | null;
  isEngineRunning?: boolean;
  loading: boolean;
  onEditReminder?: (reminder: Reminder) => void;
}

const formatTimeRemaining = (minutes: number) => {
  if (minutes === 0) return 'Due Now';
  return `In ~${formatDurationMinutes(minutes)}`;
};

export const UpcomingScheduleCard: React.FC<Props> = ({
  slots,
  reminders = [],
  isEngineRunning = true,
  loading
}) => {
  const effectiveSlots = isEngineRunning ? slots : [];
  const activeReminders = reminders.filter((r) => r.active);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
            <CalendarClock size={16} />
          </div>
          <CardTitle className="text-lg">Upcoming</CardTitle>
        </div>
        <Badge variant={!isEngineRunning ? 'outline' : 'secondary'} className="text-[10px] font-bold tracking-wider">
          {!isEngineRunning ? 'Engine Stopped' : `Next: ${effectiveSlots.length}`}
        </Badge>
      </CardHeader>

      <CardContent className="pt-4 sm:pt-6 flex-1 flex flex-col min-h-0">
        {loading && effectiveSlots.length === 0 ? (
          <div className="py-10 text-center text-sm font-medium text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
            Loading schedules...
          </div>
        ) : !isEngineRunning ? (
          <div className="py-10 text-center px-4 text-sm font-medium text-muted-foreground bg-muted/30 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1.5">
            <span className="font-semibold text-foreground/80">Engine is stopped</span>
            <span className="text-xs text-muted-foreground">Start engine to activate upcoming schedules</span>
          </div>
        ) : effectiveSlots.length === 0 ? (
          <div className="py-8 px-4 text-center text-xs bg-muted/20 rounded-lg border border-dashed flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <CalendarClock className="w-4 h-4" />
            </div>
            <span className="font-semibold text-foreground">No upcoming schedules</span>
            <p className="text-[11px] text-muted-foreground">
              {activeReminders.length === 0
                ? 'All reminders are paused. Enable reminders or start engine.'
                : 'Reminders scheduled, but no slots are due in the current window.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[350px] overflow-y-auto pr-2 -mr-2 pb-2">
            <div className="space-y-3">
              {effectiveSlots.map((slot, index) => (
                <div key={index} className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5 overflow-hidden min-w-0">
                    <p className="text-sm font-semibold truncate break-words">{slot.reminderTitle}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 break-all">
                      <Hash className="w-3 h-3 shrink-0" />
                      {slot.targetThreadId}
                    </p>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 pt-2 sm:pt-0 mt-1 sm:mt-0 border-t sm:border-t-0">
                    <span className="text-sm font-bold text-primary">
                      {formatTimeRemaining(slot.minutesFromNow)}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {slot.slotLocal}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
