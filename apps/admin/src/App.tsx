import { useState, useEffect, useCallback } from 'react';
import { Bot, Clock, RefreshCw, Sparkles } from 'lucide-react';
import { api } from './api';
import { BotStatusCard } from './components/BotStatusCard';
import { ReminderList } from './components/ReminderList';
import { ReminderModal } from './components/ReminderModal';
import { UpcomingScheduleCard } from './components/UpcomingScheduleCard';
import { LogViewer } from './components/LogViewer';
import type {
  BotState,
  Reminder,
  AuditLog,
  ExecutionLog,
  UpcomingSlot,
  CreateReminderInput
} from '@messenger/shared';

export function App() {
  const [botState, setBotState] = useState<BotState | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<UpcomingSlot[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  // Clock
  const [vnTime, setVnTime] = useState('');

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Update ICT clock every second
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'medium',
        timeStyle: 'medium',
        hourCycle: 'h23'
      });
      setVnTime(formatter.format(now) + ' (ICT)');
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [bState, rems, slots, aLogs, eLogs] = await Promise.all([
        api.getBotStatus(),
        api.getReminders(),
        api.getUpcomingSlots(),
        api.getAuditLogs(30),
        api.getExecutionLogs(30)
      ]);
      setBotState(bState);
      setReminders(rems);
      setUpcomingSlots(slots);
      setAuditLogs(aLogs);
      setExecutionLogs(eLogs);
    } catch (err: any) {
      if (!silent) showToast(err.message || 'Error loading dashboard data', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load + periodic background polling every 6 seconds
  useEffect(() => {
    loadData();
    const pollTimer = setInterval(() => {
      loadData(true);
    }, 6000);
    return () => clearInterval(pollTimer);
  }, [loadData]);

  // Bot actions
  const handleBotAction = async (action: 'START' | 'STOP' | 'RESTART' | 'EMERGENCY_STOP', reason?: string) => {
    try {
      setLoading(true);
      const updated = await api.sendBotAction(action, reason);
      setBotState(updated);
      showToast(`Bot action "${action}" executed successfully`, 'success');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || `Failed to execute ${action}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDryRun = async (dryRun: boolean) => {
    try {
      setLoading(true);
      const updated = await api.setDryRun(dryRun);
      setBotState(updated);
      showToast(`DRY_RUN mode set to ${dryRun ? 'ENABLED' : 'DISABLED'}`, 'info');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to update DRY_RUN', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Reminder operations
  const handleToggleReminder = async (id: string) => {
    try {
      const updated = await api.toggleReminder(id);
      setReminders((prev) => prev.map((r) => (r.id === id ? updated : r)));
      showToast(`Reminder "${updated.title}" ${updated.active ? 'enabled' : 'disabled'}`, 'success');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle reminder', 'error');
    }
  };

  const handleTestReminder = async (id: string) => {
    try {
      const res = await api.testReminder(id);
      showToast(res.message, 'success');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to dispatch test reminder', 'error');
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      await api.deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      showToast('Reminder deleted successfully', 'success');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete reminder', 'error');
    }
  };

  const handleSaveReminder = async (data: CreateReminderInput) => {
    try {
      setLoading(true);
      if (editingReminder) {
        await api.updateReminder(editingReminder.id, data);
        showToast('Reminder updated successfully', 'success');
      } else {
        await api.createReminder(data);
        showToast('Reminder created successfully', 'success');
      }
      setIsModalOpen(false);
      setEditingReminder(null);
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to save reminder', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-16">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div
            className={`px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 border ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : toast.type === 'error'
                ? 'bg-red-950/90 border-red-500/50 text-red-200'
                : 'bg-indigo-950/90 border-indigo-500/50 text-indigo-200'
            }`}
          >
            <Sparkles size={14} />
            {toast.message}
          </div>
        </div>
      )}

      {/* Top Navigation */}
      <header className="border-b border-white/5 bg-slate-950/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Bot size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Messenger AI Bot Control Center
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Phase 1
                </span>
              </h1>
              <p className="text-xs text-slate-400">Scheduled Reminder Operations & Playwright Automation</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-white/5">
              <Clock size={14} className="text-cyan-400" />
              <span>{vnTime}</span>
            </div>

            <button
              onClick={() => loadData()}
              disabled={loading}
              className="btn btn-ghost text-xs px-3 py-1.5"
              title="Refresh all data"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Row 1: Bot Operations Engine */}
        <BotStatusCard
          state={botState}
          onAction={handleBotAction}
          onToggleDryRun={handleToggleDryRun}
          loading={loading}
        />

        {/* Row 2: Reminders Management & Upcoming Schedules */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <ReminderList
              reminders={reminders}
              onToggle={handleToggleReminder}
              onTest={handleTestReminder}
              onEdit={(reminder) => {
                setEditingReminder(reminder);
                setIsModalOpen(true);
              }}
              onDelete={handleDeleteReminder}
              onAddNew={() => {
                setEditingReminder(null);
                setIsModalOpen(true);
              }}
              loading={loading}
            />
          </div>

          <div>
            <UpcomingScheduleCard slots={upcomingSlots} loading={loading} />
          </div>
        </div>

        {/* Row 3: Live Logs Viewer */}
        <LogViewer
          auditLogs={auditLogs}
          executionLogs={executionLogs}
          onRefresh={() => loadData(true)}
          loading={loading}
        />
      </main>

      {/* Reminder Create/Edit Modal */}
      <ReminderModal
        isOpen={isModalOpen}
        initialData={editingReminder}
        onClose={() => {
          setIsModalOpen(false);
          setEditingReminder(null);
        }}
        onSubmit={handleSaveReminder}
        loading={loading}
      />
    </div>
  );
}

export default App;
