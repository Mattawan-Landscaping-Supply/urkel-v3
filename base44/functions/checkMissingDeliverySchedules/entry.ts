import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get tomorrow's date in Eastern Time (same pattern used across all Urkel 2.0 functions)
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const tomorrow = new Date(nowET);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

    // Fetch delivery reminders scheduled for tomorrow
    const [allReminders, allOrders, existingAlerts] = await Promise.all([
      base44.asServiceRole.entities.DeliveryReminder.list('-created_date', 500),
      base44.asServiceRole.entities.Order.list('-created_date', 500),
      base44.asServiceRole.entities.MonitoringAlert.list('-created_date', 100)
    ]);

    const remindersForTomorrow = allReminders.filter(
      r => !r.is_resolved && r.scheduled_date === tomorrowStr
    );

    const orderIds = new Set(remindersForTomorrow.map(r => r.order_id).filter(Boolean));
    const ordersForTomorrow = allOrders.filter(o => orderIds.has(o.id) && !o.is_archived);

    // Fetch all loads to check which orders already have a load for tomorrow
    const allLoads = await base44.asServiceRole.entities.Load.list('-created_date', 500);

    // Clear noLoadBuilt alerts for orders that NOW have a non-archived load for tomorrow
    const orderIdsForTomorrow = new Set(ordersForTomorrow.map(o => o.id));
    const staleNoLoadAlerts = existingAlerts.filter(a =>
      a.type === 'noLoadBuilt' &&
      !a.is_resolved &&
      a.order_id &&
      allLoads.some(l =>
        l.order_id === a.order_id &&
        l.delivery_date === tomorrowStr &&
        l.status !== 'archived'
      )
    );
    if (staleNoLoadAlerts.length > 0) {
      await Promise.all(staleNoLoadAlerts.map(a =>
        base44.asServiceRole.entities.MonitoringAlert.delete(a.id)
      ));
    }

    let alertsCreated = 0;
    const alerts = [];

    for (const order of ordersForTomorrow) {
      // Skip if a non-archived load already exists for this order tomorrow
      const hasLoad = allLoads.some(l =>
        l.order_id === order.id &&
        l.delivery_date === tomorrowStr &&
        l.status !== 'archived'
      );
      if (hasLoad) continue;

      // Check if alert already exists for this order (type: noLoadBuilt, not resolved)
      const alertExists = existingAlerts.some(a => 
        a.type === 'noLoadBuilt' &&
        a.order_id === order.id && 
        !a.is_resolved
      );

      // If no alert exists, create monitoring alert
      if (!alertExists) {
        const alert = await base44.asServiceRole.entities.MonitoringAlert.create({
          type: 'noLoadBuilt',
          message: `No load built for delivery scheduled tomorrow (${tomorrowStr}): ${order.customer_name || 'Unknown'}${order.job_address ? ' — ' + order.job_address : ''}`,
          order_id: order.id,
          is_resolved: false
        });
        alerts.push(alert);
        alertsCreated++;
      }
    }

    return Response.json({
      success: true,
      checked_date: tomorrowStr,
      reminders_checked: remindersForTomorrow.length,
      orders_checked: ordersForTomorrow.length,
      alerts_created: alertsCreated,
      alerts
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});