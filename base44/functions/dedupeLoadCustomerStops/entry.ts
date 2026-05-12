import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const allStops = await base44.asServiceRole.entities.LoadCustomerStop.list('created_date', 2000);
    
    // Group by (load_id, order_id)
    const groups: Record<string, any[]> = {};
    for (const stop of allStops) {
      const key = `${stop.load_id}__${stop.order_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(stop);
    }

    const deleted: string[] = [];
    const errors: string[] = [];

    for (const [key, stops] of Object.entries(groups)) {
      if (stops.length <= 1) continue;
      // Keep the one with the lowest stop_order (or earliest created_date), delete the rest
      stops.sort((a, b) => (a.stop_order ?? 999) - (b.stop_order ?? 999) || new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
      const toDelete = stops.slice(1);
      for (const dup of toDelete) {
        try {
          await base44.asServiceRole.entities.LoadCustomerStop.delete(dup.id);
          deleted.push(`${dup.id} (load=${dup.load_id}, order=${dup.order_id})`);
        } catch (e) {
          errors.push(`${dup.id}: ${String(e)}`);
        }
      }
    }

    return Response.json({
      total_stops: allStops.length,
      duplicate_groups: Object.values(groups).filter(g => g.length > 1).length,
      deleted,
      errors
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
