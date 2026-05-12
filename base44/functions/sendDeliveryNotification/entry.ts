import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { loadId } = await req.json();

    console.log('🔔 Delivery notification check for load:', loadId);

    // Fetch load, load items, email templates, and users in parallel
    const [load, loadItems, emailTemplates, allUsers] = await Promise.all([
      base44.asServiceRole.entities.Load.get(loadId),
      base44.asServiceRole.entities.LoadItem.filter({ load_id: loadId }),
      base44.asServiceRole.entities.EmailTemplate.list(),
      base44.asServiceRole.entities.User.list()
    ]);

    if (!load) {
      return Response.json({ error: 'Load not found', sent: false }, { status: 404 });
    }

    console.log('Load notification status:', {
      alreadySent: load.delivery_notification_sent,
      isPaid: load.is_paid,
      deliveryDate: load.delivery_date
    });

    // Check if notification already sent
    if (load.delivery_notification_sent) {
      return Response.json({ message: 'Notification already sent', sent: false });
    }

    // Check delivery date timing
    if (load.delivery_date) {
      const nowUtc = new Date();
      const year = nowUtc.getUTCFullYear();
      const dstStart = new Date(Date.UTC(year, 2, 8));
      dstStart.setUTCDate(8 + ((7 - dstStart.getUTCDay()) % 7));
      const dstEnd = new Date(Date.UTC(year, 10, 1));
      dstEnd.setUTCDate(1 + ((7 - dstEnd.getUTCDay()) % 7));
      const isDst = nowUtc >= dstStart && nowUtc < dstEnd;
      const estOffsetHours = isDst ? -4 : -5;
      const nowEst = new Date(nowUtc.getTime() + estOffsetHours * 60 * 60 * 1000);
      const todayEstStr = `${nowEst.getUTCFullYear()}-${String(nowEst.getUTCMonth() + 1).padStart(2, '0')}-${String(nowEst.getUTCDate()).padStart(2, '0')}`;
      const currentHourEst = nowEst.getUTCHours();

      console.log(`📅 Delivery date: ${load.delivery_date}, Today EST: ${todayEstStr}, Hour EST: ${currentHourEst}, DST: ${isDst}`);

      if (load.delivery_date > todayEstStr) {
        console.log(`❌ Future delivery date: ${load.delivery_date} > ${todayEstStr}`);
        return Response.json({ message: 'Delivery date is in the future, notification not sent', sent: false });
      }

      if (load.delivery_date === todayEstStr && currentHourEst < 7) {
        console.log(`⏰ Delivery date is today but before 7 AM EST (current hour: ${currentHourEst})`);
        return Response.json({ message: 'Delivery date is today but notification window (7 AM EST) has not yet opened', sent: false });
      }
    }

    // Check if delivery is paid
    if (load.is_paid) {
      await base44.asServiceRole.entities.Load.update(loadId, { delivery_notification_sent: true });
      return Response.json({ message: 'Delivery is paid, marked as sent', sent: false });
    }

    // Find active email template for first_item_delivered
    const template = emailTemplates.find(t => t.template_type === 'first_item_delivered' && t.is_active);

    // Determine recipients: from template or admin user
    let validEmails = [];
    if (template?.recipient_email) {
      validEmails = template.recipient_email.split(';').map(e => e.trim()).filter(e => e);
    }
    if (validEmails.length === 0) {
      const adminUser = allUsers.find(u => u.role === 'admin');
      const emailString = adminUser?.notification_email || adminUser?.email || '';
      validEmails = emailString.split(';').map(e => e.trim()).filter(e => e);
    }

    if (validEmails.length === 0) {
      console.log('❌ No notification email configured');
      return Response.json({ message: 'No notification email configured', sent: false });
    }

    console.log('Email recipients:', validEmails);

    // Build template variables
    const itemsList = loadItems.map(item =>
      `${item.quantity || 1} ${item.selected_unit || 'unit'}(s) - ${item.name}${item.selected_color ? ` (${item.selected_color})` : ''}`
    ).join('\n');

    const receiptNumbers = [...new Set(load.receipt_numbers || [])];
    const deliveryDateStr = load.delivery_date ? new Date(load.delivery_date + 'T00:00:00').toLocaleDateString() : '';

    // Fetch order for job_address/notes if available
    let order = null;
    if (load.order_id) {
      order = await base44.asServiceRole.entities.Order.get(load.order_id);
    }

    const templateVars = {
      customer_name: load.customer_name || '',
      customer_phone: load.customer_phone || '',
      job_address: order?.job_address || load.customer_address || '',
      receipt_numbers: receiptNumbers.join(', '),
      delivery_date: deliveryDateStr,
      items_list: itemsList,
      notes: load.drop_location_notes || order?.notes || ''
    };

    const renderTemplate = (str) => {
      if (!str) return str;
      return str.replace(/\{\{(\w+)\}\}/g, (_, key) => templateVars[key] || '');
    };

    let finalSubject, finalBody;

    if (template) {
      finalSubject = renderTemplate(template.subject);
      finalBody = renderTemplate(template.body);
    } else {
      // Fallback if no template configured
      finalSubject = `⚠️ Delivery Notification - ${load.customer_name || 'Customer'} (UNPAID)`;
      finalBody = [
        'DELIVERY NOTIFICATION - UNPAID',
        '',
        'A delivery is scheduled / has been completed.',
        'This delivery has NOT been paid for.',
        '',
        'CUSTOMER:',
        templateVars.customer_name,
        templateVars.customer_phone,
        templateVars.job_address,
        '',
        templateVars.notes ? `DROP LOCATION: ${templateVars.notes}` : '',
        '',
        'DELIVERY DATE:',
        deliveryDateStr,
        '',
        receiptNumbers.length > 0 ? `RECEIPTS: ${receiptNumbers.join(', ')}` : '',
        '',
        'ITEMS:',
        itemsList,
        '',
        'Please follow up on payment.'
      ].filter(line => line !== '').join('\r\n');
    }

    // Mark as sent
    await base44.asServiceRole.entities.Load.update(loadId, { delivery_notification_sent: true });

    // Create monitoring alert instead of sending email
    await base44.asServiceRole.entities.MonitoringAlert.create({
      type: 'unconfirmedDeliveries',
      message: `Unpaid delivery: ${templateVars.customer_name}${templateVars.job_address ? ' — ' + templateVars.job_address : ''}${receiptNumbers.length > 0 ? ' | Receipts: #' + receiptNumbers.join(', #') : ''}${deliveryDateStr ? ' | Date: ' + deliveryDateStr : ''}`,
      order_id: load.order_id || null,
      is_resolved: false
    });

    console.log('✅ Monitoring alert created for delivery notification');

    return Response.json({ success: true, sent: false, alerted: true });
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return Response.json({ error: error.message, sent: false }, { status: 500 });
  }
});