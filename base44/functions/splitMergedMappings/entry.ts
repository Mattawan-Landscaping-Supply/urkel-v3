import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const unitPattern = /\bper\s+(Pallet|Each|Layer|EACH|PALLET|LAYER)\b/i;

function extractUnit(name: string): string | null {
  const m = name.match(unitPattern);
  if (!m) return null;
  const u = m[1].toLowerCase();
  return u.charAt(0).toUpperCase() + u.slice(1);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch {}
    const dry_run = body.dry_run !== false;
    const chunk_size = body.chunk_size || 10;
    const start_offset = body.start_offset || 0; // for resuming if needed

    const allMappings = await base44.asServiceRole.entities.ProductMapping.list('-created_date', 500);

    // Identify all records that need splitting
    const workItems: { record: any; toCreate: any[] }[] = [];

    for (const record of allMappings) {
      const names: string[] = record.lightspeed_names || [];
      if (names.length <= 1) continue;

      const groups: Record<string, string[]> = {};
      for (const name of names) {
        const unit = extractUnit(name) || '__none__';
        if (!groups[unit]) groups[unit] = [];
        groups[unit].push(name);
      }

      const unitKeys = Object.keys(groups);
      if (unitKeys.length <= 1) continue;

      const newRecords = Object.entries(groups).map(([unit, unitNames]) => ({
        urkel_product_name: record.urkel_product_name,
        urkel_color: record.urkel_color,
        urkel_unit: unit === '__none__' ? null : unit,
        lightspeed_names: unitNames,
        confirmed: true,
        category: record.category || null,
      }));

      workItems.push({ record, toCreate: newRecords });
    }

    const total = workItems.length;
    const slice = workItems.slice(start_offset, start_offset + chunk_size);

    if (dry_run) {
      return Response.json({
        dry_run: true,
        total_to_split: total,
        chunk_size,
        start_offset,
        this_chunk: slice.length,
        message: `Would process ${slice.length} of ${total} records in this call`,
        splits: slice.map(w => ({
          id: w.record.id,
          product: w.record.urkel_product_name,
          color: w.record.urkel_color,
          was: w.record.lightspeed_names,
          becomes: w.toCreate.map(r => ({ unit: r.urkel_unit, names: r.lightspeed_names })),
        })),
      });
    }

    // Execute this chunk
    let deleted = 0;
    let created = 0;
    const errors: string[] = [];

    for (const { record, toCreate } of slice) {
      try {
        // Create new split records first, then delete the merged one
        for (const newRec of toCreate) {
          await base44.asServiceRole.entities.ProductMapping.create(newRec);
          created++;
        }
        await base44.asServiceRole.entities.ProductMapping.delete(record.id);
        deleted++;
        await sleep(100); // small delay between records to avoid hammering the API
      } catch (e) {
        errors.push(`${record.urkel_product_name} / ${record.urkel_color}: ${String(e)}`);
      }
    }

    const next_offset = start_offset + chunk_size;
    const done = next_offset >= total;

    return Response.json({
      dry_run: false,
      chunk_processed: slice.length,
      deleted,
      created,
      errors,
      total_to_split: total,
      next_offset,
      done,
      message: done
        ? `✅ All done! Processed all ${total} merged records.`
        : `Chunk complete. Call again with { "dry_run": false, "start_offset": ${next_offset} } to continue.`,
    });

  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
