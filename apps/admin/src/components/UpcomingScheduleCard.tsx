import React from 'react';
import { CalendarClock, Hash } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { UpcomingSlot } from '@messenger/shared';

interface Props {
  slots: UpcomingSlot[];
  loading: boolean;
}

export const UpcomingScheduleCard: React.FC<Props> = ({ slots, loading }) => {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted border flex items-center justify-center">
            <CalendarClock className="w-4 h-4 text-foreground" />
          </div>
          <CardTitle className="text-lg">Upcoming</CardTitle>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-1 rounded">
          Next {slots.length}
        </span>
      </CardHeader>

      <CardContent className="pt-4 sm:pt-6 flex-1 flex flex-col min-h-0">
        {loading && slots.length === 0 ? (
          <div className="py-10 text-center text-sm font-medium text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
            Loading schedules...
          </div>
        ) : slots.length === 0 ? (
          <div className="py-10 text-center text-sm font-medium text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
            No upcoming schedules.
          </div>
        ) : (
          <ScrollArea className="h-[350px] pr-4 -mr-4">
            <div className="space-y-3">
              {slots.map((slot, index) => (
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
                      {slot.minutesFromNow === 0 ? 'DUE NOW' : `IN ~${slot.minutesFromNow}M`}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {slot.slotLocal}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
