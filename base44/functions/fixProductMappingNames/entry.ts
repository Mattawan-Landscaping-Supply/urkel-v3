import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const renames = {
    'Empire Steps 6x30': 'Empire 6x30 Steps',
    'Empire Steps 5x24': 'Empire 5x24 Steps',
    'Empire Steps 4x21': 'Empire 4x21 Steps',
    'Empire Steps 3x18': 'Empire 3x18 Steps',
    'Beacon Hill Flag': 'Beacon Hill Flagstone',
    'Beacon Hill Smooth Random': 'Beacon Hill Smooth',
    'Bristol Valley Random': 'Bristol Valley',
    'Brussels Block Standard': 'Brussels Block Std',
    'Brussels Fullnose': 'Brussels Fullnose ',
    'Copthorne': 'Copthorne ',
    'Camden Cap 24"': 'Camden Cap, 24"',
    'Dimensional Steps 4x18': 'Dimensional 4x18 Steps',
    'Dimensional Steps 6x30': 'Dimensional 6x30 Steps',
    'Dimensional Fire Pit': 'Dimensional Fire Pit (w/Ring)',
    'Belvedere Fire Pit': 'Belvedere Fire Pit (w/Ring)',
    'Kodah Fire Pit': 'Kodah Fire Pit (w/Ring)',
    'Fendt Straight Wall': 'Fendt Straight Wall ',
    'Harbor Stone XL Rec': 'Harbor Stone - XL Rec',
    'Harbor Stone XL Mega Lg Rec': 'Harbor Stone - Mega Lg Rec',
    'Harbor Stone XL Lg Square': 'Harbor Stone - Lg Square',
    'Heartwood Wall FDL': 'Heartwood Wall',
    'Holland Premier Each': 'Holland Premier',
    'Hollandstone 60mm': 'Hollandstone',
    "Irregular Steps 6'": "Irregular 6' Steps",
    'Irregular Steps 7"': 'Irregular 7" Steps',
    'Montrose Each': 'Montrose',
    'New Mission Layer': 'New Mission',
    'Richcliff Layer': 'Richcliff',
    'Treo Smooth Layer': 'Treo Smooth',
  };

  const all = await base44.asServiceRole.entities.ProductMapping.list('-created_date', 500);
  let fixed = 0;
  const results = [];

  for (const r of all) {
    const newName = renames[r.urkel_product_name];
    if (newName) {
      await base44.asServiceRole.entities.ProductMapping.update(r.id, { urkel_product_name: newName });
      results.push(`${r.urkel_product_name} → ${newName}`);
      fixed++;
    }
  }

  return Response.json({ fixed, total: all.length, results });
});