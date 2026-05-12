import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CHAT_ID = 1202637898;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { message } = await req.json();
    if (!message) {
      return Response.json({ ok: false, error: 'message field is required' }, { status: 400 });
    }

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!token) {
      return Response.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: message }),
    });

    const data = await res.json();
    if (!data.ok) {
      return Response.json({ ok: false, error: data.description || 'Telegram API error' });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});