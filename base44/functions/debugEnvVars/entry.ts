Deno.serve(async (req) => {
  const keys = ['TELEGRAM_BOT_TOKEN', 'LIGHTSPEED_CLIENT_ID', 'LIGHTSPEED_ACCOUNT_ID'];
  const result = {};
  for (const k of keys) {
    const val = Deno.env.get(k);
    result[k] = val ? `SET (starts with: ${val.substring(0,6)}...)` : 'NOT FOUND';
  }
  return Response.json(result);
});