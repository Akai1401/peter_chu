import React, { useState } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  AlertOctagon,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMediaQuery } from '@/hooks/use-media-query';
import type { BotState } from '@messenger/shared';

interface Props {
  state: BotState | null;
  onAction: (action: 'START' | 'STOP' | 'RESTART' | 'EMERGENCY_STOP', reason?: string) => Promise<void>;
  onToggleDryRun: (dryRun: boolean) => Promise<void>;
  loading: boolean;
}

export const BotStatusCard: React.FC<Props> = ({ state, onAction, onToggleDryRun, loading }) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');

  if (!state) {
    return (
      <Card className="min-h-[160px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm font-medium">Initializing Nexus Core...</span>
        </div>
      </Card>
    );
  }

  const isEmergency = state.status === 'EMERGENCY_STOPPED' || state.emergencyStop;
  const isRunning = state.status === 'RUNNING';

  const getStatusBadge = () => {
    if (isEmergency) return <Badge variant="destructive">Emergency Stopped</Badge>;
    if (isRunning) return <Badge variant="success">System Active</Badge>;
    return <Badge variant="secondary">System Standby</Badge>;
  };

  const getBadge = (state: BotState) => {
    switch (state.status) {
      case 'RUNNING':
        return (
          <Badge variant="success" className="text-[10px] uppercase tracking-wider animate-pulse">
            Active
          </Badge>
        );
      case 'STOPPED':
        return (
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
            Stopped
          </Badge>
        );
      case 'ERROR':
        return (
          <Badge variant="destructive" className="text-[10px] uppercase tracking-wider">
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            Unknown
          </Badge>
        );
    }
  };

  const getSessionBadge = () => {
    switch (state.sessionStatus) {
      case 'LOGGED_IN':
        return (
          <Badge variant="outline" className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Authenticated
          </Badge>
        );
      case 'UNAUTHENTICATED':
      case 'SESSION_EXPIRED':
        return (
          <Badge variant="destructive" className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> {state.sessionStatus === 'SESSION_EXPIRED' ? 'Expired' : 'Unauthenticated'}
          </Badge>
        );
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const handleConfirmEmergency = async () => {
    await onAction('EMERGENCY_STOP', emergencyReason || 'Triggered from Admin UI');
    setShowEmergencyModal(false);
    setEmergencyReason('');
  };

  const EmergencyForm = () => (
    <div className="py-4 space-y-2 px-4 sm:px-0">
      <Label htmlFor="reason">Reason for halt (Optional)</Label>
      <Input
        id="reason"
        value={emergencyReason}
        onChange={(e) => setEmergencyReason(e.target.value)}
        placeholder="e.g. Rate limit hit on Facebook"
        autoFocus={isDesktop}
      />
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-muted border flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <CardTitle className="text-lg">Core Worker Status</CardTitle>
                {getStatusBadge()}
              </div>
              <CardDescription>Manage the Playwright execution engine and scheduler.</CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pl-14 md:pl-0">
            {getSessionBadge()}
            
            <div className="flex items-center space-x-2 border rounded-md px-3 py-1.5 bg-card">
              <Switch 
                id="dry-run" 
                checked={state.dryRun}
                onCheckedChange={onToggleDryRun}
                disabled={loading}
              />
              <Label htmlFor="dry-run" className="text-sm cursor-pointer">Dry Run</Label>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pt-4 border-t">
            <div className="grid grid-cols-2 sm:flex items-center gap-3 w-full xl:w-auto">
              {!isRunning ? (
                <Button onClick={() => onAction('START')} disabled={loading} className="col-span-2 sm:col-span-1 gap-2">
                  <Play className="w-4 h-4" /> Initialize
                </Button>
              ) : (
                <Button onClick={() => onAction('STOP')} disabled={loading} variant="secondary" className="col-span-2 sm:col-span-1 gap-2">
                  <Square className="w-4 h-4" /> Halt
                </Button>
              )}

              <Button onClick={() => onAction('RESTART')} disabled={loading} variant="outline" className="gap-2">
                <RotateCcw className="w-4 h-4" /> Reboot
              </Button>

              <Button onClick={() => setShowEmergencyModal(true)} disabled={loading || isEmergency} variant="destructive" className="gap-2">
                <AlertOctagon className="w-4 h-4" /> E-Stop
              </Button>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground border px-3 py-1.5 rounded-md">
              <Clock className="w-4 h-4" />
              <span>Last Heartbeat: {state.lastHeartbeat ? new Date(state.lastHeartbeat).toLocaleTimeString() : 'N/A'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {isDesktop ? (
        <Dialog open={showEmergencyModal} onOpenChange={setShowEmergencyModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Emergency Stop</DialogTitle>
              <DialogDescription>
                This will forcefully halt all running jobs and prevent the bot from executing future reminders.
              </DialogDescription>
            </DialogHeader>
            <EmergencyForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEmergencyModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmEmergency}>
                Execute Stop
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={showEmergencyModal} onOpenChange={setShowEmergencyModal}>
          <DrawerContent className="max-h-[90vh]">
            <div className="overflow-y-auto" data-vaul-scrollable>
              <DrawerHeader className="text-left">
                <DrawerTitle>Confirm Emergency Stop</DrawerTitle>
                <DrawerDescription>
                  This will forcefully halt all running jobs and prevent the bot from executing future reminders.
                </DrawerDescription>
              </DrawerHeader>
              <EmergencyForm />
              <DrawerFooter className="pt-2 pb-6 mt-2">
                <Button variant="destructive" onClick={handleConfirmEmergency}>
                  Execute Stop
                </Button>
                <Button variant="outline" onClick={() => setShowEmergencyModal(false)}>
                  Cancel
                </Button>
              </DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
};
