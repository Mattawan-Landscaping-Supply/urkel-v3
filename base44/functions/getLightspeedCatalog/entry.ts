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
    grant_type: 'refresh_token'
  });
  const res = await fetch(LS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const text = await res.text();
  if (!res.ok) throw new Error('LS auth failed: ' + text);
  return JSON.parse(text).access_token;
}

async function fetchAllCategories(accountId: string, token: string) {
  const res = await fetch(
    `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Category.json?limit=200`,
    { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }
  );
  const text = await res.text();
  if (!res.ok) throw new Error('LS categories error: ' + text);
  const data = JSON.parse(text);
  if (!data.Category) return [];
  return Array.isArray(data.Category) ? data.Category : [data.Category];
}

async function fetchItemsPage(accountId: string, token: string, nextUrl: string | null = null) {
  const url = nextUrl ||
    `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Item.json?limit=100&load_relations=["Category"]&archived=false`;
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  });
  const text = await res.text();
  if (!res.ok) throw new Error('LS items fetch error: ' + text);
  const data = JSON.parse(text);
  const items = !data.Item ? [] : Array.isArray(data.Item) ? data.Item : [data.Item];
  const next = data['@attributes']?.next || null;
  return { items, next };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = Deno.env.get('LIGHTSPEED_ACCOUNT_ID') || '';
    const token = await getAccessToken();

    const allCategories = await fetchAllCategories(accountId, token);

    const targetKeywords = ['high format', 'hi format', 'unilock', 'fendt'];
    const matchedCategories = allCategories.filter(c =>
      targetKeywords.some(t => (c.name || '').toLowerCase().includes(t))
    );
    const matchedCategoryIds = new Set(matchedCategories.map(c => String(c.categoryID)));

    // Include child categories of matched parents
    for (const cat of allCategories) {
      if (cat.parentID && matchedCategoryIds.has(String(cat.parentID))) {
        matchedCategoryIds.add(String(cat.categoryID));
      }
    }

    // categoryID -> display group name (parent category name)
    const categoryNameLookup: Record<string, string> = {};
    for (const cat of allCategories) {
      if (matchedCategoryIds.has(String(cat.categoryID))) {
        const parentName = matchedCategories.find(p => String(p.categoryID) === String(cat.parentID))?.name;
        categoryNameLookup[String(cat.categoryID)] = parentName || cat.name;
      }
    }

    // Page through ALL items, keeping only those in matched categories
    const items: any[] = [];
    let nextUrl: string | null = null;
    let pageCount = 0;
    const MAX_PAGES = 50;

    do {
      const { items: batch, next } = await fetchItemsPage(accountId, token, nextUrl);
      for (const item of batch) {
        const catId = String(item.categoryID || item.Category?.categoryID || '');
        if (matchedCategoryIds.has(catId)) {
          items.push({
            itemID: item.itemID,
            description: (item.description || '').trim(),
            categoryID: catId,
            categoryName: categoryNameLookup[catId] || item.Category?.name || catId,
          });
        }
      }
      nextUrl = next;
      pageCount++;
    } while (nextUrl && pageCount < MAX_PAGES);

    const allMappings = await base44.asServiceRole.entities.ProductMapping.list('-created_date', 500);
    const allUrkelProducts = await base44.asServiceRole.entities.Product.list('name', 500);

    return Response.json({
      success: true,
      categories: matchedCategories.map(c => ({ id: c.categoryID, name: c.name })),
      items,
      item_count: items.length,
      pages_fetched: pageCount,
      mappings: allMappings,
      urkel_products: allUrkelProducts.map(p => ({
        id: p.id, name: p.name, colors: p.colors || [], units: p.units || []
      })),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
