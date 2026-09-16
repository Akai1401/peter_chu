import React, { useState } from 'react';
import {
  Bell,
  Clock,
  Send,
  Edit2,
  Trash2,
  Plus,
  Hash,
  PhoneCall,
  Video,
  MoreVertical,
  Power,
  Repeat,
  Calendar,
  RotateCcw
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Reminder, BotState } from '@messenger/shared';
import { diagnoseReminder } from '@messenger/shared';
import { cn } from '@/lib/utils';

interface Props {
  reminders: Reminder[];
  botState?: BotState | null;
  onToggle: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<void>;
  onCall: (id: string, callType?: 'AUDIO' | 'VIDEO') => Promise<void>;
  onEdit: (reminder: Reminder) => void;
  onDelete: (id: string) => Promise<void>;
  onAddNew: () => void;
  onNotify?: (msg: string, type?: 'info' | 'warning' | 'error') => void;
  loading: boolean;
}

export const ReminderList: React.FC<Props> = ({
  reminders,
  botState,
  onToggle,
  onTest,
  onCall,
  onEdit,
  onDelete,
  onAddNew,
  onNotify,
  loading
}) => {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [callingState, setCallingState] = useState<{ id: string; type: 'AUDIO' | 'VIDEO' } | null>(null);

  const handleTestClick = async (id: string) => {
    setTestingId(id);
    try {
      await onTest(id);
    } finally {
      setTestingId(null);
    }
  };

  const handleCallClick = async (id: string, callType: 'AUDIO' | 'VIDEO' = 'AUDIO') => {
    setCallingState({ id, type: callType });
    try {
      await onCall(id, callType);
    } finally {
      setCallingState(null);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted border flex items-center justify-center">
            <Bell className="w-4 h-4 text-foreground" />
          </div>
          <CardTitle className="text-lg flex items-center gap-2">
            Reminders <span className="text-muted-foreground text-sm font-medium">({reminders.length})</span>
          </CardTitle>
        </div>
        <Button onClick={onAddNew} disabled={loading} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> New Reminder
        </Button>
      </CardHeader>

      <CardContent className="pt-4 sm:pt-6 flex-1 flex flex-col min-h-0">
        {reminders.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center bg-muted/30 rounded-lg border border-dashed">
            <div className="w-12 h-12 rounded-lg bg-background border flex items-center justify-center mb-4 text-muted-foreground">
              <Bell className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold mb-1">No reminders set</h3>
            <p className="text-sm text-muted-foreground mb-6">Create a reminder to automate your Messenger tasks.</p>
            <Button onClick={onAddNew} variant="outline">
              Create First Reminder
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {reminders.map((reminder) => {
              const isTesting = testingId === reminder.id;
              const isCallingAudio = callingState?.id === reminder.id && callingState.type === 'AUDIO';
              const isCallingVideo = callingState?.id === reminder.id && callingState.type === 'VIDEO';
              const isAnyActionBusy = isTesting || isCallingAudio || isCallingVideo;

              const diagnosis = diagnoseReminder(reminder, botState?.status, botState?.sessionStatus);
              const isCompleted = diagnosis.isCompleted;
              const isPastDue = diagnosis.isPastDue;

              const handleToggleClick = () => {
                if (isPastDue && !reminder.active) {
                  onNotify?.(
                    `Không thể kích hoạt: Lịch chạy (${reminder.windowStart}) đã quá thời gian hiện tại. Vui lòng chọn thời gian mới!`,
                    'warning'
                  );
                  onEdit(reminder);
                  return;
                }
                onToggle(reminder.id);
              };

              return (
                <div
                  key={reminder.id}
                  className={`overflow-hidden rounded-lg border transition-colors ${
                    isPastDue
                      ? 'border-destructive/40 bg-card shadow-sm'
                      : reminder.active
                      ? 'bg-card'
                      : 'bg-muted/30 opacity-80'
                  }`}
                >
                  {/* ── Header: title / badges / action menu ── */}
                  <div className="flex items-start justify-between gap-2 p-4 pb-2">
                    <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold truncate">{reminder.title}</h3>
                        {isPastDue ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 shrink-0 border-destructive/40 text-destructive bg-destructive/10 font-semibold"
                          >
                            Đã quá giờ
                          </Badge>
                        ) : isCompleted ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 shrink-0 border-amber-500/30 text-amber-600 bg-amber-500/10 font-semibold"
                          >
                            Done ({reminder.runCount || 0}/{reminder.maxRuns})
                          </Badge>
                        ) : (
                          <Badge
                            variant={reminder.active ? 'success' : 'secondary'}
                            className="text-[10px] px-1.5 py-0 shrink-0"
                          >
                            {reminder.active ? 'Active' : 'Paused'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(!reminder.actionType || reminder.actionType === 'MESSAGE') && (
                          <Badge variant="outline" className="text-[10px]">Message</Badge>
                        )}
                        {reminder.actionType === 'AUDIO_CALL' && (
                          <Badge variant="outline" className="text-[10px]">
                            Audio Call ({reminder.callDurationSeconds || 25}s)
                          </Badge>
                        )}
                        {reminder.actionType === 'VIDEO_CALL' && (
                          <Badge variant="outline" className="text-[10px]">
                            Video Call ({reminder.callDurationSeconds || 25}s)
                          </Badge>
                        )}
                        {reminder.actionType === 'MESSAGE_AND_CALL' && (
                          <Badge variant="outline" className="text-[10px]">
                            Msg + Call ({reminder.callDurationSeconds || 25}s)
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Action buttons — desktop shows Pause/Edit/Delete inline; mobile via dropdown */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="hidden sm:flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleToggleClick}
                          disabled={loading}
                          className={`h-8 px-2.5 text-xs gap-1.5 ${
                            reminder.active
                              ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                              : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                          }`}
                          title={
                            reminder.active
                              ? 'Pause Schedule'
                              : isPastDue
                              ? 'Lịch chạy đã quá giờ. Bấm để sửa giờ mới.'
                              : isCompleted
                              ? 'Restart Schedule (Run count resets to 0)'
                              : 'Start Schedule'
                          }
                        >
                          {isCompleted && !reminder.active ? (
                            <>
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Restart</span>
                            </>
                          ) : (
                            <>
                              <Power className="h-3.5 w-3.5" />
                              <span>{reminder.active ? 'Pause' : 'Start'}</span>
                            </>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEdit(reminder)}
                          disabled={loading}
                          className="h-8 px-2.5 text-xs gap-1.5"
                          title="Edit"
                        >
                          <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>Edit</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this reminder?')) {
                              onDelete(reminder.id);
                            }
                          }}
                          disabled={loading}
                          className="h-8 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="More options">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {/* Mobile: management actions */}
                          <div className="sm:hidden">
                            <DropdownMenuItem onClick={handleToggleClick} className="gap-2">
                              {isCompleted && !reminder.active ? (
                                <>
                                  <RotateCcw className="h-4 w-4 text-emerald-600" /> Restart Schedule
                                </>
                              ) : (
                                <>
                                  <Power className="h-4 w-4" />
                                  {reminder.active ? 'Pause Schedule' : 'Start Schedule'}
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onEdit(reminder)} className="gap-2">
                              <Edit2 className="h-4 w-4 text-muted-foreground" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                if (window.confirm('Are you sure you want to delete this reminder?')) {
                                  onDelete(reminder.id);
                                }
                              }}
                              className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" /> Delete Reminder
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </div>
                          {/* Test actions (all screen sizes) */}
                          <DropdownMenuItem onClick={() => handleTestClick(reminder.id)} disabled={isAnyActionBusy} className="gap-2">
                            <Send className={`h-4 w-4 ${isTesting ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
                            Test Message
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCallClick(reminder.id, 'AUDIO')} disabled={isAnyActionBusy} className="gap-2">
                            <PhoneCall className={`h-4 w-4 ${isCallingAudio ? 'animate-pulse text-cyan-500' : 'text-muted-foreground'}`} />
                            Test Voice Call
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCallClick(reminder.id, 'VIDEO')} disabled={isAnyActionBusy} className="gap-2">
                            <Video className={`h-4 w-4 ${isCallingVideo ? 'animate-pulse text-purple-500' : 'text-muted-foreground'}`} />
                            Test Video Call
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* ── Message content ── */}
                  <div className="px-4 pb-2">
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {reminder.actionType === 'AUDIO_CALL' ? (
                        <span className="italic">Audio call reminder (no text message)</span>
                      ) : reminder.actionType === 'VIDEO_CALL' ? (
                        <span className="italic">Video call reminder (no text message)</span>
                      ) : (
                        reminder.content
                      )}
                    </p>
                  </div>

                  {/* ── Metadata chips (flex-wrap, never overflows) ── */}
                  <div className="px-4 pb-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <div className="flex items-start gap-1 border px-2 py-1 rounded-md bg-muted min-w-0">
                      <Hash className="h-3 w-3 shrink-0 mt-0.5" />
                      <span className="break-all">{reminder.targetThreadId}</span>
                    </div>
                    <div className={cn(
                      "flex items-center gap-1 border px-2 py-1 rounded-md whitespace-nowrap",
                      isPastDue ? "bg-destructive/10 border-destructive/30 text-destructive font-medium" : "bg-muted"
                    )}>
                      <Clock className={cn("h-3 w-3 shrink-0", isPastDue && "text-destructive")} />
                      {reminder.maxRuns === 1 || reminder.windowStart === reminder.windowEnd ? (
                        <span>{reminder.windowStart} (1 lần){isPastDue ? ' - Đã quá giờ' : ''}</span>
                      ) : (
                        <span>{reminder.windowStart}–{reminder.windowEnd} ({reminder.intervalMinutes}m){isPastDue ? ' - Đã quá giờ' : ''}</span>
                      )}
                    </div>
                    {Boolean(reminder.targetDate) && (
                      <div className={cn(
                        "flex items-center gap-1 border px-2 py-1 rounded-md whitespace-nowrap",
                        isPastDue ? "bg-destructive/10 border-destructive/30 text-destructive font-medium" : "bg-muted"
                      )}>
                        <Calendar className={cn("h-3 w-3 shrink-0", isPastDue && "text-destructive")} />
                        <span>{reminder.targetDate}</span>
                      </div>
                    )}
                    {Boolean(reminder.maxRuns && reminder.maxRuns > 0) && (
                      <div className="flex items-center gap-1 border px-2 py-1 rounded-md bg-muted whitespace-nowrap">
                        <Repeat className="h-3 w-3 shrink-0" />
                        <span>{reminder.runCount || 0}/{reminder.maxRuns} {reminder.maxRuns === 1 ? 'lần' : 'runs'}</span>
                        {isCompleted && (
                          <span className="text-[10px] text-amber-500 font-semibold ml-1">(Done)</span>
                        )}
                      </div>
                    )}
                  </div>


                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
