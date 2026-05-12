// v4 - upsert pattern for alerts (no duplicates), startup cleanup of resolved alerts
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // === STARTUP CLEANUP ===
    // 1. Delete ALL resolved alerts (historical junk)
    // 2. Delete the specific bad Turf Works unconfirmedDeliveries alert
    const allAlertsForCleanup = await base44.asServiceRole.entities.MonitoringAlert.list('-created_date', 500);
    const toArrayCleanup = (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; } }
      return [];
    };
    const alertsForCleanup = toArrayCleanup(allAlertsForCleanup);

    const cleanupIds = alertsForCleanup
      .filter(a =>
        a.is_resolved === true ||
        a.type === 'ready_to_archive'
      )
      .map(a => a.id);

    // Delete sequentially to avoid rate limits
    for (const id of cleanupIds) {
      await base44.asServiceRole.entities.MonitoringAlert.delete(id);
    }
    // === END STARTUP CLEANUP ===

    const issues = [];

    // Fetch all data needed for checks
    const [allItemsRaw, allLoadItemsRaw, receiptsRaw, ordersRaw, allLoadsRaw] = await Promise.all([
      base44.asServiceRole.entities.OrderItem.list('-created_date', 500),
      base44.asServiceRole.entities.LoadItem.list('-created_date', 500),
      base44.asServiceRole.entities.Receipt.list('-created_date', 500),
      base44.asServiceRole.entities.Order.list('-created_date', 500),
      base44.asServiceRole.entities.Load.list('-created_date', 500),
    ]);

    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') { try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
      return [];
    };

    const normalizedItems = toArray(allItemsRaw);
    const normalizedLoadItems = toArray(allLoadItemsRaw);
    const normalizedReceipts = toArray(receiptsRaw);
    const normalizedOrders = toArray(ordersRaw);
    const allLoads = toArray(allLoadsRaw);

    const loadItemOrderIds = new Set(normalizedLoadItems.map(li => li.order_item_id).filter(Boolean));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // 1. Over-allocation
    const masterItemsMap = {};
    for (const item of normalizedItems) {
      let masterId = item.id;
      if (item.master_item_id) masterId = item.master_item_id;
      if (!masterItemsMap[masterId]) masterItemsMap[masterId] = { master: null, children: [] };
      if (item.id === masterId) masterItemsMap[masterId].master = item;
      else masterItemsMap[masterId].children.push(item);
    }
    for (const masterId in masterItemsMap) {
      const { master, children } = masterItemsMap[masterId];
      if (!master) continue;
      // Skip if original_quantity is null/undefined — cannot assess over-allocation without it
      if (!master.original_quantity || master.original_quantity <= 0) continue;
      const totalQty = (master.quantity || 0) + children.reduce((sum, i) => sum + (i.quantity || 0), 0);
      if (totalQty > master.original_quantity) {
        const order = normalizedOrders.find(o => o.id === master.order_id);
        if (order && !order.is_archived) {
          const colorLabel = master.selected_color ? ` (${master.selected_color})` : '';
          issues.push({
            type: 'overAllocation',
            message: `OVER-ALLOCATION: ${order.customer_name} | ${master.product_name}${colorLabel} ${master.selected_unit} | Original: ${master.original_quantity}, Current total: ${totalQty} | Over by: ${totalQty - master.original_quantity}`,
            order_id: master.order_id,
          });
        }
      }
    }

    // 2. Overdue unpaid receipts (>30 days since first delivery)
    const activeOrders = normalizedItems.reduce((map, item) => {
      if (!map.has(item.order_id)) map.set(item.order_id, []);
      map.get(item.order_id).push(item);
      return map;
    }, new Map());

    activeOrders.forEach((items, orderId) => {
      const order = normalizedOrders.find(o => o.id === orderId);
      if (!order || order.is_archived) return;
      const deliveredItems = items.filter(i => i.status === 'delivered' && i.date_completed);
      if (deliveredItems.length === 0) return;
      const earliestDate = new Date(Math.min(...deliveredItems.map(i => new Date(i.date_completed + 'T00:00:00').getTime())));
      const daysOverdue = Math.floor((today - earliestDate) / (1000 * 60 * 60 * 24));
      if (daysOverdue > 30) {
        const orderReceipts = normalizedReceipts.filter(r => r.order_id === orderId && !r.is_paid && !r.ignore_overdue_alert);
        if (orderReceipts.length > 0) {
          issues.push({
            type: 'overdueUnpaidReceipts',
            message: `${order.customer_name} has ${orderReceipts.length} unpaid receipt(s) (${orderReceipts.map(r => r.receipt_number).join(', ')}) overdue by ${daysOverdue} days since ${earliestDate.toISOString().split('T')[0]}`,
            order_id: orderId,
          });
        }
      }
    });

    // 3. Orphaned on_delivery items (on_delivery but no LoadItem)
    const orphanedOnDelivery = normalizedItems.filter(item =>
      item.status === 'on_delivery' && !loadItemOrderIds.has(item.id)
    );
    if (orphanedOnDelivery.length > 0) {
      const groupedOrphanedByOrder = {};
      orphanedOnDelivery.forEach(item => {
        if (!groupedOrphanedByOrder[item.order_id]) groupedOrphanedByOrder[item.order_id] = [];
        groupedOrphanedByOrder[item.order_id].push(item);
      });
      Object.entries(groupedOrphanedByOrder).forEach(([orderId, items]) => {
        const order = normalizedOrders.find(o => o.id === orderId);
        if (order && order.is_archived) return;
        const receiptNums = [...new Set(items.map(i => i.receipt_number).filter(Boolean))];
        const receiptInfo = receiptNums.length > 0 ? receiptNums.map(r => `#${r}`).join(', ') : 'No receipts';
        issues.push({
          type: 'orphanedItems',
          message: `Orphaned Items: ${order?.customer_name || 'Unknown'} | ${items.length} item(s) on_delivery | Receipts: ${receiptInfo} | Missing load assignment`,
          order_id: orderId,
        });
      });
    }

    // 4. (completionIntegrity check removed — delivery_method is not required to be 'delivery' on load items)

    // 5. Unconfirmed deliveries: on_delivery items whose load delivery_date is in the past
    // If the parent Load is already delivered/archived, auto-heal the stuck OrderItem instead of alerting.
    const onDeliveryItems = normalizedItems.filter(i => i.status === 'on_delivery');
    const checkedOrders = new Set();
    for (const item of onDeliveryItems) {
      if (checkedOrders.has(item.order_id)) continue;
      const order = normalizedOrders.find(o => o.id === item.order_id);
      if (!order || order.is_archived) continue;
      const loadItemForThis = normalizedLoadItems.find(li => li.order_item_id === item.id);
      if (!loadItemForThis) continue;
      const load = allLoads.find(l => l.id === loadItemForThis.load_id);
      if (!load || !load.delivery_date) continue;

      if (load.status === 'delivered' || load.status === 'archived') {
        // Load was confirmed — auto-fix all on_delivery items for this order that belong to confirmed loads
        const stuckItems = onDeliveryItems.filter(i2 => {
          if (i2.order_id !== item.order_id) return false;
          const li = normalizedLoadItems.find(li2 => li2.order_item_id === i2.id);
          if (!li) return false;
          const l = allLoads.find(l2 => l2.id === li.load_id);
          return l && (l.status === 'delivered' || l.status === 'archived');
        });
        for (const stuck of stuckItems) {
          await base44.asServiceRole.entities.OrderItem.update(stuck.id, {
            status: 'delivered',
            date_completed: stuck.date_completed || load.delivery_date || todayStr,
          });
        }
        checkedOrders.add(item.order_id);
        continue;
      }

      if (load.delivery_date < todayStr) {
        checkedOrders.add(item.order_id);
        const orderOnDeliveryItems = onDeliveryItems.filter(i2 => i2.order_id === item.order_id);
        issues.push({
          type: 'unconfirmedDeliveries',
          message: `Unconfirmed delivery: ${order.customer_name} — ${orderOnDeliveryItems.length} item(s) still on_delivery since ${load.delivery_date}. Delivery may not have been confirmed.`,
          order_id: item.order_id,
        });
      }
    }

    // 6. Ready to archive
    // ALL THREE must be true:
    // 1. is_completed: true AND is_archived: false
    // 2. ALL OrderItems are status=delivered OR quantity=0 (none are order/in_hold/on_delivery)
    // 3. ALL Receipt records for the order have is_paid: true
    const readyToArchiveOrderIds = new Set();
    normalizedOrders.forEach(order => {
      if (!order.is_completed || order.is_archived) return;
      const orderItems = normalizedItems.filter(i => i.order_id === order.id);
      if (orderItems.length === 0) return;

      // Criterion 2: no item with qty > 0 and a non-delivered status
      const hasActiveItems = orderItems.some(i =>
        (i.quantity || 0) > 0 &&
        (i.status === 'order' || i.status === 'in_hold' || i.status === 'on_delivery')
      );
      if (hasActiveItems) return;

      // Criterion 3: all receipts must be paid
      const orderReceipts = normalizedReceipts.filter(r => r.order_id === order.id);
      const hasUnpaidReceipts = orderReceipts.some(r => !r.is_paid);
      if (hasUnpaidReceipts) return;

      readyToArchiveOrderIds.add(order.id);
      issues.push({
        type: 'ready_to_archive',
        message: `${order.customer_name} — order is complete, all items delivered, all receipts paid. Ready to archive.`,
        order_id: order.id,
      });
    });

    // 7. Orphaned deliveries: master items (no master_item_id) with status === 'delivered' and no child records
    const childItemsByMaster = {};
    for (const item of normalizedItems) {
      if (item.master_item_id) {
        if (!childItemsByMaster[item.master_item_id]) childItemsByMaster[item.master_item_id] = [];
        childItemsByMaster[item.master_item_id].push(item);
      }
    }
    const orphanedDeliveryByOrder = {};
    for (const item of normalizedItems) {
      if (item.master_item_id) continue; // skip children
      if (item.status !== 'delivered') continue; // only flag delivered items
      const order = normalizedOrders.find(o => o.id === item.order_id);
      if (!order || order.is_archived) continue;
      const children = childItemsByMaster[item.id] || [];
      if (children.length === 0) {
        if (!orphanedDeliveryByOrder[item.order_id]) orphanedDeliveryByOrder[item.order_id] = { order, items: [] };
        orphanedDeliveryByOrder[item.order_id].items.push(item);
      }
    }
    for (const [orderId, { order, items: orphans }] of Object.entries(orphanedDeliveryByOrder)) {
      const productNames = orphans.map(i => `${i.product_name}${i.selected_color ? ` (${i.selected_color})` : ''}`).join(', ');
      issues.push({
        type: 'orphaned_delivery',
        message: `${order.customer_name} has ${orphans.length} item(s) delivered without proper child records: ${productNames}`,
        order_id: orderId,
      });
    }

    // 8. Pending arrivals (items in 'order' status with a delivery reminder within 3 days)
    const pendingArrivalOrders = new Map();
    normalizedItems.forEach(item => {
      if (item.status !== 'order' || item.is_quote || (item.quantity || 0) <= 0) return;
      const order = normalizedOrders.find(o => o.id === item.order_id);
      if (!order || order.is_archived || order.is_completed) return;
      if (!pendingArrivalOrders.has(item.order_id)) pendingArrivalOrders.set(item.order_id, { order, count: 0 });
      pendingArrivalOrders.get(item.order_id).count++;
    });
    const allReminders = await base44.asServiceRole.entities.DeliveryReminder.list('-created_date', 500);
    const threeDaysOut = new Date(today);
    threeDaysOut.setDate(threeDaysOut.getDate() + 3);
    const threeDaysOutStr = threeDaysOut.toISOString().split('T')[0];
    pendingArrivalOrders.forEach(({ order, count }, orderId) => {
      const reminder = toArray(allReminders).find(r =>
        r.order_id === orderId &&
        !r.is_resolved &&
        r.scheduled_date >= todayStr &&
        r.scheduled_date <= threeDaysOutStr
      );
      if (reminder) {
        issues.push({
          type: 'pendingArrivals',
          message: `Pending arrivals: ${order.customer_name} has ${count} item(s) not yet arrived at yard — delivery reminder set for ${reminder.scheduled_date}.`,
          order_id: orderId,
        });
      }
    });

    // === UPSERT ALERTS ===
    // Re-fetch current unresolved alerts (after startup cleanup)
    const currentAlertsRaw = await base44.asServiceRole.entities.MonitoringAlert.list('-created_date', 500);
    const currentAlerts = toArray(currentAlertsRaw).filter(a => a.type !== 'lastChecked' && !a.is_resolved);

    // One-time cleanup: delete any existing completionIntegrity alerts
    const completionAlerts = currentAlerts.filter(a => a.type === 'completionIntegrity');
    for (const a of completionAlerts) {
      await base44.asServiceRole.entities.MonitoringAlert.delete(a.id);
    }

    const generatedTypes = ['overAllocation', 'orphanedItems', 'overdueUnpaidReceipts', 'unconfirmedDeliveries', 'pendingArrivals', 'ready_to_archive', 'orphaned_delivery'];

    // Delete unresolved alerts for issues that no longer exist
    const toDelete = currentAlerts.filter(alert => {
      if (generatedTypes.includes(alert.type)) {
        return !issues.some(issue => issue.type === alert.type && issue.order_id === alert.order_id);
      }
      if (alert.type === 'noLoadBuilt' && alert.order_id) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        return allLoads.some(l => l.order_id === alert.order_id && l.delivery_date === tomorrowStr && l.status !== 'archived');
      }
      return false;
    });
    for (const a of toDelete) {
      await base44.asServiceRole.entities.MonitoringAlert.delete(a.id);
    }

    // Upsert each issue: update if existing alert found, create if not (sequential to prevent duplicates)
    let alertsCreatedCount = 0;
    let alertsUpdatedCount = 0;
    const seenKeys = new Set(); // guard against duplicate issues in the same run
    for (const issue of issues) {
      const key = `${issue.type}::${issue.order_id || ''}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const existing = currentAlerts.find(a => a.type === issue.type && a.order_id === issue.order_id);
      if (existing) {
        if (existing.message !== issue.message) {
          await base44.asServiceRole.entities.MonitoringAlert.update(existing.id, { message: issue.message });
          alertsUpdatedCount++;
        }
      } else {
        await base44.asServiceRole.entities.MonitoringAlert.create({ ...issue, is_resolved: false });
        alertsCreatedCount++;
      }
    }

    // Update lastChecked record
    const now = new Date().toISOString();
    const lastCheckedRecords = await base44.asServiceRole.entities.MonitoringAlert.filter({ type: 'lastChecked' });
    if (toArray(lastCheckedRecords).length > 0) {
      await base44.asServiceRole.entities.MonitoringAlert.update(toArray(lastCheckedRecords)[0].id, { message: now });
    } else {
      await base44.asServiceRole.entities.MonitoringAlert.create({ type: 'lastChecked', message: now, is_resolved: false });
    }

    // Send email if there are new issues
    if (alertsCreatedCount > 0) {
      const typeLabels = {
        overAllocation: '🔴 Over-Allocation',
        orphanedItems: '⚠️ Orphaned Items',
        overdueUnpaidReceipts: '💳 Overdue Unpaid Receipt',
        completionIntegrity: '🔧 Data Integrity Issue',
        unconfirmedDeliveries: '🚚 Unconfirmed Delivery',
        pendingArrivals: '📦 Pending Arrivals',
        noLoadBuilt: '🗓️ No Load Built',
        ready_to_archive: '📁 Ready to Archive',
        orphaned_delivery: '🔧 Orphaned Delivery'
      };
      const newIssuesList = issues.filter((issue, idx, arr) =>
        arr.findIndex(x => x.type === issue.type && x.order_id === issue.order_id) === idx &&
        !currentAlerts.find(a => a.type === issue.type && a.order_id === issue.order_id)
      );
      const issueRows = newIssuesList.map(i => {
        const label = typeLabels[i.type] || i.type;
        return `
          <tr>
            <td style="padding:0 0 16px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr><td style="background:#f9fafb;padding:10px 16px;border-bottom:1px solid #e5e7eb;">
                  <span style="font-size:13px;font-weight:700;color:#374151;">${label}</span>
                </td></tr>
                <tr><td style="padding:12px 16px;background:#ffffff;">
                  <span style="font-size:14px;color:#111827;line-height:1.6;">${i.message}</span>
                </td></tr>
              </table>
            </td>
          </tr>`;
      }).join('');

      const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#1e3a5f;padding:24px 28px;">
          <p style="margin:0;font-size:22px;font-weight:bold;color:#ffffff;">⚠️ Urkel Monitoring Alert</p>
          <p style="margin:6px 0 0;font-size:14px;color:#93c5fd;">${alertsCreatedCount} new issue${alertsCreatedCount > 1 ? 's' : ''} detected — action may be required</p>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 20px;font-size:14px;color:#374151;">The monitoring check found the following new issue${alertsCreatedCount > 1 ? 's' : ''}:</p>
          <table width="100%" cellpadding="0" cellspacing="0">${issueRows}</table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
            <tr><td align="center" style="padding:16px 0;">
              <a href="https://app.base44.com/apps/6962ca7ed1a1badc683a33a7" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 28px;border-radius:6px;">View Alerts in Urkel →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 28px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Urkel automated monitoring system &mdash; sent ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: 'info@mattawanlandscape.com',
        from_name: 'Urkel Monitoring',
        subject: `⚠ Urkel Alert: ${alertsCreatedCount} new issue${alertsCreatedCount > 1 ? 's' : ''} found`,
        body: htmlBody,
        is_html: true
      });
    }

    return Response.json({
      success: true,
      cleanedUpOnStartup: cleanupIds.length,
      alertsCreated: alertsCreatedCount,
      alertsUpdated: alertsUpdatedCount,
      alertsDeleted: toDelete.length,
      totalIssues: issues.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});