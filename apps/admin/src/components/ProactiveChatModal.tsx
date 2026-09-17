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
    const finalTarget = targetThread.trim() || defaultThreadUrl.trim();
    if (enabled && !finalTarget) {
      onNotify?.('Vui lòng cấu hình Target Thread chung trước khi kích hoạt chủ động nhắn tin!', 'error');
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
      await api.updateProactiveConfig({
        enabled,
        targetThread: finalTarget,
        minIntervalMinutes: Number(minIntervalMinutes),
        maxIntervalMinutes: Number(maxIntervalMinutes),
        activeHoursStart,
        activeHoursEnd,
        promptGuidance: promptGuidance.trim()
      });
      onNotify?.('Đã lưu cấu hình chủ động nhắn tin thành công!', 'success');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      onNotify?.(err.message || 'Lỗi khi lưu cấu hình chủ động nhắn tin', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNow = async () => {
    const target = targetThread.trim() || defaultThreadUrl.trim();
    if (!target) {
      onNotify?.('Chưa có link hội thoại để gửi thử. Vui lòng cấu hình Target Thread chung trên Dashboard trước.', 'error');
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
      <DialogContent className="w-[calc(100vw-20px)] sm:max-w-[560px] max-h-[92dvh] sm:max-h-[88vh] overflow-y-auto p-3.5 sm:p-5 rounded-2xl sm:rounded-xl">
        <DialogHeader className="space-y-2 pb-3 border-b">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-600 dark:text-pink-400 shrink-0 mt-0.5 sm:mt-0 shadow-2xs">
              <MessageCircleHeart className="w-4.5 h-4.5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-sm sm:text-base font-semibold flex items-center gap-2 text-foreground">
                Chủ động Nói chuyện (Proactive Chat)
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4.5 font-medium text-pink-600 dark:text-pink-400 border-pink-500/30 bg-pink-500/10">
                  Auto-Initiate
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                Tự động chọn thời điểm ngẫu nhiên để nhắn tin hỏi thăm hoặc trêu đùa theo văn phong cá nhân.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-3.5">
          {/* Main Switch Card */}
          <div className="flex items-center justify-between p-3.5 bg-muted/40 dark:bg-muted/20 rounded-xl border border-border/80">
            <div className="space-y-0.5 pr-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="proactive-switch" className="text-xs sm:text-sm font-semibold text-foreground cursor-pointer">
                  Kích hoạt chủ động nhắn tin
                </Label>
                {enabled ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Đang bật
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/50">
                    Đang tắt
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-[11px] text-muted-foreground leading-relaxed">
                Bot sẽ tự động chọn thời điểm ngẫu nhiên trong ngày để nhắn mà không cần đợi khách nhắn trước.
              </p>
            </div>
            <Switch
              id="proactive-switch"
              checked={enabled}
              onCheckedChange={setEnabled}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>

          {/* Target Thread (Synchronized from Central Config) */}
          <div className="space-y-1.5 p-3 bg-muted/30 dark:bg-muted/15 rounded-xl border border-border/80">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                Hội thoại Messenger mục tiêu:
              </Label>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border text-muted-foreground bg-background">
                Theo cấu hình chung
              </Badge>
            </div>
            <div className="p-2.5 bg-background rounded-lg border border-border/70">
              <span className="font-mono text-xs truncate text-foreground font-medium block" title={targetThread || defaultThreadUrl}>
                {targetThread.trim() || defaultThreadUrl || 'Chưa thiết lập (Vui lòng cấu hình trên Dashboard)'}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              ✓ Tự động đồng bộ theo Target Thread chung của bot. Để đổi hội thoại, hãy chỉnh sửa ở thanh Target Thread trên Dashboard.
            </p>
          </div>

          {/* Random Wait Interval (Min - Max) */}
          <div className="p-3 bg-muted/30 dark:bg-muted/15 rounded-xl border border-border/80 space-y-2.5">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              Khoảng cách thời gian ngẫu nhiên giữa 2 lần nhắn:
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Tối thiểu (phút):</span>
                  <span className="font-mono text-foreground font-semibold text-[11px]">
                    {(minIntervalMinutes / 60).toFixed(1)}h
                  </span>
                </div>
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  step={15}
                  value={minIntervalMinutes}
                  onChange={(e) => setMinIntervalMinutes(Number(e.target.value))}
                  className="text-sm sm:text-xs h-10 sm:h-8.5 font-mono bg-background"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Tối đa (phút):</span>
                  <span className="font-mono text-foreground font-semibold text-[11px]">
                    {(maxIntervalMinutes / 60).toFixed(1)}h
                  </span>
                </div>
                <Input
                  type="number"
                  min={10}
                  max={2880}
                  step={15}
                  value={maxIntervalMinutes}
                  onChange={(e) => setMaxIntervalMinutes(Number(e.target.value))}
                  className="text-sm sm:text-xs h-10 sm:h-8.5 font-mono bg-background"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground flex items-start gap-1 pt-0.5 leading-relaxed">
              <HelpCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span>Bot sẽ bốc ngẫu nhiên từ {minIntervalMinutes} đến {maxIntervalMinutes} phút sau mỗi lần nhắn để lên lịch lần kế tiếp.</span>
            </p>
          </div>

          {/* Active Hours in day */}
          <div className="p-3 bg-muted/30 dark:bg-muted/15 rounded-xl border border-border/80 space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              Khung giờ cho phép nhắn trong ngày (Giờ Việt Nam):
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium">Bắt đầu từ:</span>
                <Input
                  type="time"
                  value={activeHoursStart}
                  onChange={(e) => setActiveHoursStart(e.target.value)}
                  className="text-sm sm:text-xs h-10 sm:h-8.5 font-mono bg-background"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium">Kết thúc lúc:</span>
                <Input
                  type="time"
                  value={activeHoursEnd}
                  onChange={(e) => setActiveHoursEnd(e.target.value)}
                  className="text-sm sm:text-xs h-10 sm:h-8.5 font-mono bg-background"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Ngoài khung giờ này (ví dụ đêm khuya), bot sẽ giữ im lặng tuyệt đối.
            </p>
          </div>

          {/* Prompt Guidance & Quick Selectors */}
          <div className="space-y-2 p-3 bg-background rounded-xl border border-border/80">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                Định hướng chủ đề mở lời:
              </Label>
              <span className="text-[10px] text-muted-foreground">Kết hợp với Văn phong đã học</span>
            </div>

            <Textarea
              rows={2}
              value={promptGuidance}
              onChange={(e) => setPromptGuidance(e.target.value)}
              placeholder="VD: Hỏi thăm đang làm gì đó, trêu đùa lầy lội hoặc rủ đi ăn/cafe..."
              className="text-xs bg-muted/20 resize-none min-h-[60px]"
            />

            {/* Quick suggestions */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] text-muted-foreground block font-medium">Gợi ý nhanh:</span>
              <div className="flex flex-wrap gap-1.5">
                {TOPIC_SUGGESTIONS.map((topic, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPromptGuidance(topic)}
                    className="text-xs sm:text-[11px] px-3 py-1.5 rounded-full bg-muted/70 hover:bg-muted text-foreground border border-border/80 transition-all cursor-pointer min-h-[32px] inline-flex items-center active:scale-95"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Schedule Status & Preview */}
          <div className="p-3 bg-muted/40 dark:bg-muted/20 rounded-xl border border-border/70 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Lần gửi gần nhất:</span>
              <span className="text-foreground font-mono text-xs font-medium">{formatTimestamp(lastSentAt)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Dự kiến gửi lần tiếp theo:</span>
              <span className="text-foreground font-mono text-xs font-semibold text-purple-600 dark:text-purple-400">
                {enabled ? formatTimestamp(nextScheduledAt) : 'Đang tắt'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer with Test Trigger & Save Button */}
        <DialogFooter className="pt-3 border-t flex flex-col-reverse sm:flex-row gap-2 sm:justify-between items-stretch sm:items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestNow}
            disabled={isTesting || (!targetThread.trim() && !defaultThreadUrl.trim())}
            className="text-xs h-10 sm:h-8.5 px-3.5 gap-1.5 font-medium w-full sm:w-auto active:scale-[0.98]"
            title="Thử nghiệm tạo câu mở đầu và gửi tin nhắn ngay lập tức"
          >
            {isTesting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            ) : (
              <Send className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span>{isTesting ? 'Đang gửi thử...' : 'Gửi thử nghiệm ngay'}</span>
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-10 sm:h-8.5 px-4 flex-1 sm:flex-none active:scale-[0.98]"
            >
              Đóng
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="text-xs h-10 sm:h-8.5 px-4.5 gap-1.5 shadow-xs flex-1 sm:flex-none font-medium active:scale-[0.98]"
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
