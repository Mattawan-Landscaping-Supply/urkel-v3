import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { alertType, alertMessage, orderId, alertId } = await req.json();

    // Get alert details and related order data
    const alert = await base44.entities.MonitoringAlert.get(alertId);
    const order = await base44.entities.Order.get(orderId);
    const orderItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 100);
    const receipts = await base44.entities.Receipt.filter({ order_id: orderId }, '-created_date', 100);

    // Create a message for the agent with context
    let agentMessage = `I need you to help fix this monitoring alert:\n\n`;
    agentMessage += `**Alert Type:** ${alertType}\n`;
    agentMessage += `**Alert:** ${alertMessage}\n\n`;
    agentMessage += `**Order Details:**\n`;
    agentMessage += `- Customer: ${order.customer_name}\n`;
    agentMessage += `- Total Items: ${orderItems.length}\n`;
    agentMessage += `- Unpaid Receipts: ${receipts.filter(r => !r.is_paid).length}\n\n`;
    
    agentMessage += `Based on this alert, what is the best fix? Provide specific steps I should take. If you need to make updates to the system, ask for my approval first.`;

    // Build suggestion based on alert type
    let suggestion = null;
    if (alertType === 'overAllocation') {
      // Parse the over-allocation alert message to find the affected item
      // Format: "Over-allocation: CustomerName | ProductName | Receipt #XXXXX — N allocated vs M ordered (+diff)"
      const parts = alertMessage.split('|');
      // productPart may look like "Terratex, 3x360 (Wall) (Default)"
      // strip the trailing color/default qualifier in parentheses at the end to get just the product name
      const rawProductPart = parts[1]?.trim() || '';
      // The product name is everything up to and including the first parenthesized part (e.g. "(Wall)")
      // but NOT the color qualifier "(Default)" which comes after
      // Strategy: try to match exact product names from orderItems first
      const receiptPart = parts[2]?.trim() || '';
      const receiptMatch = receiptPart.match(/#(\S+)/);
      const receiptNum = receiptMatch ? receiptMatch[1] : null;
      const allocMatch = receiptPart.match(/(\d+)\s+allocated vs\s+(\d+)\s+ordered/);
      const allocated = allocMatch ? parseInt(allocMatch[1]) : null;
      const ordered = allocMatch ? parseInt(allocMatch[2]) : null;

      // Find the over-allocated items - match by checking if the rawProductPart starts with the product name
      const overAllocatedItems = orderItems.filter(i => {
        const matchesProduct = !rawProductPart || rawProductPart.startsWith(i.product_name) || i.product_name === rawProductPart;
        const matchesReceipt = !receiptNum || i.receipt_number === receiptNum;
        return matchesProduct && matchesReceipt;
      });

      // Determine the actual product name by finding the best match in order items
      const matchedProductName = overAllocatedItems[0]?.product_name || rawProductPart;
      const productPart = matchedProductName;

      suggestion = {
        analysis: `Over-allocation detected: ${productPart} — ${allocated} units are allocated across columns but only ${ordered} were ordered on receipt #${receiptNum || 'N/A'}.`,
        recommendation: `Click "Apply Fix" to automatically reduce the total quantity back to ${ordered} (the amount ordered). The fix will reduce master order items first, then committed items if needed.`,
        impact: `More items are being tracked than were actually ordered. This can lead to incorrect inventory counts and delivery over-commitments.`,
        affectedItems: overAllocatedItems.map(i => ({
          productName: i.product_name,
          quantity: i.quantity,
          color: i.selected_color,
          unit: i.selected_unit,
          status: i.status,
          receiptNumber: i.receipt_number
        })),
        riskLevel: 'HIGH',
        details: `${allocated} allocated vs ${ordered} ordered on receipt #${receiptNum}`,
        autoFixFunction: 'fixOverAllocation',
        params: {
          orderId,
          alertId,
          productName: productPart,
          receiptNumber: receiptNum,
          targetQuantity: ordered
        }
      };
    } else if (alertType === 'overdueUnpaidReceipts') {
      const unpaidReceipts = receipts.filter(r => !r.is_paid);
      suggestion = {
        analysis: `Order has ${unpaidReceipts.length} unpaid receipts that are overdue by 30+ days.`,
        recommendation: `Contact the customer to follow up on payment. Once payment is received, mark the receipts as paid in the system.`,
        impact: `These unpaid invoices represent outstanding revenue. Customer may have payment issues or disputes that need resolution.`,
        affectedItems: unpaidReceipts.map(r => ({
          receiptNumber: r.receipt_number,
          isPaid: r.is_paid
        })),
        riskLevel: 'HIGH',
        details: `Unpaid receipts: ${unpaidReceipts.map(r => r.receipt_number).join(', ')}`,
        autoFixFunction: null
      };
    } else if (alertType === 'orphanedItems') {
       const orphanedItems = orderItems.filter(i => (i.status === 'delivered' || i.status === 'on_delivery'));
       suggestion = {
         analysis: `Order has ${orphanedItems.length} items marked as delivered or on-delivery, but these items are NOT linked to any delivery load record. This creates a data integrity issue.`,
         recommendation: `Click "Apply Fix" to automatically move orphaned "on_delivery" items back to "In Hold" so they can be re-scheduled for delivery. Any items already marked as "delivered" cannot be auto-fixed — you will be shown those items after the fix and can decide whether to leave them as-is (if genuinely delivered) or drag them back to In Hold in the order.`,
         impact: `Orphaned items break the connection between item status and actual delivery records. This causes confusion, prevents accurate completion tracking, and makes it impossible to verify what was actually delivered.`,
         affectedItems: orphanedItems.map(i => ({
           productName: i.product_name,
           quantity: i.quantity,
           color: i.selected_color,
           unit: i.selected_unit,
           status: i.status
         })),
         riskLevel: 'MEDIUM',
         details: `${orphanedItems.length} items need review: ${orphanedItems.map(i => `${i.product_name} (${i.quantity} ${i.selected_unit})`).join('; ')}`,
         autoFixFunction: 'fixOrphanedItems',
         params: { orderId }
       };
    } else if (alertType === 'unconfirmedDeliveries') {
      const onDeliveryItems = orderItems.filter(i => i.status === 'on_delivery');
      suggestion = {
        analysis: `${order.customer_name} has ${onDeliveryItems.length} item(s) still marked as "on_delivery" past the scheduled delivery date. The delivery has not been confirmed in the system.`,
        recommendation: `Go to the order and confirm the delivery by moving all "on_delivery" items to "Delivered" in the On Delivery section.`,
        impact: `Until confirmed, inventory counts are inaccurate and the order cannot be marked as complete.`,
        affectedItems: onDeliveryItems.map(i => ({
          productName: i.product_name,
          quantity: i.quantity,
          color: i.selected_color,
          unit: i.selected_unit,
          status: i.status
        })),
        riskLevel: 'HIGH',
        autoFixFunction: null
      };
    } else if (alertType === 'ready_to_archive') {
      const paidReceipts = receipts.filter(r => r.is_paid);
      const unpaidReceipts = receipts.filter(r => !r.is_paid);
      const allPaid = unpaidReceipts.length === 0;
      const receiptSummary = receipts.length > 0
        ? `All ${receipts.length} receipt${receipts.length > 1 ? 's' : ''} (${receipts.map(r => `#${r.receipt_number}`).join(', ')}) ${allPaid ? 'have been paid in full' : `are NOT all paid — ${unpaidReceipts.length} unpaid`}.`
        : 'No receipts on file.';
      suggestion = {
        analysis: `${order.customer_name}'s order is marked as completed, all items have been delivered or returned, and all receipts are paid in full. It meets every criterion to be archived. ${receiptSummary}`,
        recommendation: `Go to Completed Orders and archive this order to keep your active order list clean.`,
        impact: `Completed orders left unarchived clutter the completed orders view and may cause confusion.`,
        affectedItems: receipts.map(r => ({
          productName: `Receipt #${r.receipt_number}`,
          status: r.is_paid ? '✓ Paid' : '✗ Unpaid',
        })),
        isReceiptSummary: true,
        riskLevel: 'LOW',
        autoFixFunction: null
      };
    } else if (alertType === 'pendingArrivals') {
      const pendingItems = orderItems.filter(i => i.status === 'order' && (i.quantity || 0) > 0 && !i.is_quote);
      suggestion = {
        analysis: `${order.customer_name} has ${pendingItems.length} item(s) still in "Order" status (not yet arrived at the yard) with a delivery reminder coming up soon.`,
        recommendation: `Contact the supplier to confirm the expected arrival date. Once items arrive at the yard, move them to "In Hold" in the order.`,
        impact: `If items haven't arrived before the scheduled delivery date, the delivery may need to be rescheduled.`,
        affectedItems: pendingItems.map(i => ({
          productName: i.product_name,
          quantity: i.quantity,
          color: i.selected_color,
          unit: i.selected_unit,
          status: i.status
        })),
        riskLevel: 'MEDIUM',
        autoFixFunction: null
      };
    } else if (alertType === 'completionIntegrity') {
      // Only flag items that have the wrong delivery_method (the actual data corruption)
      const corruptedItems = orderItems.filter(i =>
        (i.status === 'delivered' || i.status === 'on_delivery') &&
        i.delivery_method !== 'delivery'
      );
      suggestion = {
        analysis: `${corruptedItems.length} item(s) for ${order.customer_name} were processed through a delivery load but still have delivery_method set to "${corruptedItems[0]?.delivery_method || 'pickup'}" instead of "delivery". This is a data corruption issue caused by the item's delivery method not being updated when it was added to a load.`,
        recommendation: `Click "Apply Fix" to automatically correct the delivery_method to "delivery" on all affected items. This is safe and reversible — it only updates the delivery method field.`,
        impact: `Items with the wrong delivery_method may be incorrectly counted as pickups in reports, and can prevent the order from completing properly.`,
        affectedItems: corruptedItems.map(i => ({
          productName: i.product_name,
          quantity: i.quantity,
          status: i.status,
          dateCompleted: i.date_completed,
          color: i.selected_color
        })),
        riskLevel: 'MEDIUM',
        details: `${corruptedItems.length} item(s) need delivery_method corrected to "delivery"`,
        autoFixFunction: 'fixDeliveryMethodCorruption',
        params: { orderId, alertId }
      };
    }

    return Response.json({ 
      success: true,
      suggestion: suggestion
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});