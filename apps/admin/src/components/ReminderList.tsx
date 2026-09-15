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
  MoreVertical,
  Power
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
import type { Reminder } from '@messenger/shared';

interface Props {
  reminders: Reminder[];
  onToggle: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<void>;
  onCall: (id: string, callType?: 'AUDIO' | 'VIDEO') => Promise<void>;
  onEdit: (reminder: Reminder) => void;
  onDelete: (id: string) => Promise<void>;
  onAddNew: () => void;
  loading: boolean;
}

export const ReminderList: React.FC<Props> = ({
  reminders,
  onToggle,
  onTest,
  onCall,
  onEdit,
  onDelete,
  onAddNew,
  loading
}) => {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [callingId, setCallingId] = useState<string | null>(null);

  const handleTestClick = async (id: string) => {
    setTestingId(id);
    try {
      await onTest(id);
    } finally {
      setTestingId(null);
    }
  };

  const handleCallClick = async (id: string, callType: 'AUDIO' | 'VIDEO' = 'AUDIO') => {
    setCallingId(id);
    try {
      await onCall(id, callType);
    } finally {
      setCallingId(null);
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
          <div className="grid gap-4">
            {reminders.map((reminder) => {
              const isTesting = testingId === reminder.id;
              const isCalling = callingId === reminder.id;

              return (
                <div
                  key={reminder.id}
                  className={`relative p-4 rounded-lg border transition-colors ${
                    reminder.active
                      ? 'bg-card'
                      : 'bg-muted/30 opacity-80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                    <div className="flex flex-col gap-2 pr-8 sm:pr-0 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold break-words">{reminder.title}</h3>
                        <Badge variant={reminder.active ? "success" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {reminder.active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
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

                    {/* Actions Menu */}
                    <div className="absolute sm:relative top-3 sm:top-0 right-3 sm:right-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => onToggle(reminder.id)} className="gap-2">
                            <Power className="h-4 w-4" />
                            {reminder.active ? 'Pause Schedule' : 'Start Schedule'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEdit(reminder)} className="gap-2">
                            <Edit2 className="h-4 w-4 text-muted-foreground" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleTestClick(reminder.id)} disabled={isTesting} className="gap-2">
                            <Send className={`h-4 w-4 ${isTesting ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
                            Test Message
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCallClick(reminder.id, reminder.actionType === 'VIDEO_CALL' ? 'VIDEO' : 'AUDIO')} disabled={isCalling} className="gap-2">
                            <PhoneCall className={`h-4 w-4 ${isCalling ? 'animate-pulse text-primary' : 'text-muted-foreground'}`} />
                            Test Call
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onDelete(reminder.id)} className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10">
                            <Trash2 className="h-4 w-4" /> Delete Reminder
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3 leading-relaxed break-words break-all sm:break-words">
                    {reminder.content}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 border px-2 py-1 rounded-md break-all bg-muted">
                      <Hash className="h-3 w-3" />
                      {reminder.targetThreadId}
                    </div>
                    <div className="flex items-center gap-1.5 border px-2 py-1 rounded-md whitespace-nowrap bg-muted">
                      <Clock className="h-3 w-3" />
                      {reminder.windowStart} - {reminder.windowEnd} ({reminder.intervalMinutes}m)
                    </div>
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
