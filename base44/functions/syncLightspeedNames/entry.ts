import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LS_TOKEN_URL = 'https://cloud.lightspeedapp.com/oauth/access_token.php';

async function getAccessToken() {
  const clientId = (Deno.env.get('LIGHTSPEED_CLIENT_ID') || '').trim();
  const clientSecret = (Deno.env.get('LIGHTSPEED_CLIENT_SECRET') || '').trim();
  const refreshToken = (Deno.env.get('LIGHTSPEED_REFRESH_TOKEN') || '').trim();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(LS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Failed to get Lightspeed access token: ${text}`);
  return JSON.parse(text).access_token;
}

async function fetchAllLightspeedItems(accountId, accessToken) {
  const allItems = [];
  let nextUrl = `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Item.json?limit=100&archived=false`;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 429 || text.includes('Rate limit')) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw new Error(`Lightspeed API error fetching items: ${text}`);
    }

    const data = JSON.parse(text);
    if (!data.Item) break;

    const items = Array.isArray(data.Item) ? data.Item : [data.Item];
    allItems.push(...items);

    nextUrl = data['@attributes']?.next || null;
    if (nextUrl) await new Promise(r => setTimeout(r, 300));
  }

  return allItems;
}

// Extract color from end of name: "Belvedere Wall per Pallet (27 SF) - Limestone" → "Limestone"
function extractColor(name) {
  const match = name.match(/\s+-\s+([^-]+)$/);
  return match ? match[1].trim() : null;
}

// Extract unit from LS name
function extractUnit(name) {
  const lower = name.toLowerCase();
  if (lower.includes('per pallet')) return 'Pallet';
  if (lower.includes('per layer')) return 'Layer';
  if (lower.includes('per each')) return 'Each';
  return null;
}

// Strip unit phrase and color suffix to get the bare product name from LS
// "Belvedere Wall per Pallet (27 SF) - Limestone" → "Belvedere Wall"
// "Belvedere Fire Pit (w/Ring) per Pallet - Limestone" → "Belvedere Fire Pit (w/Ring)"
// "Belvedere Fire Pit (w/Ring) - Limestone" → "Belvedere Fire Pit (w/Ring)"
function extractLsProductName(name) {
  let s = name;
  // Remove color suffix " - Color" at end
  s = s.replace(/\s+-\s+[^-]+$/, '').trim();
  // Remove unit phrase with optional parenthetical: " per Pallet (27 SF)" or " per EACH"
  s = s.replace(/\s+per\s+(pallet|layer|each)\b(\s*\([^)]*\))?/gi, '').trim();
  return s;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = Deno.env.get('LIGHTSPEED_ACCOUNT_ID');
    const accessToken = await getAccessToken();

    const [lsItems, allMappings, allProducts] = await Promise.all([
      fetchAllLightspeedItems(accountId, accessToken),
      base44.asServiceRole.entities.ProductMapping.list('-created_date', 500),
      base44.asServiceRole.entities.Product.list('-created_date', 500),
    ]);

    const lsNames = [...new Set(
      lsItems.map(item => (item.description || '').trim()).filter(Boolean)
    )];

    // Build product units lookup
    const productUnits = {};
    for (const p of allProducts) {
      productUnits[p.name.toLowerCase()] = (p.units || []).map(u => u.toLowerCase());
    }

    // Build set of already-mapped names
    const alreadyMapped = new Set();
    for (const m of allMappings) {
      for (const n of (m.lightspeed_names || [])) {
        alreadyMapped.add(n.trim().toLowerCase());
      }
    }

    const updatedMappings = {}; // mappingId → new names array
    const noMatch = [];
    let newlyMappedCount = 0;

    for (const lsName of lsNames) {
      if (alreadyMapped.has(lsName.toLowerCase())) continue;

      const lsProductName = extractLsProductName(lsName);
      const lsColor = extractColor(lsName);
      const lsUnit = extractUnit(lsName);

      if (!lsProductName) {
        noMatch.push(lsName);
        continue;
      }

      // STRICT matching: the extracted LS product name must EXACTLY equal the Urkel product name (case-insensitive)
      // No partial matches, no substring matches — exact only.
      let matched = null;
      for (const m of allMappings) {
        const urkelName = (m.urkel_product_name || '').toLowerCase();
        const urkelColor = (m.urkel_color || '').toLowerCase();

        // Product name must match exactly
        if (urkelName !== lsProductName.toLowerCase()) continue;

        // Color must match exactly (if LS has a color)
        if (lsColor && urkelColor !== lsColor.toLowerCase()) continue;

        // Unit must be valid for this product
        if (lsUnit) {
          const validUnits = productUnits[urkelName] || [];
          if (validUnits.length > 0 && !validUnits.includes(lsUnit.toLowerCase())) continue;
        }

        matched = m;
        break;
      }

      if (!matched) {
        noMatch.push(lsName);
        continue;
      }

      if (!updatedMappings[matched.id]) {
        updatedMappings[matched.id] = [...(matched.lightspeed_names || [])];
      }
      if (!updatedMappings[matched.id].map(n => n.toLowerCase()).includes(lsName.toLowerCase())) {
        updatedMappings[matched.id].push(lsName);
        newlyMappedCount++;
      }
    }

    // Persist updates
    const updateEntries = Object.entries(updatedMappings);
    for (const [mappingId, newNames] of updateEntries) {
      await base44.asServiceRole.entities.ProductMapping.update(mappingId, { lightspeed_names: newNames });
    }

    return Response.json({
      total_ls_products: lsNames.length,
      newly_mapped: newlyMappedCount,
      mappings_updated: updateEntries.length,
      no_match_count: noMatch.length,
      no_match_names: noMatch.slice(0, 200),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});