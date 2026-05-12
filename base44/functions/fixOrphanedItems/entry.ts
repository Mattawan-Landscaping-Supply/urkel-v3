import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    console.log('[fixOrphanedItems] Received request:', body);
    const { orderId } = body;
    
    if (!orderId) {
      return Response.json({ error: 'Missing orderId' }, { status: 400 });
    }

    console.log('[fixOrphanedItems] Fetching order items for order:', orderId);
    const orderItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 100);
    console.log('[fixOrphanedItems] Found', orderItems.length, 'order items');
    const allLoadItems = await base44.asServiceRole.entities.LoadItem.list('-created_date', 1000);
    console.log('[fixOrphanedItems] Found', allLoadItems.length, 'load items');
    const loadItemOrderIds = new Set(allLoadItems.map(li => li.order_item_id).filter(Boolean));

    // Get orphaned items (on_delivery or delivered but not linked to a load)
    const orphanedItems = orderItems.filter(item => 
      (item.status === 'on_delivery' || item.status === 'delivered') && 
      !loadItemOrderIds.has(item.id)
    );
    console.log('[fixOrphanedItems] Found', orphanedItems.length, 'orphaned items');

    if (orphanedItems.length === 0) {
      return Response.json({
        success: true,
        message: 'No orphaned items to fix',
        details: [],
        fixed: 0
      });
    }

    // Fix: move on_delivery items back to in_hold
    const details = [];
    for (const item of orphanedItems) {
      if (item.status === 'on_delivery') {
        await base44.entities.OrderItem.update(item.id, {
          status: 'in_hold',
          hold_location: item.hold_location || 'Warehouse'
        });
        details.push({
          itemName: `${item.product_name}${item.selected_color ? ` (${item.selected_color})` : ''}`,
          action: `Moved from on_delivery to in_hold`,
          details: `${item.quantity} ${item.selected_unit}`
        });
      } else if (item.status === 'delivered') {
        // For delivered items, just flag them as needing manual review
        details.push({
          itemName: `${item.product_name}${item.selected_color ? ` (${item.selected_color})` : ''}`,
          action: `Marked for manual review (delivered but unlinked to load)`,
          details: `${item.quantity} ${item.selected_unit} • Date: ${item.date_completed}`
        });
      }
    }

    const fixedCount = orphanedItems.filter(i => i.status === 'on_delivery').length;
    const response = {
      success: true,
      message: `Fixed ${fixedCount} orphaned item(s)`,
      details: details,
      fixed: fixedCount
    };
    console.log('[fixOrphanedItems] Returning response:', response);
    return Response.json(response);
  } catch (error) {
    console.error('[fixOrphanedItems] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});