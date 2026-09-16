import React, { useState, useRef, useEffect } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface TimePickerProps {
  value: string; // "HH:mm"
  onChange: (time: string) => void;
  className?: string;
}

const PRESETS = [
  { label: '09:00', time: '09:00' },
  { label: '12:00', time: '12:00' },
  { label: '15:00', time: '15:00' },
  { label: '18:00', time: '18:00' },
  { label: '20:00', time: '20:00' },
  { label: '22:00', time: '22:00' }
];

const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export const TimePicker: React.FC<TimePickerProps> = ({
  value = '09:00',
  onChange,
  className
}) => {
  const [open, setOpen] = useState(false);

  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  const [hStr, mStr] = (value || '09:00').split(':');
  const currentHour = parseInt(hStr, 10) || 0;
  const currentMinute = parseInt(mStr, 10) || 0;

  const pad = (n: number) => n.toString().padStart(2, '0');

  const setHour = (h: number) => {
    const normalizedH = (h + 24) % 24;
    onChange(`${pad(normalizedH)}:${pad(currentMinute)}`);
  };

  const setMinute = (m: number) => {
    const normalizedM = (m + 60) % 60;
    onChange(`${pad(currentHour)}:${pad(normalizedM)}`);
  };

  // Prevent parent react-remove-scroll / modal from canceling scroll events
  useEffect(() => {
    if (!open) return;

    const stopScrollBubble = (e: Event) => {
      e.stopPropagation();
    };

    const hEl = hourListRef.current;
    const mEl = minuteListRef.current;

    if (hEl) {
      hEl.addEventListener('wheel', stopScrollBubble, { passive: true });
      hEl.addEventListener('touchmove', stopScrollBubble, { passive: true });
    }
    if (mEl) {
      mEl.addEventListener('wheel', stopScrollBubble, { passive: true });
      mEl.addEventListener('touchmove', stopScrollBubble, { passive: true });
    }

    // Auto-scroll to currently selected hour and minute when popover opens
    const timer = setTimeout(() => {
      const selectedH = hEl?.querySelector<HTMLElement>('[data-selected="true"]');
      const selectedM = mEl?.querySelector<HTMLElement>('[data-selected="true"]');
      selectedH?.scrollIntoView({ block: 'center', behavior: 'auto' });
      selectedM?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }, 30);

    return () => {
      clearTimeout(timer);
      if (hEl) {
        hEl.removeEventListener('wheel', stopScrollBubble);
        hEl.removeEventListener('touchmove', stopScrollBubble);
      }
      if (mEl) {
        mEl.removeEventListener('wheel', stopScrollBubble);
        mEl.removeEventListener('touchmove', stopScrollBubble);
      }
    };
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "justify-start text-left font-mono font-medium h-9 text-xs px-3 gap-2 bg-background hover:bg-accent border shadow-none",
            className
          )}
        >
          <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>{value || '09:00'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3 shadow-xl rounded-xl border bg-card text-card-foreground"
        align="start"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Quick Presets */}
        <div className="grid grid-cols-3 gap-1 pb-2.5 mb-2.5 border-b">
          {PRESETS.map((p) => (
            <Button
              key={p.time}
              type="button"
              variant={value === p.time ? 'default' : 'secondary'}
              size="sm"
              className="h-6 text-[11px] font-mono px-1.5"
              onClick={() => {
                onChange(p.time);
                setOpen(false);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {/* Hour & Minute columns */}
        <div className="grid grid-cols-2 gap-2 text-center">
          {/* Hours Column */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                Giờ
              </span>
              <span className="text-xs font-mono font-bold text-primary">
                {pad(currentHour)}
              </span>
            </div>
            {/* Stepper UP */}
            <button
              type="button"
              onClick={() => setHour(currentHour - 1)}
              className="h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded mb-0.5"
              title="Giảm 1 giờ"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            {/* Scrollable list */}
            <div
              ref={hourListRef}
              className="h-36 overflow-y-auto overscroll-contain pr-1 space-y-1 rounded-md border p-1 bg-muted/20 select-none"
              style={{ overscrollBehavior: 'contain' }}
              onWheel={(e) => e.stopPropagation()}
            >
              {Array.from({ length: 24 }).map((_, h) => {
                const isSelected = h === currentHour;
                return (
                  <button
                    key={h}
                    type="button"
                    data-selected={isSelected ? 'true' : 'false'}
                    onClick={() => setHour(h)}
                    className={cn(
                      "w-full h-6 text-xs font-mono rounded flex items-center justify-center transition-colors shrink-0",
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "hover:bg-accent text-foreground"
                    )}
                  >
                    {pad(h)}
                  </button>
                );
              })}
            </div>
            {/* Stepper DOWN */}
            <button
              type="button"
              onClick={() => setHour(currentHour + 1)}
              className="h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded mt-0.5"
              title="Tăng 1 giờ"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Minutes Column */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                Phút
              </span>
              <span className="text-xs font-mono font-bold text-primary">
                {pad(currentMinute)}
              </span>
            </div>
            {/* Stepper UP */}
            <button
              type="button"
              onClick={() => setMinute(currentMinute - 5)}
              className="h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded mb-0.5"
              title="Giảm 5 phút"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            {/* Scrollable list */}
            <div
              ref={minuteListRef}
              className="h-36 overflow-y-auto overscroll-contain pr-1 space-y-1 rounded-md border p-1 bg-muted/20 select-none"
              style={{ overscrollBehavior: 'contain' }}
              onWheel={(e) => e.stopPropagation()}
            >
              {MINUTES.map((m) => {
                const isSelected = m === currentMinute;
                return (
                  <button
                    key={m}
                    type="button"
                    data-selected={isSelected ? 'true' : 'false'}
                    onClick={() => setMinute(m)}
                    className={cn(
                      "w-full h-6 text-xs font-mono rounded flex items-center justify-center transition-colors shrink-0",
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "hover:bg-accent text-foreground"
                    )}
                  >
                    {pad(m)}
                  </button>
                );
              })}
            </div>
            {/* Stepper DOWN */}
            <button
              type="button"
              onClick={() => setMinute(currentMinute + 5)}
              className="h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded mt-0.5"
              title="Tăng 5 phút"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Direct manual input field */}
        <div className="mt-2 pt-2 border-t flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">Tự nhập:</span>
          <input
            type="time"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-24 text-xs font-mono text-center rounded border bg-background px-1 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
