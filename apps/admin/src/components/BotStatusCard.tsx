import React, { useState } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  Clock,
  Cpu,
  AlertTriangle,
  FlaskConical,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  Link2,
  GraduationCap
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AiConfigModal } from './AiConfigModal';
import { PersonaConfigModal } from './PersonaConfigModal';
import type { BotState } from '@messenger/shared';

interface Props {
  state: BotState | null;
  onAction: (action: 'START' | 'STOP' | 'RESTART' | 'EMERGENCY_STOP', reason?: string) => Promise<void>;
  onCheckSession?: () => Promise<void>;
  onConnectMessenger?: () => Promise<void>;
  onDisconnectMessenger?: () => Promise<void>;
  onToggleAiAutoReply?: (enabled: boolean) => Promise<void>;
  onUpdateAiConfig?: (config: { enabled?: boolean; targetThread?: string }) => Promise<void>;
  onCheckIncoming?: () => Promise<void>;
  isCheckingSession?: boolean;
  isCheckingIncoming?: boolean;
  loading: boolean;
  onNotify?: (message: string, type: 'success' | 'error' | 'info') => void;
  onPersonaUpdated?: () => Promise<void>;
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
  onToggleAiAutoReply,
  onUpdateAiConfig,
  onCheckIncoming,
  isCheckingIncoming,
  loading,
  onNotify,
  onPersonaUpdated
}) => {
  const [isRestarting, setIsRestarting] = useState(false);
  const [isTogglingAi, setIsTogglingAi] = useState(false);
  const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);

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
  const aiEnabled = state.aiAutoReply !== false;
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

        {/* Gemini AI Auto-Reply indicator */}
        <Badge
          variant="outline"
          className={`text-[10px] px-2 py-0 h-5 gap-1 font-semibold transition-colors ${
            !aiEnabled
              ? 'text-slate-400 border-slate-200 bg-slate-50 dark:text-slate-500 dark:bg-slate-800/40 dark:border-slate-700'
              : isRunning
              ? 'text-purple-700 border-purple-300 bg-purple-50 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-800'
              : 'text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800'
          }`}
        >
          <Sparkles className={`w-3 h-3 ${aiEnabled && isRunning ? 'text-purple-500 animate-pulse' : 'text-slate-400'}`} />
          <span>Gemini AI: {!aiEnabled ? 'Tắt' : isRunning ? 'Hoạt động' : 'Chờ bật Engine'}</span>
        </Badge>

        {/* Learned Persona Active Indicator */}
        {state.learnedPersona && (
          <button
            type="button"
            onClick={() => setIsPersonaModalOpen(true)}
            className="inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-800 dark:hover:bg-purple-900/50 transition-colors cursor-pointer"
            title="Văn phong cá nhân hóa đang được áp dụng. Bấm để xem chi tiết hoặc chuyển đổi"
          >
            <GraduationCap className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            <span>
              Văn phong: <strong className="font-medium">
                {state.activePersonaName
                  ? (state.activePersonaName.length > 22 ? `${state.activePersonaName.slice(0, 22)}…` : state.activePersonaName)
                  : (state.learnedPersona.tone.length > 22 ? `${state.learnedPersona.tone.slice(0, 22)}…` : state.learnedPersona.tone)}
              </strong>
            </span>
          </button>
        )}
      </div>

      {/* ── Engine Controls + Heartbeat ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t">
        {/* Engine Controls + AI Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {!isRunning ? (
            <Button
              onClick={() => onAction('START')}
              disabled={loading || isRestarting}
              size="sm"
              className="gap-2 h-9 px-4 font-medium shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Start Engine
            </Button>
          ) : (
            <Button
              onClick={() => onAction('STOP')}
              disabled={loading || isRestarting}
              variant="destructive"
              size="sm"
              className="gap-2 h-9 px-4 font-medium shadow-sm"
            >
              <Square className="w-3.5 h-3.5 fill-current" /> Stop Engine
            </Button>
          )}

          <Button
            onClick={handleRestart}
            disabled={loading || isRestarting}
            variant="outline"
            size="sm"
            className="gap-2 h-9 px-3 text-xs font-medium"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin' : ''}`} /> Restart
          </Button>

          {/* AI Auto-Reply Toggle Button right next to Engine controls */}
          {onToggleAiAutoReply && (
            <Button
              type="button"
              variant={aiEnabled ? 'default' : 'outline'}
              size="sm"
              disabled={loading || isTogglingAi}
              onClick={async () => {
                setIsTogglingAi(true);
                try {
                  await onToggleAiAutoReply(!aiEnabled);
                } finally {
                  setIsTogglingAi(false);
                }
              }}
              className={`gap-2 h-9 px-3.5 text-xs font-medium transition-all ${
                aiEnabled
                  ? 'bg-purple-600 hover:bg-purple-700 text-white border-transparent shadow-xs'
                  : 'text-muted-foreground hover:text-foreground border-border bg-background'
              }`}
              title={`Bấm để ${aiEnabled ? 'Tắt' : 'Bật'} tự động trả lời bằng Gemini AI`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${aiEnabled ? 'text-amber-300 animate-pulse' : 'text-muted-foreground'}`} />
              <span>AI Reply: <strong className="font-semibold">{aiEnabled ? 'BẬT' : 'TẮT'}</strong></span>
            </Button>
          )}

          {/* AI Thread Configuration Button */}
          {onUpdateAiConfig && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => setIsAiConfigOpen(true)}
              className="gap-1.5 h-9 px-3 text-xs font-medium text-muted-foreground hover:text-foreground border-border bg-background"
              title="Cấu hình liên kết cuộc hội thoại Messenger để AI theo dõi"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600" />
              <span className="hidden sm:inline">Cấu hình hội thoại</span>
            </Button>
          )}

          {/* Persona Learning Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => setIsPersonaModalOpen(true)}
            className="gap-1.5 h-9 px-3 text-xs font-medium text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-900/50"
            title="Học văn phong nói chuyện Messenger từ link hội thoại"
          >
            <GraduationCap className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span className="hidden sm:inline">Học văn phong</span>
            {state.learnedPersona && (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
            )}
          </Button>

          {/* Configured Thread Indicator / Quick Edit Badge */}
          {state.aiTargetThread && state.aiTargetThread.trim() && (
            <button
              type="button"
              onClick={() => setIsAiConfigOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md text-[11px] font-mono bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-colors shadow-2xs max-w-[200px] sm:max-w-[260px]"
              title={`Cuộc hội thoại mục tiêu: ${state.aiTargetThread} (Bấm để thay đổi)`}
            >
              <Link2 className="w-3 h-3 text-purple-600 shrink-0" />
              <span className="truncate">{state.aiTargetThread}</span>
            </button>
          )}

          {/* Compact manual scan button */}
          {onCheckIncoming && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading || isCheckingIncoming}
              onClick={onCheckIncoming}
              className="h-9 px-2.5 text-xs gap-1.5 font-medium text-muted-foreground hover:text-foreground"
              title="Quét tin nhắn Messenger mới ngay lập tức"
            >
              <RefreshCw className={`w-3 h-3 ${isCheckingIncoming ? 'animate-spin text-primary' : ''}`} />
              <span className="inline">{isCheckingIncoming ? 'Đang quét...' : 'Quét tin nhắn'}</span>
            </Button>
          )}
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

      {/* AI Conversation Thread Configuration Modal */}
      {onUpdateAiConfig && (
        <AiConfigModal
          isOpen={isAiConfigOpen}
          currentTargetThread={state.aiTargetThread || ''}
          onClose={() => setIsAiConfigOpen(false)}
          onSave={async (thread) => {
            await onUpdateAiConfig({ targetThread: thread });
          }}
          loading={loading}
        />
      )}

      {/* Persona Learning & Management Modal */}
      <PersonaConfigModal
        isOpen={isPersonaModalOpen}
        onClose={() => setIsPersonaModalOpen(false)}
        defaultThreadUrl={state.personaSourceThread || state.aiTargetThread || ''}
        onNotify={onNotify}
        onSuccess={onPersonaUpdated}
      />
    </Card>
  );
};
