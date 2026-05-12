import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [loads, orders] = await Promise.all([
    base44.asServiceRole.entities.Load.list('created_date', 200),
    base44.asServiceRole.entities.Order.list('created_date', 500),
  ]);

  const orderIds = new Set(orders.map(o => o.id));
  const orphaned = loads.filter(l => l.order_id && !orderIds.has(l.order_id));

  if (orphaned.length === 0) {
    return Response.json({ success: true, deletedLoads: 0, deletedItems: 0 });
  }

  const orphanedIds = new Set(orphaned.map(l => l.id));

  // Get all load items and filter to orphaned loads
  const allLoadItems = await base44.asServiceRole.entities.LoadItem.list('created_date', 500);
  const orphanedItems = allLoadItems.filter(li => orphanedIds.has(li.load_id));

  // Revert any on_delivery OrderItems back to in_hold before deleting
  const orphanedOrderItemIds = [...new Set(orphanedItems.map(li => li.order_item_id).filter(Boolean))];
  const revertUpdates = orphanedOrderItemIds.map(oid =>
    base44.asServiceRole.entities.OrderItem.update(oid, { status: 'in_hold', date_completed: null }).catch(() => {})
  );

  // Delete in parallel (after revert kicks off)
  await Promise.all([
    ...revertUpdates,
    ...orphanedItems.map(li => base44.asServiceRole.entities.LoadItem.delete(li.id)),
    ...orphaned.map(l => base44.asServiceRole.entities.Load.delete(l.id)),
  ]);

  return Response.json({ success: true, deletedLoads: orphaned.length, deletedItems: orphanedItems.length, revertedOrderItems: orphanedOrderItemIds.length });
});