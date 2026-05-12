import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find or create Andy Test order
    let orders = await base44.entities.Order.filter({ customer_name: 'Andy Test' }, '-created_date', 1);
    let order = orders[0];
    
    if (!order) {
      order = await base44.entities.Order.create({
        customer_name: 'Andy Test',
        customer_phone: '555-0001',
        company_name: 'Test Company',
        notes: 'Test order for monitoring agent'
      });
    }

    // Create master item and conflicting children
    const masterItem = await base44.entities.OrderItem.create({
      order_id: order.id,
      product_name: 'Test Product',
      quantity: 2,
      selected_unit: 'Pallet',
      status: 'order'
    });

    // Create a delivered child
    const deliveredChild = await base44.entities.OrderItem.create({
      order_id: order.id,
      product_name: 'Test Product',
      quantity: 1,
      selected_unit: 'Pallet',
      status: 'delivered',
      delivery_method: 'delivery',
      date_completed: new Date().toISOString().split('T')[0],
      master_item_id: masterItem.id
    });

    // Create an on_delivery child - THIS IS THE CORRUPTION
    const onDeliveryChild = await base44.entities.OrderItem.create({
      order_id: order.id,
      product_name: 'Test Product',
      quantity: 1,
      selected_unit: 'Pallet',
      status: 'on_delivery',
      master_item_id: masterItem.id
    });

    // Create a monitoring alert for this corruption
    const alert = await base44.entities.MonitoringAlert.create({
      type: 'orphanedItems',
      message: `DATA CORRUPTION: Item on_delivery with delivered sibling. Order ${order.id} has items in conflicting states. | Test Product | Receipt #TEST-001`,
      order_id: order.id,
      is_resolved: false
    });

    return Response.json({ 
      success: true,
      message: 'Test corruption issue created',
      order_id: order.id,
      alert_id: alert.id,
      details: {
        masterItemId: masterItem.id,
        deliveredChildId: deliveredChild.id,
        onDeliveryChildId: onDeliveryChild.id
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});