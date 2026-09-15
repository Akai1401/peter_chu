import React, { useState } from 'react';
import { Terminal, RefreshCw, Filter, ChevronRight, ChevronDown } from 'lucide-react';
import type { AuditLog, ExecutionLog } from '@messenger/shared';

interface Props {
  auditLogs: AuditLog[];
  executionLogs: ExecutionLog[];
  onRefresh: () => Promise<void>;
  loading: boolean;
}

export const LogViewer: React.FC<Props> = ({
  auditLogs,
  executionLogs,
  onRefresh,
  loading
}) => {
  const [tab, setTab] = useState<'execution' | 'audit'>('execution');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const filteredExecLogs = executionLogs.filter((log) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (
      log.status.toLowerCase().includes(q) ||
      log.threadId.toLowerCase().includes(q) ||
      log.messagePreview.toLowerCase().includes(q)
    );
  });

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.actor.toLowerCase().includes(q) ||
      log.level.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <span className="badge badge-success text-[10px]">Success</span>;
      case 'DRY_RUN':
        return <span className="badge badge-warning text-[10px]">Dry Run</span>;
      case 'FAILED':
        return <span className="badge badge-danger text-[10px]">Failed</span>;
      case 'SKIPPED_DUPLICATE':
        return <span className="badge badge-neutral text-[10px]">Duplicate Skipped</span>;
      case 'SKIPPED_RATE_LIMITED':
        return <span className="badge badge-warning text-[10px]">Rate Limited</span>;
      default:
        return <span className="badge badge-neutral text-[10px]">{status}</span>;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'INFO':
        return <span className="badge badge-info text-[10px]">Info</span>;
      case 'WARN':
        return <span className="badge badge-warning text-[10px]">Warn</span>;
      case 'ERROR':
        return <span className="badge badge-danger text-[10px]">Error</span>;
      default:
        return <span className="badge badge-neutral text-[10px]">{level}</span>;
    }
  };

  return (
    <div className="glass-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Terminal size={18} className="text-indigo-400" />
            System & Dispatch Logs
          </h3>

          <div className="flex bg-slate-900 rounded-lg p-1 border border-white/5 text-xs">
            <button
              onClick={() => setTab('execution')}
              className={`px-3 py-1 rounded-md transition-all ${
                tab === 'execution'
                  ? 'bg-indigo-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Execution Logs ({executionLogs.length})
            </button>
            <button
              onClick={() => setTab('audit')}
              className={`px-3 py-1 rounded-md transition-all ${
                tab === 'audit'
                  ? 'bg-indigo-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Audit Trail ({auditLogs.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Filter size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter logs..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            onClick={() => onRefresh()}
            disabled={loading}
            className="btn btn-ghost text-xs px-2.5 py-1.5"
            title="Refresh logs"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="mt-4 max-h-[420px] overflow-y-auto font-mono text-xs divide-y divide-white/5">
        {tab === 'execution' ? (
          filteredExecLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-500 font-sans">
              No execution logs found.
            </div>
          ) : (
            filteredExecLogs.map((log) => {
              const isExpanded = expandedId === log.id;
              return (
                <div key={log.id} className="py-2.5 hover:bg-white/[0.02] px-2 rounded-lg transition-colors">
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="flex flex-wrap items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="text-slate-400">
                        {new Date(log.executedAt).toLocaleTimeString()}
                      </span>
                      {getStatusBadge(log.status)}
                      <span className="text-slate-300 font-sans truncate max-w-sm">
                        {log.messagePreview}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-slate-500">
                      <span>Thread: {log.threadId}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-950/80 border border-white/5 text-[11px] text-slate-400 space-y-1">
                      <p><strong className="text-slate-300">Log ID:</strong> {log.id}</p>
                      <p><strong className="text-slate-300">Reminder ID:</strong> {log.reminderId}</p>
                      <p><strong className="text-slate-300">Idempotency Key:</strong> {log.idempotencyKey}</p>
                      <p><strong className="text-slate-300">Executed At:</strong> {log.executedAt}</p>
                      {log.details && (
                        <div>
                          <strong className="text-slate-300">Details:</strong>
                          <pre className="mt-1 p-2 rounded bg-slate-900 border border-white/5 overflow-x-auto text-cyan-300">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          filteredAuditLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-500 font-sans">
              No audit logs found.
            </div>
          ) : (
            filteredAuditLogs.map((log) => {
              const isExpanded = expandedId === log.id;
              return (
                <div key={log.id} className="py-2.5 hover:bg-white/[0.02] px-2 rounded-lg transition-colors">
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="flex flex-wrap items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {getLevelBadge(log.level)}
                      <span className="font-semibold text-slate-200">{log.action}</span>
                    </div>

                    <span className="text-slate-500">Actor: {log.actor}</span>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-950/80 border border-white/5 text-[11px] text-slate-400 space-y-1">
                      <p><strong className="text-slate-300">Audit ID:</strong> {log.id}</p>
                      <p><strong className="text-slate-300">Timestamp:</strong> {log.timestamp}</p>
                      {log.details && (
                        <div>
                          <strong className="text-slate-300">Payload:</strong>
                          <pre className="mt-1 p-2 rounded bg-slate-900 border border-white/5 overflow-x-auto text-amber-300">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
};
