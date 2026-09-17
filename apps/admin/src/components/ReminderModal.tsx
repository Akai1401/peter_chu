import React, { useState, useEffect } from 'react';
import { MessageCircle, PhoneCall, Video, Settings2, AlarmClock, Sparkles } from 'lucide-react';
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
import type { Reminder, CreateReminderInput } from '@messenger/shared';
import { getLocalTimeParts } from '@messenger/shared';

interface Props {
  isOpen: boolean;
  initialData?: Reminder | null;
  onClose: () => void;
  onSubmit: (data: CreateReminderInput & { resetRunCount?: boolean }) => Promise<void>;
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

  const isSelectedDateToday = !targetDate.trim() || targetDate.trim() === todayStr;
  const effectiveMinTime = (!isRepeat && isSelectedDateToday) ? minTimeForToday : undefined;

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setContent(initialData.content);
      setTargetThreadId(initialData.targetThreadId);
      setActionType(initialData.actionType || 'MESSAGE');
      setCallDurationSeconds(initialData.callDurationSeconds || 25);
      
      const isSingle = initialData.maxRuns === 1 || initialData.windowStart === initialData.windowEnd;
      setIsRepeat(!isSingle);
      setWakeUpMode(Boolean(initialData.wakeUpMode));
      setAiGenerateMessage(Boolean(initialData.aiGenerateMessage));
      setTargetDate(initialData.targetDate || '');
      setRunTime(initialData.windowStart || minTimeForToday);
      setMaxRuns(initialData.maxRuns || 0);
      setWindowStart(initialData.windowStart || '08:00');
      setWindowEnd(initialData.windowEnd || '22:00');
      setIntervalMinutes(initialData.intervalMinutes || 10);
      setActive(initialData.active);
    } else if (isOpen) {
      setTitle('');
      setContent('');
      setTargetThreadId('');
      setActionType('MESSAGE');
      setCallDurationSeconds(25);
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
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetThreadId.trim()) {
      setError('Vui lòng điền tiêu đề và Thread ID');
      return;
    }

    const isMessageRequired = actionType === 'MESSAGE' || actionType === 'MESSAGE_AND_CALL';
    if (isMessageRequired && !content.trim()) {
      setError(aiGenerateMessage ? 'Vui lòng nhập mô tả/yêu cầu cho AI sinh tin nhắn' : 'Vui lòng nhập nội dung tin nhắn');
      return;
    }

    if (!isRepeat && !runTime.trim()) {
      setError('Vui lòng chọn giờ chạy');
      return;
    }

    if (isRepeat && (!windowStart.trim() || !windowEnd.trim())) {
      setError('Vui lòng chọn khung giờ bắt đầu và kết thúc');
      return;
    }

    const finalMaxRuns = isRepeat ? (Number(maxRuns) || 0) : 1;
    const finalWindowStart = isRepeat ? windowStart.trim() : runTime.trim();
    const finalWindowEnd = isRepeat ? windowEnd.trim() : runTime.trim();
    const finalInterval = isRepeat ? (Number(intervalMinutes) || 10) : 1;
    const finalTargetDate = targetDate.trim() ? targetDate.trim() : null;

    // Validate that single-run time today is NOT in the past
    if (!isRepeat && isSelectedDateToday && finalWindowStart < minTimeForToday) {
      setError(`Thời gian chạy (${finalWindowStart}) đã nhỏ hơn thời gian hiện tại (${currentTimeStr}). Vui lòng chọn giờ trong tương lai!`);
      return;
    }

    try {
      await onSubmit({
        title: title.trim(),
        content: isMessageRequired ? content.trim() : (actionType === 'AUDIO_CALL' ? 'Audio Call' : 'Video Call'),
        targetThreadId: targetThreadId.trim(),
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
      setError(err.message || 'Lỗi khi lưu cấu hình');
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
            <Label htmlFor="title" className="text-xs font-medium">Tiêu đề</Label>
            <Input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Nhắc việc hàng ngày"
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="target" className="text-xs font-medium">Target Thread ID / Link</Label>
            <Input
              id="target"
              required
              value={targetThreadId}
              onChange={(e) => setTargetThreadId(e.target.value)}
              placeholder="e.g. 1000123456789"
              className="font-mono text-xs h-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Hành động</Label>
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
            <Label htmlFor="duration" className="text-xs font-medium">Thời lượng chuông</Label>
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
              <span className="text-xs text-muted-foreground font-medium">giây</span>
            </div>
          </div>
        )}

        {(actionType === 'MESSAGE' || actionType === 'MESSAGE_AND_CALL') && (
          <div className="space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/60">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="content" className="text-xs font-semibold cursor-pointer">
                  {aiGenerateMessage ? 'Mô tả / Prompt tin nhắn cho AI' : 'Nội dung tin nhắn'}
                </Label>
                {aiGenerateMessage && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-1 font-medium border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/10">
                    <Sparkles className="w-2.5 h-2.5" /> AI Dynamic
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="ai-gen-toggle" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                  <Sparkles className="w-3 h-3 text-purple-500" />
                  <span>Dùng AI sinh</span>
                </Label>
                <Switch
                  id="ai-gen-toggle"
                  checked={aiGenerateMessage}
                  onCheckedChange={setAiGenerateMessage}
                  className="data-[state=checked]:bg-purple-600 scale-90"
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
                  ? "Ví dụ: Nhắc bạn ấy đi ngủ bằng giọng điệu trêu đùa, cute, xưng hô anh - em, thêm icon dễ thương..."
                  : "Nhập nội dung tin nhắn gửi..."
              }
              className="resize-y min-h-[75px] text-xs bg-background"
            />
            <div className="flex justify-between items-center pt-0.5">
              {aiGenerateMessage ? (
                <p className="text-[11px] text-muted-foreground leading-tight flex items-center gap-1">
                  <span>Mỗi lần chạy lịch, AI sẽ tự động sinh tin nhắn mới mẻ dựa trên mô tả này và văn phong hiện tại.</span>
                </p>
              ) : (
                <span />
              )}
              <span className="text-[10px] text-muted-foreground shrink-0 font-mono">{content.length}/2000</span>
            </div>
          </div>
        )}

        {/* ── Repeat & Schedule Section ── */}
        <div className="p-3.5 sm:p-4 bg-muted/30 rounded-xl border space-y-3.5">
          {/* Header toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="repeat-toggle" className="text-xs font-semibold cursor-pointer">
                Lặp lại
              </Label>
              <Badge variant={isRepeat ? "info" : "secondary"} className="text-[10px] px-1.5 py-0 h-4 font-medium">
                {isRepeat ? 'Bật' : 'Tắt (Chạy 1 lần)'}
              </Badge>
            </div>
            <Switch
              id="repeat-toggle"
              checked={isRepeat}
              onCheckedChange={setIsRepeat}
            />
          </div>

          {!isRepeat ? (
            /* Chạy 1 lần: Chọn Ngày & Giờ chạy */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Ngày chạy</Label>
                <DatePicker
                  value={targetDate}
                  onChange={setTargetDate}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Giờ chạy</Label>
                <TimePicker
                  value={runTime}
                  onChange={setRunTime}
                  minTime={effectiveMinTime}
                  className="w-full"
                />
              </div>
            </div>
          ) : (
            /* Lặp lại: Khung giờ + Khoảng cách + Số lần lặp max */
            <div className="space-y-3 pt-1 border-t">
              {/* Khung giờ */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Khung giờ chạy</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[11px] px-1.5 font-medium text-primary hover:text-primary hover:bg-primary/10"
                    onClick={() => { setWindowStart('00:00'); setWindowEnd('23:59'); }}
                  >
                    Cả ngày (00:00 - 23:59)
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium">Bắt đầu</span>
                    <TimePicker
                      value={windowStart}
                      onChange={setWindowStart}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium">Kết thúc</span>
                    <TimePicker
                      value={windowEnd}
                      onChange={setWindowEnd}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Tần suất lặp & Số lần tối đa */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="interval" className="text-xs font-medium">
                    Mỗi lần cách nhau
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
                    <span className="text-xs text-muted-foreground shrink-0 font-medium">phút</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="maxRuns" className="text-xs font-medium">
                    Số lần lặp max
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="maxRuns"
                      type="number"
                      min={0}
                      max={9999}
                      value={maxRuns}
                      onChange={(e) => setMaxRuns(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      placeholder="0 = vô hạn"
                      className="font-mono text-xs text-center bg-background h-9"
                    />
                    <span className="text-xs text-muted-foreground shrink-0 font-medium">lần</span>
                  </div>
                </div>
              </div>

              {/* Chế độ gọi dậy (Wake-up Alarm) */}
              <div className="pt-2.5 border-t flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <AlarmClock className="w-3.5 h-3.5 text-amber-500" />
                    <Label htmlFor="wake-up-mode" className="text-xs font-semibold cursor-pointer">
                      Chế độ gọi dậy
                    </Label>
                    <Badge variant={wakeUpMode ? "warning" : "secondary"} className="text-[10px] px-1.5 py-0 h-4 font-medium">
                      {wakeUpMode ? 'Bật' : 'Tắt'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Tự động dừng lặp khi khách nghe máy, tắt máy hoặc gửi tin nhắn lại.
                  </p>
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

        <div className="flex items-center gap-2.5 pt-1">
          <Switch 
            id="active" 
            checked={active}
            onCheckedChange={setActive}
          />
          <Label htmlFor="active" className="text-xs font-medium cursor-pointer">
            Kích hoạt ngay (Active)
          </Label>
        </div>
      </div>
    </form>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[95vw] sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 py-3.5 sm:px-6 sm:py-4 border-b shrink-0 text-left space-y-1">
          <DialogTitle className="text-base font-semibold">{initialData ? 'Sửa cấu hình' : 'Tạo nhắc nhở mới'}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Thiết lập tin nhắn, cuộc gọi và lịch trình gửi tự động.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0">
          {formContentNode}
        </div>
        <DialogFooter className="px-5 py-3 sm:px-6 sm:py-3.5 shrink-0 border-t flex-col sm:flex-row gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="w-full sm:w-20 text-xs h-9">
            Hủy
          </Button>
          <Button type="submit" form="reminder-form" disabled={loading} className="w-full sm:w-auto text-xs h-9 font-medium">
            {loading ? 'Đang lưu...' : initialData ? 'Lưu thay đổi' : 'Tạo nhắc nhở'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
