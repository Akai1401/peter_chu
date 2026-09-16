import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  MessageCircleHeart,
  Sparkles,
  Clock,
  Send,
  RefreshCw,
  Check,
  Calendar,
  HelpCircle,
  Link2
} from 'lucide-react';
import type { ProactiveChatConfig } from '@messenger/shared';
import { api } from '@/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultThreadUrl?: string;
  onNotify?: (message: string, type: 'success' | 'error' | 'info') => void;
  onSuccess?: () => void;
}

const TOPIC_SUGGESTIONS = [
  'Hỏi thăm đang làm gì đó',
  'Trêu đùa lầy lội, vui vẻ',
  'Rủ đi cafe / ăn uống',
  'Hỏi dạo này công việc thế nào',
  'Thả thính nhẹ nhàng'
];

export const ProactiveChatModal: React.FC<Props> = ({
  isOpen,
  onClose,
  defaultThreadUrl = '',
  onNotify,
  onSuccess
}) => {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [targetThread, setTargetThread] = useState<string>('');
  const [minIntervalMinutes, setMinIntervalMinutes] = useState<number>(120);
  const [maxIntervalMinutes, setMaxIntervalMinutes] = useState<number>(360);
  const [activeHoursStart, setActiveHoursStart] = useState<string>('08:00');
  const [activeHoursEnd, setActiveHoursEnd] = useState<string>('22:30');
  const [promptGuidance, setPromptGuidance] = useState<string>('');
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [nextScheduledAt, setNextScheduledAt] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  // Load configuration on open
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      api
        .getProactiveConfig()
        .then((config) => {
          if (config) {
            setEnabled(Boolean(config.enabled));
            setTargetThread(config.targetThread || defaultThreadUrl || '');
            setMinIntervalMinutes(config.minIntervalMinutes || 120);
            setMaxIntervalMinutes(config.maxIntervalMinutes || 360);
            setActiveHoursStart(config.activeHoursStart || '08:00');
            setActiveHoursEnd(config.activeHoursEnd || '22:30');
            setPromptGuidance(
              config.promptGuidance ||
                'Hỏi thăm bạn bè/khách hàng xem đang làm gì đó, trêu đùa lầy lội hoặc rủ đi ăn/cafe'
            );
            setLastSentAt(config.lastSentAt || null);
            setNextScheduledAt(config.nextScheduledAt || null);
          }
        })
        .catch((err: any) => {
          console.warn('Could not load proactive chat config:', err.message);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, defaultThreadUrl]);

  const handleSave = async () => {
    if (enabled && !targetThread.trim()) {
      onNotify?.('Vui lòng nhập link cuộc hội thoại để bot biết cần nhắn cho ai!', 'error');
      return;
    }

    if (minIntervalMinutes < 5) {
      onNotify?.('Khoảng cách tối thiểu phải từ 5 phút trở lên', 'error');
      return;
    }

    if (maxIntervalMinutes < minIntervalMinutes) {
      onNotify?.('Khoảng cách tối đa phải lớn hơn khoảng cách tối thiểu', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<ProactiveChatConfig> = {
        enabled,
        targetThread: targetThread.trim(),
        minIntervalMinutes: Number(minIntervalMinutes),
        maxIntervalMinutes: Number(maxIntervalMinutes),
        activeHoursStart,
        activeHoursEnd,
        promptGuidance: promptGuidance.trim()
      };

      await api.updateProactiveConfig(payload);
      onNotify?.(
        enabled
          ? 'Đã bật chế độ chủ động nhắn tin ngẫu nhiên!'
          : 'Đã tắt chế độ chủ động nhắn tin.',
        'success'
      );
      onSuccess?.();
      onClose();
    } catch (err: any) {
      onNotify?.(err.message || 'Lỗi khi lưu cấu hình', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNow = async () => {
    const target = targetThread.trim() || defaultThreadUrl.trim();
    if (!target) {
      onNotify?.('Vui lòng nhập link cuộc hội thoại để thử nghiệm!', 'error');
      return;
    }

    setIsTesting(true);
    try {
      await api.testProactiveMessage(target);
      onNotify?.('Đã gửi lệnh thử nghiệm! Bot đang chuẩn bị câu mở lời...', 'info');
      setTimeout(async () => {
        try {
          const cfg = await api.getProactiveConfig();
          setLastSentAt(cfg.lastSentAt || null);
          setNextScheduledAt(cfg.nextScheduledAt || null);
        } catch {}
      }, 4000);
    } catch (err: any) {
      onNotify?.(err.message || 'Lỗi khi thử gửi tin nhắn chủ động', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const formatTimestamp = (isoString?: string | null) => {
    if (!isoString) return 'Chưa có';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto p-5">
        <DialogHeader className="space-y-1.5 pb-2.5 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground shrink-0">
              <MessageCircleHeart className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                Chủ động Nói chuyện (Proactive Chat)
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-border">
                  Auto-Initiate
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Tự động chọn thời điểm ngẫu nhiên để nhắn tin hỏi thăm hoặc trêu đùa theo văn phong cá nhân
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-3.5">
          {/* Main Switch Card */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/80">
            <div className="space-y-0.5 pr-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="proactive-switch" className="text-xs font-semibold text-foreground cursor-pointer">
                  Kích hoạt chủ động nhắn tin
                </Label>
                {enabled ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Đang bật
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    Đang tắt
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Bot sẽ tự động chọn thời điểm ngẫu nhiên trong ngày để nhắn mà không cần đợi khách nhắn trước.
              </p>
            </div>
            <Switch
              id="proactive-switch"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {/* Target Thread Link */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                Hội thoại Messenger mục tiêu: <span className="text-destructive">*</span>
              </Label>
              {defaultThreadUrl && defaultThreadUrl !== targetThread && (
                <button
                  type="button"
                  onClick={() => setTargetThread(defaultThreadUrl)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Dùng link đang theo dõi
                </button>
              )}
            </div>
            <Input
              value={targetThread}
              onChange={(e) => setTargetThread(e.target.value)}
              placeholder="VD: https://www.facebook.com/messages/t/100040388333156 hoặc ID số"
              className="text-xs font-mono h-8 bg-background"
            />
          </div>

          {/* Random Wait Interval (Min - Max) */}
          <div className="p-3 bg-muted/20 rounded-lg border border-border/80 space-y-2">
            <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              Khoảng cách thời gian ngẫu nhiên giữa 2 lần nhắn:
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Tối thiểu (phút):</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    step={15}
                    value={minIntervalMinutes}
                    onChange={(e) => setMinIntervalMinutes(Number(e.target.value))}
                    className="text-xs h-8 font-mono bg-background"
                  />
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    ({(minIntervalMinutes / 60).toFixed(1)}h)
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Tối đa (phút):</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={10}
                    max={2880}
                    step={15}
                    value={maxIntervalMinutes}
                    onChange={(e) => setMaxIntervalMinutes(Number(e.target.value))}
                    className="text-xs h-8 font-mono bg-background"
                  />
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    ({(maxIntervalMinutes / 60).toFixed(1)}h)
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 pt-0.5">
              <HelpCircle className="w-3 h-3 text-muted-foreground shrink-0" />
              Bot sẽ bốc ngẫu nhiên từ {minIntervalMinutes} đến {maxIntervalMinutes} phút sau mỗi lần nhắn để lên lịch lần kế tiếp.
            </p>
          </div>

          {/* Active Hours in day */}
          <div className="p-3 bg-muted/20 rounded-lg border border-border/80 space-y-2">
            <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              Khung giờ cho phép nhắn trong ngày (Giờ Việt Nam):
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Bắt đầu từ:</span>
                <Input
                  type="time"
                  value={activeHoursStart}
                  onChange={(e) => setActiveHoursStart(e.target.value)}
                  className="text-xs h-8 font-mono bg-background"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Kết thúc lúc:</span>
                <Input
                  type="time"
                  value={activeHoursEnd}
                  onChange={(e) => setActiveHoursEnd(e.target.value)}
                  className="text-xs h-8 font-mono bg-background"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Ngoài khung giờ này (ví dụ đêm khuya), bot sẽ giữ im lặng tuyệt đối.
            </p>
          </div>

          {/* Prompt Guidance & Quick Selectors */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                Định hướng chủ đề mở lời:
              </Label>
              <span className="text-[10px] text-muted-foreground">Tự động kết hợp với Văn phong đã học</span>
            </div>

            <Textarea
              rows={2}
              value={promptGuidance}
              onChange={(e) => setPromptGuidance(e.target.value)}
              placeholder="VD: Hỏi thăm đang làm gì đó, trêu đùa lầy lội hoặc rủ đi ăn/cafe..."
              className="text-xs bg-background resize-none"
            />

            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-1 items-center pt-0.5">
              <span className="text-[10px] text-muted-foreground mr-0.5">Gợi ý nhanh:</span>
              {TOPIC_SUGGESTIONS.map((topic, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPromptGuidance(topic)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted hover:bg-muted/80 text-foreground border border-border/80 transition-colors cursor-pointer"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Status & Preview */}
          <div className="p-2.5 bg-muted/30 rounded-lg border border-border/70 space-y-1 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Lần gửi gần nhất:</span>
              <span className="text-foreground font-mono text-[11px] font-medium">{formatTimestamp(lastSentAt)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Dự kiến gửi lần tiếp theo:</span>
              <span className="text-foreground font-mono text-[11px] font-medium">
                {enabled ? formatTimestamp(nextScheduledAt) : 'Đang tắt'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer with Test Trigger & Save Button */}
        <DialogFooter className="pt-3 border-t sm:justify-between items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestNow}
            disabled={isTesting || !targetThread.trim()}
            className="text-xs h-8 px-3 gap-1.5 font-medium"
            title="Thử nghiệm tạo câu mở đầu và gửi tin nhắn ngay lập tức"
          >
            {isTesting ? (
              <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : (
              <Send className="w-3 h-3 text-muted-foreground" />
            )}
            <span>{isTesting ? 'Đang gửi thử...' : 'Gửi thử nghiệm'}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-8 px-3"
            >
              Đóng
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="text-xs h-8 px-3.5 gap-1.5 shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
