import React, { useState, useEffect } from 'react';
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
import { MessageSquare, Link2, Info, Check, Sparkles } from 'lucide-react';

interface Props {
  isOpen: boolean;
  currentTargetThread?: string;
  onClose: () => void;
  onSave: (targetThread: string) => Promise<void>;
  loading: boolean;
}

export const AiConfigModal: React.FC<Props> = ({
  isOpen,
  currentTargetThread = '',
  onClose,
  onSave,
  loading
}) => {
  const [targetThread, setTargetThread] = useState(currentTargetThread);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTargetThread(currentTargetThread);
    }
  }, [isOpen, currentTargetThread]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(targetThread.trim());
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      await onSave('');
      setTargetThread('');
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader className="space-y-1.5 pb-2 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold">Cấu hình Target Thread ID / Link</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Cuộc trò chuyện mục tiêu dùng chung cho toàn bộ Bot (Lịch nhắc, Chế độ gọi dậy, AI tự động trả lời & Chủ động nhắn tin)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="aiTargetThread" className="text-xs font-medium flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
              Link hoặc ID cuộc hội thoại Messenger:
            </Label>
            <Input
              id="aiTargetThread"
              value={targetThread}
              onChange={(e) => setTargetThread(e.target.value)}
              placeholder="VD: https://www.facebook.com/messages/t/100040388333156 hoặc ID số"
              className="font-mono text-xs h-9 sm:h-8 bg-background"
              disabled={loading || isSaving}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5 pt-0.5">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span>
                Cấu hình này tự động đồng bộ sang mọi tính năng khác: Lên lịch hẹn, Gọi dậy, AI Tự động trả lời và AI Chủ động nhắn tin mà không cần nhập lại ở bất cứ đâu.
              </span>
            </p>
          </div>

          <div className="p-3 bg-muted/30 rounded-lg border border-border/80 space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 text-foreground font-medium text-xs">
              <MessageSquare className="w-3.5 h-3.5 text-foreground" />
              <span>Trạng thái áp dụng:</span>
            </div>
            <p className="text-[11px] leading-normal pl-5">
              {targetThread.trim() ? (
                <span>
                  Đang chỉ định: <code className="font-mono text-foreground font-medium bg-background px-1 py-0.5 rounded border border-border/80 break-all">{targetThread.trim()}</code>
                </span>
              ) : (
                <span>
                  <strong>Quét tự do:</strong> Chưa chỉ định Target Thread chung. AI sẽ quét tự do trong hộp thư hoặc đợi cấu hình.
                </span>
              )}
            </p>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2 border-t sm:justify-between items-stretch sm:items-center">
            {currentTargetThread ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={loading || isSaving}
                className="text-xs text-muted-foreground hover:text-destructive h-9 sm:h-8 px-2.5 w-full sm:w-auto"
              >
                Xóa chỉ định (Quét tự do)
              </Button>
            ) : <div className="hidden sm:block" />}

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={loading || isSaving}
                className="text-xs h-9 sm:h-8 px-3.5 flex-1 sm:flex-none"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading || isSaving}
                className="text-xs h-9 sm:h-8 px-4 gap-1.5 shadow-xs flex-1 sm:flex-none font-medium"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
