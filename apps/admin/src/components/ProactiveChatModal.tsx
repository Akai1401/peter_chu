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
  CheckCircle2,
  Calendar,
  HelpCircle,
  Bot
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
  'Trêu đùa lầy lội, hài hước',
  'Rủ đi cafe / ăn uống',
  'Hỏi dạo này công việc thế nào',
  'Hỏi thăm sức khỏe & thời tiết'
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
      onNotify?.('Vui lòng nhập link hội thoại Messenger để bot biết cần nhắn cho ai!', 'error');
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
          ? 'Đã bật chế độ chủ động nhắn tin! Bot sẽ random thời gian gửi tin nhắn theo cấu hình.'
          : 'Đã lưu cấu hình và tắt chế độ chủ động nhắn tin.',
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
      onNotify?.('Vui lòng nhập link cuộc trò chuyện Messenger để thử nghiệm!', 'error');
      return;
    }

    setIsTesting(true);
    try {
      await api.testProactiveMessage(target);
      onNotify?.('Đã gửi yêu cầu thử nghiệm! Bot đang soạn câu mở đầu và gửi tin nhắn ngay...', 'info');
      // Re-fetch state after a short delay
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
      <DialogContent className="sm:max-w-[620px] max-h-[92vh] overflow-y-auto p-5">
        <DialogHeader className="space-y-1.5 pb-3 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-sm shadow-pink-500/20">
              <MessageCircleHeart className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                Chủ Động Bắt Chuyện & Nhắn Tin
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-pink-200 text-pink-700 dark:border-pink-800 dark:text-pink-300 font-mono">
                  Proactive Chat
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Cho phép AI tự động random thời gian để chủ động nhắn tin hỏi thăm, trêu đùa theo đúng văn phong.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* Main Switch Card */}
          <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-pink-50/70 to-rose-50/40 dark:from-pink-950/30 dark:to-rose-950/20 rounded-xl border border-pink-200/80 dark:border-pink-800/80">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="proactive-switch" className="text-xs font-bold text-foreground cursor-pointer">
                  Bật chế độ chủ động nhắn tin ngẫu nhiên
                </Label>
                {enabled ? (
                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-600 text-white font-medium">
                    Đang BẬT
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                    Đang TẮT
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Bot sẽ tự động chọn thời điểm bất kỳ trong ngày để nhắn tin cho khách mà không cần khách nhắn trước.
              </p>
            </div>
            <Switch
              id="proactive-switch"
              checked={enabled}
              onCheckedChange={setEnabled}
              className="data-[state=checked]:bg-pink-600"
            />
          </div>

          {/* Target Thread Link */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-pink-600" />
                Hội thoại Messenger mục tiêu: <span className="text-red-500">*</span>
              </Label>
              {defaultThreadUrl && defaultThreadUrl !== targetThread && (
                <button
                  type="button"
                  onClick={() => setTargetThread(defaultThreadUrl)}
                  className="text-[11px] text-pink-600 hover:underline font-normal"
                >
                  Dùng link đang theo dõi
                </button>
              )}
            </div>
            <Input
              value={targetThread}
              onChange={(e) => setTargetThread(e.target.value)}
              placeholder="Ví dụ: https://www.facebook.com/messages/t/100040388333156 hoặc ID số"
              className="text-xs font-mono h-8 bg-background"
            />
          </div>

          {/* Random Wait Interval (Min - Max) */}
          <div className="p-3 bg-background rounded-xl border border-border/80 space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-pink-600" />
              Khoảng thời gian chờ ngẫu nhiên giữa các lần nhắn:
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
                  <span className="text-xs text-muted-foreground shrink-0">
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
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({(maxIntervalMinutes / 60).toFixed(1)}h)
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic flex items-center gap-1 pt-0.5">
              <HelpCircle className="w-3 h-3 text-pink-500 shrink-0" />
              Bot sẽ random ngẫu nhiên từ {minIntervalMinutes} phút đến {maxIntervalMinutes} phút sau mỗi lần nhắn để gửi tiếp.
            </p>
          </div>

          {/* Active Hours in day */}
          <div className="p-3 bg-background rounded-xl border border-border/80 space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-pink-600" />
              Khung giờ cho phép nhắn tin trong ngày (Giờ Việt Nam):
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Từ giờ:</span>
                <Input
                  type="time"
                  value={activeHoursStart}
                  onChange={(e) => setActiveHoursStart(e.target.value)}
                  className="text-xs h-8 font-mono bg-background"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Đến giờ:</span>
                <Input
                  type="time"
                  value={activeHoursEnd}
                  onChange={(e) => setActiveHoursEnd(e.target.value)}
                  className="text-xs h-8 font-mono bg-background"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              Tránh nhắn tin đêm khuya hoặc sáng sớm gây phiền phức cho đối phương.
            </p>
          </div>

          {/* Prompt Guidance & Quick Selectors */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-pink-600" />
                Chủ đề gợi mở & hướng dẫn nội dung bắt chuyện:
              </Label>
              <span className="text-[10px] text-muted-foreground">Tự động kết hợp với Văn phong AI</span>
            </div>

            <Textarea
              rows={2}
              value={promptGuidance}
              onChange={(e) => setPromptGuidance(e.target.value)}
              placeholder="Ví dụ: Hỏi thăm đang làm gì đó, trêu đùa lầy lội, rủ đi cafe chém gió..."
              className="text-xs bg-background resize-none"
            />

            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-1 items-center pt-0.5">
              <span className="text-[10px] text-muted-foreground mr-1">Gợi ý nhanh:</span>
              {TOPIC_SUGGESTIONS.map((topic, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPromptGuidance(topic)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted hover:bg-pink-100 hover:text-pink-700 dark:hover:bg-pink-950/60 dark:hover:text-pink-300 border border-border/80 transition-colors"
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
              <strong className="text-foreground font-mono text-[11px]">{formatTimestamp(lastSentAt)}</strong>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Dự kiến gửi ngẫu nhiên lần tiếp theo:</span>
              <strong className="text-pink-600 dark:text-pink-400 font-mono text-[11px]">
                {enabled ? formatTimestamp(nextScheduledAt) : 'Đang tắt'}
              </strong>
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
            className="text-xs h-8 px-3 gap-1.5 font-medium text-pink-700 border-pink-200 hover:bg-pink-50 dark:text-pink-300 dark:border-pink-800 dark:hover:bg-pink-950/40"
            title="Thử nghiệm tạo câu mở đầu và gửi tin nhắn ngay lập tức"
          >
            {isTesting ? (
              <RefreshCw className="w-3 h-3 animate-spin text-pink-600" />
            ) : (
              <Send className="w-3 h-3 text-pink-600" />
            )}
            <span>{isTesting ? 'Đang gửi thử...' : 'Thử gửi ngay bây giờ'}</span>
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
              className="text-xs h-8 px-4 gap-1.5 font-semibold bg-pink-600 hover:bg-pink-700 text-white shadow-2xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
