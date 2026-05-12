import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Calculate tomorrow's date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        
        // Fetch all needed data (respecting 500 limit)
        const [allOrders, allOrderItems, allLoadItems, allLoads, existingAlerts] = await Promise.all([
            base44.asServiceRole.entities.Order.list('-created_date', 500),
            base44.asServiceRole.entities.OrderItem.list('-created_date', 500),
            base44.asServiceRole.entities.LoadItem.list('-created_date', 500),
            base44.asServiceRole.entities.Load.list('-created_date', 500),
            base44.asServiceRole.entities.MonitoringAlert.filter({ is_resolved: false }, '-created_date', 500)
        ]);
        
        // Filter to active orders only
        const activeOrders = allOrders.filter(o => !o.is_archived && !o.is_completed);
        
        // Build a set of all order item IDs that are already on a load
        const orderItemIdsOnLoads = new Set(allLoadItems.map(li => li.order_item_id).filter(Boolean));
        
        const ordersNeedingLoads = [];
        
        for (const order of activeOrders) {
            const deliveryDate = order.last_fulfillment_date || order.delivery_date;
            if (deliveryDate !== tomorrowStr) continue;
            
            const orderItems = allOrderItems.filter(i => i.order_id === order.id);
            const inHoldDeliveryItems = orderItems.filter(i => 
                i.status === 'in_hold' &&
                !i.is_quote &&
                (i.quantity || 0) > 0 &&
                !orderItemIdsOnLoads.has(i.id)
            );
            
            if (inHoldDeliveryItems.length === 0) continue;
            
            const loadsForOrderTomorrow = allLoads.filter(l => 
                l.order_id === order.id && 
                l.delivery_date === tomorrowStr &&
                l.status !== 'archived'
            );
            
            if (loadsForOrderTomorrow.length > 0) continue;
            
            ordersNeedingLoads.push({
                orderId: order.id,
                customerName: order.customer_name,
                jobAddress: order.job_address || 'N/A',
                receiptNumbers: order.receipt_numbers || 'N/A',
                deliveryDate: deliveryDate,
                itemsNotInLoads: inHoldDeliveryItems.map(i => ({
                    productName: i.product_name,
                    quantity: i.quantity,
                    unit: i.selected_unit,
                    color: i.selected_color || 'N/A',
                    receiptNumber: i.receipt_number || 'N/A',
                    holdLocation: i.hold_location || 'N/A'
                }))
            });
        }
        
        // Clear noLoadBuilt alerts for orders that NOW have a load (i.e. load was built since last check)
        const ordersNeedingLoadIds = new Set(ordersNeedingLoads.map(o => o.orderId));
        const staleNoLoadAlerts = existingAlerts.filter(a =>
            a.type === 'noLoadBuilt' &&
            !a.is_resolved &&
            !ordersNeedingLoadIds.has(a.order_id)
        );
        if (staleNoLoadAlerts.length > 0) {
            await Promise.all(staleNoLoadAlerts.map(a =>
                base44.asServiceRole.entities.MonitoringAlert.delete(a.id)
            ));
        }

        // Create MonitoringAlert records for each order needing a load
        let alertsCreated = 0;
        for (const o of ordersNeedingLoads) {
            const alreadyExists = existingAlerts.some(a =>
                a.type === 'noLoadBuilt' &&
                a.order_id === o.orderId &&
                !a.is_resolved
            );
            if (!alreadyExists) {
                await base44.asServiceRole.entities.MonitoringAlert.create({
                    type: 'noLoadBuilt',
                    message: `No load built for delivery scheduled tomorrow (${tomorrowStr}): ${o.customerName}${o.jobAddress !== 'N/A' ? ' — ' + o.jobAddress : ''}`,
                    order_id: o.orderId,
                    is_resolved: false
                });
                alertsCreated++;
            }
        }
        
        // Send email if there are orders needing loads
        if (ordersNeedingLoads.length > 0) {
            const today = new Date();
            const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const tomorrowDisplayStr = new Date(tomorrowStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

            const htmlStyles = `
                body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
                .container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                .header { background: #b45309; color: white; padding: 24px 28px; }
                .header h1 { margin: 0; font-size: 20px; }
                .header p { margin: 6px 0 0; font-size: 13px; color: #fde68a; }
                .content { padding: 24px 28px; }
                .alert-banner { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; color: #92400e; font-weight: bold; }
                .order-card { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 16px; overflow: hidden; }
                .order-header { background: #f8fafc; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; }
                .order-header .name { font-size: 16px; font-weight: bold; color: #1e293b; }
                .order-header .meta { font-size: 13px; color: #64748b; margin-top: 4px; }
                .order-header .meta span { font-weight: 600; color: #334155; }
                .items-table { width: 100%; border-collapse: collapse; font-size: 13px; }
                .items-table th { background: #f1f5f9; text-align: left; padding: 8px 12px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
                .items-table td { padding: 8px 12px; border-top: 1px solid #f1f5f9; color: #334155; }
                .cta { background: #1e293b; color: white; text-align: center; padding: 16px; border-radius: 6px; margin-top: 20px; font-size: 14px; font-weight: bold; }
                .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 28px; font-size: 12px; color: #94a3b8; }
            `;

            const orderCardsHtml = ordersNeedingLoads.map(o => {
                const itemRows = o.itemsNotInLoads.map(i => `
                    <tr>
                        <td>${i.productName}</td>
                        <td>${i.quantity} ${i.unit}</td>
                        <td>${i.color !== 'N/A' ? i.color : '—'}</td>
                        <td>#${i.receiptNumber}</td>
                        <td>${i.holdLocation !== 'N/A' ? i.holdLocation : '—'}</td>
                    </tr>`).join('');

                return `
                    <div class="order-card">
                        <div class="order-header">
                            <div class="name">${o.customerName}</div>
                            <div class="meta">Address: <span>${o.jobAddress}</span> &nbsp;|&nbsp; Receipts: <span>${o.receiptNumbers}</span></div>
                        </div>
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Qty</th>
                                    <th>Color</th>
                                    <th>Receipt</th>
                                    <th>Hold Location</th>
                                </tr>
                            </thead>
                            <tbody>${itemRows}</tbody>
                        </table>
                    </div>`;
            }).join('');

            const emailSubject = `⚠️ Action Required: ${ordersNeedingLoads.length} Order${ordersNeedingLoads.length > 1 ? 's' : ''} Need Delivery Loads for Tomorrow`;
            const emailBody = `<!DOCTYPE html><html><head><style>${htmlStyles}</style></head><body>
                <div class="container">
                    <div class="header">
                        <h1>⚠️ Delivery Load Assignment Required</h1>
                        <p>Today: ${dateStr}</p>
                    </div>
                    <div class="content">
                        <div class="alert-banner">
                            🚚 ${ordersNeedingLoads.length} order${ordersNeedingLoads.length > 1 ? 's have' : ' has'} items in hold scheduled for delivery <strong>tomorrow (${tomorrowDisplayStr})</strong> but no load has been created yet.
                        </div>
                        ${orderCardsHtml}
                        <div class="cta">Go to LoadMaster → Delivery Calendar to create loads for these orders.</div>
                    </div>
                    <div class="footer">Urkel automated monitoring system</div>
                </div>
            </body></html>`;

            await base44.asServiceRole.integrations.Core.SendEmail({
                to: 'info@mattawanlandscape.com',
                subject: emailSubject,
                body: emailBody,
                is_html: true
            });
        }
        
        return Response.json({ 
            success: true, 
            ordersNeedingLoads: ordersNeedingLoads.length,
            alertsCreated,
            details: ordersNeedingLoads
        });
    } catch (error) {
        console.error('Upcoming delivery check failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});