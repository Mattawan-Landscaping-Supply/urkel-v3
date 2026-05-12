import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const records = await base44.asServiceRole.entities.ProductMapping.list('-created_date', 500);
  let updated = 0;
  for (const r of records) {
    if (r.lightspeed_name && (!r.lightspeed_names || r.lightspeed_names.length === 0)) {
      await base44.asServiceRole.entities.ProductMapping.update(r.id, { lightspeed_names: [r.lightspeed_name] });
      updated++;
    }
  }

  return Response.json({ updated, total: records.length });
});