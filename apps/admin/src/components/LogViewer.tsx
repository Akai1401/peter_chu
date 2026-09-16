import React, { useState, useMemo } from 'react';
import {
  Terminal,
  RefreshCw,
  Filter,
  ChevronRight,
  ChevronDown,
  Sparkles,
  MessageSquare,
  Clock,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
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
  const [tab, setTab] = useState<'messages' | 'execution' | 'audit'>('messages');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // 1. Phân loại Tin nhắn & AI: Tự động gom & khử trùng lặp
  // Nếu 1 tin nhắn đến đã có log phản hồi của AI (AI Reply), ẩn log tin nhắn đến đơn lẻ đi
  const messagesLogs = useMemo(() => {
    const aiRepliedIncomingTexts = new Set<string>();

    executionLogs.forEach((l) => {
      const details = (l.details || {}) as any;
      if (l.reminderId === 'ai_auto_reply' || details.actionType === 'AI_REPLY') {
        const text = details.incomingMessage || '';
        if (text) aiRepliedIncomingTexts.add(text.trim());
      }
    });

    return executionLogs.filter((log) => {
      const details = (log.details || {}) as any;
      const isAiReply =
        log.reminderId === 'ai_auto_reply' ||
        details.actionType === 'AI_REPLY' ||
        details.actionType === 'AI_REPLY_ERROR' ||
        details.actionType === 'AI_REPLY_SEND_ERROR' ||
        log.messagePreview.includes('[AI Reply]') ||
        log.messagePreview.includes('[AI Lỗi]');

      const isIncoming =
        log.reminderId === 'incoming_message' ||
        details.actionType === 'INCOMING_MESSAGE' ||
        log.messagePreview.includes('[Tin nhắn đến]');

      if (isAiReply) return true;
      if (isIncoming) {
        const text = (details.incomingMessage || '').trim();
        // Nếu tin nhắn này đã có câu trả lời AI ngay phía trên, không hiển thị thẻ trùng
        if (text && aiRepliedIncomingTexts.has(text)) {
          return false;
        }
        return true;
      }
      return false;
    });
  }, [executionLogs]);

  // 2. Phân loại Lịch nhắc nhở (Execution Logs thuần tuý):
  // LOẠI BỎ hoàn toàn tin nhắn đến và AI reply để không bị trùng với Tab 1
  const scheduledExecutionLogs = useMemo(() => {
    return executionLogs.filter((log) => {
      const details = (log.details || {}) as any;
      const isAiOrIncoming =
        log.reminderId === 'incoming_message' ||
        log.reminderId === 'ai_auto_reply' ||
        details.actionType === 'INCOMING_MESSAGE' ||
        details.actionType === 'AI_REPLY' ||
        details.actionType === 'AI_REPLY_ERROR' ||
        details.actionType === 'AI_REPLY_SEND_ERROR' ||
        log.messagePreview.includes('[Tin nhắn đến]') ||
        log.messagePreview.includes('[AI Reply]') ||
        log.messagePreview.includes('[AI Lỗi]');

      return !isAiOrIncoming;
    });
  }, [executionLogs]);

  // 3. Bộ lọc tìm kiếm
  const filteredMessagesLogs = useMemo(() => {
    if (!filterText) return messagesLogs;
    const q = filterText.toLowerCase();
    return messagesLogs.filter((log) => {
      const details = (log.details || {}) as any;
      return (
        log.messagePreview.toLowerCase().includes(q) ||
        log.threadId.toLowerCase().includes(q) ||
        (details.incomingMessage && String(details.incomingMessage).toLowerCase().includes(q)) ||
        (details.replyContent && String(details.replyContent).toLowerCase().includes(q)) ||
        (details.senderName && String(details.senderName).toLowerCase().includes(q))
      );
    });
  }, [messagesLogs, filterText]);

  const filteredExecLogs = useMemo(() => {
    if (!filterText) return scheduledExecutionLogs;
    const q = filterText.toLowerCase();
    return scheduledExecutionLogs.filter((log) => {
      return (
        log.status.toLowerCase().includes(q) ||
        log.threadId.toLowerCase().includes(q) ||
        log.messagePreview.toLowerCase().includes(q)
      );
    });
  }, [scheduledExecutionLogs, filterText]);

  const filteredAuditLogs = useMemo(() => {
    if (!filterText) return auditLogs;
    const q = filterText.toLowerCase();
    return auditLogs.filter((log) => {
      return (
        log.action.toLowerCase().includes(q) ||
        log.actor.toLowerCase().includes(q) ||
        log.level.toLowerCase().includes(q) ||
        (log.details && String(log.details).toLowerCase().includes(q))
      );
    });
  }, [auditLogs, filterText]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <Badge variant="success" className="text-[10px] uppercase tracking-wider h-5 font-semibold">Success</Badge>;
      case 'DRY_RUN':
        return <Badge variant="info" className="text-[10px] uppercase tracking-wider h-5 font-semibold">Dry Run</Badge>;
      case 'FAILED':
        return <Badge variant="destructive" className="text-[10px] uppercase tracking-wider h-5 font-semibold">Failed</Badge>;
      case 'SKIPPED_DUPLICATE':
        return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider h-5 font-medium">Duplicate</Badge>;
      case 'SKIPPED_RATE_LIMITED':
        return <Badge variant="warning" className="text-[10px] uppercase tracking-wider h-5 font-medium">Rate Limited</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider h-5">{status}</Badge>;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'INFO':
        return <Badge variant="info" className="text-[10px] uppercase tracking-wider h-5 font-semibold">Info</Badge>;
      case 'WARN':
      case 'WARNING':
        return <Badge variant="warning" className="text-[10px] uppercase tracking-wider h-5 font-semibold">Warning</Badge>;
      case 'ERROR':
      case 'CRITICAL':
        return <Badge variant="destructive" className="text-[10px] uppercase tracking-wider h-5 font-semibold">Error</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px] uppercase tracking-wider h-5">{level}</Badge>;
    }
  };

  const getActionBadge = (action: string) => {
    if (action === 'INCOMING_MESSAGE_RECEIVED') {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 gap-1 font-medium text-sky-700 border-sky-200 bg-sky-50 dark:text-sky-300 dark:bg-sky-950/40 dark:border-sky-800">
          <MessageSquare className="w-2.5 h-2.5" /> Tin nhắn đến
        </Badge>
      );
    }
    if (action === 'AI_REPLY_SENT') {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 gap-1 font-medium text-purple-700 border-purple-200 bg-purple-50 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-800">
          <Sparkles className="w-2.5 h-2.5" /> AI Reply
        </Badge>
      );
    }
    if (action === 'AI_AUTO_REPLY_TOGGLE') {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 gap-1 font-medium text-amber-700 border-amber-200 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800">
          AI Toggle
        </Badge>
      );
    }
    if (action === 'INCOMING_MESSAGE_CHECK') {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 gap-1 font-medium text-emerald-700 border-emerald-200 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800">
          <RefreshCw className="w-2.5 h-2.5" /> Quét tin nhắn
        </Badge>
      );
    }
    return null;
  };

  const formatThreadDisplay = (threadId: string) => {
    if (!threadId) return 'N/A';
    if (threadId.startsWith('http')) {
      const match = threadId.match(/\/t\/([^/?#]+)/i);
      return match ? match[1] : 'Direct Thread';
    }
    return threadId;
  };

  const getThreadUrl = (threadId: string) => {
    if (!threadId) return '#';
    if (threadId.startsWith('http')) return threadId;
    return `https://www.facebook.com/messages/t/${threadId}`;
  };

  return (
    <Card className="shadow-xs border-border">
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border/80">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold tracking-tight">System Logs</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">Giám sát tin nhắn khách, phản hồi AI & lịch trình nhắc nhở</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex bg-muted/60 p-1 rounded-lg border border-border w-fit flex-wrap gap-1">
            <Button
              variant={tab === 'messages' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTab('messages')}
              className="h-7 text-xs px-3 gap-1.5 font-medium transition-all"
            >
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>Tin nhắn & AI ({messagesLogs.length})</span>
            </Button>

            <Button
              variant={tab === 'execution' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTab('execution')}
              className="h-7 text-xs px-3 gap-1.5 font-medium transition-all"
            >
              <Clock className="w-3 h-3" />
              <span>Lịch nhắc nhở ({scheduledExecutionLogs.length})</span>
            </Button>

            <Button
              variant={tab === 'audit' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTab('audit')}
              className="h-7 text-xs px-3 gap-1.5 font-medium transition-all"
            >
              <ShieldCheck className="w-3 h-3" />
              <span>Audit Logs ({filteredAuditLogs.length})</span>
            </Button>
          </div>
        </div>

        {/* Filter & Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Tìm kiếm log..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={loading || isRefreshing}
            className="shrink-0 h-8 w-8 shadow-none border-border"
            title="Tải lại nhật ký"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading || isRefreshing ? 'animate-spin text-primary' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="max-h-[520px] overflow-y-auto pr-1 pb-1">
          <div className="space-y-2.5">
            {/* ── TAB 1: TIN NHẮN & AI ── */}
            {tab === 'messages' && (
              filteredMessagesLogs.length === 0 ? (
                <div className="py-14 px-4 text-center bg-muted/20 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-semibold text-foreground">Chưa có tin nhắn khách nào</h4>
                  <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                    Khi khách hàng gửi tin nhắn tới tài khoản Messenger, hệ thống sẽ ghi nhận và Gemini AI sẽ tự động phản hồi tại đây.
                  </p>
                </div>
              ) : (
                filteredMessagesLogs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  const details = (log.details || {}) as any;
                  const isAiReply = log.reminderId === 'ai_auto_reply' || details.actionType === 'AI_REPLY';
                  const isError = log.status === 'FAILED' || Boolean(details.error);
                  const incomingText = details.incomingMessage || '';
                  const replyText = details.replyContent || '';
                  const sender = details.senderName || 'Khách Messenger';
                  const threadClean = formatThreadDisplay(log.threadId);

                  return (
                    <div
                      key={log.id}
                      className="border border-border/80 bg-card rounded-lg overflow-hidden transition-all hover:border-border shadow-2xs"
                    >
                      {/* Clickable Card Header */}
                      <div
                        onClick={() => toggleExpand(log.id)}
                        className="p-3 flex items-start gap-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <div className="text-muted-foreground shrink-0 mt-0.5">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </div>

                        <div className="flex flex-col gap-2 min-w-0 flex-1">
                          {/* Metadata row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Status badge */}
                            {isError ? (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4.5 font-semibold">
                                Lỗi phản hồi
                              </Badge>
                            ) : isAiReply ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-2 py-0 h-4.5 gap-1 font-semibold text-purple-700 border-purple-200 bg-purple-50 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-800"
                              >
                                <Sparkles className="w-2.5 h-2.5 text-purple-500" /> AI Phản hồi
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-2 py-0 h-4.5 font-medium text-muted-foreground border-border bg-muted/30"
                              >
                                Chỉ ghi nhận
                              </Badge>
                            )}

                            {/* Sender Name */}
                            <span className="text-xs font-semibold text-foreground truncate max-w-[180px]">
                              {sender}
                            </span>

                            {/* Thread ID */}
                            <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/50">
                              {threadClean}
                            </span>

                            {/* Model Pill */}
                            {details.model && (
                              <span className="text-[10px] font-mono text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                                {details.model}
                              </span>
                            )}

                            {/* Context History Count Pill */}
                            {details.contextMessagesCount > 0 && (
                              <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800" title={`Đã đọc và hiểu ${details.contextMessagesCount} tin nhắn trước đó`}>
                                {details.contextMessagesCount} context
                              </span>
                            )}

                            {/* Target Thread Pill */}
                            {details.targetThread && (
                              <span className="text-[10px] font-mono text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800" title="Chỉ định theo liên kết cuộc hội thoại">
                                target
                              </span>
                            )}

                            {/* Timestamp */}
                            <span className="text-[11px] font-mono text-muted-foreground ml-auto shrink-0">
                              {new Date(log.executedAt).toLocaleTimeString()}
                            </span>
                          </div>

                          {/* Dialogue Bubble Area */}
                          <div className="space-y-1.5 pt-0.5">
                            {/* Customer Message Bubble */}
                            <div className="flex items-start gap-2 text-xs">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0 w-11 pt-1 select-none">
                                Khách:
                              </span>
                              <div className="bg-muted/50 text-foreground px-3 py-1.5 rounded-lg border border-border/50 max-w-[90%] leading-relaxed text-xs">
                                {incomingText || log.messagePreview}
                              </div>
                            </div>

                            {/* AI Reply Bubble */}
                            {isAiReply && replyText && (
                              <div className="flex items-start gap-2 text-xs">
                                <span className="text-[10px] font-medium uppercase tracking-wider text-purple-600 dark:text-purple-400 shrink-0 w-11 pt-1 flex items-center gap-1 select-none">
                                  <Sparkles className="w-2.5 h-2.5" /> AI:
                                </span>
                                <div className="bg-purple-50/70 dark:bg-purple-950/30 text-foreground px-3 py-1.5 rounded-lg border border-purple-200/60 dark:border-purple-800/60 max-w-[90%] leading-relaxed text-xs font-normal">
                                  {replyText}
                                </div>
                              </div>
                            )}

                            {/* AI Disabled Note */}
                            {!isAiReply && !isError && (
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pl-[52px] pt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                <span>Chế độ AI Auto-Reply đang Tắt (chỉ lưu vết tin nhắn đến)</span>
                              </div>
                            )}

                            {/* Error Note */}
                            {isError && (
                              <div className="text-[11px] text-destructive flex items-center gap-1.5 pl-[52px] pt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                                <span>{details.error || log.messagePreview}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Details View */}
                      {isExpanded && (
                        <div className="p-3 bg-muted/20 border-t border-border space-y-2.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-muted-foreground">Thread ID:</span>
                              <span className="font-mono text-foreground font-medium">{log.threadId}</span>
                              <a
                                href={getThreadUrl(log.threadId)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1 ml-1"
                              >
                                <ExternalLink className="w-3 h-3" /> Mở Messenger
                              </a>
                            </div>
                            <div className="text-muted-foreground font-mono text-[11px]">
                              Thời gian: {log.executedAt}
                            </div>
                          </div>

                          {details && (
                            <div>
                              <span className="text-[11px] font-semibold text-muted-foreground block mb-1 font-mono">Dữ liệu chi tiết:</span>
                              <pre className="p-2.5 bg-background border border-border rounded-md overflow-x-auto text-[11px] font-mono text-foreground leading-normal">
                                {JSON.stringify(details, null, 2)}
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

            {/* ── TAB 2: LỊCH NHẮC NHỞ (EXECUTION LOGS) ── */}
            {tab === 'execution' && (
              filteredExecLogs.length === 0 ? (
                <div className="py-14 text-center text-sm font-medium text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground">
                    <Clock className="w-5 h-5" />
                  </div>
                  <span>Chưa có lượt gửi nhắc nhở nào được thực thi</span>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Khi các lịch nhắc nhở đến giờ chạy hoặc khi bạn bấm "Gửi thử nghiệm", lịch sử thực thi sẽ hiển thị tại đây.
                  </p>
                </div>
              ) : (
                filteredExecLogs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  const threadClean = formatThreadDisplay(log.threadId);

                  return (
                    <div
                      key={log.id}
                      className="border border-border/80 rounded-lg overflow-hidden bg-card hover:border-border transition-colors shadow-2xs"
                    >
                      <div
                        onClick={() => toggleExpand(log.id)}
                        className="p-3 flex items-start gap-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <div className="text-muted-foreground shrink-0 mt-0.5">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </div>

                        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getStatusBadge(log.status)}

                            <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/50">
                              {threadClean}
                            </span>

                            <span className="text-[11px] font-mono text-muted-foreground ml-auto shrink-0">
                              {new Date(log.executedAt).toLocaleTimeString()}
                            </span>
                          </div>

                          <div className="text-xs font-medium text-foreground line-clamp-2 break-words">
                            {log.messagePreview}
                          </div>
                        </div>
                      </div>

                      {/* Expanded View */}
                      {isExpanded && (
                        <div className="p-3 bg-muted/20 border-t border-border space-y-2 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-b border-border/60 pb-2">
                            <div><span className="font-semibold text-muted-foreground">Log ID:</span> <span className="font-mono">{log.id}</span></div>
                            <div><span className="font-semibold text-muted-foreground">Thread ID:</span> <span className="font-mono">{log.threadId}</span></div>
                            <div><span className="font-semibold text-muted-foreground">Thời gian:</span> <span className="font-mono">{log.executedAt}</span></div>
                            <div><span className="font-semibold text-muted-foreground">Khóa đơn nhiệm:</span> <span className="font-mono truncate block">{log.idempotencyKey}</span></div>
                          </div>

                          {log.details && (
                            <div>
                              <span className="text-[11px] font-semibold text-muted-foreground block mb-1 font-mono">Chi tiết:</span>
                              <pre className="p-2.5 bg-background border border-border rounded-md overflow-x-auto text-[11px] font-mono text-foreground leading-normal">
                                {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
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

            {/* ── TAB 3: AUDIT LOGS ── */}
            {tab === 'audit' && (
              filteredAuditLogs.length === 0 ? (
                <div className="py-14 text-center text-sm font-medium text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span>Không tìm thấy nhật ký kiểm toán nào</span>
                </div>
              ) : (
                filteredAuditLogs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <div
                      key={log.id}
                      className="border border-border/80 rounded-lg overflow-hidden bg-card hover:border-border transition-colors shadow-2xs"
                    >
                      <div
                        onClick={() => toggleExpand(log.id)}
                        className="p-3 flex items-start gap-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <div className="text-muted-foreground shrink-0 mt-0.5">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </div>

                        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getLevelBadge(log.level)}
                            {getActionBadge(log.action)}

                            <span className="text-[11px] font-mono text-muted-foreground ml-auto shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>

                            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border h-4.5">
                              {log.actor}
                            </Badge>
                          </div>

                          <div className="text-xs font-medium text-foreground line-clamp-2 break-words">
                            {log.action}
                          </div>

                          {log.details && typeof log.details === 'string' && (
                            <div className="text-[11px] text-muted-foreground line-clamp-1 italic">
                              {log.details}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded View */}
                      {isExpanded && (
                        <div className="p-3 bg-muted/20 border-t border-border space-y-2 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-b border-border/60 pb-2">
                            <div><span className="font-semibold text-muted-foreground">ID:</span> <span className="font-mono">{log.id}</span></div>
                            <div><span className="font-semibold text-muted-foreground">Actor:</span> <span className="font-mono">{log.actor}</span></div>
                            <div><span className="font-semibold text-muted-foreground">Thời gian:</span> <span className="font-mono">{log.timestamp}</span></div>
                          </div>

                          {log.details && (
                            <div>
                              <span className="text-[11px] font-semibold text-muted-foreground block mb-1 font-mono">Dữ liệu chi tiết:</span>
                              <pre className="p-2.5 bg-background border border-border rounded-md overflow-x-auto text-[11px] font-mono text-foreground leading-normal">
                                {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
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
