import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orderId } = await req.json();

    if (!orderId) {
      return Response.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Fetch all items for this order
    const items = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);

    // Find items with status 'delivered' and delivery_method 'delivery' or 'pickup'
    const itemsToUpdate = items.filter(i => 
      i.status === 'delivered' && 
      (i.delivery_method === 'delivery' || i.delivery_method === 'pickup')
    );

    if (itemsToUpdate.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'No items to update',
        updated: 0
      });
    }

    // Update all items to on_delivery status
    await Promise.all(
      itemsToUpdate.map(item =>
        base44.entities.OrderItem.update(item.id, { 
          status: 'on_delivery',
          date_completed: null // Clear the completion date since it's not delivered yet
        })
      )
    );

    return Response.json({ 
      success: true, 
      message: `Updated ${itemsToUpdate.length} items to on_delivery status`,
      updated: itemsToUpdate.length,
      items: itemsToUpdate.map(i => ({ id: i.id, product: i.product_name, quantity: i.quantity }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});