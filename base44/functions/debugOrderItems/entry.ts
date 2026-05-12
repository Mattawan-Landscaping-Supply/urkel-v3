import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orderId } = await req.json();

    // Fetch all items for this order
    const items = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);

    return Response.json({ 
      totalItems: items.length,
      items: items.map(i => ({
        id: i.id,
        product_name: i.product_name,
        quantity: i.quantity,
        status: i.status,
        delivery_method: i.delivery_method,
        date_completed: i.date_completed
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});