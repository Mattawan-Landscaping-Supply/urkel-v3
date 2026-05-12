import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const results: any = { deleted: [], fixed: [], errors: [] };

    // === DELETE GARBAGE MAPPINGS ===
    const garbageIds = [
      '69ffb77d270ebba2c0dad5f5', // Rose Rx / Tektramat under Montrose/Fossil
      '69ffb77c1984f70ea69f4c7d', // 1ft Levelling Stand / Perma Edge under Ledgestone Standard Coping
    ];

    for (const id of garbageIds) {
      try {
        await base44.asServiceRole.entities.ProductMapping.delete(id);
        results.deleted.push(id);
      } catch (e) {
        results.errors.push(`Delete ${id}: ${String(e)}`);
      }
    }

    // === FIX WRONG UNITS ===
    const unitFixes = [
      { id: '69e796b2cd6ee989651581bc', urkel_unit: 'Each',   note: 'SienaStone 72" Step/Safari — LS says per EACH, was Pallet' },
      { id: '69fcee31e4e2dd2bc48a81fc', urkel_unit: 'Pallet', note: 'Compac Straight Wall/Graphite — LS says per Pallet, was Each' },
    ];

    for (const fix of unitFixes) {
      try {
        await base44.asServiceRole.entities.ProductMapping.update(fix.id, { urkel_unit: fix.urkel_unit });
        results.fixed.push({ id: fix.id, urkel_unit: fix.urkel_unit, note: fix.note });
      } catch (e) {
        results.errors.push(`Fix ${fix.id}: ${String(e)}`);
      }
    }

    return Response.json({
      message: `Done: deleted ${results.deleted.length} garbage records, fixed ${results.fixed.length} wrong units`,
      ...results,
    });

  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
