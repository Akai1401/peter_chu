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
      <DialogContent className="w-[calc(100vw-24px)] max-w-[480px] p-4 sm:p-5 rounded-2xl sm:rounded-xl">
        <DialogHeader className="space-y-2 pb-3 border-b">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 mt-0.5 sm:mt-0 shadow-2xs">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle className="text-sm sm:text-base font-semibold text-foreground">
                Configure Target Thread ID / Link
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                Target conversation shared across all Bot features (Reminders, Wake-up Alarms, AI Auto-Reply & Proactive Messaging).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="aiTargetThread" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
              Messenger conversation link or numeric ID:
            </Label>
            <Input
              id="aiTargetThread"
              value={targetThread}
              onChange={(e) => setTargetThread(e.target.value)}
              placeholder="e.g. https://www.facebook.com/messages/t/100040388333156 or numeric ID"
              className="font-mono text-sm sm:text-xs h-10 sm:h-9 bg-background focus-visible:ring-purple-500/30"
              disabled={loading || isSaving}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5 pt-0.5">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span>
                This configuration automatically syncs across all features: Reminders, Wake-up alarms, AI Auto-reply, and AI Proactive Chat without re-entering.
              </span>
            </p>
          </div>

          <div className="p-3 bg-muted/40 dark:bg-muted/20 rounded-xl border border-border/80 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 text-foreground font-medium text-xs">
              <MessageSquare className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Applied status:</span>
            </div>
            <div className="text-[11px] leading-relaxed pl-5 text-muted-foreground">
              {targetThread.trim() ? (
                <div>
                  Currently targeting: <code className="font-mono text-foreground font-medium bg-background px-1.5 py-0.5 rounded border border-border break-all inline-block mt-0.5">{targetThread.trim()}</code>
                </div>
              ) : (
                <div>
                  <strong className="text-foreground">Open scan:</strong> No shared Target Thread specified. AI will scan across all Messenger inbox threads.
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-3 border-t sm:justify-between items-stretch sm:items-center">
            {currentTargetThread ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={loading || isSaving}
                className="text-xs text-muted-foreground hover:text-destructive h-10 sm:h-8.5 px-3 w-full sm:w-auto active:scale-[0.98] transition-all"
              >
                Clear target (Open scan)
              </Button>
            ) : <div className="hidden sm:block" />}

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={loading || isSaving}
                className="text-xs h-10 sm:h-8.5 px-4 flex-1 sm:flex-none active:scale-[0.98] transition-all"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading || isSaving}
                className="text-xs h-10 sm:h-8.5 px-4 gap-1.5 shadow-xs flex-1 sm:flex-none font-medium active:scale-[0.98] transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
