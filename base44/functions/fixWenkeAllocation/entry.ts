import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Find Wenke Landscaping order by searching all orders and matching customer name
        const allOrders = await base44.asServiceRole.entities.Order.list('-created_date', 1000);
        const order = allOrders.find(o => o.customer_name && o.customer_name.includes('Wenke'));
        
        if (!order) {
            return Response.json({ error: 'Wenke Landscaping order not found' }, { status: 404 });
        }

        // Find ALL Kodah Corner items with receipt #75160
        const items = await base44.asServiceRole.entities.OrderItem.filter({ order_id: order.id });
        const kodahItems = items.filter(i => 
            i.product_name === 'Kodah Corner' && 
            i.receipt_number === '75160'
        );

        if (kodahItems.length === 0) {
            return Response.json({ error: 'No Kodah Corner items found for receipt #75160' }, { status: 404 });
        }

        // Find master item (status='order')
        const masterItem = kodahItems.find(i => i.status === 'order');
        
        // Find all delivered/on_delivery items (duplicates)
        const deliveredItems = kodahItems.filter(i => i.status === 'delivered' || i.status === 'on_delivery');

        if (deliveredItems.length === 0) {
            return Response.json({ error: 'No delivered items to clean up' }, { status: 400 });
        }

        // Calculate total delivered quantity
        const totalDelivered = deliveredItems.reduce((sum, i) => sum + (i.quantity || 0), 0);

        // Delete all delivered/on_delivery items
        await Promise.all(deliveredItems.map(item => base44.asServiceRole.entities.OrderItem.delete(item.id)));

        // Reset master to original 12 if it exists
        if (masterItem) {
            await base44.asServiceRole.entities.OrderItem.update(masterItem.id, { 
                quantity: 12,
                original_quantity: 12
            });
        }

        // Create ONE correct delivered item with qty 1 (since they ordered 1 pallet)
        await base44.asServiceRole.entities.OrderItem.create({
            product_name: 'Kodah Corner',
            selected_unit: 'Pallet',
            selected_color: masterItem?.selected_color || null,
            quantity: 1,
            status: 'delivered',
            order_id: order.id,
            receipt_number: '75160',
            is_quote: false,
            master_item_id: masterItem?.id || null,
            date_completed: new Date().toISOString().split('T')[0]
        });

        return Response.json({ 
            success: true, 
            message: `Fixed: Removed ${deliveredItems.length} duplicate items (${totalDelivered} total qty), reset master to 12, created 1 delivered item with qty 1`
        });

    } catch (error) {
        console.error('Fix failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});