import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const today = new Date();
        // Use local date string (YYYY-MM-DD)
        const todayStr = today.toISOString().split('T')[0];

        const pendingTasks = [];

        // 1. Delivery Notification tasks
        // Loads that are active, not paid, notification not sent, delivery_date <= today
        const [allLoads, allLoadItems] = await Promise.all([
            base44.asServiceRole.entities.Load.filter({ status: 'active' }),
            base44.asServiceRole.entities.LoadItem.list('-created_date', 2000)
        ]);

        const loadItemsByLoad = {};
        allLoadItems.forEach(li => {
            if (!loadItemsByLoad[li.load_id]) loadItemsByLoad[li.load_id] = [];
            loadItemsByLoad[li.load_id].push(li);
        });

        for (const load of allLoads) {
            if (load.is_paid || load.delivery_notification_sent) continue;
            if (!load.delivery_date || load.delivery_date > todayStr) continue;

            const items = loadItemsByLoad[load.id] || [];
            if (items.length > 0) {
                pendingTasks.push({
                    type: 'delivery_notification',
                    id: load.id,
                    customer_name: load.customer_name || 'Unknown',
                    delivery_date: load.delivery_date,
                    message: `Send delivery notification for ${load.customer_name || 'Unknown'} (${load.delivery_date})`,
                    navigateTo: `LoadDetails?id=${load.id}`
                });
            }
        }

        // 2. Load creation tasks
        // OrderItems that are in_hold, not a quote, not already on an active load,
        // and whose parent Order has a delivery_date <= today
        const inHoldItems = await base44.asServiceRole.entities.OrderItem.filter({ status: 'in_hold' });

        // Build set of order_item_ids that are already on active loads
        const activeLoadIds = new Set(allLoads.map(l => l.id));
        const itemsOnActiveLoads = new Set();
        allLoadItems.forEach(li => {
            if (li.order_item_id && activeLoadIds.has(li.load_id)) {
                itemsOnActiveLoads.add(li.order_item_id);
            }
        });

        // Fetch unique orders for the in_hold items
        const orderIds = [...new Set(inHoldItems.map(i => i.order_id).filter(Boolean))];
        const orderMap = {};
        if (orderIds.length > 0) {
            const orders = await Promise.all(orderIds.map(id => base44.asServiceRole.entities.Order.get(id).catch(() => null)));
            orders.forEach(o => { if (o) orderMap[o.id] = o; });
        }

        const ordersNeedingLoad = {};
        for (const item of inHoldItems) {
            if (item.is_quote) continue;
            if (itemsOnActiveLoads.has(item.id)) continue;

            const order = orderMap[item.order_id];
            if (!order || order.is_archived) continue;
            if (!order.delivery_date || order.delivery_date > todayStr) continue;

            if (!ordersNeedingLoad[order.id]) {
                ordersNeedingLoad[order.id] = { order, count: 0 };
            }
            ordersNeedingLoad[order.id].count++;
        }

        for (const { order, count } of Object.values(ordersNeedingLoad)) {
            pendingTasks.push({
                type: 'load_creation',
                id: order.id,
                customer_name: order.customer_name || 'Unknown',
                delivery_date: order.delivery_date,
                item_count: count,
                message: `Create load for ${order.customer_name || 'Unknown'} (${count} item${count !== 1 ? 's' : ''} in hold, scheduled ${order.delivery_date})`,
                navigateTo: `OrderDetails?id=${order.id}`
            });
        }

        return Response.json({ tasks: pendingTasks });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});