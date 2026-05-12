import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Fixes OrderItems stuck in 'on_delivery' status with no corresponding LoadItem on an active load.
// Reverts them back to 'in_hold' so they can be loaded correctly.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { orderId } = body;
    if (!orderId) return Response.json({ error: 'orderId required' }, { status: 400 });

    // Fetch all on_delivery items for this order
    const orderItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);
    const onDeliveryItems = orderItems.filter(i => i.status === 'on_delivery' && (i.quantity || 0) > 0);

    if (onDeliveryItems.length === 0) {
      return Response.json({ fixed: 0, message: 'No on_delivery items found' });
    }

    // Fetch ALL load items globally to check coverage
    const allLoadItems = await base44.asServiceRole.entities.LoadItem.list('-created_date', 500);
    const allLoads = await base44.asServiceRole.entities.Load.list('-created_date', 500);
    const activeLoadIds = new Set(allLoads.filter(l => l.status !== 'archived').map(l => l.id));

    const fixed = [];
    for (const item of onDeliveryItems) {
      // Check if this item has a LoadItem on an active load
      const coveringLoadItem = allLoadItems.find(
        li => li.order_item_id === item.id && activeLoadIds.has(li.load_id)
      );
      if (!coveringLoadItem) {
        // Orphaned — revert to in_hold
        await base44.entities.OrderItem.update(item.id, {
          status: 'in_hold',
          date_completed: null,
        });
        fixed.push({ id: item.id, product_name: item.product_name, quantity: item.quantity });
      }
    }

    return Response.json({ fixed: fixed.length, items: fixed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});