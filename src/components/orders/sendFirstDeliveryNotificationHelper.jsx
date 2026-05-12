import { format } from 'date-fns';

export const sendFirstDeliveryNotificationHelper = async (
  base44,
  orderId,
  order,
  items,
  receipts,
  queryClient,
  renderTemplate,
  setEmailConfirmationDialog,
  toast
) => {
  try {
    const user = await base44.auth.me();

    // Use cached items passed in — avoid extra API calls that cause rate limits
    const freshItems2 = items || [];
    const cachedLoadItems = queryClient.getQueryData(['allLoadItemsRaw', orderId]) || [];

    const deliveredItemsOnLoads2 = freshItems2.filter(i => {
      if (i.status !== 'delivered' && i.status !== 'on_delivery') return false;
      if (i.delivery_method === 'pickup' || i.delivery_method === 'direct_ship') return true;
      if (i.delivery_method === 'delivery') return cachedLoadItems.some(li => li.order_item_id === i.id);
      return false;
    });

    const templates = await base44.entities.EmailTemplate.filter({ template_type: 'first_item_delivered', is_active: true });
    const template = templates?.[0];

    // Use recipient_email from template if set, otherwise fall back to user's email
    let validEmails;
    if (template?.recipient_email) {
      validEmails = template.recipient_email.split(';').map(e => e.trim()).filter(e => e);
    } else {
      const emailString = user.notification_email || user.email;
      validEmails = emailString ? emailString.split(';').map(e => e.trim()).filter(e => e) : [];
    }

    if (validEmails.length === 0) {
      toast.error("No Recipients Configured");
      return;
    }

    const itemsList = deliveredItemsOnLoads2.map(item => {
      const lines = [`${item.quantity} ${item.selected_unit || 'Each'} - ${item.product_name}`];
      if (item.selected_color) lines.push(`Color: ${item.selected_color}`);
      lines.push(`Receipt #${item.receipt_number || 'N/A'}`);
      return lines.join('\n');
    }).join('\n\n');

    const allReceiptNumbers = [...new Set(freshItems2.map(i => i.receipt_number).filter(r => r && r.trim()))];
    const receiptNumbersString = allReceiptNumbers.length > 0 ? allReceiptNumbers.join(', ') : 'N/A';

    // CRITICAL: Get the EARLIEST fulfillment date across ALL delivered items (pickup, delivery, direct_ship)
    // Only count items with status='delivered' (not on_delivery, which hasn't actually been delivered yet)
    const allPossibleDates = [];
    
    // Add all date_completed from DELIVERED items only
    for (const item of freshItems2.filter(i => i.status === 'delivered')) {
      if (item.date_completed) {
        allPossibleDates.push(item.date_completed);
      }
    }
    
    // Add all delivery_dates from loads associated with this order (use cache)
    const cachedLoads = queryClient.getQueryData(['loads', orderId]) || [];
    for (const load of cachedLoads.filter(l => l.delivery_date)) {
      allPossibleDates.push(load.delivery_date);
    }
    
    // Convert to Date objects, sort, get earliest
    let rawDeliveryDate = null;
    if (allPossibleDates.length > 0) {
      const dateObjs = allPossibleDates
        .map(d => ({ str: d, date: new Date(d + 'T00:00:00') }))
        .sort((a, b) => a.date - b.date);
      rawDeliveryDate = dateObjs[0].str;
    }

    const deliveryDateStr = rawDeliveryDate ? format(new Date(rawDeliveryDate + 'T00:00:00'), 'MMM d, yyyy') : 'Not set';

    const templateData = {
      customer_name: order.customer_name,
      customer_phone: order.customer_phone || 'No phone',
      job_address: order.job_address || 'No address',
      receipt_numbers: receiptNumbersString,
      delivery_date: deliveryDateStr || 'Not set',
      items_list: itemsList,
      notes: order.notes || ''
    };

    let emailSubject, emailBody;
    if (template) {
      emailSubject = renderTemplate(template.subject, templateData);
      emailBody = renderTemplate(template.body, templateData);
    } else {
      emailSubject = `⚠️ First Item Delivered - ${order.customer_name} (UNPAID)`;
      const lines = [
        'FIRST ITEM DELIVERED - UNPAID RECEIPTS',
        '',
        'The first item from this order has been delivered.',
        'This order has UNPAID receipts.',
        '',
        '',
        'CUSTOMER:',
        order.customer_name,
        order.customer_phone || 'No phone',
        order.job_address || 'No address',
        '',
        '',
        'RECEIPTS:',
        receiptNumbersString,
        '',
        'DELIVERY DATE:',
        deliveryDateStr,
        '',
        '',
        'ITEMS DELIVERED:',
        '',
        itemsList
      ];
      if (order.notes) lines.push('', '', '', 'NOTES:', order.notes);
      lines.push('', '', '', 'Please follow up on payment.');
      emailBody = lines.join('\r\n');
    }

    await base44.functions.invoke('sendFirstItemDeliveredEmail', { orderId });

    // Only invalidate the specific order record — not the full orders list — to avoid rate limit cascade
    queryClient.invalidateQueries(['order', orderId]);
    setEmailConfirmationDialog({ isOpen: true, message: `Email notification sent to ${validEmails.join(', ')} for first item delivered.` });
  } catch (e) {
    toast.error("Failed to Send Notification", { description: e.message });
  }
};