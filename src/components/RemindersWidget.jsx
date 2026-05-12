import React, { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { format } from 'date-fns';

export default function RemindersWidget() {
  const queryClient = useQueryClient();

  const { data: reminders = [] } = useQuery({
    queryKey: ['reminders', 'active'],
    queryFn: async () => {
      const all = await base44.entities.Reminder.list('-due_time', 500);
      return all.filter(r => !r.is_completed && !r.is_dismissed);
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Reminder.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders', 'active'] }),
  });

  if (reminders.length === 0) return null;

  return (
    <div className="mb-6 bg-amber-50 border border-amber-300 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-4 h-4 text-amber-600" />
        <span className="font-semibold text-amber-900 text-sm">Reminders</span>
        <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
          {reminders.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {reminders.map(reminder => (
          <div key={reminder.id} className="flex items-center justify-between gap-3 bg-white border border-amber-200 rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{reminder.title}</p>
              <p className="text-xs text-gray-500">
                {reminder.due_time ? format(new Date(reminder.due_time), 'MMM d, h:mm a') : ''}
                {reminder.customer_name ? ` · ${reminder.customer_name}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => updateMutation.mutate({ id: reminder.id, data: { is_completed: true } })}
                disabled={updateMutation.isPending}
              >
                ✅ Done
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-gray-500 border-gray-300 hover:bg-gray-50"
                onClick={() => updateMutation.mutate({ id: reminder.id, data: { is_dismissed: true } })}
                disabled={updateMutation.isPending}
              >
                ✖
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}