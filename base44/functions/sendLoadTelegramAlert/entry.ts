import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { event, data } = payload;

    if (event.type !== 'create') {
      return Response.json({ error: 'Only create events are supported' }, { status: 400 });
    }

    const load = data;
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = '1202637898'; // redeployed

    if (!token) {
      console.warn('TELEGRAM_BOT_TOKEN not set');
      return Response.json({ error: 'Telegram bot token not configured' }, { status: 400 });
    }

    const customerName = load.company_name || load.customer_name || 'Unknown';
    const deliveryDate = load.delivery_date || 'TBD';
    const batchId = load.schedule_batch_id;

    // If this load is part of a batch, only send a message for the LAST load in the batch
    // (i.e. wait a moment, then count all loads with this batch_id and only alert once)
    if (batchId) {
      // Wait 3 seconds to let other loads in the batch finish creating
      await new Promise(resolve => setTimeout(resolve, 3000));

      const batchLoads = await base44.asServiceRole.entities.Load.filter({ schedule_batch_id: batchId });

      // Only send the alert from the load with the highest delivery_order (last in sequence)
      const maxOrder = Math.max(...batchLoads.map(l => l.delivery_order ?? 0));
      if ((load.delivery_order ?? 0) < maxOrder) {
        console.log(`Skipping Telegram alert for load ${load.id} — not the last in batch ${batchId}`);
        return Response.json({ success: true, skipped: true, reason: 'Not the last load in batch' });
      }

      // This is the last load — send a consolidated message
      const loadCount = batchLoads.length;
      const message = loadCount > 1
        ? `🚛 ${loadCount} Loads Built: ${customerName} — ${deliveryDate} (${loadCount} deliveries)`
        : `🚛 New Load Built: ${customerName} — ${deliveryDate} (Stop #${(load.delivery_order ?? 0) + 1})`;

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
      return Response.json({ success: true, message_id: result.result.message_id, loadCount });
    }

    // No batch ID — single load, send normally
    const stopNumber = (load.delivery_order ?? 0) + 1;
    const message = `🚛 New Load Built: ${customerName} — ${deliveryDate} (Stop #${stopNumber})`;

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
    console.error('Error in sendLoadTelegramAlert:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});