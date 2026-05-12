import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all loads where customer_name contains 'Bodfish'
    const allLoads = await base44.entities.Load.list('-created_date', 500);
    const bodfishLoads = allLoads.filter(l => l.customer_name && l.customer_name.toLowerCase().includes('bodfish'));
    
    // Fetch all orders to look up company names
    const allOrders = await base44.entities.Order.list('-created_date', 500);
    
    const results = [];
    const updates = [];

    for (const load of bodfishLoads) {
      results.push({
        id: load.id,
        customer_name: load.customer_name,
        company_name: load.company_name,
      });

      // Determine correct company name
      let correctCompanyName = load.company_name;
      if (!correctCompanyName) {
        const linkedOrder = load.order_id ? allOrders.find(o => o.id === load.order_id) : null;
        correctCompanyName = linkedOrder?.company_name || linkedOrder?.customer_name || null;
      }

      // Only update if company_name is set and different from customer_name
      if (correctCompanyName && load.customer_name !== correctCompanyName) {
        updates.push({
          loadId: load.id,
          newCustomerName: correctCompanyName,
        });
      }
    }

    // Apply updates
    for (const update of updates) {
      await base44.entities.Load.update(update.loadId, { customer_name: update.newCustomerName });
    }

    return Response.json({
      found: bodfishLoads.length,
      updated: updates.length,
      records: results,
      updates: updates,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});