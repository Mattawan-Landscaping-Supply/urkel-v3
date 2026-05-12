import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const today = new Date();
        // Use Eastern time for date calculation
        const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD

        // Fetch all unresolved delivery reminders for today
        const allReminders = await base44.asServiceRole.entities.DeliveryReminder.list('-created_date', 500);
        const todayReminders = allReminders.filter(r => !r.is_resolved && r.scheduled_date === todayStr);

        if (todayReminders.length === 0) {
            return Response.json({ success: true, message: 'No delivery reminders for today', count: 0 });
        }

        // Fetch order details for each reminder
        const allOrders = await base44.asServiceRole.entities.Order.list('-created_date', 1000);
        const allItems = await base44.asServiceRole.entities.OrderItem.list('-created_date', 5000);

        // Create monitoring alerts for today's reminders
        const existingAlerts = await base44.asServiceRole.entities.MonitoringAlert.filter({ is_resolved: false });
        for (const reminder of todayReminders) {
            const message = `Delivery reminder for today (${todayStr}): ${reminder.customer_name || 'Unknown'}${reminder.notes ? ' — ' + reminder.notes : ''}`;
            const alreadyExists = existingAlerts.some(a => a.type === 'noLoadBuilt' && a.message === message);
            if (!alreadyExists) {
                await base44.asServiceRole.entities.MonitoringAlert.create({
                    type: 'noLoadBuilt',
                    message,
                    order_id: reminder.order_id,
                    is_resolved: false
                });
            }
        }

        return Response.json({ success: true, count: todayReminders.length, message: `Created ${todayReminders.length} monitoring alert(s) for today's delivery reminders` });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});