import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get all OrderItems with selected_unit = Pallet and keep_on_same_load = true
    const items = await base44.entities.OrderItem.filter({ selected_unit: 'Pallet', keep_on_same_load: true }, '-created_date', 500);

    let fixed = 0;
    for (const item of items) {
      await base44.entities.OrderItem.update(item.id, { keep_on_same_load: false });
      fixed++;
    }

    return Response.json({ success: true, fixed, message: `Cleared keep_on_same_load on ${fixed} Pallet items` });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});
