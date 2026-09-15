import React from 'react';
import { CalendarClock, Hash } from 'lucide-react';
import type { UpcomingSlot } from '@messenger/shared';

interface Props {
  slots: UpcomingSlot[];
  loading: boolean;
}

export const UpcomingScheduleCard: React.FC<Props> = ({ slots, loading }) => {
  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <CalendarClock size={18} className="text-cyan-400" />
          Upcoming Scheduled Runs (Asia/Ho_Chi_Minh)
        </h3>
        <span className="text-xs text-slate-500 font-mono">Next {slots.length} slots</span>
      </div>

      {loading && slots.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          Calculating upcoming slots...
        </div>
      ) : slots.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          No active reminders or upcoming slots scheduled.
        </div>
      ) : (
        <div className="mt-4 divide-y divide-white/5 max-h-[340px] overflow-y-auto pr-1">
          {slots.map((slot, index) => (
            <div key={index} className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <p className="font-semibold text-white">{slot.reminderTitle}</p>
                <p className="font-mono text-slate-500 flex items-center gap-1">
                  <Hash size={11} className="text-indigo-400" />
                  {slot.targetThreadId}
                </p>
              </div>

              <div className="text-right">
                <span className="font-mono text-cyan-300 font-medium block">
                  {slot.slotLocal}
                </span>
                <span className="text-[11px] text-slate-400">
                  {slot.minutesFromNow === 0 ? 'Due now' : `in ~${slot.minutesFromNow}m`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
