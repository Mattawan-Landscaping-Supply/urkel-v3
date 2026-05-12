import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { displayName, LOAD_STATUS } from '@/lib/utils';
import { Loader2, Truck, GripVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Delivery Schedule Sidebar
 * Shows all BUILT loads (active or delivered) for a given delivery date.
 * DeliveryReminders are NOT shown here — they are calendar-only.
 */
export default function LoadScheduleSidebar({ currentLoadId, deliveryDate }) {
  const navigate = useNavigate();

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['loads', 'date', deliveryDate],
    staleTime: 0,
    refetchOnMount: 'always',
    enabled: !!deliveryDate,
    queryFn: async () => {
      const all = await base44.entities.Load.filter({ delivery_date: deliveryDate });
      // Only show actually-built loads. ACTIVE or DELIVERED. Never archived.
      return all
        .filter(l => l.status === LOAD_STATUS.ACTIVE || l.status === LOAD_STATUS.DELIVERED)
        .sort((a, b) => (a.delivery_order ?? 99) - (b.delivery_order ?? 99));
    },
  });

  if (!deliveryDate) return null;

  return (
    <div className="w-56 shrink-0 border-l bg-gray-50 p-3 space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Delivery Schedule</h3>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
      ) : loads.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No loads built for this date.</p>
      ) : (
        <div className="space-y-1">
          {loads.map((load, idx) => {
            const isCurrent = load.id === currentLoadId;
            return (
              <button
                key={load.id}
                onClick={() => !isCurrent && navigate(createPageUrl(`LoadDetails?id=${load.id}`))}
                className={`w-full text-left rounded-lg p-2 transition-colors flex items-start gap-2 ${
                  isCurrent
                    ? 'bg-blue-600 text-white'
                    : 'bg-white hover:bg-gray-100 text-gray-800 border border-gray-200'
                }`}
              >
                <span className={`text-xs font-bold mt-0.5 shrink-0 ${isCurrent ? 'text-blue-100' : 'text-gray-400'}`}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{displayName(load) || load.name}</p>
                  {load.status === LOAD_STATUS.DELIVERED && (
                    <Badge className="bg-green-100 text-green-700 text-xs mt-0.5">Delivered</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
