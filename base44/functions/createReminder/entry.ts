import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);

    const { title, due_time } = await req.json();

    if (!title || !due_time) {
      return Response.json({ error: 'Missing title or due_time' }, { status: 400 });
    }

    const reminder = await base44.asServiceRole.entities.Reminder.create({
      title,
      due_time,
      is_completed: false,
      is_dismissed: false,
      telegram_sent: false
    });

    return Response.json({ success: true, reminder }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});