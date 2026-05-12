import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { orderId } = await req.json();

    console.log('🔔 Email notification check for order:', orderId);

    // Fetch order, items, email templates, and receipts in parallel
    const [order, orderItems, templates, receipts, allUsers] = await Promise.all([
      base44.asServiceRole.entities.Order.get(orderId),
      base44.asServiceRole.entities.OrderItem.filter({ order_id: orderId }),
      base44.asServiceRole.entities.EmailTemplate.filter({ 
        template_type: 'first_item_delivered',
        is_active: true 
      }),
      base44.asServiceRole.entities.Receipt.filter({ order_id: orderId }),
      base44.asServiceRole.entities.User.list()
    ]);

    // Fetch customer for company name if available
    let customer = null;
    if (order?.customer_id) {
      customer = await base44.asServiceRole.entities.Customer.get(order.customer_id).catch(() => null);
    }

    if (!order) {
      return Response.json({ error: 'Order not found', sent: false }, { status: 404 });
    }

    console.log('Order notification status:', {
      alreadySent: order.first_item_moved_notification_sent,
      deliveredItemsCount: orderItems.filter(i => i.status === 'delivered').length
    });

    // Check if notification already sent
    if (order.first_item_moved_notification_sent) {
      return Response.json({ message: 'Notification already sent', sent: false });
    }

    // ONLY trigger on status='delivered'
    const fulfilledItems = orderItems.filter(i => i.status === 'delivered');
    if (fulfilledItems.length === 0) {
      return Response.json({ message: 'No delivered items yet', sent: false });
    }

    const emailTemplate = templates?.[0];

    // Use template's recipient_email if set, otherwise fall back to admin user's email
    let emailString;
    if (emailTemplate?.recipient_email) {
      emailString = emailTemplate.recipient_email;
    } else {
      const adminUser = allUsers.find(u => u.role === 'admin');
      emailString = adminUser?.notification_email || adminUser?.email || '';
    }

    const validEmails = emailString.split(';').map(e => e.trim()).filter(e => e);
    console.log('Valid email recipients:', validEmails);

    if (validEmails.length === 0) {
      return Response.json({ message: 'No notification email configured', sent: false });
    }

    // Check if any fulfilled items have unpaid receipts
    const receiptNumbers = [...new Set(orderItems.filter(i => i.receipt_number && !i.is_quote).map(i => i.receipt_number))];
    const fulfilledReceiptNumbers = new Set(fulfilledItems.map(i => i.receipt_number).filter(Boolean));
    
    const unpaidFulfilledReceipts = receipts.filter(r => 
      !r.is_paid && fulfilledReceiptNumbers.has(r.receipt_number)
    );
    
    console.log('Unpaid fulfilled receipts:', unpaidFulfilledReceipts.length);
    
    // If no unpaid receipts, mark as sent but don't send email
    if (unpaidFulfilledReceipts.length === 0) {
      await base44.asServiceRole.entities.Order.update(orderId, {
        first_item_moved_notification_sent: true
      });
      return Response.json({ message: 'All receipts paid, marked as sent', sent: false });
    }

    // Build items list
    const itemsList = fulfilledItems.map(item => 
      `${item.quantity} ${item.selected_unit || 'unit'}(s) - ${item.product_name}${item.selected_color ? ` (${item.selected_color})` : ''} [Delivered]`
    ).join('\n');

    // Get load delivery dates for fulfilled items
    const allLoadItems = await base44.asServiceRole.entities.LoadItem.list();
    const allLoads = await base44.asServiceRole.entities.Load.list();
    
    const deliveryDates = fulfilledItems.map(i => {
      const loadItem = allLoadItems.find(li => li.order_item_id === i.id);
      if (loadItem) {
        const load = allLoads.find(l => l.id === loadItem.load_id);
        if (load?.delivery_date) return load.delivery_date;
      }
      return i.date_completed;
    }).filter(Boolean).sort();

    const actualDeliveryDate = deliveryDates[0] || order.delivery_date || '';
    const formattedDeliveryDate = actualDeliveryDate
      ? new Date(actualDeliveryDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Unknown';

    const templateData = {
      customer_name: order.customer_name || '',
      company_name: customer?.company || customer?.name || '',
      customer_phone: order.customer_phone || '',
      job_address: order.job_address || '',
      receipt_numbers: receiptNumbers.join(', '),
      delivery_date: formattedDeliveryDate,
      items_list: itemsList,
      notes: order.notes || ''
    };

    let finalSubject, finalBody;
    
    if (emailTemplate) {
      finalSubject = emailTemplate.subject;
      finalBody = emailTemplate.body;
      Object.keys(templateData).forEach(key => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        finalSubject = finalSubject.replace(regex, templateData[key]);
        finalBody = finalBody.replace(regex, templateData[key]);
      });
    } else {
      finalSubject = `⚠️ First Item Delivered - ${order.customer_name} (UNPAID)`;
      finalBody = [
        'FIRST ITEM DELIVERED - UNPAID RECEIPTS',
        '',
        'The first item from this order has been delivered to the customer.',
        'This order has UNPAID receipts.',
        '',
        'DELIVERY DATE:',
        formattedDeliveryDate,
        '',
        'CUSTOMER:',
        order.customer_name,
        order.customer_phone || '',
        order.job_address || '',
        '',
        'RECEIPTS:',
        receiptNumbers.join(', '),
        '',
        'ITEMS ON DELIVERY:',
        itemsList,
        '',
        order.notes ? `NOTES: ${order.notes}` : '',
        '',
        'Please follow up on payment.'
      ].filter(line => line !== '').join('\r\n');
    }

    // Send emails to all recipients
    console.log('📧 Sending emails to:', validEmails);
    for (const email of validEmails) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject: finalSubject,
        body: finalBody,
        is_html: emailTemplate?.is_html || false
      });
    }

    // Mark as sent
    await base44.asServiceRole.entities.Order.update(orderId, {
      first_item_moved_notification_sent: true
    });

    console.log('✅ Email sent successfully to:', validEmails);

    return Response.json({ 
      success: true, 
      sent: true,
      recipients: validEmails 
    });
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return Response.json({ error: error.message, sent: false }, { status: 500 });
  }
});