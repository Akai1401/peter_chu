import React, { useState } from "react";
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
  Pencil,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AiConfigModal } from "./AiConfigModal";
import { PersonaConfigModal } from "./PersonaConfigModal";
import { ProactiveChatModal } from "./ProactiveChatModal";
import type { BotState } from "@messenger/shared";

interface Props {
  state: BotState | null;
  onAction: (
    action: "START" | "STOP" | "RESTART" | "EMERGENCY_STOP",
    reason?: string,
  ) => Promise<void>;
  onCheckSession?: () => Promise<void>;
  onConnectMessenger?: () => Promise<void>;
  onDisconnectMessenger?: () => Promise<void>;
  onToggleAiAutoReply?: (enabled: boolean) => Promise<void>;
  onUpdateAiConfig?: (config: {
    enabled?: boolean;
    targetThread?: string;
  }) => Promise<void>;
  onCheckIncoming?: () => Promise<void>;
  isCheckingSession?: boolean;
  isCheckingIncoming?: boolean;
  loading: boolean;
  onNotify?: (message: string, type: "success" | "error" | "info") => void;
  onPersonaUpdated?: () => Promise<void>;
}

const ENGINE_STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  RUNNING: {
    label: "Running",
    dot: "bg-emerald-500 animate-pulse",
    badge:
      "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800",
  },
  STOPPED: {
    label: "Stopped",
    dot: "bg-muted-foreground",
    badge: "text-muted-foreground bg-muted border-border",
  },
  PAUSED: {
    label: "Paused",
    dot: "bg-amber-400 animate-pulse",
    badge:
      "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800",
  },
  EMERGENCY_STOPPED: {
    label: "Emergency Stop",
    dot: "bg-destructive animate-pulse",
    badge: "text-destructive bg-destructive/10 border-destructive/30",
  },
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
  onPersonaUpdated,
}) => {
  const [isRestarting, setIsRestarting] = useState(false);
  const [isTogglingAi, setIsTogglingAi] = useState(false);
  const [isAiConfigOpen, setIsAiConfigOpen] = useState(false);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [isProactiveModalOpen, setIsProactiveModalOpen] = useState(false);

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await onAction("RESTART");
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
          <span className="text-xs font-medium">
            Loading system status...
          </span>
        </div>
      </Card>
    );
  }

  const isRunning = state.status === "RUNNING";
  const aiEnabled = state.aiAutoReply !== false;
  const engineCfg =
    ENGINE_STATUS_CONFIG[state.status] ?? ENGINE_STATUS_CONFIG["STOPPED"];
  const isAnyAiActive = aiEnabled || Boolean(state.proactiveChat?.enabled);

  return (
    <Card className="p-3.5 sm:p-4 md:p-5 shadow-xs border-border space-y-3.5 md:space-y-4 bg-card">
      {/* ── Top Row: System Status & Core Engine Controls ── */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Left: System state, warnings & Last Heartbeat */}
        <div className="flex items-center gap-2 md:gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground font-medium shrink-0">
            <Cpu className="w-3.5 h-3.5 md:w-4 md:h-4 text-foreground" />
            <span>System:</span>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 md:px-3 py-0.5 md:py-1 text-[11px] md:text-xs font-semibold ${engineCfg.badge}`}
          >
            <span
              className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shrink-0 ${engineCfg.dot}`}
            />
            {engineCfg.label}
          </span>

          {/* Last Heartbeat right next to system status */}
          <div
            className="inline-flex items-center gap-1.5 text-[11px] md:text-xs text-muted-foreground bg-muted/50 border border-border/80 px-2.5 md:px-3 py-0.5 md:py-1 rounded-full shrink-0"
            title="Last heartbeat check time"
          >
            <Clock className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0 text-foreground" />
            <span>Last heartbeat:</span>
            <strong className="font-mono text-foreground font-[500]">
              {state.lastHeartbeat
                ? new Date(state.lastHeartbeat).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "N/A"}
            </strong>
          </div>

          {state.dryRun && (
            <Badge
              variant="outline"
              className="text-[10px] md:text-xs px-1.5 md:px-2 py-0 h-5 md:h-6 gap-1 font-medium text-muted-foreground border-border bg-muted/30"
            >
              <FlaskConical className="w-3 h-3 md:w-3.5 md:h-3.5" /> Dry Run
            </Badge>
          )}

          {state.emergencyStop && (
            <Badge
              variant="destructive"
              className="text-[10px] md:text-xs px-1.5 md:px-2 py-0 h-5 md:h-6 gap-1 font-semibold"
            >
              <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5" /> Emergency
              Stop
            </Badge>
          )}
        </div>

        {/* Right: Engine Actions */}
        <div className="flex items-center gap-2 justify-end shrink-0">
          {!isRunning ? (
            <Button
              onClick={() => onAction("START")}
              disabled={loading || isRestarting}
              size="sm"
              className="gap-1.5 h-8 md:h-9 px-3 md:px-4 text-xs md:text-sm font-medium shadow-xs"
            >
              <Play className="w-3 h-3 md:w-3.5 md:h-3.5 fill-current" />
              <span>Start Engine</span>
            </Button>
          ) : (
            <Button
              onClick={() => onAction("STOP")}
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
            <RotateCcw
              className={`w-3 h-3 md:w-3.5 md:h-3.5 ${isRestarting ? "animate-spin" : ""}`}
            />
            <span>Restart</span>
          </Button>
        </div>
      </div>

      {/* ── Dedicated AI Copilot & Automation Hub ── */}
      <div className="rounded-xl md:rounded-2xl p-3.5 sm:p-4 md:p-4.5 bg-gradient-to-b from-purple-500/[0.04] to-transparent border border-purple-500/15 dark:border-purple-500/20 space-y-3 md:space-y-3.5 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground tracking-tight">
                  AI Assistant & Automation
                </h3>
                {isAnyAiActive && isRunning && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    AI Online
                  </span>
                )}
              </div>
            </div>
          </div>

          {onCheckIncoming && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || isCheckingIncoming}
              onClick={onCheckIncoming}
              className="h-8 sm:h-7.5 px-2.5 sm:px-3 text-xs gap-1.5 font-medium text-foreground bg-background hover:bg-muted active:scale-[0.98] transition-all shadow-2xs shrink-0"
              title="Scan for new Messenger messages immediately"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isCheckingIncoming ? "animate-spin text-purple-600 dark:text-purple-400" : "text-muted-foreground"}`}
              />
              <span>
                {isCheckingIncoming ? "Scanning..." : "Scan Messages"}
              </span>
            </Button>
          )}
        </div>

        {/* ── Unified Target Thread Bar (Single Source of Truth) ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl border border-border/80 bg-background dark:bg-card/70 backdrop-blur-xs shadow-2xs">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8.5 h-8.5 rounded-lg bg-muted/60 border border-border/70 flex items-center justify-center shrink-0 text-foreground mt-0.5 sm:mt-0">
              <Link2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="min-w-0 space-y-0.5 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs sm:text-sm font-semibold text-foreground">
                  Target Thread
                </span>
              </div>
              <p
                className="text-xs sm:text-[11px] text-muted-foreground font-mono break-all line-clamp-1"
                title={state.aiTargetThread}
              >
                {state.aiTargetThread ? (
                  <span className="text-foreground font-medium">
                    {state.aiTargetThread}
                  </span>
                ) : (
                  <span className="italic text-muted-foreground">
                    Not configured (Schedule & AI will scan mailbox freely)
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAiConfigOpen(true)}
            className="w-full sm:w-auto h-9 sm:h-8 px-3.5 text-xs gap-1.5 font-medium shrink-0 active:scale-[0.98] shadow-2xs"
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            <span>
              {state.aiTargetThread
                ? "Change Target Thread"
                : "Configure Target Thread"}
            </span>
          </Button>
        </div>

        {/* 3-Column AI Capabilities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3 md:gap-3.5">
          {/* 1. Auto-Reply Card */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              aiEnabled
                ? "border-emerald-500/30 bg-emerald-500/[0.03] dark:bg-emerald-950/10"
                : "border-border/80 bg-background dark:bg-card/50"
            } space-y-2.5 shadow-2xs`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-foreground">
                <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <span>Auto-Reply</span>
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
                  className="data-[state=checked]:bg-emerald-600"
                  title={`Click to ${aiEnabled ? "Disable" : "Enable"} auto-reply`}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${aiEnabled ? (isRunning ? "bg-emerald-500 animate-pulse" : "bg-amber-400 animate-pulse") : "bg-muted-foreground"}`}
                />
                <span className="font-medium text-foreground">
                  {!aiEnabled
                    ? "Disabled"
                    : isRunning
                      ? "Active"
                      : "Waiting for Engine"}
                </span>
              </div>

              {/* Target thread indicator */}
              <div className="flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
                <Link2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                {state.aiTargetThread ? (
                  <span className="truncate font-mono text-[11px]">
                    Follows shared Target Thread
                  </span>
                ) : (
                  <span className="text-[11px]">Scan entire mailbox</span>
                )}
              </div>
            </div>
          </div>

          {/* 2. Persona Card */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              state.activePersonaName || state.learnedPersona?.tone
                ? "border-purple-500/30 bg-purple-500/[0.03] dark:bg-purple-950/10"
                : "border-border/80 bg-background dark:bg-card/50"
            } space-y-2.5 shadow-2xs`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-foreground">
                <div className="w-6 h-6 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <GraduationCap className="w-3.5 h-3.5" />
                </div>
                <span>Conversation Persona</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsPersonaModalOpen(true)}
                className="h-8 sm:h-7 px-3 sm:px-2.5 text-xs gap-1 font-medium shadow-2xs active:scale-[0.98]"
              >
                <Pencil className="w-3 h-3 text-muted-foreground" />
                <span>Manage</span>
              </Button>
            </div>

            <div className="space-y-1">
              <p
                className="text-xs sm:text-sm font-semibold text-foreground truncate"
                title={state.activePersonaName || state.learnedPersona?.tone}
              >
                {state.activePersonaName ||
                  (state.learnedPersona?.tone
                    ? `Tone: ${state.learnedPersona.tone}`
                    : "Default (Natural)")}
              </p>
              <p className="text-xs sm:text-[11px] text-muted-foreground truncate">
                {state.learnedPersona?.pronouns
                  ? `Pronouns: ${state.learnedPersona.pronouns}`
                  : "Not personalized yet"}
              </p>
            </div>
          </div>

          {/* 3. Proactive Chat Card */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              state.proactiveChat?.enabled
                ? "border-pink-500/30 bg-pink-500/[0.03] dark:bg-pink-950/10"
                : "border-border/80 bg-background dark:bg-card/50"
            } space-y-2.5 shadow-2xs`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-foreground">
                <div className="w-6 h-6 rounded-md bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center">
                  <MessageCircleHeart className="w-3.5 h-3.5" />
                </div>
                <span>Proactive Chat</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsProactiveModalOpen(true)}
                className="h-8 sm:h-7 px-3 sm:px-2.5 text-xs gap-1 font-medium shadow-2xs active:scale-[0.98]"
              >
                <span>Configure</span>
              </Button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${state.proactiveChat?.enabled ? "bg-pink-500 animate-pulse" : "bg-muted-foreground"}`}
                />
                <span className="font-medium text-foreground">
                  {state.proactiveChat?.enabled ? "Enabled" : "Disabled"}
                </span>
                {state.proactiveChat?.enabled && (
                  <span className="text-muted-foreground text-[10px] sm:text-[11px] bg-muted/60 px-1.5 py-0.2 rounded border border-border/50">
                    {(state.proactiveChat.minIntervalMinutes || 120) / 60}h -{" "}
                    {(state.proactiveChat.maxIntervalMinutes || 360) / 60}h
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-[11px] text-muted-foreground truncate">
                {state.proactiveChat?.enabled &&
                state.proactiveChat.nextScheduledAt
                  ? `Next: ${new Date(state.proactiveChat.nextScheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Auto-initiate conversation"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {onUpdateAiConfig && (
        <AiConfigModal
          isOpen={isAiConfigOpen}
          currentTargetThread={state.aiTargetThread || ""}
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
        defaultThreadUrl={
          state.personaSourceThread || state.aiTargetThread || ""
        }
        onNotify={onNotify}
        onSuccess={onPersonaUpdated}
      />

      <ProactiveChatModal
        isOpen={isProactiveModalOpen}
        onClose={() => setIsProactiveModalOpen(false)}
        defaultThreadUrl={state.aiTargetThread || ""}
        onNotify={onNotify}
        onSuccess={onPersonaUpdated}
      />
    </Card>
  );
};
