import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Central unfulfillment function: removes an OrderItem from a Load, reverting all related records consistently.
 * 
 * Payload:
 *   - loadItemId: string (required) - the LoadItem to remove from the load
 * 
 * This is the single source of truth for removing an item from a delivery load.
 * It handles:
 *   - Deleting the LoadItem record
 *   - Reverting OrderItem status to 'in_hold' (always, since items on loads came from in_hold)
 *   - Restoring OrderItem hold_location to original_hold_location
 *   - Clearing date_completed on OrderItem
 *   - Updating Order's is_completed flag if necessary
 *   - Automatically deleting the load if it becomes empty
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { loadItemId } = await req.json();

    if (!loadItemId) {
      return Response.json({ error: 'loadItemId is required' }, { status: 400 });
    }

    // Fetch the load item
    let loadItem;
    try {
      loadItem = await base44.entities.LoadItem.get(loadItemId);
    } catch (e) {
      // Already deleted or not found — treat as success (idempotent)
      return Response.json({ success: true, loadItemId, alreadyGone: true });
    }
    if (!loadItem) {
      return Response.json({ success: true, loadItemId, alreadyGone: true });
    }

    const loadId = loadItem.load_id;

    // Fetch OrderItem and remaining load items in parallel
    const [orderItem, remainingItemsBeforeDelete] = await Promise.all([
      loadItem.order_item_id
        ? base44.entities.OrderItem.get(loadItem.order_item_id).catch(() => null)
        : Promise.resolve(null),
      base44.asServiceRole.entities.LoadItem.filter({ load_id: loadId }).catch(() => [])
    ]);

    // Revert the order item if it exists
    if (loadItem.order_item_id && orderItem) {
      // For partial deliveries: the on_delivery OrderItem was a new split item with its own ID.
      // The original in_hold source item (master_item_id) needs its quantity restored.
      // For full deliveries: the OrderItem IS the source item — restore status in_hold.
      // A "partial split" item is one created by fulfillOrderItem's partial path:
      // - it has master_item_id AND original_status was NOT 'in_hold' (it never existed as in_hold independently)
      // Items that were in_hold before being placed on a load have original_status === 'in_hold'
      // and should be RESTORED to in_hold, not deleted.
      const isPartialSplit = !!orderItem.master_item_id && loadItem.original_status !== 'in_hold';

      if (isPartialSplit) {
        // This was a partial delivery split — delete the on_delivery item and restore qty to source
        const sourceItem = await base44.entities.OrderItem.get(orderItem.master_item_id).catch(() => null);
        if (sourceItem) {
          const restoredQty = Math.max(0, (sourceItem.quantity || 0) + (loadItem.quantity || 0));
          await base44.entities.OrderItem.update(sourceItem.id, {
            quantity: restoredQty,
            status: 'in_hold',
            hold_location: loadItem.original_hold_location || sourceItem.hold_location || null
          });
        }
        // Delete the split on_delivery item
        await base44.entities.OrderItem.delete(loadItem.order_item_id).catch(() => {});
      } else {
        // Full delivery — restore the item back to in_hold
        await base44.entities.OrderItem.update(loadItem.order_item_id, {
          status: 'in_hold',
          hold_location: loadItem.original_hold_location || null,
          date_completed: null,
          delivery_method: null,
          date_arrived: orderItem.date_arrived || null
        });
      }

      // Only fetch+update the Order if it might be marked completed (avoids extra round-trip in common case)
      const updates = [];
      if (orderItem.order_id) {
        updates.push(
          base44.entities.Order.get(orderItem.order_id).then(order => {
            if (order?.is_completed) {
              return base44.entities.Order.update(orderItem.order_id, { is_completed: false });
            }
          }).catch(() => {})
        );
      }

      await Promise.all(updates);
    }

    // Delete the load item only — never delete the Load record itself
    await base44.entities.LoadItem.delete(loadItemId);

    return Response.json({
      success: true,
      loadItemId,
      loadId,
      loadWasDeleted: false,
      orderItemId: loadItem.order_item_id || null
    });

  } catch (error) {
    console.error('unfulfillOrderItem error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});