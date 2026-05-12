import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ExternalLink, X, Loader2 } from 'lucide-react';

export default function OnDeliverySection({ items, updateItemMutation, getLocalDateString, checkAndSendFirstDeliveryNotification, checkIfOrderComplete, deliveryDate, loadItems, orderId, queryClient, loadId, loads }) {
  const [removingItemId, setRemovingItemId] = useState(null);
  const [isFixing, setIsFixing] = useState(false);

  // Verify loadId actually points to a load that still exists.
  // If the load was just deleted, loads[] won't contain it — treat as no load.
  const resolvedLoadId = loadId && loads && loads.length > 0
    ? (loads.find(l => l.id === loadId) ? loadId : null)
    : loadId;

  // Detect orphaned items: on_delivery but no covering LoadItem
  // Only flag orphans if we've confirmed no active load exists for these items.
  const allLoadItemIds = new Set((loadItems || []).map(li => li.order_item_id).filter(Boolean));
  const orphanedItems = !resolvedLoadId
    ? items  // no load found at all — all items are orphaned
    : items.filter(i => !allLoadItemIds.has(i.id));
  const hasOrphans = orphanedItems.length > 0;

  const handleFixOrphans = async () => {
    setIsFixing(true);
    try {
      await base44.functions.invoke('fixOrphanedOnDeliveryItems', { orderId });
      if (queryClient && orderId) {
        queryClient.invalidateQueries(['items', orderId]);
        queryClient.invalidateQueries(['allLoadItemsRaw', orderId]);
      }
    } finally {
      setIsFixing(false);
    }
  };

  if (!items || items.length === 0) return null;

  const handleRemoveItem = async (item) => {
    setRemovingItemId(item.id);

    // Always do a fresh API lookup — never rely on stale cache for this critical operation
    const freshLoadItems = await base44.entities.LoadItem.filter({ order_item_id: item.id });
    const loadItem = freshLoadItems[0];

    if (loadItem) {
      // Use the central unfulfill function which handles full cleanup (LoadItem delete, OrderItem revert, empty Load delete)
      await base44.functions.invoke('unfulfillOrderItem', { loadItemId: loadItem.id });
    } else {
      // No LoadItem found — just revert the OrderItem status
      await base44.entities.OrderItem.update(item.id, {
        status: 'in_hold',
        hold_location: item.original_hold_location || item.hold_location || null,
        date_completed: null,
      });
    }

    if (queryClient && orderId) {
      queryClient.invalidateQueries(['items', orderId]);
      queryClient.invalidateQueries(['allLoadItemsRaw', orderId]);
      queryClient.invalidateQueries(['loads', orderId]);
      queryClient.invalidateQueries({ queryKey: ['loads', 'today-banner'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['allLoadItems'] });
      queryClient.invalidateQueries({ queryKey: ['loads'], exact: false });
      // Force immediate banner refresh by refetching
      await queryClient.refetchQueries({ queryKey: ['loads', 'today-banner'], exact: false });
    }
    setRemovingItemId(null);
  };

  const confirmItems = async () => {
    // Use the load's scheduled delivery_date if available, otherwise fall back to today
    const confirmedDate = deliveryDate || getLocalDateString();
    await Promise.all(items.map(item =>
      updateItemMutation.mutateAsync({
        id: item.id,
        data: { status: 'delivered', delivery_method: 'delivery', date_completed: confirmedDate }
      })
    ));
    // Archive the load after all items are confirmed as delivered
    if (loadId) {
      try {
        await base44.entities.Load.update(loadId, { status: 'archived' });
        if (queryClient) queryClient.invalidateQueries(['loads', orderId]);
      } catch (e) {
        console.error('Failed to archive load:', e);
      }
    }
    // Trigger a monitoring check so the unconfirmed delivery alert is cleared immediately
    try {
      await base44.functions.invoke('runMonitoringCheck', {});
      if (queryClient) queryClient.invalidateQueries({ queryKey: ['monitoringAlerts'], exact: false });
    } catch (e) {
      console.warn('Monitoring check after confirm failed (non-critical):', e);
    }
  };

  const cancelDelivery = async () => {
    // Step 1: Unfulfill all items concurrently — fetch their LoadItems in parallel, then invoke in parallel
    const loadItemResults = await Promise.all(
      items.map(item => base44.entities.LoadItem.filter({ order_item_id: item.id }))
    );

    await Promise.all(
      items.map(async (item, idx) => {
        const loadItem = loadItemResults[idx]?.[0];
        if (loadItem) {
          await base44.functions.invoke('unfulfillOrderItem', { loadItemId: loadItem.id });
        } else {
          await base44.entities.OrderItem.update(item.id, {
            status: 'in_hold',
            hold_location: item.hold_location || null,
            date_completed: null,
          });
        }
      })
    );

    // Step 2: Fetch fresh items and merge any duplicates in in_hold
    const allItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);
    const holdItems = allItems.filter(i => i.status === 'in_hold');

    // Group by merge key, then run all merges in parallel
    const seen = new Map();
    const mergeUpdates = [];
    const mergeDeletes = [];

    for (const h of holdItems) {
      const key = `${h.product_name}||${h.selected_color || ''}||${h.receipt_number || ''}||${h.hold_location || ''}||${h.selected_unit || ''}`;
      if (!seen.has(key)) {
        seen.set(key, { ...h });
      } else {
        const keeper = seen.get(key);
        const newQty = (keeper.quantity || 0) + (h.quantity || 0);
        keeper.quantity = newQty;
        mergeUpdates.push(base44.entities.OrderItem.update(keeper.id, { quantity: newQty }));
        mergeDeletes.push(base44.entities.OrderItem.delete(h.id).catch(e => console.warn('Skipping already-deleted OrderItem during merge:', h.id, e.message)));
      }
    }

    await Promise.all([...mergeUpdates, ...mergeDeletes]);

    if (queryClient && orderId) {
      queryClient.invalidateQueries(['items', orderId]);
      queryClient.invalidateQueries({ queryKey: ['loads', 'today-banner'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['allLoadItems'] });
      queryClient.invalidateQueries({ queryKey: ['loads'], exact: false });
      await queryClient.refetchQueries({ queryKey: ['loads', 'today-banner'], exact: false });
    }
  };

  const handleConfirmAll = async () => {
    await confirmItems();
    await checkAndSendFirstDeliveryNotification();
    if (checkIfOrderComplete) {
      setTimeout(() => checkIfOrderComplete(), 500);
    }
  };

  return (
    <>
      <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 shadow-sm flex-shrink-0">
        <div className="p-2.5 border-b border-indigo-200 bg-indigo-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-indigo-800 text-sm uppercase tracking-wider">🚚 On Delivery Load</h3>
            <p className="text-xs text-indigo-600 mt-0.5">Confirm delivery to customer to start billing</p>
          </div>
          {resolvedLoadId && (
            <Link
              to={createPageUrl(`LoadDetails?id=${resolvedLoadId}`)}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              View Load
            </Link>
          )}
        </div>
        {hasOrphans && (
          <div className="mx-2.5 mt-2.5 bg-red-50 border border-red-300 rounded-lg p-2 text-xs text-red-800">
            <div className="font-semibold mb-1">⚠️ Data mismatch detected</div>
            <p className="mb-2">These items appear as "On Delivery" but aren't found on an active load. They may need to be restored to In Hold.</p>
            <button
              onClick={handleFixOrphans}
              disabled={isFixing}
              className="bg-red-600 text-white px-3 py-1 rounded font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
            >
              {isFixing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {isFixing ? 'Fixing...' : 'Fix — Return to In Hold'}
            </button>
          </div>
        )}
        <div className="p-2.5 space-y-2">
          {(() => {
            // Group items with same product/color/unit/receipt into a single display row
            const groups = [];
            const seen = new Map();
            items.forEach(item => {
              const key = `${item.product_name}||${item.selected_color || ''}||${item.selected_unit || ''}||${item.receipt_number || ''}`;
              if (seen.has(key)) {
                const g = seen.get(key);
                g.totalQty += (item.quantity || 0);
                g.ids.push(item.id);
              } else {
                const g = { key, item, totalQty: item.quantity || 0, ids: [item.id] };
                seen.set(key, g);
                groups.push(g);
              }
            });
            return groups.map(({ key, item, totalQty, ids }) => (
              <div key={key} className="bg-white border border-indigo-200 rounded-lg p-2 space-y-1.5">
                <div className="flex items-start justify-between gap-1">
                  <div className="font-medium text-sm text-gray-900">
                    {item.product_name}{item.selected_color ? ` — ${item.selected_color}` : ''}
                  </div>
                  <button
                    onClick={() => ids.forEach(id => handleRemoveItem(items.find(i => i.id === id)))}
                    disabled={ids.some(id => removingItemId === id)}
                    className="shrink-0 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Remove from load"
                  >
                    {ids.some(id => removingItemId === id)
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <X className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="text-xs text-gray-500">
                  {totalQty} {item.selected_unit} · Receipt #{item.receipt_number || 'N/A'}
                </div>
                {deliveryDate && (
                  <div className="text-xs text-indigo-600">
                    Scheduled: {format(new Date(deliveryDate + 'T00:00:00'), 'MMM d, yyyy')}
                  </div>
                )}
              </div>
            ));
          })()}
          <Button
            size="sm"
            className="w-full h-9 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold mt-1"
            onClick={handleConfirmAll}
          >
            ✓ Confirm Delivered to Customer
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs border-red-300 text-red-600 hover:bg-red-50 mt-1"
            onClick={cancelDelivery}
          >
            ✕ Cancel Delivery (Return to In Hold)
          </Button>
        </div>
      </div>

    </>
  );
}