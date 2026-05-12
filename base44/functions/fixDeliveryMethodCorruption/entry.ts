import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { orderId, alertId } = await req.json();

    if (!orderId) return Response.json({ error: 'orderId is required' }, { status: 400 });

    const orderItems = await base44.asServiceRole.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);

    // Find items that are on_delivery or delivered but have wrong delivery_method
    const corrupted = orderItems.filter(i =>
      (i.status === 'delivered' || i.status === 'on_delivery') &&
      i.delivery_method !== 'delivery'
    );

    if (corrupted.length === 0) {
      return Response.json({ success: true, message: 'No corrupted items found — may already be fixed.', details: [] });
    }

    await Promise.all(corrupted.map(i =>
      base44.asServiceRole.entities.OrderItem.update(i.id, { delivery_method: 'delivery' })
    ));

    // Resolve the alert if provided
    if (alertId) {
      await base44.asServiceRole.entities.MonitoringAlert.update(alertId, { is_resolved: true });
    }

    return Response.json({
      success: true,
      message: `Fixed ${corrupted.length} item(s) — delivery_method corrected to "delivery".`,
      details: corrupted.map(i => ({
        itemName: i.product_name,
        action: `Updated delivery_method from "${i.delivery_method || 'none'}" to "delivery"`,
        details: `Status: ${i.status}`
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});