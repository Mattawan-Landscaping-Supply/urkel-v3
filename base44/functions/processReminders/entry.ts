import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = '1202637898';

    if (!token) {
      return Response.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 400 });
    }

    const allReminders = await base44.asServiceRole.entities.Reminder.list('-created_date', 500);
    const now = new Date();
    let processed = 0;
    let deleted = 0;

    for (const reminder of allReminders) {
      const dueTime = new Date(reminder.due_time);
      
      // CRITICAL: Never delete or process reminders with future due_time
      if (dueTime > now) continue;
      
      // Delete completed reminders — they should not exist
      if (reminder.is_completed) {
        await base44.asServiceRole.entities.Reminder.delete(reminder.id);
        deleted++;
        continue;
      }

      // Skip dismissed
      if (reminder.is_dismissed) continue;

      const telegramSent = reminder.telegram_sent === true;
      const lastFiredAt = reminder.last_fired_at ? new Date(reminder.last_fired_at) : null;
      const minutesSinceLastFire = lastFiredAt ? (now - lastFiredAt) / (1000 * 60) : null;

      if (!telegramSent) {
        // Initial fire
        const text = `⏰ Reminder: ${reminder.title}`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text })
        });
        await base44.asServiceRole.entities.Reminder.update(reminder.id, {
          telegram_sent: true,
          last_fired_at: now.toISOString()
        });
        processed++;
      } else if (minutesSinceLastFire !== null && minutesSinceLastFire >= 60) {
        // Re-fire every hour — do NOT reset telegram_sent
        const text = `⏰ Still pending: ${reminder.title}`;
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text })
        });
        await base44.asServiceRole.entities.Reminder.update(reminder.id, {
          last_fired_at: now.toISOString()
        });
        processed++;
      }
    }

    return Response.json({ success: true, processed, deleted, checked: allReminders.length });
  } catch (error) {
    console.error('processReminders error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});