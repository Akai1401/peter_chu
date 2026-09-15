import React, { useState } from 'react';
import {
  Bell,
  Clock,
  Send,
  Edit2,
  Trash2,
  Plus,
  Hash
} from 'lucide-react';
import type { Reminder } from '@messenger/shared';

interface Props {
  reminders: Reminder[];
  onToggle: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<void>;
  onEdit: (reminder: Reminder) => void;
  onDelete: (id: string) => Promise<void>;
  onAddNew: () => void;
  loading: boolean;
}

export const ReminderList: React.FC<Props> = ({
  reminders,
  onToggle,
  onTest,
  onEdit,
  onDelete,
  onAddNew,
  loading
}) => {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleTestClick = async (id: string) => {
    setTestingId(id);
    try {
      await onTest(id);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between pb-5 border-b border-white/10">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Bell size={20} className="text-indigo-400" />
            Scheduled Reminders ({reminders.length})
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Automated message schedules targeted at Messenger threads
          </p>
        </div>

        <button
          onClick={onAddNew}
          disabled={loading}
          className="btn btn-primary"
        >
          <Plus size={16} /> Add Reminder
        </button>
      </div>

      {reminders.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          <Bell size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="font-medium text-slate-300">No reminders configured yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Create your first reminder to automate recurring notifications during target hours.
          </p>
          <button onClick={onAddNew} className="btn btn-primary mt-4">
            <Plus size={16} /> Create First Reminder
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {reminders.map((reminder) => {
            const isTesting = testingId === reminder.id;
            return (
              <div
                key={reminder.id}
                className={`p-4 rounded-xl border transition-all ${
                  reminder.active
                    ? 'bg-slate-900/60 border-white/10 hover:border-indigo-500/30'
                    : 'bg-slate-950/40 border-white/5 opacity-70'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Info */}
                  <div className="space-y-1.5 flex-1 min-w-[260px]">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-semibold text-white">
                        {reminder.title}
                      </h3>
                      {reminder.active ? (
                        <span className="badge badge-success text-[10px]">Active</span>
                      ) : (
                        <span className="badge badge-neutral text-[10px]">Disabled</span>
                      )}
                    </div>

                    <p className="text-sm text-slate-300 line-clamp-2 bg-slate-950/50 p-2.5 rounded-lg border border-white/5 font-sans">
                      {reminder.content}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                      <span className="flex items-center gap-1 font-mono text-slate-300">
                        <Hash size={13} className="text-indigo-400" />
                        {reminder.targetThreadId}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={13} className="text-cyan-400" />
                        Window: {reminder.windowStart} - {reminder.windowEnd} (every {reminder.intervalMinutes}m)
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Toggle Active Button */}
                    <button
                      onClick={() => onToggle(reminder.id)}
                      disabled={loading}
                      title={reminder.active ? 'Disable reminder' : 'Enable reminder'}
                      className={`btn text-xs px-3 py-1.5 ${
                        reminder.active ? 'btn-ghost text-amber-300' : 'btn-ghost text-emerald-400'
                      }`}
                    >
                      {reminder.active ? 'Disable' : 'Enable'}
                    </button>

                    {/* Test Trigger Button */}
                    <button
                      onClick={() => handleTestClick(reminder.id)}
                      disabled={loading || isTesting}
                      title="Send test message now (respects DRY_RUN safe mode)"
                      className="btn btn-ghost text-xs px-3 py-1.5 text-indigo-300 hover:text-white"
                    >
                      <Send size={14} className={isTesting ? 'animate-spin' : ''} />
                      {isTesting ? 'Testing...' : 'Test Send'}
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => onEdit(reminder)}
                      disabled={loading}
                      title="Edit reminder"
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                    >
                      <Edit2 size={16} />
                    </button>

                    {/* Delete */}
                    {deleteConfirmId === reminder.id ? (
                      <div className="flex items-center gap-1 bg-red-950/60 p-1 rounded-lg border border-red-500/30">
                        <button
                          onClick={() => {
                            onDelete(reminder.id);
                            setDeleteConfirmId(null);
                          }}
                          className="text-xs px-2 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-500"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs px-2 py-1 text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(reminder.id)}
                        disabled={loading}
                        title="Delete reminder"
                        className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
