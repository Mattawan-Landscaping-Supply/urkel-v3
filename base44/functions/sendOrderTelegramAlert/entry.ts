import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { event, data } = payload;

    if (event.type !== 'create') {
      return Response.json({ error: 'Only create events are supported' }, { status: 400 });
    }

    const order = data;
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = '1202637898';

    if (!token) {
      console.warn('TELEGRAM_BOT_TOKEN not set');
      return Response.json({ error: 'Telegram bot token not configured' }, { status: 400 });
    }

    const customerName = order.company_name || order.customer_name || 'Unknown';
    const receiptNumbers = Array.isArray(order.receipt_numbers)
      ? order.receipt_numbers.join(', ')
      : (typeof order.receipt_numbers === 'string' ? order.receipt_numbers : 'N/A');

    const message = `🆕 New Order: ${customerName} — Receipt(s): ${receiptNumbers}`;

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Telegram API error:', error);
      return Response.json({ error: 'Failed to send Telegram message', details: error }, { status: 500 });
    }

    const result = await response.json();
    return Response.json({ success: true, message_id: result.result.message_id });
  } catch (error) {
    console.error('Error in sendOrderTelegramAlert:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});