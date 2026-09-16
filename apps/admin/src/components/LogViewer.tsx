import React, { useState } from 'react';
import { Terminal, RefreshCw, Filter, ChevronRight, ChevronDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
        return <Badge variant="success" className="text-[10px] uppercase tracking-wider">Success</Badge>;
      case 'DRY_RUN':
        return <Badge variant="info" className="text-[10px] uppercase tracking-wider">Dry Run</Badge>;
      case 'FAILED':
        return <Badge variant="destructive" className="text-[10px] uppercase tracking-wider">Failed</Badge>;
      case 'SKIPPED_DUPLICATE':
        return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">Duplicate</Badge>;
      case 'SKIPPED_RATE_LIMITED':
        return <Badge variant="warning" className="text-[10px] uppercase tracking-wider">Rate Limited</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{status}</Badge>;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'INFO':
        return <Badge variant="info" className="text-[10px] uppercase tracking-wider">Info</Badge>;
      case 'WARN':
      case 'WARNING':
        return <Badge variant="warning" className="text-[10px] uppercase tracking-wider">Warning</Badge>;
      case 'ERROR':
      case 'CRITICAL':
        return <Badge variant="destructive" className="text-[10px] uppercase tracking-wider">Error</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{level}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted border flex items-center justify-center">
              <Terminal className="w-4 h-4 text-foreground" />
            </div>
            <CardTitle className="text-lg">System Logs</CardTitle>
          </div>

          <div className="flex bg-muted/50 rounded-md p-1 border">
            <button
              onClick={() => setTab('execution')}
              className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors ${
                tab === 'execution'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              Execution ({executionLogs.length})
            </button>
            <button
              onClick={() => setTab('audit')}
              className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors ${
                tab === 'audit'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
            >
              Audit ({auditLogs.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-56">
            <Filter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search logs..."
              className="pl-9"
            />
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => onRefresh()}
            disabled={loading}
            className="shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 sm:pt-6">
        <div className="max-h-[500px] overflow-y-auto pr-2 -mr-2 pb-2">
          <div className="space-y-3">
            {tab === 'execution' ? (
              filteredExecLogs.length === 0 ? (
                <div className="py-16 text-center text-sm font-medium text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                  No execution logs found.
                </div>
              ) : (
                filteredExecLogs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <div key={log.id} className="border rounded-lg overflow-hidden bg-card hover:border-muted-foreground/30 transition-colors">
                      <div
                        onClick={() => toggleExpand(log.id)}
                        className="p-3.5 flex items-start gap-3 cursor-pointer hover:bg-muted/30"
                      >
                        <div className="text-muted-foreground shrink-0 mt-1">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>
                        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getStatusBadge(log.status)}
                            <span className="text-[11px] font-medium text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                              {new Date(log.executedAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <span className="text-sm font-medium line-clamp-2 break-words">{log.messagePreview}</span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-4 bg-muted/20 border-t space-y-2">
                          <p className="text-xs"><span className="font-semibold">ID:</span> <span className="font-mono text-muted-foreground break-all">{log.id}</span></p>
                          <p className="text-xs"><span className="font-semibold">Thread:</span> <span className="font-mono text-muted-foreground break-all">{log.threadId}</span></p>
                          <p className="text-xs"><span className="font-semibold">Time:</span> <span className="font-mono text-muted-foreground">{log.executedAt}</span></p>
                          {log.details && (
                            <div className="mt-3">
                              <pre className="p-3 bg-background border rounded-md overflow-x-auto text-xs font-mono">
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
                <div className="py-16 text-center text-sm font-medium text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                  No audit logs found.
                </div>
              ) : (
                filteredAuditLogs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <div key={log.id} className="border rounded-lg overflow-hidden bg-card hover:border-muted-foreground/30 transition-colors">
                      <div
                        onClick={() => toggleExpand(log.id)}
                        className="p-3.5 flex items-start gap-3 cursor-pointer hover:bg-muted/30"
                      >
                        <div className="text-muted-foreground shrink-0 mt-1">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>
                        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getLevelBadge(log.level)}
                            <span className="text-[11px] font-medium text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <Badge variant="outline" className="text-[10px] ml-auto">
                              {log.actor}
                            </Badge>
                          </div>
                          <span className="text-sm font-medium line-clamp-2 break-words">{log.action}</span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-4 bg-muted/20 border-t space-y-2">
                          <p className="text-xs"><span className="font-semibold">ID:</span> <span className="font-mono text-muted-foreground break-all">{log.id}</span></p>
                          <p className="text-xs sm:hidden"><span className="font-semibold">Actor:</span> <span className="font-mono text-muted-foreground">{log.actor}</span></p>
                          {log.details && (
                            <div className="mt-3">
                              <pre className="p-3 bg-background border rounded-md overflow-x-auto text-xs font-mono">
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
      </CardContent>
    </Card>
  );
};
