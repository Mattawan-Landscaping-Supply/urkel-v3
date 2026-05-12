import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { loadId, productName, color } = await req.json();

    if (!loadId || !productName) {
      return Response.json({ error: 'loadId and productName required' }, { status: 400 });
    }

    // Fetch all load items for this load
    const allLoadItems = await base44.asServiceRole.entities.LoadItem.list('-created_date', 1000);
    const loadItemsForLoad = allLoadItems.filter(li => li.load_id === loadId && li.name === productName);

    if (loadItemsForLoad.length === 0) {
      return Response.json({ error: 'No items found on this load' }, { status: 404 });
    }

    // Filter by color if provided
    const relevantLoadItems = color 
      ? loadItemsForLoad.filter(li => li.selected_color === color)
      : loadItemsForLoad;

    if (relevantLoadItems.length === 0) {
      return Response.json({ error: 'No matching items found with that color' }, { status: 404 });
    }

    // Calculate total on load
    let totalOnLoad = 0;
    for (const li of relevantLoadItems) {
      totalOnLoad += (li.quantity || 0);
    }

    // Find the original quantity from the first order item reference
    const allOrderItems = await base44.asServiceRole.entities.OrderItem.list('-created_date', 1000);
    let originalQty = 0;

    for (const li of relevantLoadItems) {
      if (li.order_item_id) {
        const oi = allOrderItems.find(item => item.id === li.order_item_id);
        if (oi) {
          // Use original_quantity if available, otherwise quantity
          originalQty = oi.original_quantity || oi.quantity || 0;
          break;
        }
      }
    }

    if (originalQty === 0) {
      return Response.json({ error: 'Could not determine original quantity' }, { status: 404 });
    }
    const excessQty = totalOnLoad - originalQty;

    if (excessQty <= 0) {
      return Response.json({ 
        success: true, 
        message: 'No over-allocation detected',
        totalOnLoad,
        originalQty,
        excess: 0
      });
    }

    // Remove excess items starting from the end
    const itemsToDelete = [];
    let remainingExcess = excessQty;

    for (let i = relevantLoadItems.length - 1; i >= 0 && remainingExcess > 0; i--) {
      const item = relevantLoadItems[i];
      const qtyToRemove = Math.min(item.quantity || 0, remainingExcess);
      
      if (qtyToRemove === item.quantity) {
        // Delete entire load item
        itemsToDelete.push(item.id);
        remainingExcess -= item.quantity;
      } else {
        // Update to reduce quantity
        await base44.asServiceRole.entities.LoadItem.update(item.id, {
          quantity: (item.quantity || 0) - qtyToRemove
        });
        remainingExcess -= qtyToRemove;
      }
    }

    // Delete the items marked for removal
    await Promise.all(itemsToDelete.map(id => 
      base44.asServiceRole.entities.LoadItem.delete(id)
    ));

    return Response.json({
      success: true,
      message: `Removed ${excessQty} excess units from load`,
      originalQty,
      totalWasOnLoad: totalOnLoad,
      removedQty: excessQty,
      itemsDeleted: itemsToDelete.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});