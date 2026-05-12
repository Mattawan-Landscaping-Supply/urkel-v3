import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CalendarIcon } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, parseISO } from 'date-fns';

function MiniCalendar({ value, onChange, onClose }) {
  const [viewDate, setViewDate] = useState(value ? parseISO(value) : new Date());

  const start = startOfWeek(startOfMonth(viewDate));
  const end = endOfWeek(endOfMonth(viewDate));
  const days = [];
  let d = start;
  while (d <= end) {
    days.push(d);
    d = addDays(d, 1);
  }

  const selected = value ? parseISO(value) : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-64 z-50">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewDate(subMonths(viewDate, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-600 font-bold text-lg leading-none"
        >‹</button>
        <span className="text-sm font-semibold text-gray-800">
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          type="button"
          onClick={() => setViewDate(addMonths(viewDate, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-600 font-bold text-lg leading-none"
        >›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day, i) => {
          const isSelected = selected && isSameDay(day, selected);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, viewDate);
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                onChange(format(day, 'yyyy-MM-dd'));
                onClose();
              }}
              className={`
                text-xs rounded-full w-7 h-7 mx-auto flex items-center justify-center transition-colors
                ${isSelected ? 'bg-indigo-600 text-white font-semibold' : ''}
                ${!isSelected && isToday ? 'border border-indigo-400 text-indigo-600 font-semibold' : ''}
                ${!isSelected && !isCurrentMonth ? 'text-gray-300' : ''}
                ${!isSelected && isCurrentMonth && !isToday ? 'text-gray-700 hover:bg-gray-100' : ''}
              `}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ReminderDialog({ isOpen, onOpenChange, reminderDate, setReminderDate, reminderNotes, setReminderNotes, onCreateReminder, isLoading }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);

  useEffect(() => {
    if (isOpen && !reminderDate) {
      const today = new Date();
      setReminderDate(format(today, 'yyyy-MM-dd'));
    }
  }, [isOpen]);

  // Close calendar on outside click
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCalendar]);

  const displayDate = reminderDate
    ? format(parseISO(reminderDate), 'MMM d, yyyy')
    : 'Select a date';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        setShowCalendar(false);
        setReminderDate('');
        setReminderNotes('');
      }
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Add Delivery Reminder</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="grid gap-2">
            <Label>Delivery Date</Label>
            <div className="relative" ref={calendarRef}>
              <button
                type="button"
                onClick={() => setShowCalendar(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-all"
              >
                <span className={reminderDate ? 'text-gray-800' : 'text-gray-400'}>{displayDate}</span>
                <CalendarIcon className="w-4 h-4 text-gray-400" />
              </button>
              {showCalendar && (
                <div className="absolute top-full left-0 mt-1 z-50">
                  <MiniCalendar
                    value={reminderDate}
                    onChange={setReminderDate}
                    onClose={() => setShowCalendar(false)}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <textarea
              id="notes"
              className="w-full text-sm text-gray-700 bg-white border border-gray-300 rounded-lg p-2 outline-none resize-none min-h-[80px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
              placeholder="Add notes about this delivery..."
              value={reminderNotes}
              onChange={(e) => setReminderNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => {
            onOpenChange(false);
            setReminderDate('');
            setReminderNotes('');
          }}>
            Cancel
          </Button>
          <Button onClick={onCreateReminder} disabled={isLoading || !reminderDate}>
            {isLoading ? 'Creating...' : 'Create Reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}