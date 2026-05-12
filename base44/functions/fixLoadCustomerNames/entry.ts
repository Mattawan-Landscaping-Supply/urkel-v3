import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all loads, orders, and customers
    const [allLoads, allOrders, allCustomers] = await Promise.all([
      base44.asServiceRole.entities.Load.list('-created_date', 500),
      base44.asServiceRole.entities.Order.list('-created_date', 500),
      base44.asServiceRole.entities.Customer.list('-created_date', 500)
    ]);

    const updatesToApply = [];

    // Check each load
    for (const load of allLoads) {
      const order = load.order_id ? allOrders.find(o => o.id === load.order_id) : null;
      
      if (!order) continue;

      // Determine what the customer_name should be
      let correctName = order.customer_name;
      
      // If order has company_name, use that
      if (order.company_name) {
        correctName = order.company_name;
      } else if (order.customer_id) {
        // Otherwise check customer table for company
        const customer = allCustomers.find(c => c.id === order.customer_id);
        if (customer?.company) {
          correctName = customer.company;
        }
      }

      // If load.customer_name doesn't match the correct name, schedule update
      if (load.customer_name !== correctName) {
        updatesToApply.push({
          loadId: load.id,
          oldName: load.customer_name,
          newName: correctName,
          orderId: order.id,
          orderName: order.customer_name,
          orderCompanyName: order.company_name
        });
      }
    }

    // Apply all updates
    const results = [];
    for (const update of updatesToApply) {
      await base44.asServiceRole.entities.Load.update(update.loadId, { customer_name: update.newName });
      results.push(update);
    }

    console.log(`Fixed ${results.length} load(s) with incorrect customer names`);

    return Response.json({
      success: true,
      fixedCount: results.length,
      updates: results
    });
  } catch (error) {
    console.error('Error in fixLoadCustomerNames:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});