import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Calculate tomorrow's date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

        // Fetch everything we need in parallel
        const [allOrders, allOrderItems, allLoads, allReminders] = await Promise.all([
            base44.asServiceRole.entities.Order.list('-created_date', 1000),
            base44.asServiceRole.entities.OrderItem.list('-created_date', 5000),
            base44.asServiceRole.entities.Load.list('-created_date', 1000),
            base44.asServiceRole.entities.DeliveryReminder.list('-created_date', 500)
        ]);

        // Active orders only
        const activeOrders = allOrders.filter(o => !o.is_archived && !o.is_completed);

        // Find order IDs that have a load scheduled for tomorrow
        const orderIdsWithLoadTomorrow = new Set(
            allLoads
                .filter(l => l.delivery_date === tomorrowStr && l.status !== 'archived')
                .map(l => l.order_id)
                .filter(Boolean)
        );

        // Find order IDs that have an unresolved DeliveryReminder for tomorrow
        const orderIdsWithReminderTomorrow = new Set(
            allReminders
                .filter(r => r.scheduled_date === tomorrowStr && !r.is_resolved)
                .map(r => r.order_id)
                .filter(Boolean)
        );

        // Combined: orders with ANY delivery planned for tomorrow
        const orderIdsPlannedTomorrow = new Set([
            ...orderIdsWithLoadTomorrow,
            ...orderIdsWithReminderTomorrow
        ]);

        const alertOrders = [];

        for (const order of activeOrders) {
            if (!orderIdsPlannedTomorrow.has(order.id)) continue;

            // Get items for this order that are still in quote form
            const orderItems = allOrderItems.filter(i => i.order_id === order.id);
            const quoteItems = orderItems.filter(i =>
                i.is_quote === true &&
                i.status !== 'returned' &&
                (i.quantity || 0) > 0
            );

            if (quoteItems.length === 0) continue;

            // Group quote items by quote number
            const quoteNumbers = [...new Set(quoteItems.map(i => i.receipt_number).filter(Boolean))];

            alertOrders.push({
                orderId: order.id,
                customerName: order.customer_name || 'Unknown',
                jobAddress: order.job_address || 'N/A',
                quoteNumbers: quoteNumbers.length > 0 ? quoteNumbers.join(', ') : 'N/A',
                hasLoad: orderIdsWithLoadTomorrow.has(order.id),
                hasReminder: orderIdsWithReminderTomorrow.has(order.id),
                quoteItems: quoteItems.map(i => ({
                    productName: i.product_name,
                    quantity: i.quantity,
                    unit: i.selected_unit || 'unit',
                    color: i.selected_color || null,
                    quoteNumber: i.receipt_number || 'N/A',
                    status: i.status
                }))
            });
        }

        if (alertOrders.length === 0) {
            return Response.json({
                success: true,
                alertsSent: 0,
                message: 'No orders with unconverted quotes scheduled for tomorrow'
            });
        }

        // Build HTML email
        const today = new Date();
        const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const tomorrowDisplayStr = new Date(tomorrowStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        const styles = `
            body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
            .container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .header { background: #7c3aed; color: white; padding: 24px 28px; }
            .header h1 { margin: 0; font-size: 20px; }
            .header p { margin: 6px 0 0; font-size: 13px; color: #ddd6fe; }
            .content { padding: 24px 28px; }
            .alert-banner { background: #faf5ff; border: 1px solid #ddd6fe; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; color: #6b21a8; font-weight: bold; }
            .order-card { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 16px; overflow: hidden; }
            .order-header { background: #f8fafc; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; }
            .order-header .name { font-size: 16px; font-weight: bold; color: #1e293b; }
            .order-header .meta { font-size: 13px; color: #64748b; margin-top: 4px; }
            .order-header .meta span { font-weight: 600; color: #334155; }
            .quote-badge { display: inline-block; background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: bold; margin-left: 8px; }
            .items-table { width: 100%; border-collapse: collapse; font-size: 13px; }
            .items-table th { background: #f1f5f9; text-align: left; padding: 8px 12px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
            .items-table td { padding: 8px 12px; border-top: 1px solid #f1f5f9; color: #334155; }
            .cta { background: #1e293b; color: white; text-align: center; padding: 16px; border-radius: 6px; margin-top: 20px; font-size: 14px; font-weight: bold; }
            .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 28px; font-size: 12px; color: #94a3b8; }
        `;

        const orderCardsHtml = alertOrders.map(o => {
            const itemRows = o.quoteItems.map(i => `
                <tr>
                    <td>${i.productName}</td>
                    <td>${i.quantity} ${i.unit}</td>
                    <td>${i.color || '—'}</td>
                    <td>Quote #${i.quoteNumber}</td>
                </tr>`).join('');

            const deliveryNote = o.hasLoad
                ? '<span style="color:#16a34a;font-weight:bold;">✓ Partial load exists</span> — but these quotes are NOT included'
                : '<span style="color:#dc2626;font-weight:bold;">✗ No load created</span>';

            return `
                <div class="order-card">
                    <div class="order-header">
                        <div class="name">${o.customerName} <span class="quote-badge">⚠ UNCONVERTED QUOTES</span></div>
                        <div class="meta">Address: <span>${o.jobAddress}</span></div>
                        <div class="meta">Quote Numbers: <span>${o.quoteNumbers}</span></div>
                        <div class="meta" style="margin-top:6px;">${deliveryNote}</div>
                    </div>
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Qty</th>
                                <th>Color</th>
                                <th>Quote #</th>
                            </tr>
                        </thead>
                        <tbody>${itemRows}</tbody>
                    </table>
                </div>`;
        }).join('');

        const emailSubject = `⚠️ Quote Alert: ${alertOrders.length} Order${alertOrders.length > 1 ? 's' : ''} with Unconverted Quotes Scheduled for Tomorrow`;
        const emailBody = `<!DOCTYPE html>
<html>
<head><style>${styles}</style></head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Unconverted Quotes — Delivery Tomorrow</h1>
            <p>Today: ${dateStr}</p>
        </div>
        <div class="content">
            <div class="alert-banner">
                📋 ${alertOrders.length} order${alertOrders.length > 1 ? 's have' : ' has'} items still in <strong>Quote form</strong> that are scheduled for delivery <strong>tomorrow (${tomorrowDisplayStr})</strong>. These quotes must be converted to receipts before a load can be created for them.
            </div>
            ${orderCardsHtml}
            <div class="cta">Go to Order Details → Convert quotes to receipts, then create a delivery load.</div>
        </div>
        <div class="footer">Urkel automated monitoring system</div>
    </div>
</body>
</html>`;

        await base44.asServiceRole.integrations.Core.SendEmail({
            to: 'info@mattawanlandscape.com',
            subject: emailSubject,
            body: emailBody,
            is_html: true
        });

        return Response.json({
            success: true,
            alertsSent: alertOrders.length,
            details: alertOrders
        });

    } catch (error) {
        console.error('Quote item alert check failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});