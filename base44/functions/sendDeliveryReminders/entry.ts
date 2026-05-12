import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const orders = await base44.asServiceRole.entities.Order.list('-created_date', 1000);
    const ordersForTomorrow = orders.filter(o =>
      !o.is_archived &&
      !o.is_completed &&
      o.delivery_date === tomorrowStr
    );

    if (ordersForTomorrow.length === 0) {
      return Response.json({ success: true, message: 'No orders for tomorrow', count: 0 });
    }

    const allItems = await base44.asServiceRole.entities.OrderItem.list('-created_date', 5000);

    let alertCount = 0;

    for (const order of ordersForTomorrow) {
      const orderItems = allItems.filter(i => i.order_id === order.id);
      const receiptNumbers = [...new Set(orderItems.filter(i => i.receipt_number).map(i => i.receipt_number))];
      if (orderItems.length === 0 || receiptNumbers.length === 0) continue;

      await base44.asServiceRole.entities.MonitoringAlert.create({
        type: 'missedDeliveries',
        message: `Delivery reminder for tomorrow (${tomorrowStr}): ${order.customer_name || 'Unknown'}${order.job_address ? ' — ' + order.job_address : ''}${receiptNumbers.length > 0 ? ' | Receipts: #' + receiptNumbers.join(', #') : ''}`,
        order_id: order.id,
        is_resolved: false
      });

      alertCount++;
    }

    return Response.json({
      success: true,
      message: `Created ${alertCount} delivery reminder alert(s)`,
      count: alertCount,
      ordersChecked: ordersForTomorrow.length
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});