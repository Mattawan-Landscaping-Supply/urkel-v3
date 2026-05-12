import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entityType, entityId, entityName, isPermanent, customerName, receiptNumbers, orderId } = await req.json();

    // Build detailed message with customer and receipt info
    let message = `${isPermanent ? 'Permanently deleted' : 'Archived'} ${entityType.toLowerCase()}: ${entityName || entityId}`;
    if (customerName) {
      message += ` | Customer: ${customerName}`;
    }
    if (receiptNumbers && receiptNumbers.length > 0) {
      message += ` | Receipts: ${receiptNumbers.join(', ')}`;
    }
    message += ` | User: ${user.email}`;

    // Log deletion as an already-resolved audit entry (not an active alert)
    await base44.asServiceRole.entities.MonitoringAlert.create({
      type: 'completionIntegrity',
      message: message,
      order_id: orderId || null,
      is_resolved: true
    });

    return Response.json({ 
      success: true,
      logged: true
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});