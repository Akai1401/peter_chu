import { useState, useEffect, useCallback } from 'react';
import { Bot, Clock, RefreshCw } from 'lucide-react';
import { api } from './api';
import { BotStatusCard } from './components/BotStatusCard';
import { ReminderList } from './components/ReminderList';
import { ReminderModal } from './components/ReminderModal';
import { UpcomingScheduleCard } from './components/UpcomingScheduleCard';
import { LogViewer } from './components/LogViewer';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [vnTime, setVnTime] = useState('');

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else toast.info(message);
  };

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'medium',
        timeStyle: 'medium',
        hourCycle: 'h23'
      });
      setVnTime(formatter.format(now));
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

  useEffect(() => {
    loadData();
    const pollTimer = setInterval(() => {
      loadData(true);
    }, 6000);
    return () => clearInterval(pollTimer);
  }, [loadData]);

  const handleBotAction = async (action: 'START' | 'STOP' | 'RESTART' | 'EMERGENCY_STOP', reason?: string) => {
    try {
      setLoading(true);
      const updated = await api.sendBotAction(action, reason);
      setBotState(updated);
      showToast(`Action "${action}" executed`, 'success');
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
      showToast(`Dry Run mode ${dryRun ? 'enabled' : 'disabled'}`, 'info');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to update Dry Run', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleReminder = async (id: string) => {
    try {
      const updated = await api.toggleReminder(id);
      setReminders((prev) => prev.map((r) => (r.id === id ? updated : r)));
      showToast(`Reminder ${updated.active ? 'enabled' : 'disabled'}`, 'success');
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
      showToast(err.message || 'Failed to dispatch test', 'error');
    }
  };

  const handleCallReminder = async (id: string, callType: 'AUDIO' | 'VIDEO' = 'AUDIO') => {
    try {
      const res = await api.callReminder(id, callType);
      showToast(res.message, 'success');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to initiate call', 'error');
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      await api.deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      showToast('Reminder deleted', 'success');
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
        showToast('Reminder updated', 'success');
      } else {
        await api.createReminder(data);
        showToast('Reminder created', 'success');
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
    <div className="min-h-screen bg-muted/40">
      <Toaster position="top-center" richColors />

      {/* Top Navigation */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted">
              <Bot className="h-4 w-4" />
            </div>
            <h1 className="font-semibold tracking-tight">Coin Card</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{vnTime} (ICT)</span>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => loadData()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="container pt-6 sm:pt-8 pb-10 space-y-4 sm:space-y-6">
        <BotStatusCard
          state={botState}
          onAction={handleBotAction}
          onToggleDryRun={handleToggleDryRun}
          loading={loading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2">
            <ReminderList
              reminders={reminders}
              onToggle={handleToggleReminder}
              onTest={handleTestReminder}
              onCall={handleCallReminder}
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

        <LogViewer
          auditLogs={auditLogs}
          executionLogs={executionLogs}
          onRefresh={() => loadData(true)}
          loading={loading}
        />
      </main>

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
