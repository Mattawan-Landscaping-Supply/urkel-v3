import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { orderItemId, fixType } = await req.json();

        if (!orderItemId || !fixType) {
            return Response.json({ error: 'Missing orderItemId or fixType' }, { status: 400 });
        }

        const item = await base44.asServiceRole.entities.OrderItem.get(orderItemId);
        if (!item) return Response.json({ error: 'Item not found' }, { status: 404 });

        if (fixType === 'change_to_pickup') {
            // Change delivery_method to 'pickup' so it no longer needs a load
            await base44.asServiceRole.entities.OrderItem.update(orderItemId, { delivery_method: 'pickup' });
            return Response.json({ success: true, message: 'Changed to pickup - no load required' });
        }

        if (fixType === 'create_load') {
            // Create a minimal load for this item
            const order = await base44.asServiceRole.entities.Order.get(item.order_id);
            
            const load = await base44.asServiceRole.entities.Load.create({
                name: `${order?.customer_name || 'Order'} - ${item.receipt_number || 'Manual'}`,
                order_id: item.order_id,
                receipt_numbers: item.receipt_number ? [item.receipt_number] : [],
                customer_name: order?.customer_name || '',
                customer_address: order?.job_address || '',
                customer_phone: order?.customer_phone || '',
                delivery_date: item.date_completed || new Date().toISOString().split('T')[0],
                status: 'archived', // archived since it's already delivered
                is_active: false
            });

            // Create load item linking this order item to the load
            await base44.asServiceRole.entities.LoadItem.create({
                load_id: load.id,
                order_item_id: item.id,
                name: item.product_name,
                selected_color: item.selected_color || '',
                selected_unit: item.selected_unit || 'Pallet',
                quantity: item.quantity || 1,
                category: ''
            });

            return Response.json({ success: true, message: 'Load record created and item linked' });
        }

        return Response.json({ error: 'Unknown fixType' }, { status: 400 });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});