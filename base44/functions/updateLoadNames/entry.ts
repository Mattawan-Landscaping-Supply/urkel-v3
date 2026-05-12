import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const updates = [
      { id: '69fb83f918d23857edd81fb3', name: 'Andy\'s Outdoor - Delivery 3' },
      { id: '69fb83fa11c52c77e926f4a3', name: 'Andy\'s Outdoor - Delivery 4' },
      { id: '69fb83fc083d090876f57cfd', name: 'Andy\'s Outdoor - Delivery 5' },
    ];

    for (const update of updates) {
      await base44.entities.Load.update(update.id, { name: update.name });
    }

    return Response.json({ success: true, updated: updates.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});