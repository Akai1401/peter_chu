import React, { useState, useEffect } from 'react';
import { Sparkles, MessageCircle, PhoneCall, Video, Settings2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { Reminder, CreateReminderInput } from '@messenger/shared';

interface Props {
  isOpen: boolean;
  initialData?: Reminder | null;
  onClose: () => void;
  onSubmit: (data: CreateReminderInput) => Promise<void>;
  loading: boolean;
}

export const ReminderModal: React.FC<Props> = ({
  isOpen,
  initialData,
  onClose,
  onSubmit,
  loading
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetThreadId, setTargetThreadId] = useState('');
  const [actionType, setActionType] = useState<any>('MESSAGE');
  const [callDurationSeconds, setCallDurationSeconds] = useState(25);
  const [windowStart, setWindowStart] = useState('18:00');
  const [windowEnd, setWindowEnd] = useState('22:00');
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData && isOpen) {
      setTitle(initialData.title);
      setContent(initialData.content);
      setTargetThreadId(initialData.targetThreadId);
      setActionType(initialData.actionType || 'MESSAGE');
      setCallDurationSeconds(initialData.callDurationSeconds || 25);
      setWindowStart(initialData.windowStart || '18:00');
      setWindowEnd(initialData.windowEnd || '22:00');
      setIntervalMinutes(initialData.intervalMinutes || 10);
      setActive(initialData.active);
    } else if (isOpen) {
      setTitle('');
      setContent('');
      setTargetThreadId('');
      setActionType('MESSAGE');
      setCallDurationSeconds(25);
      setWindowStart('18:00');
      setWindowEnd('22:00');
      setIntervalMinutes(10);
      setActive(true);
    }
    setError(null);
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !targetThreadId.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        targetThreadId: targetThreadId.trim(),
        actionType,
        callDurationSeconds: Number(callDurationSeconds),
        windowStart,
        windowEnd,
        intervalMinutes: Number(intervalMinutes),
        active
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save reminder');
    }
  };

  const actionTypes = [
    { id: 'MESSAGE', label: 'Message', icon: <MessageCircle className="h-4 w-4" /> },
    { id: 'AUDIO_CALL', label: 'Audio', icon: <PhoneCall className="h-4 w-4" /> },
    { id: 'VIDEO_CALL', label: 'Video', icon: <Video className="h-4 w-4" /> },
    { id: 'MESSAGE_AND_CALL', label: 'Both', icon: <Settings2 className="h-4 w-4" /> }
  ];

  const formContentNode = (
    <form id="reminder-form" onSubmit={handleSubmit} className="flex flex-col">
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Daily Standup"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target">Target Thread ID</Label>
            <Input
              id="target"
              required
              value={targetThreadId}
              onChange={(e) => setTargetThreadId(e.target.value)}
              placeholder="e.g. 1000123456789"
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Label>Action Type</Label>
          <div className="grid grid-cols-4 gap-2">
            {actionTypes.map(type => (
              <button
                key={type.id}
                type="button"
                onClick={() => setActionType(type.id)}
                className={`flex flex-col items-center justify-center gap-2 p-2 sm:p-3 rounded-md border transition-colors ${
                  actionType === type.id
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-card border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {type.icon}
                <span className="text-[10px] font-semibold uppercase tracking-wider">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {actionType !== 'MESSAGE' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 bg-muted/50 rounded-lg border">
            <Label htmlFor="duration" className="font-semibold">Ring Duration (sec)</Label>
            <Input
              id="duration"
              type="number"
              min={5}
              max={180}
              value={callDurationSeconds}
              onChange={(e) => setCallDurationSeconds(Number(e.target.value))}
              className="sm:w-24 bg-background"
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="content">Message Content</Label>
            <span className="text-xs text-muted-foreground">{content.length}/2000</span>
          </div>
          <Textarea
            id="content"
            required
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter message content..."
            className="resize-y min-h-[80px]"
          />
        </div>

        <div className="p-3 sm:p-4 bg-muted/30 rounded-lg border space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Schedule Window</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[10px] uppercase tracking-wider gap-1"
              onClick={() => { setWindowStart('18:00'); setWindowEnd('22:00'); setIntervalMinutes(10); }}
            >
              <Sparkles className="h-3 w-3" /> Default
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="space-y-2">
              <Label htmlFor="start" className="text-xs sm:text-sm">Start</Label>
              <Input
                id="start"
                type="text"
                value={windowStart}
                onChange={(e) => setWindowStart(e.target.value)}
                className="text-center font-mono text-xs sm:text-sm px-1 sm:px-3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end" className="text-xs sm:text-sm">End</Label>
              <Input
                id="end"
                type="text"
                value={windowEnd}
                onChange={(e) => setWindowEnd(e.target.value)}
                className="text-center font-mono text-xs sm:text-sm px-1 sm:px-3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interval" className="text-xs sm:text-sm truncate">Interval(m)</Label>
              <Input
                id="interval"
                type="number"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                className="text-center font-mono text-xs sm:text-sm px-1 sm:px-3"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2 pb-6 sm:pb-0">
          <Switch 
            id="active" 
            checked={active}
            onCheckedChange={setActive}
          />
          <Label htmlFor="active" className="cursor-pointer">
            Active Status
          </Label>
        </div>
      </div>
    </form>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-lg">
        <DialogHeader className="p-4 sm:p-6 pb-2 shrink-0 text-left">
          <DialogTitle>{initialData ? 'Edit Configuration' : 'New Configuration'}</DialogTitle>
          <DialogDescription>
            Configure the automated message and call behavior for this schedule.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0">
          {formContentNode}
        </div>
        <DialogFooter className="p-4 sm:p-6 pt-2 sm:pt-4 shrink-0 border-t flex-col sm:flex-row gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="w-full sm:w-24">
            Cancel
          </Button>
          <Button type="submit" form="reminder-form" disabled={loading} className="w-full sm:w-auto">
            {loading ? 'Saving...' : initialData ? 'Save Configuration' : 'Create Configuration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
