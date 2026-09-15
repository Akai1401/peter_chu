import React, { useState } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  AlertOctagon,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Clock
} from 'lucide-react';
import type { BotState } from '@messenger/shared';

interface Props {
  state: BotState | null;
  onAction: (action: 'START' | 'STOP' | 'RESTART' | 'EMERGENCY_STOP', reason?: string) => Promise<void>;
  onToggleDryRun: (dryRun: boolean) => Promise<void>;
  loading: boolean;
}

export const BotStatusCard: React.FC<Props> = ({ state, onAction, onToggleDryRun, loading }) => {
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');

  if (!state) {
    return (
      <div className="glass-panel p-6 flex items-center justify-center text-slate-400">
        Loading bot state...
      </div>
    );
  }

  const isEmergency = state.status === 'EMERGENCY_STOPPED' || state.emergencyStop;
  const isRunning = state.status === 'RUNNING';

  const getStatusBadge = () => {
    if (isEmergency) {
      return (
        <span className="badge badge-danger">
          <span className="w-2 h-2 rounded-full bg-red-500 pulse-dot inline-block"></span>
          Emergency Stopped
        </span>
      );
    }
    if (isRunning) {
      return (
        <span className="badge badge-success">
          <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot inline-block"></span>
          Running
        </span>
      );
    }
    return (
      <span className="badge badge-neutral">
        <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
        Stopped
      </span>
    );
  };

  const getSessionBadge = () => {
    switch (state.sessionStatus) {
      case 'LOGGED_IN':
        return (
          <span className="badge badge-success">
            <ShieldCheck size={14} /> Logged In
          </span>
        );
      case 'UNAUTHENTICATED':
        return (
          <span className="badge badge-danger">
            <ShieldAlert size={14} /> Unauthenticated
          </span>
        );
      case 'SESSION_EXPIRED':
        return (
          <span className="badge badge-warning">
            <ShieldAlert size={14} /> Expired
          </span>
        );
      default:
        return (
          <span className="badge badge-neutral">
            <Radio size={14} /> Unknown
          </span>
        );
    }
  };

  const handleConfirmEmergency = async () => {
    await onAction('EMERGENCY_STOP', emergencyReason || 'Triggered from Admin UI');
    setShowEmergencyModal(false);
    setEmergencyReason('');
  };

  return (
    <div className="glass-panel p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-white">Bot Operations Engine</h2>
            {getStatusBadge()}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Messenger Web Persistent Context & Scheduler Control
          </p>
        </div>

        {/* Status Indicators */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-white/5 text-xs text-slate-300">
            <span className="text-slate-500">Messenger Session:</span>
            {getSessionBadge()}
          </div>

          <button
            onClick={() => onToggleDryRun(!state.dryRun)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${
              state.dryRun
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
            }`}
            title="Toggle DRY_RUN safe simulation mode"
          >
            <span className={`w-2 h-2 rounded-full ${state.dryRun ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
            DRY_RUN: {state.dryRun ? 'ENABLED (Safe)' : 'DISABLED (Live)'}
          </button>
        </div>
      </div>

      {/* Control Actions */}
      <div className="pt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {!isRunning ? (
            <button
              onClick={() => onAction('START')}
              disabled={loading}
              className="btn btn-primary"
            >
              <Play size={16} /> Start Bot
            </button>
          ) : (
            <button
              onClick={() => onAction('STOP')}
              disabled={loading}
              className="btn btn-ghost"
            >
              <Square size={16} /> Stop Bot
            </button>
          )}

          <button
            onClick={() => onAction('RESTART')}
            disabled={loading}
            className="btn btn-ghost"
          >
            <RotateCcw size={16} /> Restart
          </button>

          <button
            onClick={() => setShowEmergencyModal(true)}
            disabled={loading || isEmergency}
            className="btn btn-danger"
          >
            <AlertOctagon size={16} /> Emergency Stop
          </button>
        </div>

        {/* Heartbeat info */}
        <div className="text-xs text-slate-500 flex items-center gap-2 font-mono">
          <Clock size={14} />
          <span>Last Heartbeat: {state.lastHeartbeat ? new Date(state.lastHeartbeat).toLocaleTimeString() : 'N/A'}</span>
          {state.lockHolderId && (
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              {state.lockHolderId}
            </span>
          )}
        </div>
      </div>

      {/* Emergency Stop Confirmation Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="glass-panel max-w-md w-full p-6 border-red-500/30 bg-slate-950/95 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-3">
              <AlertOctagon size={28} />
              <h3 className="text-lg font-bold">Confirm Emergency Stop</h3>
            </div>
            <p className="text-sm text-slate-300 mb-4">
              Triggering Emergency Stop will immediately halt all scheduled jobs and prevent any message delivery until explicitly restarted.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Reason (optional):
              </label>
              <input
                type="text"
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                placeholder="e.g. Account security audit or suspicious behavior"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm focus:outline-none focus:border-red-500"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowEmergencyModal(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEmergency}
                className="btn btn-danger"
              >
                Execute Emergency Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
