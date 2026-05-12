import React, { useState } from 'react';
import { format } from 'date-fns';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DeliveryRemindersSection({
  deliveryReminders,
  loads,
  items,
  resolveReminderMutation,
  rescheduleReminderMutation
}) {
  const [rescheduleReminder, setRescheduleReminder] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');

  const allDelivered = items?.every(i =>
    i.status === 'delivered' || i.status === 'returned' || (i.status === 'order' && i.quantity === 0)
  );

  const today = new Date().toISOString().split('T')[0];
  const upcomingReminders = deliveryReminders.filter(r => r.scheduled_date >= today);

  if (
    upcomingReminders.length === 0 ||
    loads.some(l => l.status === 'completed') ||
    allDelivered
  ) return null;

  return (
    <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-5 h-5 text-amber-600" />
        <h3 className="font-bold text-amber-900">
          Delivery Reminder{upcomingReminders.length > 1 ? 's' : ''}
        </h3>
      </div>

      <div className="space-y-2">
        {upcomingReminders.map((reminder, idx) => (
          <div key={reminder.id}>
            {idx > 0 && <div className="border-t border-amber-200 pt-2" />}
            <div className="flex items-start justify-between">
              <div className="text-sm text-amber-800">
                Scheduled for{' '}
                <span className="font-semibold">
                  {format(new Date(reminder.scheduled_date + 'T00:00:00'), 'MMMM d, yyyy')}
                </span>
                {reminder.notes && (
                  <span className="block text-xs text-amber-700 mt-0.5">{reminder.notes}</span>
                )}
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 text-xs h-7 px-2"
                  onClick={() => {
                    setRescheduleReminder(reminder);
                    setRescheduleDate(reminder.scheduled_date);
                  }}
                >
                  Reschedule
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => resolveReminderMutation.mutate(reminder.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {rescheduleReminder?.id === reminder.id && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                  className="border border-amber-300 rounded px-2 py-1 text-sm bg-white"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => {
                    rescheduleReminderMutation.mutate({ reminderId: reminder.id, newDate: rescheduleDate });
                    setRescheduleReminder(null);
                    setRescheduleDate('');
                  }}
                  disabled={!rescheduleDate || rescheduleReminderMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setRescheduleReminder(null); setRescheduleDate(''); }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
