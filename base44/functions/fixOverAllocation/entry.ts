import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { orderId, productName, receiptNumber, targetQuantity, alertId } = await req.json();

    if (!orderId || !productName || targetQuantity == null) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const orderItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);

    // Find all items for this product+receipt combination
    // Use flexible matching: exact match OR the alert's productName starts with the item's product_name
    const matchingItems = orderItems.filter(i => {
      const matchesProduct = i.product_name === productName || 
                             productName?.startsWith(i.product_name) ||
                             i.product_name?.startsWith(productName);
      const matchesReceipt = !receiptNumber || i.receipt_number === receiptNumber;
      return matchesProduct && matchesReceipt;
    });

    if (matchingItems.length === 0) {
      return Response.json({ error: 'No matching items found' }, { status: 404 });
    }

    // Sort: master (status=order) items first, then non-master
    const masterItems = matchingItems.filter(i => i.status === 'order');
    const nonMasterItems = matchingItems.filter(i => i.status !== 'order');

    // Calculate current total
    const currentTotal = matchingItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
    const excess = currentTotal - targetQuantity;

    if (excess <= 0) {
      return Response.json({ success: true, message: 'No over-allocation found — quantities are already correct.', details: [] });
    }

    const details = [];
    let remaining = excess;

    // First, reduce master (order status) items since they haven't been committed yet
    for (const item of masterItems) {
      if (remaining <= 0) break;
      const reduce = Math.min(item.quantity || 0, remaining);
      if (reduce <= 0) continue;
      const newQty = (item.quantity || 0) - reduce;
      if (newQty === 0) {
        await base44.asServiceRole.entities.OrderItem.delete(item.id);
        details.push({ itemName: item.product_name, action: `Removed master order item (qty was ${item.quantity}, now fully reduced)` });
      } else {
        await base44.asServiceRole.entities.OrderItem.update(item.id, { quantity: newQty });
        details.push({ itemName: item.product_name, action: `Reduced master order quantity from ${item.quantity} to ${newQty}` });
      }
      remaining -= reduce;
    }

    // If still excess, reduce non-master items (on_order, in_hold, etc.)
    for (const item of nonMasterItems) {
      if (remaining <= 0) break;
      const reduce = Math.min(item.quantity || 0, remaining);
      if (reduce <= 0) continue;
      const newQty = (item.quantity || 0) - reduce;
      if (newQty === 0) {
        await base44.asServiceRole.entities.OrderItem.delete(item.id);
        details.push({ itemName: item.product_name, action: `Removed ${item.status} item (qty was ${item.quantity}, now fully reduced)` });
      } else {
        await base44.asServiceRole.entities.OrderItem.update(item.id, { quantity: newQty });
        details.push({ itemName: item.product_name, action: `Reduced ${item.status} quantity from ${item.quantity} to ${newQty}` });
      }
      remaining -= reduce;
    }

    // Resolve the alert if provided
    if (alertId) {
      try {
        await base44.asServiceRole.entities.MonitoringAlert.update(alertId, { is_resolved: true });
      } catch (e) { /* ignore */ }
    }

    return Response.json({
      success: true,
      message: `Over-allocation fixed. Reduced total quantity from ${currentTotal} to ${targetQuantity}.`,
      details
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});