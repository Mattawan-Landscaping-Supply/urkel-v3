import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LS_TOKEN_URL = 'https://cloud.lightspeedapp.com/oauth/access_token.php';

async function getAccessToken() {
  const clientId = (Deno.env.get('LIGHTSPEED_CLIENT_ID') || '').trim();
  const clientSecret = (Deno.env.get('LIGHTSPEED_CLIENT_SECRET') || '').trim();
  const refreshToken = (Deno.env.get('LIGHTSPEED_REFRESH_TOKEN') || '').trim();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  const res = await fetch(LS_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token error: ${text}`);
  return JSON.parse(text).access_token;
}

async function fetchAllLightspeedItems(accountId, accessToken) {
  const allItems = [];
  let nextUrl = `https://api.lightspeedapp.com/API/V3/Account/${accountId}/Item.json?limit=100&archived=false`;
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 429 || text.includes('Rate limit')) { await new Promise(r => setTimeout(r, 2000)); continue; }
      throw new Error(`LS API error: ${text}`);
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { keyword } = await req.json().catch(() => ({}));
    const searchTerm = (keyword || 'belvedere').toLowerCase();

    const accountId = Deno.env.get('LIGHTSPEED_ACCOUNT_ID');
    const accessToken = await getAccessToken();
    const lsItems = await fetchAllLightspeedItems(accountId, accessToken);

    const allNames = [...new Set(lsItems.map(i => (i.description || '').trim()).filter(Boolean))];
    const matching = allNames.filter(n => n.toLowerCase().includes(searchTerm)).sort();

    return Response.json({ keyword: searchTerm, count: matching.length, names: matching });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});