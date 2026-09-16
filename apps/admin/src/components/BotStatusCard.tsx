import React, { useState } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  Clock,
  Cpu,
  AlertTriangle,
  FlaskConical
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BotState } from '@messenger/shared';

interface Props {
  state: BotState | null;
  onAction: (action: 'START' | 'STOP' | 'RESTART' | 'EMERGENCY_STOP', reason?: string) => Promise<void>;
  onCheckSession?: () => Promise<void>;
  onConnectMessenger?: () => Promise<void>;
  onDisconnectMessenger?: () => Promise<void>;
  isCheckingSession?: boolean;
  loading: boolean;
}

const ENGINE_STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  RUNNING:          { label: 'Running',          dot: 'bg-emerald-500 animate-pulse', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800' },
  STOPPED:          { label: 'Stopped',          dot: 'bg-slate-400',                badge: 'text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800/40 dark:border-slate-700' },
  PAUSED:           { label: 'Paused',           dot: 'bg-amber-400 animate-pulse',  badge: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800' },
  EMERGENCY_STOPPED:{ label: 'Emergency Stop',   dot: 'bg-red-500 animate-pulse',    badge: 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800' },
};



export const BotStatusCard: React.FC<Props> = ({
  state,
  onAction,
  loading
}) => {
  const [isRestarting, setIsRestarting] = useState(false);

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await onAction('RESTART');
    } finally {
      setTimeout(() => {
        setIsRestarting(false);
      }, 600);
    }
  };

  if (!state) {
    return (
      <Card className="p-4 flex items-center justify-center min-h-[64px]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-xs font-medium">Loading Engine State...</span>
        </div>
      </Card>
    );
  }

  const isRunning = state.status === 'RUNNING';
  const engineCfg = ENGINE_STATUS_CONFIG[state.status] ?? ENGINE_STATUS_CONFIG['STOPPED'];

  return (
    <Card className="p-3 sm:p-4 shadow-sm space-y-3">
      {/* ── System Status Row ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium shrink-0">
          <Cpu className="w-3.5 h-3.5" />
          <span>System Status</span>
        </div>

        {/* Engine status */}
        <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${engineCfg.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${engineCfg.dot}`} />
          {engineCfg.label}
        </span>

        {/* Dry-run indicator */}
        {state.dryRun && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 font-semibold text-purple-600 border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-400">
            <FlaskConical className="w-3 h-3" /> Dry Run
          </Badge>
        )}

        {/* Emergency stop warning */}
        {state.emergencyStop && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5 gap-1 font-semibold">
            <AlertTriangle className="w-3 h-3" /> Emergency Stop
          </Badge>
        )}
      </div>

      {/* ── Engine Controls + Heartbeat ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t">
        {/* Engine Controls */}
        <div className="flex items-center gap-2.5">
          {!isRunning ? (
            <Button
              onClick={() => onAction('START')}
              disabled={loading || isRestarting}
              size="sm"
              className="gap-2 h-9 px-4 font-medium shadow-sm"
            >
              <Play className="w-3.5 h-3.5" /> Start Engine
            </Button>
          ) : (
            <Button
              onClick={() => onAction('STOP')}
              disabled={loading || isRestarting}
              variant="destructive"
              size="sm"
              className="gap-2 h-9 px-4 font-medium shadow-sm"
            >
              <Square className="w-3.5 h-3.5" /> Stop Engine
            </Button>
          )}

          <Button
            onClick={handleRestart}
            disabled={loading || isRestarting}
            variant="outline"
            size="sm"
            className="gap-2 h-9 px-3.5 text-xs font-medium"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin' : ''}`} /> Restart
          </Button>
        </div>

        {/* Heartbeat Display */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border px-3 py-2 rounded-md justify-center sm:justify-start">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            Heartbeat:{' '}
            <strong className="font-mono text-foreground font-medium">
              {state.lastHeartbeat ? new Date(state.lastHeartbeat).toLocaleTimeString() : 'N/A'}
            </strong>
          </span>
        </div>
      </div>
    </Card>
  );
};
