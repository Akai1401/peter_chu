import React, { useState, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import type { Reminder, CreateReminderInput } from '@messenger/shared';

interface Props {
  isOpen: boolean;
  initialData?: Reminder | null;
  onClose: () => void;
  onSubmit: (data: CreateReminderInput) => Promise<void>;
  loading: boolean;
}

export const ReminderModal: React.FC<Props> = ({
  isOpen,
  initialData,
  onClose,
  onSubmit,
  loading
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetThreadId, setTargetThreadId] = useState('');
  const [windowStart, setWindowStart] = useState('18:00');
  const [windowEnd, setWindowEnd] = useState('22:00');
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setContent(initialData.content);
      setTargetThreadId(initialData.targetThreadId);
      setWindowStart(initialData.windowStart || '18:00');
      setWindowEnd(initialData.windowEnd || '22:00');
      setIntervalMinutes(initialData.intervalMinutes || 10);
      setActive(initialData.active);
    } else {
      setTitle('');
      setContent('');
      setTargetThreadId('');
      setWindowStart('18:00');
      setWindowEnd('22:00');
      setIntervalMinutes(10);
      setActive(true);
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!content.trim()) {
      setError('Content message is required');
      return;
    }
    if (!targetThreadId.trim()) {
      setError('Target thread ID or Messenger conversation URL is required');
      return;
    }

    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        targetThreadId: targetThreadId.trim(),
        windowStart,
        windowEnd,
        intervalMinutes: Number(intervalMinutes),
        active
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save reminder');
    }
  };

  const applyDefaultWindow = () => {
    setWindowStart('18:00');
    setWindowEnd('22:00');
    setIntervalMinutes(10);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="glass-panel max-w-xl w-full p-6 bg-slate-950/95 border-indigo-500/20 shadow-2xl my-8">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <h3 className="text-lg font-bold text-white">
            {initialData ? 'Edit Scheduled Reminder' : 'Create New Reminder'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Evening Daily Standup Reminder"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Target Messenger Thread ID or URL *
            </label>
            <input
              type="text"
              required
              value={targetThreadId}
              onChange={(e) => setTargetThreadId(e.target.value)}
              placeholder="e.g. 1000123456789 or https://www.facebook.com/messages/t/1000123456789"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Message Content *
              </label>
              <span className="text-xs text-slate-500">{content.length}/2000 chars</span>
            </div>
            <textarea
              required
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nhập nội dung nhắc nhở cần gửi đến Messenger..."
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500 resize-y"
            />
          </div>

          {/* Time Window Settings */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                Schedule & Operational Window (Asia/Ho_Chi_Minh)
              </span>
              <button
                type="button"
                onClick={applyDefaultWindow}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Sparkles size={12} /> Default (18:00-22:00, 10m)
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Start Time (HH:mm)</label>
                <input
                  type="text"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  placeholder="18:00"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-indigo-500 text-center"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">End Time (HH:mm)</label>
                <input
                  type="text"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  placeholder="22:00"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-indigo-500 text-center"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Interval (Mins)</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-indigo-500 text-center"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="reminder-active"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="reminder-active" className="text-sm text-slate-300 cursor-pointer">
              Active (scheduler will process this reminder)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Saving...' : initialData ? 'Update Reminder' : 'Create Reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
