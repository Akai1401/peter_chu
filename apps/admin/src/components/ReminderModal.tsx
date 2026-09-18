import React, { useState, useEffect } from 'react';
import { MessageCircle, PhoneCall, Video, Settings2, AlarmClock, Sparkles, Calendar, Repeat } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker } from '@/components/ui/time-picker';
import { cn } from '@/lib/utils';
import type { Reminder, CreateReminderInput } from '@messenger/shared';
import { getLocalTimeParts } from '@messenger/shared';

interface Props {
  isOpen: boolean;
  initialData?: Reminder | null;
  defaultTargetThread?: string;
  onClose: () => void;
  onSubmit: (data: CreateReminderInput & { resetRunCount?: boolean }) => Promise<void>;
  loading: boolean;
}

export const ReminderModal: React.FC<Props> = ({
  isOpen,
  initialData,
  defaultTargetThread = '',
  onClose,
  onSubmit,
  loading
}) => {
  const [scheduleRecurrence, setScheduleRecurrence] = useState<'daily' | 'date'>('daily');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetThreadId, setTargetThreadId] = useState('');
  const [actionType, setActionType] = useState<any>('MESSAGE');
  const [callDurationSeconds, setCallDurationSeconds] = useState(25);
  const [isRepeat, setIsRepeat] = useState(false);
  const [wakeUpMode, setWakeUpMode] = useState(false);
  const [aiGenerateMessage, setAiGenerateMessage] = useState(false);
  const [targetDate, setTargetDate] = useState('');
  const [runTime, setRunTime] = useState('09:00');
  const [maxRuns, setMaxRuns] = useState<number>(0);
  const [windowStart, setWindowStart] = useState('08:00');
  const [windowEnd, setWindowEnd] = useState('22:00');
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nowParts = getLocalTimeParts();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const todayStr = `${nowParts.year}-${pad(nowParts.month)}-${pad(nowParts.day)}`;
  const currentTimeStr = `${pad(nowParts.hour)}:${pad(nowParts.minute)}`;

  // For minTime constraint: current time + 1 min
  const nextMinDate = new Date();
  nextMinDate.setMinutes(nextMinDate.getMinutes() + 1);
  const nextMinParts = getLocalTimeParts(nextMinDate);
  const minTimeForToday = `${pad(nextMinParts.hour)}:${pad(nextMinParts.minute)}`;

  const isSelectedDateToday = scheduleRecurrence === 'date' && (!targetDate.trim() || targetDate.trim() === todayStr);
  const effectiveMinTime = (!isRepeat && isSelectedDateToday) ? minTimeForToday : undefined;

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setContent(initialData.content);
      setTargetThreadId(initialData.targetThreadId);
      setActionType(initialData.actionType || 'MESSAGE');
      setCallDurationSeconds(initialData.callDurationSeconds || 25);
      
      const isDailyMode = !initialData.targetDate;
      setScheduleRecurrence(isDailyMode ? 'daily' : 'date');

      const isExact = initialData.windowStart === initialData.windowEnd;
      setIsRepeat(!isExact);
      setWakeUpMode(Boolean(initialData.wakeUpMode));
      setAiGenerateMessage(Boolean(initialData.aiGenerateMessage));
      setTargetDate(initialData.targetDate || todayStr);
      setRunTime(initialData.windowStart || '09:00');
      setMaxRuns(initialData.maxRuns || 0);
      setWindowStart(initialData.windowStart || '08:00');
      setWindowEnd(initialData.windowEnd || '22:00');
      setIntervalMinutes(initialData.intervalMinutes || 10);
      setActive(initialData.active);
    } else if (isOpen) {
      setTitle('');
      setContent('');
      setTargetThreadId(defaultTargetThread || '');
      setActionType('MESSAGE');
      setCallDurationSeconds(25);
      setScheduleRecurrence('daily');
      setIsRepeat(false);
      setWakeUpMode(false);
      setAiGenerateMessage(false);

      setTargetDate(todayStr);

      // Default to 10 minutes in the future, rounded up to next 5 minutes
      const future = new Date(Date.now() + 10 * 60 * 1000);
      const roundedM = Math.ceil(future.getMinutes() / 5) * 5;
      future.setMinutes(roundedM, 0, 0);
      const fParts = getLocalTimeParts(future);
      setRunTime(`${pad(fParts.hour)}:${pad(fParts.minute)}`);

      setMaxRuns(0);
      setWindowStart('08:00');
      setWindowEnd('22:00');
      setIntervalMinutes(10);
      setActive(true);
    }
    setError(null);
  }, [initialData, isOpen, defaultTargetThread]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a reminder title');
      return;
    }

    const finalThreadId = (targetThreadId.trim() || defaultTargetThread || '').trim();
    if (!finalThreadId) {
      setError('Please enter a Target Thread ID or configure a default Target Thread first');
      return;
    }

    const isMessageRequired = actionType === 'MESSAGE' || actionType === 'MESSAGE_AND_CALL';
    if (isMessageRequired && !content.trim()) {
      setError(aiGenerateMessage ? 'Please enter a description/prompt for AI message generation' : 'Please enter message content');
      return;
    }

    if (!isRepeat && !runTime.trim()) {
      setError('Please select a scheduled time');
      return;
    }

    if (isRepeat && (!windowStart.trim() || !windowEnd.trim())) {
      setError('Please select both window start and end times');
      return;
    }

    const isDaily = scheduleRecurrence === 'daily';
    const finalTargetDate = isDaily ? null : (targetDate.trim() || todayStr);

    let finalMaxRuns: number;
    let finalWindowStart: string;
    let finalWindowEnd: string;
    let finalInterval: number;

    if (!isRepeat) {
      finalWindowStart = runTime.trim();
      finalWindowEnd = runTime.trim();
      finalInterval = 1;
      finalMaxRuns = isDaily ? 0 : 1;
    } else {
      finalWindowStart = windowStart.trim();
      finalWindowEnd = windowEnd.trim();
      finalInterval = Number(intervalMinutes) || 10;
      finalMaxRuns = Number(maxRuns) || 0;
    }

    // Validate that single-run time today is NOT in the past (only for specific date on today)
    if (!isDaily && !isRepeat && isSelectedDateToday && finalWindowStart < minTimeForToday) {
      setError(`Scheduled time (${finalWindowStart}) is earlier than current time (${currentTimeStr}). Please choose a future time!`);
      return;
    }

    try {
      await onSubmit({
        title: title.trim(),
        content: isMessageRequired ? content.trim() : (actionType === 'AUDIO_CALL' ? 'Audio Call' : 'Video Call'),
        targetThreadId: finalThreadId,
        actionType,
        callDurationSeconds: Number(callDurationSeconds),
        maxRuns: finalMaxRuns,
        targetDate: finalTargetDate,
        windowStart: finalWindowStart,
        windowEnd: finalWindowEnd,
        intervalMinutes: finalInterval,
        wakeUpMode: isRepeat ? wakeUpMode : false,
        aiGenerateMessage: isMessageRequired ? aiGenerateMessage : false,
        active,
        resetRunCount: true
      });
    } catch (err: any) {
      setError(err.message || 'Error saving reminder configuration');
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
      <div className="px-5 py-3.5 sm:px-6 sm:py-4 space-y-4">
        {error && (
          <div className="p-2.5 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-xs font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-xs font-medium">Title</Label>
            <Input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Daily standup reminder"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="target" className="text-xs font-medium">Target Thread ID / Link</Label>
              {defaultTargetThread && defaultTargetThread !== targetThreadId && (
                <button
                  type="button"
                  onClick={() => setTargetThreadId(defaultTargetThread)}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Use default thread
                </button>
              )}
            </div>
            <Input
              id="target"
              value={targetThreadId}
              onChange={(e) => setTargetThreadId(e.target.value)}
              placeholder={defaultTargetThread ? `Default: ${defaultTargetThread}` : "e.g. 1000123456789"}
              className="font-mono text-xs h-9"
            />
            {defaultTargetThread && (
              <p className="text-[10px] text-muted-foreground">
                ✓ Defaults to shared Target Thread if left blank.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Action Type</Label>
          <div className="grid grid-cols-4 gap-2">
            {actionTypes.map(type => (
              <Button
                key={type.id}
                type="button"
                variant={actionType === type.id ? "default" : "outline"}
                onClick={() => setActionType(type.id)}
                className="h-auto py-2 flex flex-col items-center justify-center gap-1 rounded-lg border transition-all"
              >
                {type.icon}
                <span className="text-[10px] font-semibold uppercase tracking-wider">{type.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {actionType !== 'MESSAGE' && (
          <div className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg border">
            <Label htmlFor="duration" className="text-xs font-medium">Ringing Duration</Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="duration"
                type="number"
                min={5}
                max={180}
                value={callDurationSeconds}
                onChange={(e) => setCallDurationSeconds(Number(e.target.value))}
                className="w-16 bg-background text-center font-mono h-8 text-xs"
              />
              <span className="text-xs text-muted-foreground font-medium">seconds</span>
            </div>
          </div>
        )}

        {(actionType === 'MESSAGE' || actionType === 'MESSAGE_AND_CALL') && (
          <div className={`space-y-2 p-3.5 rounded-xl border transition-all ${
            aiGenerateMessage
              ? 'bg-purple-500/[0.04] dark:bg-purple-950/15 border-purple-500/30'
              : 'bg-muted/20 border-border/60'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Label htmlFor="content" className="text-xs sm:text-sm font-semibold cursor-pointer text-foreground">
                  {aiGenerateMessage ? 'Prompt / Description for AI' : 'Message Content'}
                </Label>
                {aiGenerateMessage && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0 h-4.5 gap-1 font-medium border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/10">
                    <Sparkles className="w-2.5 h-2.5" /> AI Dynamic
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto pt-0.5 sm:pt-0">
                <Label htmlFor="ai-gen-toggle" className="text-xs sm:text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>Generate with AI</span>
                </Label>
                <Switch
                  id="ai-gen-toggle"
                  checked={aiGenerateMessage}
                  onCheckedChange={setAiGenerateMessage}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>
            </div>

            <Textarea
              id="content"
              required
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                aiGenerateMessage
                  ? "e.g. Remind them to sleep with a warm, cute, playful tone and friendly emojis..."
                  : "Enter message content to send..."
              }
              className="resize-y min-h-[75px] text-xs sm:text-xs bg-background focus-visible:ring-purple-500/30"
            />

            {aiGenerateMessage && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <span className="text-[10px] text-muted-foreground self-center mr-0.5">Prompt suggestions:</span>
                {[
                  'Cute, playful, affectionate',
                  'Gentle, caring & warm',
                  'Humorous, funny & energetic'
                ].map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setContent(sug)}
                    className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 text-foreground border border-border/70 transition-all cursor-pointer min-h-[26px] active:scale-95"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end items-center pt-0.5">
              <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{content.length}/2000</span>
            </div>
          </div>
        )}

        {/* ── Repeat & Schedule Section ── */}
        <div className="p-3.5 sm:p-4 bg-muted/30 rounded-xl border space-y-4">
          {/* Frequency Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Frequency</Label>
              <Badge variant={scheduleRecurrence === 'daily' ? "success" : "secondary"} className="text-[10px] px-2 py-0.5 font-medium gap-1">
                {scheduleRecurrence === 'daily' ? <Repeat className="w-2.5 h-2.5" /> : <Calendar className="w-2.5 h-2.5" />}
                {scheduleRecurrence === 'daily' ? 'Daily' : 'Specific Date'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Button
                type="button"
                variant={scheduleRecurrence === 'daily' ? "default" : "outline"}
                onClick={() => setScheduleRecurrence('daily')}
                className={cn(
                  "h-10 px-3 flex items-center justify-center gap-2 rounded-lg border transition-all font-medium text-xs",
                  scheduleRecurrence === 'daily'
                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/95"
                    : "hover:bg-muted/80 bg-background"
                )}
              >
                <Repeat className="h-4 w-4" />
                <span>Daily</span>
              </Button>

              <Button
                type="button"
                variant={scheduleRecurrence === 'date' ? "default" : "outline"}
                onClick={() => setScheduleRecurrence('date')}
                className={cn(
                  "h-10 px-3 flex items-center justify-center gap-2 rounded-lg border transition-all font-medium text-xs",
                  scheduleRecurrence === 'date'
                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/95"
                    : "hover:bg-muted/80 bg-background"
                )}
              >
                <Calendar className="h-4 w-4" />
                <span>Specific Date</span>
              </Button>
            </div>
          </div>

          {/* Target Date */}
          {scheduleRecurrence === 'date' && (
            <div className="space-y-1.5 pt-2 border-t">
              <Label className="text-xs font-medium">Scheduled Date</Label>
              <DatePicker
                value={targetDate}
                onChange={setTargetDate}
                className="w-full"
              />
            </div>
          )}

          {/* Timing Mode */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="repeat-toggle" className="text-xs font-semibold cursor-pointer">
                  Multi-run Window
                </Label>
                <Badge variant={isRepeat ? "info" : "secondary"} className="text-[10px] px-1.5 py-0.5 font-medium">
                  {isRepeat ? 'Interval Window' : 'Exact Time'}
                </Badge>
              </div>
              <Switch
                id="repeat-toggle"
                checked={isRepeat}
                onCheckedChange={setIsRepeat}
              />
            </div>

            {!isRepeat ? (
              /* Exact Time */
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-medium">Scheduled Time</Label>
                <TimePicker
                  value={runTime}
                  onChange={setRunTime}
                  minTime={effectiveMinTime}
                  className="w-full"
                />
              </div>
            ) : (
              /* Multi-run Interval Window */
              <div className="space-y-3 pt-1">
                {/* Time window */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Active Time Window</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[11px] px-1.5 font-medium text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => { setWindowStart('00:00'); setWindowEnd('23:59'); }}
                    >
                      All Day (00:00 - 23:59)
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">Start</span>
                      <TimePicker
                        value={windowStart}
                        onChange={setWindowStart}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">End</span>
                      <TimePicker
                        value={windowEnd}
                        onChange={setWindowEnd}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Repeat Interval & Max Runs */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="interval" className="text-xs font-medium">
                      Interval
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        id="interval"
                        type="number"
                        min={1}
                        max={1440}
                        value={intervalMinutes}
                        onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value) || 1))}
                        className="font-mono text-xs text-center bg-background h-9"
                      />
                      <span className="text-xs text-muted-foreground shrink-0 font-medium">mins</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="maxRuns" className="text-xs font-medium">
                      Max Runs
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        id="maxRuns"
                        type="number"
                        min={0}
                        max={9999}
                        value={maxRuns}
                        onChange={(e) => setMaxRuns(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        placeholder="0 = unlimited"
                        className="font-mono text-xs text-center bg-background h-9"
                      />
                      <span className="text-xs text-muted-foreground shrink-0 font-medium">runs</span>
                    </div>
                  </div>
                </div>

                {/* Wake-up mode */}
                <div className="pt-2.5 border-t flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <AlarmClock className="w-3.5 h-3.5 text-amber-500" />
                    <Label htmlFor="wake-up-mode" className="text-xs font-semibold cursor-pointer">
                      Wake-up Alarm Mode
                    </Label>
                    <Badge variant={wakeUpMode ? "warning" : "secondary"} className="text-[10px] px-1.5 py-0 h-4 font-medium">
                      {wakeUpMode ? 'On' : 'Off'}
                    </Badge>
                  </div>
                  <Switch
                    id="wake-up-mode"
                    checked={wakeUpMode}
                    onCheckedChange={setWakeUpMode}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <Switch 
            id="active" 
            checked={active}
            onCheckedChange={setActive}
          />
          <Label htmlFor="active" className="text-xs font-medium cursor-pointer">
            Active immediately
          </Label>
        </div>
      </div>
    </form>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 py-3.5 sm:px-6 sm:py-4 border-b shrink-0 text-left space-y-1">
          <DialogTitle className="text-base font-semibold">{initialData ? 'Edit Reminder' : 'Create New Reminder'}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure messages, calls, and automated dispatch schedules.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0">
          {formContentNode}
        </div>
        <DialogFooter className="px-5 py-3 sm:px-6 sm:py-3.5 shrink-0 border-t flex-col sm:flex-row gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="w-full sm:w-20 text-xs h-9">
            Cancel
          </Button>
          <Button type="submit" form="reminder-form" disabled={loading} className="w-full sm:w-auto text-xs h-9 font-medium">
            {loading ? 'Saving...' : initialData ? 'Save Changes' : 'Create Reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
