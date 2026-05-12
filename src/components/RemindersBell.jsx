import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { base44 } from '@/api/base44Client';
import { Clock, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addHours } from 'date-fns';

export default function RemindersBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [snoozedIds, setSnoozedIds] = useState(new Set());
  const [snoozedExpanded, setSnoozedExpanded] = useState(false);
  const drawerRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: reminders = [] } = useQuery({
    queryKey: ['reminders', 'active'],
    queryFn: async () => {
      const all = await base44.entities.Reminder.list('-due_time', 500);
      const nowISO = new Date().toISOString();
      // Only show reminders that are actually due — don't surface future reminders
      return all.filter(r => !r.is_completed && !r.is_dismissed && r.due_time && r.due_time <= nowISO);
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Reminder.delete(id),
    onSuccess: (_, id) => {
      setSnoozedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      queryClient.invalidateQueries({ queryKey: ['reminders', 'active'] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, due_time }) => base44.entities.Reminder.update(id, { due_time, telegram_sent: false }),
    onSuccess: (_, { id }) => {
      setSnoozedIds(prev => new Set([...prev, id]));
    },
  });

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Clear snooze tracking for reminders no longer in the list
  useEffect(() => {
    const ids = new Set(reminders.map(r => r.id));
    setSnoozedIds(prev => {
      const next = new Set([...prev].filter(id => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [reminders]);

  const activeReminders = reminders.filter(r => !snoozedIds.has(r.id));
  const snoozedReminders = reminders.filter(r => snoozedIds.has(r.id));
  const count = activeReminders.length;

  const renderCard = (reminder, isSnoozed) => (
    <div
      key={reminder.id}
      className={`rounded-xl p-5 shadow-sm border ${
        isSnoozed
          ? 'bg-gray-50 border-gray-200 opacity-60'
          : 'bg-white border-gray-200'
      }`}
    >
      <p className={`text-base font-semibold mb-1.5 ${isSnoozed ? 'text-gray-400' : 'text-gray-900'}`}>
        {reminder.title}
      </p>
      <p className="text-sm text-gray-400 mb-4">
        {isSnoozed ? '💤 ' : ''}
        {reminder.due_time ? format(new Date(reminder.due_time), 'MMM d, h:mm a') : ''}
        {reminder.customer_name ? ` · ${reminder.customer_name}` : ''}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-9 px-4 text-sm bg-green-600 hover:bg-green-700 text-white"
          onClick={() => deleteMutation.mutate(reminder.id)}
          disabled={deleteMutation.isPending}
        >
          ✅ Done
        </Button>
        {!isSnoozed && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-4 text-sm text-gray-500 border-gray-300 hover:bg-gray-50"
            onClick={() => snoozeMutation.mutate({ id: reminder.id, due_time: addHours(new Date(), 1).toISOString() })}
            disabled={snoozeMutation.isPending}
          >
            💤 Snooze 1hr
          </Button>
        )}
      </div>
    </div>
  );

  const drawer = isOpen && ReactDOM.createPortal(
    <div ref={drawerRef} className="fixed top-0 right-0 h-full w-[440px] bg-white shadow-2xl border-l border-gray-200 z-[9999] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-500" />
          <span className="font-bold text-gray-900 text-lg">My Reminders</span>
          {count > 0 && (
            <span className="bg-red-500 text-white text-sm font-bold rounded-full px-2 py-0.5 min-w-[24px] text-center">
              {count}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-9 w-9">
          <X className="w-5 h-5 text-gray-500" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <span className="text-5xl mb-3">🎉</span>
            <p className="text-base font-medium text-gray-500">No pending reminders</p>
          </div>
        ) : (
          <>
            {/* Active reminders */}
            {activeReminders.length === 0 && snoozedReminders.length > 0 && (
              <p className="text-xs text-gray-400 text-center py-2">All reminders are snoozed</p>
            )}
            {activeReminders.map(r => renderCard(r, false))}

            {/* Snoozed section */}
            {snoozedReminders.length > 0 && (
              <div className="pt-1">
                <button
                  onClick={() => setSnoozedExpanded(v => !v)}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 font-medium w-full py-1.5"
                >
                  {snoozedExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="text-base">💤</span> Snoozed ({snoozedReminders.length})
                </button>
                {snoozedExpanded && (
                  <div className="space-y-3 mt-2">
                    {snoozedReminders.map(r => renderCard(r, true))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {drawer}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-9 w-9"
        title="Reminders"
      >
        <Clock className="w-5 h-5 text-gray-600" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Button>
    </>
  );
}