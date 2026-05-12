import React from 'react';
import { Truck } from 'lucide-react';
import { createPageUrl } from '@/utils';

/**
 * Renders the "Add to Existing Delivery" or "Build Load" button above the Delivered column.
 * Only shows "Add to Existing Delivery" if at least one load for this order actually has items.
 */
export default function DeliveryColumnHeader({ itemsNeedingLoad, order, loads, allLoadItemsForOrder, navigate, onBuildLoad, className = '' }) {
  if (!itemsNeedingLoad?.length || order?.is_archived) return null;

  // Only show "Add to Existing Delivery" if there's a load that actually has items assigned
  const loadsWithItems = (loads || []).filter(l =>
    (allLoadItemsForOrder || []).some(li => li.load_id === l.id)
  );

  if (loadsWithItems.length > 0) {
    return (
      <button
        onClick={() => {
          if (loadsWithItems.length === 1) {
            navigate(createPageUrl(`LoadDetails?id=${loadsWithItems[0].id}`));
          } else {
            navigate(createPageUrl('Deliver'));
          }
        }}
        className={`w-full py-2.5 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 text-sm ${className}`}
        style={{ background: 'linear-gradient(90deg, #0891b2, #0e7490)' }}
      >
        <Truck className="w-4 h-4" />
        Add to Existing Delivery
      </button>
    );
  }

  return (
    <button
      onClick={onBuildLoad}
      className={`w-full py-2.5 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 text-sm animate-pulse ${className}`}
      style={{ background: 'linear-gradient(90deg, #4f46e5, #7c3aed)' }}
    >
      <Truck className="w-4 h-4" />
      Build Load
    </button>
  );
}