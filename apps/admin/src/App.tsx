import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  RefreshCw,
  LogIn,
  ShieldAlert,
  LogOut
} from 'lucide-react';
import { api } from './api';
import { BrandLogo } from './components/BrandLogo';
import { BotStatusCard } from './components/BotStatusCard';
import { ReminderList } from './components/ReminderList';
import { ReminderModal } from './components/ReminderModal';
import { UpcomingScheduleCard } from './components/UpcomingScheduleCard';
import { LogViewer } from './components/LogViewer';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [isCheckingIncoming, setIsCheckingIncoming] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [vnTime, setVnTime] = useState('');

  const showToast = (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info'
  ) => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else if (type === 'warning') toast.warning(message);
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
      setInitialLoaded(true);
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

  const handleToggleAiAutoReply = async (enabled: boolean) => {
    try {
      setLoading(true);
      const updated = await api.toggleAiAutoReply(enabled);
      setBotState(updated);
      showToast(`Gemini AI auto-reply is now ${enabled ? 'ENABLED' : 'DISABLED'}`, 'success');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle Gemini AI', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAiConfig = async (config: { enabled?: boolean; targetThread?: string }) => {
    try {
      setLoading(true);
      const updated = await api.updateAiConfig(config);
      setBotState(updated);
      if (config.targetThread !== undefined) {
        showToast(
          config.targetThread.trim()
            ? 'Target conversation for AI updated'
            : 'Switched AI to free scan mode across mailbox',
          'success'
        );
      }
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to update AI configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIncoming = async () => {
    setIsCheckingIncoming(true);
    try {
      const res = await api.checkIncomingMessages();
      if (res.found) {
        showToast(res.message || 'New contact messages detected and processed!', 'success');
      } else {
        showToast(res.message || 'Scan completed: No new unread messages.', 'info');
      }
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to scan messages', 'error');
    } finally {
      setIsCheckingIncoming(false);
    }
  };

  const handleCheckSession = async () => {
    setIsCheckingSession(true);
    try {
      const res = await api.checkSession();
      if (res.sessionStatus === 'LOGGED_IN') {
        showToast('Messenger session is connected and active!', 'success');
      } else if (res.sessionStatus === 'SESSION_EXPIRED') {
        showToast('Messenger session has expired. Please reconnect!', 'warning');
      } else {
        showToast('No valid Messenger session detected!', 'error');
      }
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to verify session', 'error');
    } finally {
      setIsCheckingSession(false);
    }
  };

  const handleConnectMessenger = async () => {
    setIsConnecting(true);
    try {
      const res = await api.connectMessenger();
      showToast(res.message, 'info');

      // Poll until logged in
      const startTime = Date.now();
      const interval = setInterval(async () => {
        try {
          const freshState = await api.getBotStatus();
          setBotState(freshState);
          if (freshState.sessionStatus === 'LOGGED_IN') {
            clearInterval(interval);
            setIsConnecting(false);
            showToast('Connected to Messenger successfully! All features are now active.', 'success');
            await loadData(true);
          } else if (Date.now() - startTime > 180000) {
            clearInterval(interval);
            setIsConnecting(false);
          }
        } catch {
          clearInterval(interval);
          setIsConnecting(false);
        }
      }, 2500);
    } catch (err: any) {
      setIsConnecting(false);
      showToast(err.message || 'Failed to open Messenger login', 'error');
    }
  };

  const handleDisconnectMessenger = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Messenger session?')) {
      return;
    }
    try {
      const res = await api.disconnectMessenger();
      showToast(res.message, 'success');
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to disconnect session', 'error');
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

  if (!initialLoaded) {
    return (
      <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-xs animate-in fade-in zoom-in-95 duration-200">
          <BrandLogo size="xl" />
          <div className="space-y-1">
            <h2 className="font-semibold text-sm tracking-tight text-foreground lowercase">Messenger Schedule Bot</h2>
            <p className="text-xs text-muted-foreground">Initializing control system...</p>
          </div>
          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-foreground/60 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const isDisconnected = botState && botState.sessionStatus !== 'LOGGED_IN';

  return (
    <div className="min-h-screen bg-muted/40 relative">
      <Toaster position="top-center" richColors />

      {/* Top Navigation */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" interactive />
            <div className="hidden sm:flex flex-col">
              <div className="flex items-center gap-1.5">
                <h1 className="font-semibold tracking-tight text-sm sm:text-base leading-tight">Messenger Schedule Bot</h1>
                <Badge variant="outline" className="hidden sm:inline-flex text-[10px] px-1.5 py-0 h-4 font-mono text-muted-foreground border-border bg-muted/50">v1.0</Badge>
              </div>
              <span className="text-[11px] text-muted-foreground leading-none mt-0.5">Powered by <strong className="font-medium text-foreground">Gavin</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 justify-end">
            <div className="hidden lg:flex items-center gap-1.5 text-xs font-medium text-muted-foreground border-r pr-3 mr-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{vnTime} (ICT)</span>
            </div>

            {botState && (
              <>
                {botState.sessionStatus === 'LOGGED_IN' ? (
                  <div className="flex items-center gap-1.5 sm:gap-2">

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckSession}
                      disabled={isCheckingSession}
                      className="h-7 px-2.5 text-xs gap-1.5 font-medium text-muted-foreground hover:text-foreground shadow-none"
                      title="Verify live Messenger connection status"
                    >
                      <RefreshCw className={`w-3 h-3 ${isCheckingSession ? 'animate-spin text-primary' : ''}`} />
                      <span>{isCheckingSession ? 'Checking...' : 'Verify'}</span>
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDisconnectMessenger}
                      disabled={loading}
                      className="h-7 px-2.5 text-xs gap-1.5 font-medium shadow-sm transition-all hover:bg-destructive/90"
                      title="Disconnect Messenger session"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Disconnect</span>
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Badge variant="destructive" className="text-[11px] h-7 px-2.5 gap-1.5 font-medium">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Disconnected</span>
                    </Badge>

                    <Button
                      size="sm"
                      onClick={handleConnectMessenger}
                      disabled={isConnecting}
                      className="h-7 gap-1.5 font-medium text-xs px-2.5 shadow-sm"
                    >
                      <LogIn className={`w-3 h-3 ${isConnecting ? 'animate-spin' : ''}`} />
                      <span>{isConnecting ? 'Connecting...' : 'Connect'}</span>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="container pt-6 sm:pt-8 pb-10 space-y-4 sm:space-y-6">
        <div className={isDisconnected ? 'pointer-events-none select-none' : ''}>
          <BotStatusCard
            state={botState}
            onAction={handleBotAction}
            onCheckSession={handleCheckSession}
            onConnectMessenger={handleConnectMessenger}
            onDisconnectMessenger={handleDisconnectMessenger}
            onToggleAiAutoReply={handleToggleAiAutoReply}
            onUpdateAiConfig={handleUpdateAiConfig}
            onCheckIncoming={handleCheckIncoming}
            isCheckingSession={isCheckingSession}
            isCheckingIncoming={isCheckingIncoming}
            loading={loading}
            onNotify={showToast}
            onPersonaUpdated={async () => {
              await loadData(true);
            }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mt-4 sm:mt-6">
            <div className="lg:col-span-2">
              <ReminderList
                reminders={reminders}
                botState={botState}
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
                onNotify={showToast}
                loading={loading}
              />
            </div>

            <div>
              <UpcomingScheduleCard
                slots={upcomingSlots}
                reminders={reminders}
                botState={botState}
                isEngineRunning={botState?.status === 'RUNNING'}
                loading={loading}
                onEditReminder={(reminder) => {
                  setEditingReminder(reminder);
                  setIsModalOpen(true);
                }}
              />
            </div>
          </div>

          <div className="mt-4 sm:mt-6">
            <LogViewer
              auditLogs={auditLogs}
              executionLogs={executionLogs}
              onRefresh={() => loadData(true)}
              loading={loading}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        <div className="container flex items-center justify-center gap-1.5">
          <span>Powered by</span>
          <img src="/gavin.jpg" alt="Gavin" className="w-4 h-4 rounded-full object-cover border" />
          <span className="font-semibold text-foreground">Gavin</span>
        </div>
      </footer>

      {/* Connection Required Modal */}
      <Dialog open={!!isDisconnected}>
        <DialogContent
          className="sm:max-w-[400px] w-[92vw] p-6 text-center [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="flex flex-col items-center justify-center space-y-3 pt-2 text-center sm:text-center">
            <div className="relative flex items-center justify-center">
              <BrandLogo size="xl" />
            </div>
            <div className="space-y-1.5">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                Connect Messenger
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground max-w-[280px] mx-auto">
                Connect your Facebook Messenger account to activate scheduled reminders and automation.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="pt-4 space-y-2">
            <Button
              className="w-full gap-2 font-medium"
              size="lg"
              onClick={handleConnectMessenger}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Opening Facebook...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Connect Messenger</span>
                </>
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCheckSession}
              disabled={isCheckingSession}
              className="w-full text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingSession ? 'animate-spin text-primary' : ''}`} />
              <span>{isCheckingSession ? 'Checking...' : 'Check Connection Status'}</span>
            </Button>
          </div>

          <div className="pt-3 border-t mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span>Powered by</span>
            <img src="/gavin.jpg" alt="Gavin" className="w-3.5 h-3.5 rounded-full object-cover border" />
            <span className="font-semibold text-foreground">Gavin</span>
          </div>
        </DialogContent>
      </Dialog>

      <ReminderModal
        isOpen={isModalOpen}
        initialData={editingReminder}
        defaultTargetThread={botState?.aiTargetThread || ''}
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
