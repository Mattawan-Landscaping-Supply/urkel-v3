import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get today's date in Eastern Time (YYYY-MM-DD)
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const year = nowET.getFullYear();
    const month = String(nowET.getMonth() + 1).padStart(2, '0');
    const day = String(nowET.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    const dateFormatted = nowET.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    // Fetch all loads, delivery reminders, and memories in parallel
    const [allLoads, allReminders, allMemories] = await Promise.all([
      base44.asServiceRole.entities.Load.list('delivery_order', 500),
      base44.asServiceRole.entities.Reminder.list(undefined, 500),
      base44.asServiceRole.entities.AIMemory.list('-created_date', 500),
    ]);

    // Log raw Reminder fetch for debugging
    console.log('Raw Reminder fetch result:', allReminders);

    // Filter loads: today's date in ET, exclude only archived/delivered
    const loads = allLoads.filter(l =>
      l.delivery_date === todayStr &&
      l.status !== 'archived' &&
      l.status !== 'delivered'
    );

    // Filter reminders: not completed, not dismissed (JS filter — avoid query-level boolean issues)
    const reminders = allReminders.filter(r => r.is_completed !== true && r.is_dismissed !== true).map(r => r.title);

    // Filter memories: not resolved, exclude system records (JS filter — avoid query-level boolean issues)
    const memories = allMemories.filter(m =>
      m.is_resolved !== true && m.created_from !== 'system'
    );

    return Response.json({
      date: dateFormatted,
      todayStr,
      loads,
      reminders,
      memories,
    });
  } catch (error) {
    console.error('getDailyBriefing error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});