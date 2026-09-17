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
  Link2,
  GraduationCap,
  MessageCircleHeart,
  Bot,
  Pencil
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { AiConfigModal } from './AiConfigModal';
import { PersonaConfigModal } from './PersonaConfigModal';
import { ProactiveChatModal } from './ProactiveChatModal';
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
  RUNNING:           { label: 'Running',        dot: 'bg-emerald-500 animate-pulse', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800' },
  STOPPED:           { label: 'Stopped',        dot: 'bg-muted-foreground',          badge: 'text-muted-foreground bg-muted border-border' },
  PAUSED:            { label: 'Paused',         dot: 'bg-amber-400 animate-pulse',  badge: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800' },
  EMERGENCY_STOPPED: { label: 'Emergency Stop', dot: 'bg-destructive animate-pulse', badge: 'text-destructive bg-destructive/10 border-destructive/30' },
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
  const [isProactiveModalOpen, setIsProactiveModalOpen] = useState(false);

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
      <Card className="p-4 flex items-center justify-center min-h-[64px] border-border shadow-xs">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-xs font-medium">Đang tải trạng thái hệ thống...</span>
        </div>
      </Card>
    );
  }

  const isRunning = state.status === 'RUNNING';
  const aiEnabled = state.aiAutoReply !== false;
  const engineCfg = ENGINE_STATUS_CONFIG[state.status] ?? ENGINE_STATUS_CONFIG['STOPPED'];
  const isAnyAiActive = aiEnabled || Boolean(state.proactiveChat?.enabled);

  return (
    <Card className="p-3.5 sm:p-4 md:p-5 shadow-xs border-border space-y-3.5 md:space-y-4 bg-card">
      {/* ── Top Row: System Status & Core Engine Controls ── */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Left: System state, warnings & Last Heartbreak */}
        <div className="flex items-center gap-2 md:gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground font-medium shrink-0">
            <Cpu className="w-3.5 h-3.5 md:w-4 md:h-4 text-foreground" />
            <span>Hệ thống:</span>
          </div>

          <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 md:px-3 py-0.5 md:py-1 text-[11px] md:text-xs font-semibold ${engineCfg.badge}`}>
            <span className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shrink-0 ${engineCfg.dot}`} />
            {engineCfg.label}
          </span>

          {/* Last Heartbreak right next to system status */}
          <div
            className="inline-flex items-center gap-1.5 text-[11px] md:text-xs text-muted-foreground bg-muted/50 border border-border/80 px-2.5 md:px-3 py-0.5 md:py-1 rounded-full shrink-0"
            title="Thời điểm kiểm tra nhịp đập hệ thống gần nhất (Last Heartbreak)"
          >
            <Clock className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0 text-foreground" />
            <span>Last heartbreak:</span>
            <strong className="font-mono text-foreground font-[500]">
              {state.lastHeartbeat ? new Date(state.lastHeartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A'}
            </strong>
          </div>

          {state.dryRun && (
            <Badge variant="outline" className="text-[10px] md:text-xs px-1.5 md:px-2 py-0 h-5 md:h-6 gap-1 font-medium text-muted-foreground border-border bg-muted/30">
              <FlaskConical className="w-3 h-3 md:w-3.5 md:h-3.5" /> Dry Run
            </Badge>
          )}

          {state.emergencyStop && (
            <Badge variant="destructive" className="text-[10px] md:text-xs px-1.5 md:px-2 py-0 h-5 md:h-6 gap-1 font-semibold">
              <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5" /> Emergency Stop
            </Badge>
          )}
        </div>

        {/* Right: Engine Actions */}
        <div className="flex items-center gap-2 justify-end shrink-0">
          {!isRunning ? (
            <Button
              onClick={() => onAction('START')}
              disabled={loading || isRestarting}
              size="sm"
              className="gap-1.5 h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm font-medium shadow-xs"
            >
              <Play className="w-3 h-3 md:w-3.5 md:h-3.5 fill-current" />
              <span>Start Engine</span>
            </Button>
          ) : (
            <Button
              onClick={() => onAction('STOP')}
              disabled={loading || isRestarting}
              variant="destructive"
              size="sm"
              className="gap-1.5 h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm font-medium shadow-xs"
            >
              <Square className="w-3 h-3 md:w-3.5 md:h-3.5 fill-current" />
              <span>Stop Engine</span>
            </Button>
          )}

          <Button
            onClick={handleRestart}
            disabled={loading || isRestarting}
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 md:h-9 px-2.5 md:px-3 text-xs md:text-sm font-medium"
          >
            <RotateCcw className={`w-3 h-3 md:w-3.5 md:h-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
            <span>Restart</span>
          </Button>
        </div>
      </div>

      {/* ── Dedicated AI Copilot & Automation Hub ── */}
      <div className="pt-2 md:pt-3 border-t border-border/60 space-y-2.5 md:space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 text-foreground" />
            <h3 className="text-xs md:text-sm font-semibold text-foreground tracking-tight">
              Trợ lý AI & Tự động hoá
            </h3>
            {isAnyAiActive && isRunning && (
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse" title="AI đang hoạt động" />
            )}
          </div>

          {onCheckIncoming && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading || isCheckingIncoming}
              onClick={onCheckIncoming}
              className="h-7 md:h-8 px-2 md:px-2.5 text-xs md:text-sm gap-1.5 font-medium text-muted-foreground hover:text-foreground"
              title="Quét tin nhắn Messenger mới ngay lập tức"
            >
              <RefreshCw className={`w-3 h-3 md:w-3.5 md:h-3.5 ${isCheckingIncoming ? 'animate-spin text-foreground' : ''}`} />
              <span>{isCheckingIncoming ? 'Đang quét...' : 'Quét tin nhắn'}</span>
            </Button>
          )}
        </div>

        {/* ── Unified Target Thread Bar (Single Source of Truth) ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3 rounded-lg border border-border bg-muted/20">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-background border border-border/80 flex items-center justify-center shrink-0 text-foreground">
              <Link2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs sm:text-sm font-semibold text-foreground">Cuộc trò chuyện mục tiêu (Target Thread)</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-border bg-background">
                  Dùng chung
                </Badge>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-mono truncate max-w-[280px] sm:max-w-md" title={state.aiTargetThread}>
                {state.aiTargetThread ? (
                  <span className="text-foreground font-medium">{state.aiTargetThread}</span>
                ) : (
                  <span className="italic text-muted-foreground">Chưa cấu hình (Lịch & AI sẽ quét tự do hoặc chờ chỉ định)</span>
                )}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAiConfigOpen(true)}
            className="w-full sm:w-auto h-8 px-3 text-xs gap-1.5 font-medium shrink-0 shadow-2xs"
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{state.aiTargetThread ? 'Đổi Target Thread' : 'Cấu hình Target Thread'}</span>
          </Button>
        </div>

        {/* 3-Column AI Capabilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3 md:gap-4">
          {/* 1. Auto-Reply Card */}
          <div className="p-3 md:p-3.5 rounded-lg border border-border/80 bg-muted/20 space-y-2 md:space-y-2.5 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs md:text-sm font-semibold text-foreground">
                <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" />
                <span>Tự động trả lời</span>
              </div>
              {onToggleAiAutoReply && (
                <Switch
                  checked={aiEnabled}
                  disabled={loading || isTogglingAi}
                  onCheckedChange={async (checked) => {
                    setIsTogglingAi(true);
                    try {
                      await onToggleAiAutoReply(checked);
                    } finally {
                      setIsTogglingAi(false);
                    }
                  }}
                  title={`Bấm để ${aiEnabled ? 'Tắt' : 'Bật'} tự động trả lời`}
                />
              )}
            </div>

            <div className="space-y-1 md:space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] md:text-xs">
                <span className={`w-1.5 h-1.5 rounded-full ${aiEnabled ? (isRunning ? 'bg-emerald-500' : 'bg-amber-400') : 'bg-muted-foreground'}`} />
                <span className="font-medium text-foreground">
                  {!aiEnabled ? 'Đang tắt' : isRunning ? 'Đang hoạt động' : 'Chờ bật Engine'}
                </span>
              </div>

              {/* Target thread indicator */}
              <div className="flex items-center gap-1.5 pt-0.5 text-[11px] md:text-xs text-muted-foreground">
                <Link2 className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0 text-muted-foreground" />
                {state.aiTargetThread ? (
                  <span className="truncate font-mono">
                    Theo Target Thread chung
                  </span>
                ) : (
                  <span>Quét toàn bộ hộp thư</span>
                )}
              </div>
            </div>
          </div>

          {/* 2. Persona Card */}
          <div className="p-3 md:p-3.5 rounded-lg border border-border/80 bg-muted/20 space-y-2 md:space-y-2.5 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs md:text-sm font-semibold text-foreground">
                <GraduationCap className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" />
                <span>Văn phong hội thoại</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsPersonaModalOpen(true)}
                className="h-8 sm:h-7 px-3 sm:px-2.5 text-xs sm:text-xs gap-1 font-medium shadow-2xs"
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
                <span>Quản lý</span>
              </Button>
            </div>

            <div className="space-y-0.5 md:space-y-1">
              <p className="text-xs md:text-sm font-semibold text-foreground truncate" title={state.activePersonaName || state.learnedPersona?.tone}>
                {state.activePersonaName || (state.learnedPersona?.tone ? `Văn phong: ${state.learnedPersona.tone}` : 'Mặc định (Tự nhiên)')}
              </p>
              <p className="text-[11px] md:text-xs text-muted-foreground truncate">
                {state.learnedPersona?.pronouns
                  ? `Xưng hô: ${state.learnedPersona.pronouns}`
                  : 'Chưa thiết lập cá nhân hoá'}
              </p>
            </div>
          </div>

          {/* 3. Proactive Chat Card */}
          <div className="p-3 md:p-3.5 rounded-lg border border-border/80 bg-muted/20 space-y-2 md:space-y-2.5 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs md:text-sm font-semibold text-foreground">
                <MessageCircleHeart className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" />
                <span>Chủ động nhắn tin</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsProactiveModalOpen(true)}
                className="h-8 sm:h-7 px-3 sm:px-2.5 text-xs sm:text-xs gap-1 font-medium shadow-2xs"
              >
                <span>Cấu hình</span>
              </Button>
            </div>

            <div className="space-y-0.5 md:space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] md:text-xs">
                <span className={`w-1.5 h-1.5 rounded-full ${state.proactiveChat?.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
                <span className="font-medium text-foreground">
                  {state.proactiveChat?.enabled ? 'Đang bật' : 'Đang tắt'}
                </span>
                {state.proactiveChat?.enabled && (
                  <span className="text-muted-foreground text-[10px] md:text-[11px]">
                    ({(state.proactiveChat.minIntervalMinutes || 120) / 60}h-{(state.proactiveChat.maxIntervalMinutes || 360) / 60}h)
                  </span>
                )}
              </div>
              <p className="text-[11px] md:text-xs text-muted-foreground truncate">
                {state.proactiveChat?.enabled && state.proactiveChat.nextScheduledAt
                  ? `Lần tới: ${new Date(state.proactiveChat.nextScheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Tự động mở lời khi rảnh'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
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

      <PersonaConfigModal
        isOpen={isPersonaModalOpen}
        onClose={() => setIsPersonaModalOpen(false)}
        defaultThreadUrl={state.personaSourceThread || state.aiTargetThread || ''}
        onNotify={onNotify}
        onSuccess={onPersonaUpdated}
      />

      <ProactiveChatModal
        isOpen={isProactiveModalOpen}
        onClose={() => setIsProactiveModalOpen(false)}
        defaultThreadUrl={state.aiTargetThread || ''}
        onNotify={onNotify}
        onSuccess={onPersonaUpdated}
      />
    </Card>
  );
};
