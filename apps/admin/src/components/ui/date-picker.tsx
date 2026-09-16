import React, { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value?: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  className?: string;
  minDate?: string; // YYYY-MM-DD
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return 'Chọn ngày';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;

  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const dStr = `${pad(d)}/${pad(m)}`;

  if (target.getTime() === today.getTime()) {
    return `Hôm nay (${dStr})`;
  }
  if (target.getTime() === tomorrow.getTime()) {
    return `Ngày mai (${dStr})`;
  }
  return `${pad(d)}/${pad(m)}/${y}`;
}

function getTodayString(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getTomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  className,
  minDate = getTodayString()
}) => {
  const [open, setOpen] = useState(false);

  const initialDate = value ? new Date(value) : new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()); // 0-11

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((prev) => prev - 1);
      setViewMonth(11);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((prev) => prev + 1);
      setViewMonth(0);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  // Generate calendar days
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Day of week for 1st of month: 0 (Sun) - 6 (Sat)
  // Convert so Monday = 0, Sunday = 6
  let firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay() - 1;
  if (firstDayOfWeek === -1) firstDayOfWeek = 6;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const todayStr = getTodayString();

  const handleSelectDay = (day: number) => {
    const selected = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    onChange(selected);
    setOpen(false);
  };

  const isSelected = (day: number) => {
    if (!value) return false;
    return value === `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
  };

  const isPast = (day: number) => {
    if (!minDate) return false;
    const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    return dateStr < minDate;
  };

  const isToday = (day: number) => {
    return todayStr === `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "justify-start text-left font-medium h-9 text-xs px-3 gap-2 bg-background hover:bg-accent border shadow-none",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate">{formatDisplayDate(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 shadow-xl rounded-xl border" align="start">
        {/* Quick shortcut pills */}
        <div className="flex items-center gap-1.5 pb-2.5 mb-2.5 border-b">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-6 text-[11px] px-2 font-medium"
            onClick={() => {
              onChange(getTodayString());
              setOpen(false);
            }}
          >
            Hôm nay
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-6 text-[11px] px-2 font-medium"
            onClick={() => {
              onChange(getTomorrowString());
              setOpen(false);
            }}
          >
            Ngày mai
          </Button>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between gap-2 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md"
            onClick={handlePrevMonth}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="text-xs font-semibold text-foreground">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md"
            onClick={handleNextMonth}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-[10px] font-semibold text-muted-foreground h-6 flex items-center justify-center">
              {wd}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="h-7 w-7" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const disabled = isPast(day);
            const active = isSelected(day);
            const today = isToday(day);

            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => handleSelectDay(day)}
                className={cn(
                  "h-7 w-7 text-xs rounded-md flex items-center justify-center font-medium transition-colors",
                  active && "bg-primary text-primary-foreground font-semibold shadow-sm",
                  !active && today && "border border-primary/50 text-primary font-semibold",
                  !active && !today && !disabled && "hover:bg-accent text-foreground",
                  disabled && "text-muted-foreground/30 cursor-not-allowed"
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
