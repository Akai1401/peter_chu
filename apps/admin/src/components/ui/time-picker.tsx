import React, { useState, useRef, useEffect } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface TimePickerProps {
  value: string; // "HH:mm"
  onChange: (time: string) => void;
  className?: string;
  minTime?: string; // "HH:mm" e.g. "14:00"
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
  className,
  minTime
}) => {
  const [open, setOpen] = useState(false);

  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  const [hStr, mStr] = (value || '09:00').split(':');
  const currentHour = parseInt(hStr, 10) || 0;
  const currentMinute = parseInt(mStr, 10) || 0;

  const pad = (n: number) => n.toString().padStart(2, '0');

  // Parse minTime
  const [minH, minM] = minTime ? minTime.split(':').map((v) => parseInt(v, 10)) : [-1, -1];
  const hasMin = minTime !== undefined && minH >= 0 && minM >= 0;

  const isHourDisabled = (h: number) => hasMin && h < minH;
  const isMinuteDisabled = (h: number, m: number) => hasMin && h === minH && m < minM;

  const setHour = (h: number) => {
    const normalizedH = (h + 24) % 24;
    if (isHourDisabled(normalizedH)) return;

    // If switching to minH and currentMinute is below minM, adjust minute
    let targetM = currentMinute;
    if (hasMin && normalizedH === minH && targetM < minM) {
      targetM = minM;
    }
    onChange(`${pad(normalizedH)}:${pad(targetM)}`);
  };

  const setMinute = (m: number) => {
    const normalizedM = (m + 60) % 60;
    if (isMinuteDisabled(currentHour, normalizedM)) return;
    onChange(`${pad(currentHour)}:${pad(normalizedM)}`);
  };

  // If initial or incoming value is in the past compared to minTime, auto-nudge
  useEffect(() => {
    if (hasMin && value < minTime) {
      onChange(minTime);
    }
  }, [hasMin, minTime, value, onChange]);

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
          {PRESETS.map((p) => {
            const isPresetDisabled = hasMin && p.time < minTime;
            return (
              <Button
                key={p.time}
                type="button"
                disabled={isPresetDisabled}
                variant={value === p.time ? 'default' : 'secondary'}
                size="sm"
                className={cn(
                  "h-6 text-[11px] font-mono px-1.5",
                  isPresetDisabled && "opacity-30 cursor-not-allowed"
                )}
                onClick={() => {
                  onChange(p.time);
                  setOpen(false);
                }}
              >
                {p.label}
              </Button>
            );
          })}
        </div>

        {/* Hour & Minute columns */}
        <div className="grid grid-cols-2 gap-2 text-center">
          {/* Hours Column */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                Hours
              </span>
              <span className="text-xs font-mono font-bold text-primary">
                {pad(currentHour)}
              </span>
            </div>
            {/* Stepper UP */}
            <button
              type="button"
              onClick={() => setHour(currentHour - 1)}
              disabled={hasMin && currentHour <= minH}
              className="h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded mb-0.5 disabled:opacity-25 disabled:cursor-not-allowed"
              title="Minus 1 hour"
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
                const disabled = isHourDisabled(h);
                return (
                  <button
                    key={h}
                    type="button"
                    disabled={disabled}
                    data-selected={isSelected ? 'true' : 'false'}
                    onClick={() => setHour(h)}
                    className={cn(
                      "w-full h-6 text-xs font-mono rounded flex items-center justify-center transition-colors shrink-0",
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : disabled
                        ? "opacity-25 cursor-not-allowed text-muted-foreground line-through"
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
              title="Plus 1 hour"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Minutes Column */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                Minutes
              </span>
              <span className="text-xs font-mono font-bold text-primary">
                {pad(currentMinute)}
              </span>
            </div>
            {/* Stepper UP */}
            <button
              type="button"
              onClick={() => setMinute(currentMinute - 5)}
              disabled={hasMin && currentHour === minH && currentMinute <= minM}
              className="h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded mb-0.5 disabled:opacity-25 disabled:cursor-not-allowed"
              title="Minus 5 minutes"
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
                const disabled = isMinuteDisabled(currentHour, m);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={disabled}
                    data-selected={isSelected ? 'true' : 'false'}
                    onClick={() => setMinute(m)}
                    className={cn(
                      "w-full h-6 text-xs font-mono rounded flex items-center justify-center transition-colors shrink-0",
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : disabled
                        ? "opacity-25 cursor-not-allowed text-muted-foreground line-through"
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
              title="Plus 5 minutes"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Direct manual input field */}
        <div className="mt-2 pt-2 border-t flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {hasMin ? `Min: ${minTime}` : 'Manual:'}
          </span>
          <input
            type="time"
            min={minTime}
            value={value}
            onChange={(e) => {
              const val = e.target.value;
              if (hasMin && val < minTime) {
                onChange(minTime);
              } else {
                onChange(val);
              }
            }}
            className="h-7 w-24 text-xs font-mono text-center rounded border bg-background px-1 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
