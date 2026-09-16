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
import { Sparkles, MessageSquare, Link2, Info, Check } from 'lucide-react';

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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="space-y-1.5 pb-2 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Cấu hình Hội thoại AI</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Chỉ định cuộc hội thoại Messenger để AI theo dõi và trả lời
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="aiTargetThread" className="text-xs font-semibold flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
              Target Thread ID / Link
            </Label>
            <Input
              id="aiTargetThread"
              value={targetThread}
              onChange={(e) => setTargetThread(e.target.value)}
              placeholder="e.g. https://www.facebook.com/messages/t/100040388333156 hoặc 100040388333156"
              className="font-mono text-xs h-9 bg-background focus-visible:ring-purple-500"
              disabled={loading || isSaving}
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5 pt-0.5">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span>
                Nhập link cuộc hội thoại Messenger (tương tự như cấu hình Lịch nhắc nhở Job Schedule).
                AI sẽ trực tiếp truy cập hội thoại này, <strong>đọc ngữ cảnh các tin nhắn trước</strong> và tự động phản hồi.
              </span>
            </p>
          </div>

          <div className="p-3 bg-muted/40 rounded-lg border border-border/70 space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground font-medium text-xs">
              <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
              <span>Chế độ quét:</span>
            </div>
            <p className="text-[11px] leading-normal pl-5">
              {targetThread.trim() ? (
                <span>
                  Đang chỉ định hội thoại cụ thể: <code className="font-mono text-foreground font-semibold bg-background px-1 py-0.5 rounded border border-border/80">{targetThread.trim()}</code>
                </span>
              ) : (
                <span>
                  <strong>Quét tự do:</strong> AI sẽ tự động tìm tin nhắn chưa đọc mới nhất trong toàn bộ danh sách hội thoại của Messenger Web.
                </span>
              )}
            </p>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t sm:justify-between items-center">
            {currentTargetThread ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={loading || isSaving}
                className="text-xs text-muted-foreground hover:text-destructive h-8 px-2.5"
              >
                Xóa liên kết (Quét tự do)
              </Button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={loading || isSaving}
                className="text-xs h-8 px-3"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading || isSaving}
                className="text-xs h-8 px-3.5 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-xs"
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
