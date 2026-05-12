import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { orderId, receiptNumber } = await req.json();

    const [order, receipts] = await Promise.all([
      base44.asServiceRole.entities.Order.get(orderId),
      base44.asServiceRole.entities.Receipt.filter({ order_id: orderId }),
    ]);

    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check if this specific receipt has skip_paid_notification set
    const targetReceipt = receipts.find(r => r.receipt_number === receiptNumber);
    if (targetReceipt?.skip_paid_notification) {
      console.log(`⏭️ Skipping paid notification for receipt #${receiptNumber} (skip_paid_notification=true)`);
      return Response.json({ message: 'Notification skipped (skip_paid_notification=true)', sent: false });
    }

    const validEmails = ['pam@mattawanlandscape.com'];


    const allReceiptNumbers = [...new Set(receipts.map(r => r.receipt_number).filter(Boolean))].sort().join(', ') || 'N/A';
    const paidReceiptNumbers = receipts.filter(r => r.is_paid).map(r => r.receipt_number).filter(Boolean).sort().join(', ') || receiptNumber || 'N/A';

    const subject = `💰 Receipt Paid - ${order.customer_name} #${receiptNumber}`;
    const body = `
<html><body style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
<h2 style="color: #16a34a;">💰 Receipt Marked as Paid</h2>
<p>Receipt <strong>#${receiptNumber}</strong> has been marked as paid.</p>
<hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />
<table style="border-collapse: collapse; width: 100%;">
  <tr><td style="padding: 4px 8px; font-weight: bold; width: 160px;">Customer:</td><td style="padding: 4px 8px;">${order.customer_name}</td></tr>
  ${order.customer_phone ? `<tr><td style="padding: 4px 8px; font-weight: bold;">Phone:</td><td style="padding: 4px 8px;">${order.customer_phone}</td></tr>` : ''}
  ${order.job_address ? `<tr><td style="padding: 4px 8px; font-weight: bold;">Job Address:</td><td style="padding: 4px 8px;">${order.job_address}</td></tr>` : ''}
  <tr><td style="padding: 4px 8px; font-weight: bold;">Receipt Paid:</td><td style="padding: 4px 8px;">#${receiptNumber}</td></tr>
  <tr><td style="padding: 4px 8px; font-weight: bold;">All Receipts:</td><td style="padding: 4px 8px;">${allReceiptNumbers}</td></tr>
  <tr><td style="padding: 4px 8px; font-weight: bold;">Paid Receipts:</td><td style="padding: 4px 8px;">${paidReceiptNumbers}</td></tr>
  ${order.notes ? `<tr><td style="padding: 4px 8px; font-weight: bold;">Notes:</td><td style="padding: 4px 8px;">${order.notes}</td></tr>` : ''}
</table>
</body></html>
`.trim();

    for (const email of validEmails) {
      await base44.asServiceRole.integrations.Core.SendEmail({ to: email, subject, body, is_html: true });
    }

    // Mark the receipt as having had a paid email sent
    const receiptToUpdate = receipts.find(r => r.receipt_number === receiptNumber);
    if (receiptToUpdate) {
      await base44.asServiceRole.entities.Receipt.update(receiptToUpdate.id, { paid_email_sent: true });
    }

    // Auto-archive if order is completed and ALL receipts are now paid
    const updatedReceipts = receipts.map(r => r.receipt_number === receiptNumber ? { ...r, is_paid: true } : r);
    const allPaid = updatedReceipts.length > 0 && updatedReceipts.every(r => r.is_paid);
    if (order.is_completed && allPaid) {
      await base44.asServiceRole.entities.Order.update(orderId, { is_archived: true });
      console.log(`📦 Order ${orderId} auto-archived (completed + all receipts paid)`);
    }

    console.log(`✅ Paid email sent for receipt #${receiptNumber} on order ${orderId} to:`, validEmails);
    return Response.json({ success: true, sent: true, recipients: validEmails, autoArchived: order.is_completed && allPaid });
  } catch (error) {
    console.error('❌ Error sending paid email:', error);
    return Response.json({ error: error.message, sent: false }, { status: 500 });
  }
});