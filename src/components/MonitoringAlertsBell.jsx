import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { base44 } from '@/api/base44Client';
import { Bell, X, AlertTriangle, CheckCircle, Wrench, Loader2, Zap, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const TYPE_LABELS = {
  overAllocation: { label: 'Over-Allocation', color: 'bg-red-100 text-red-800 border-red-300' },
  orphanedItems: { label: 'Orphaned Items', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  overdueUnpaidReceipts: { label: 'Overdue Payment', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  missedDeliveries: { label: 'Missed Delivery', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  completionIntegrity: { label: 'Completion Issue', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  noLoadBuilt: { label: 'No Load Built', color: 'bg-red-100 text-red-800 border-red-300' },
  unconfirmedDeliveries: { label: 'Unconfirmed Delivery', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  pendingArrivals: { label: 'Pending Arrivals', color: 'bg-blue-100 text-blue-800 border-blue-300' }
};

// Parse order item ID from orphaned alert message - we'll fetch items by order_id
function OrphanedItemFixer({ alert, onResolved, processingAlertId, setProcessingAlertId }) {
  const [loading, setLoading] = useState(false);
  const [orderItems, setOrderItems] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const isProcessing = processingAlertId === alert.id;

  const loadItems = async () => {
    if (!alert.order_id) return;
    setShowOptions(true);
    if (orderItems) return;
    try {
      // Parse product name from message: "Orphaned item: CustomerName | ProductName | Receipt #..."
      const parts = alert.message.split('|');
      const productName = parts[1]?.trim();
      const receiptPart = parts[2]?.trim() || '';
      const receiptMatch = receiptPart.match(/#(\S+)/);
      const receiptNum = receiptMatch ? receiptMatch[1] : null;

      const items = await base44.entities.OrderItem.filter({ order_id: alert.order_id });
      const orphaned = items.filter(i => {
        const matchesProduct = !productName || i.product_name === productName;
        const matchesReceipt = !receiptNum || i.receipt_number === receiptNum;
        const isOrphaned = (i.status === 'delivered' && i.delivery_method === 'delivery') || i.status === 'on_delivery';
        return matchesProduct && matchesReceipt && isOrphaned;
      });
      setOrderItems(orphaned.length > 0 ? orphaned : items.filter(i => i.status === 'delivered' || i.status === 'on_delivery'));
    } catch (e) {
      setOrderItems([]);
    }
  };

  const fixItem = async (itemId, fixType) => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('fixOrphanedItem', { orderItemId: itemId, fixType });
      if (res.data?.success) {
        toast.success(res.data.message);
        onResolved(alert.id);
      } else {
        toast.error(res.data?.error || 'Fix failed');
      }
    } catch (e) {
      toast.error('Failed to apply fix');
    } finally {
      setLoading(false);
    }
  };

  if (!showOptions) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={loadItems}
              disabled={isProcessing}
              className="text-xs text-orange-600 hover:underline mt-1 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wrench className="w-3 h-3" /> Fix this →
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-gray-900 text-white border-gray-700">
            <p className="text-xs">Manually resolve this issue step-by-step</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!orderItems) {
    return <Loader2 className="w-3 h-3 animate-spin text-gray-400 mt-1" />;
  }

  return (
    <div className="mt-2 bg-orange-50 rounded-md p-2 border border-orange-200">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-orange-800">Choose a fix:</p>
        <button onClick={() => { setShowOptions(false); setProcessingAlertId(null); }} className="text-xs text-gray-400 hover:text-gray-600">
          <X className="w-3 h-3" />
        </button>
      </div>
      {orderItems.length === 0 ? (
        <p className="text-xs text-gray-500">No matching items found. May already be fixed.</p>
      ) : (
        orderItems.map(item => (
          <div key={item.id} className="mb-2 pb-2 border-b border-orange-100 last:border-0">
            <p className="text-xs text-gray-700 mb-1 font-medium">{item.product_name}{item.selected_color ? ` (${item.selected_color})` : ''} — qty {item.quantity}</p>
            <div className="flex gap-1.5 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                disabled={loading}
                onClick={() => fixItem(item.id, 'change_to_pickup')}
              >
                Mark as Pickup
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs border-green-300 text-green-700 hover:bg-green-50"
                disabled={loading}
                onClick={() => fixItem(item.id, 'create_load')}
              >
                Create Load Record
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function MonitoringAlertsBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [processingAlertId, setProcessingAlertId] = useState(null);
  const [agentSuggestion, setAgentSuggestion] = useState(null);
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [confirmingFix, setConfirmingFix] = useState(false);
  const [fixResults, setFixResults] = useState(null);
  const [showFixDialog, setShowFixDialog] = useState(false);
  const [navConfirmAlert, setNavConfirmAlert] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [lastChecked, setLastChecked] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.MonitoringAlert.filter({ is_resolved: false }, '-created_date', 100);
      setAlerts(all.filter(a => a.type !== 'lastChecked' && a.type !== 'deliveryMethodChange'));
      // Try to get the lastChecked timestamp from the fetched records
      const lastCheckedRecord = all.find(a => a.type === 'lastChecked');
      if (lastCheckedRecord) setLastChecked(lastCheckedRecord.message || null);
    } catch (e) {
      // silently ignore fetch errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    fetchAlerts();
    setRefreshed(true);
    setTimeout(() => setRefreshed(false), 2000);
  };

  useEffect(() => {
    const handleClick = (e) => {
      // Don't close panel if a dialog is open
      if (agentSuggestion || fixResults) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, agentSuggestion, fixResults]);

  const handleResolve = async (alertId) => {
    const alert = alerts.find(a => a.id === alertId);
    try {
      if (alert?.type === 'overdueUnpaidReceipts' && alert.order_id) {
        const receipts = await base44.entities.Receipt.filter({ order_id: alert.order_id, is_paid: false });
        await Promise.all(receipts.map(r => base44.entities.Receipt.update(r.id, { ignore_overdue_alert: true })));
      }
      await base44.entities.MonitoringAlert.update(alertId, { is_resolved: true });
    } catch (e) {
      // silently ignore
    } finally {
      fetchAlerts();
    }
  };

  const handleClose = async (alertId) => {
    try {
      await base44.entities.MonitoringAlert.update(alertId, { is_resolved: true });
      toast.success('Alert closed');
    } catch (e) {
      toast.error('Failed to close alert');
    } finally {
      setProcessingAlertId(null);
      fetchAlerts();
    }
  };

  const handleResolveAll = async () => {
    try {
      await Promise.all(alerts.map(a => base44.entities.MonitoringAlert.update(a.id, { is_resolved: true })));
    } finally {
      fetchAlerts();
    }
  };

  const handleAskAgent = async (alert) => {
    // For noLoadBuilt alerts, go straight to OptimizeDelivery for that order
    if (alert.type === 'noLoadBuilt' && alert.order_id) {
      navigate(`${createPageUrl('OptimizeDelivery')}?orderId=${alert.order_id}`);
      setIsOpen(false);
      return;
    }

    // For unconfirmedDeliveries, show confirm dialog before navigating
    if (alert.type === 'unconfirmedDeliveries' && alert.order_id) {
      setIsOpen(false);
      setNavConfirmAlert(alert);
      return;
    }

    // For orphaned_delivery — build inline analysis and show dialog with auto-fix
    if (alert.type === 'orphaned_delivery' && alert.order_id) {
      setProcessingAlertId(alert.id);
      setIsOpen(false);
      try {
        const orderItems = await base44.entities.OrderItem.filter({ order_id: alert.order_id }, '-created_date', 500);
        // Only delivered/on_delivery items without a master_item_id can be orphaned deliveries
        const orphans = orderItems.filter(i => !i.master_item_id && (i.status === 'delivered' || i.status === 'on_delivery'));
        const childIds = new Set(orderItems.filter(i => i.master_item_id).map(i => i.master_item_id));
        const trulyOrphaned = orphans.filter(i => !childIds.has(i.id));
        if (trulyOrphaned.length === 0) {
          await base44.entities.MonitoringAlert.update(alert.id, { is_resolved: true });
          fetchAlerts();
          toast.success('No orphaned items found — alert cleared.');
          return;
        }
        setAgentSuggestion({
          alertId: alert.id,
          alertType: alert.type,
          orderId: alert.order_id,
          riskLevel: 'HIGH',
          analysis: `${trulyOrphaned.length} item(s) on this order have a delivered status but are missing the required child delivery records. This happens when a delivery was confirmed at the master-item level without properly splitting the quantity into a child record.`,
          impact: 'Without child records, the delivery history is incomplete and the Master Order view cannot accurately show what was delivered versus what remains.',
          affectedItems: trulyOrphaned.map(i => ({
            productName: i.product_name,
            quantity: i.original_quantity || i.quantity,
            unit: i.selected_unit,
            color: i.selected_color,
            status: i.status,
            receiptNumber: i.receipt_number,
          })),
          recommendation: `Create a child delivery record for each of the ${trulyOrphaned.length} affected item(s) and reset the master item quantity to 0.`,
          autoFixFunction: '__orphaned_delivery_inline__',
          _orphanedItems: trulyOrphaned,
        });
        setProcessingAlertId(null);
        setShowAgentDialog(true);
      } catch (e) {
        toast.error('Failed to analyze alert: ' + e.message);
      } finally {
        setProcessingAlertId(null);
      }
      return;
    }

    setProcessingAlertId(alert.id);
    try {
      const res = await base44.functions.invoke('askMonitoringAgent', {
        alertType: alert.type,
        alertMessage: alert.message,
        orderId: alert.order_id,
        alertId: alert.id
      });
      if (res.data?.suggestion) {
        setAgentSuggestion({ ...res.data.suggestion, alertId: alert.id, alertType: alert.type, orderId: alert.order_id });
        setIsOpen(false);
        setShowAgentDialog(true);
      } else {
        toast.error('Agent did not provide a suggestion');
        setProcessingAlertId(null);
      }
    } catch (e) {
      toast.error('Failed to analyze alert');
      setProcessingAlertId(null);
    }
  };

  const handleConfirmFix = async () => {
    if (!agentSuggestion?.autoFixFunction) return;
    setConfirmingFix(true);
    const suggestion = agentSuggestion;
    try {
      // Inline fix for orphaned_delivery
      if (suggestion.autoFixFunction === '__orphaned_delivery_inline__') {
        const trulyOrphaned = suggestion._orphanedItems || [];
        const details = [];
        for (const master of trulyOrphaned) {
          const childQty = master.original_quantity || master.quantity || 0;
          await base44.entities.OrderItem.create({
            order_id: master.order_id,
            product_name: master.product_name,
            selected_color: master.selected_color || '',
            selected_unit: master.selected_unit,
            receipt_number: master.receipt_number,
            status: master.status,
            quantity: childQty,
            master_item_id: master.id,
            delivery_method: master.delivery_method,
            date_completed: master.date_completed,
            weight_per_unit: master.weight_per_unit,
            hold_location: master.hold_location,
            date_arrived: master.date_arrived,
          });
          await base44.entities.OrderItem.update(master.id, { quantity: 0 });
          details.push({ itemName: master.product_name, action: `Child delivery record created; master quantity reset to 0`, details: `Color: ${master.selected_color || 'N/A'} • Unit: ${master.selected_unit} • Qty: ${childQty}` });
        }
        await base44.entities.MonitoringAlert.update(suggestion.alertId, { is_resolved: true });
        setShowAgentDialog(false);
        setAgentSuggestion(null);
        setFixResults({ message: `Fixed ${trulyOrphaned.length} orphaned item(s) — child records created and masters reset.`, details });
        setShowFixDialog(true);
        fetchAlerts();
        return;
      }

      const res = await base44.functions.invoke(suggestion.autoFixFunction, suggestion.params || {});
      if (res.data?.success) {
        setShowAgentDialog(false);
        setAgentSuggestion(null);
        setFixResults(res.data);
        setShowFixDialog(true);
        await base44.entities.MonitoringAlert.update(suggestion.alertId, { is_resolved: true });
        toast.success(res.data.message || 'Fix applied successfully');
      } else {
        toast.error(res.data?.error || 'Fix failed');
      }
    } catch (e) {
      toast.error('Failed to apply fix: ' + (e.message || 'Unknown error'));
    } finally {
      setConfirmingFix(false);
      setProcessingAlertId(null);
      fetchAlerts();
    }
  };

  const unresolved = alerts.length;

  const navConfirmDialog = (
    <Dialog open={!!navConfirmAlert} onOpenChange={(open) => { if (!open) setNavConfirmAlert(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Go to Order</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-700 py-2">
          This will take you to <span className="font-semibold">{navConfirmAlert?.message?.match(/^[^—]+/)?.[0]?.trim()}</span> so you can confirm the delivery.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setNavConfirmAlert(null)}>Cancel</Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={async () => {
            const alertToResolve = navConfirmAlert;
            setNavConfirmAlert(null);
            navigate(`${createPageUrl('OrderDetails')}?id=${alertToResolve.order_id}`);
            // Resolve the alert immediately — if delivery still needed, monitor will re-raise it
            try { await base44.entities.MonitoringAlert.update(alertToResolve.id, { is_resolved: true }); } catch {}
            fetchAlerts();
          }}>Go to Order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const agentDialog = (
    <Dialog open={showAgentDialog} onOpenChange={(open) => { if (!open) { setShowAgentDialog(false); setAgentSuggestion(null); setProcessingAlertId(null); } }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI Agent Analysis & Recommendation</DialogTitle>
        </DialogHeader>
        {agentSuggestion && (
          <div className="space-y-4">
            <div className="flex items-start gap-2">
              <div className={`px-2 py-1 rounded text-xs font-semibold ${agentSuggestion.riskLevel === 'HIGH' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {agentSuggestion.riskLevel || 'MEDIUM'} RISK
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Issue Identified:</p>
              <p className="text-sm text-gray-700 leading-relaxed">{agentSuggestion.analysis}</p>
            </div>
            {agentSuggestion.impact && (
              <div className="bg-orange-50 border border-orange-200 rounded p-3">
                <p className="text-xs font-semibold text-orange-900 mb-1">Why This Matters:</p>
                <p className="text-sm text-orange-800">{agentSuggestion.impact}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">
                {agentSuggestion.isReceiptSummary ? 'Receipt Payment Status:' : 'Affected Items:'}
              </p>
              {agentSuggestion.affectedItems && agentSuggestion.affectedItems.length > 0 ? (
                <div className="bg-gray-50 rounded border border-gray-200 p-3 max-h-48 overflow-y-auto">
                  <ul className="space-y-2">
                    {agentSuggestion.affectedItems.map((item, idx) => (
                      <li key={idx} className="text-xs text-gray-700 border-b border-gray-200 pb-2 last:border-0">
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-gray-600 mt-0.5">
                          {item.quantity} {item.unit || item.selected_unit} {item.color && `• ${item.color}`}
                          {item.status && ` • Status: ${item.status}`}
                          {item.dateCompleted && ` • Date: ${item.dateCompleted}`}
                          {item.receiptNumber && ` • Receipt: ${item.receiptNumber}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No additional details available</p>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Recommended Action:</p>
              <p className="text-sm text-gray-700 leading-relaxed">{agentSuggestion.recommendation}</p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { setShowAgentDialog(false); setAgentSuggestion(null); setProcessingAlertId(null); }}>
            Close
          </Button>
          {agentSuggestion && (() => {
            const alertId = agentSuggestion.alertId;
            const alert = alerts.find(a => a.id === alertId) || { type: agentSuggestion.alertType, order_id: agentSuggestion.orderId };
            const closeAndRefresh = async (id) => {
              try { await base44.entities.MonitoringAlert.update(id, { is_resolved: true }); } catch {}
              setShowAgentDialog(false);
              setAgentSuggestion(null);
              setProcessingAlertId(null);
              fetchAlerts();
            };

            if (agentSuggestion.autoFixFunction) {
              return (
                <Button onClick={handleConfirmFix} disabled={confirmingFix} className="bg-indigo-600 hover:bg-indigo-700">
                  {confirmingFix ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                  Apply Fix
                </Button>
              );
            }

            if (agentSuggestion.alertType === 'ready_to_archive' || alert?.type === 'ready_to_archive') {
              const orderId = agentSuggestion.orderId || alert?.order_id;
              return (
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700"
                  disabled={confirmingFix}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!orderId) { toast.error('No order ID found'); return; }
                    setConfirmingFix(true);
                    try {
                      await base44.entities.Order.update(orderId, { is_archived: true, is_completed: true });
                      queryClient.invalidateQueries(['orders']);
                      toast.success('Order archived successfully');
                      await closeAndRefresh(alertId);
                    } finally {
                      setConfirmingFix(false);
                    }
                  }}
                >
                  {confirmingFix ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                  Archive Order
                </Button>
              );
            }

            if (alert?.order_id) {
              return (
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => {
                    setShowAgentDialog(false);
                    setAgentSuggestion(null);
                    setProcessingAlertId(null);
                    navigate(`${createPageUrl('OrderDetails')}?id=${alert.order_id}`);
                  }}
                >
                  Go to Order
                </Button>
              );
            }

            return null;
          })()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const fixDialog = (
    <Dialog open={showFixDialog} onOpenChange={(open) => { if (!open) { setShowFixDialog(false); setFixResults(null); } }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fix Applied Successfully</DialogTitle>
        </DialogHeader>
        {fixResults && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded p-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{fixResults.message || 'Fix has been applied'}</p>
            </div>
            {fixResults.details && fixResults.details.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-3">Changes Made:</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {fixResults.details.map((detail, idx) => {
                    const needsManualReview = detail.action?.includes('manual review');
                    return (
                      <div key={idx} className={`border rounded p-3 ${needsManualReview ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-start gap-2">
                          <CheckCircle className={`w-4 h-4 mt-0.5 shrink-0 ${needsManualReview ? 'text-yellow-500' : 'text-green-600'}`} />
                          <div className="flex-1 min-w-0">
                            {detail.itemName && <p className="text-sm font-medium text-gray-900">{detail.itemName}</p>}
                            <p className="text-xs text-gray-700 mt-1">{detail.action}</p>
                            {detail.details && <p className="text-xs text-gray-600 mt-1">{detail.details}</p>}
                            {needsManualReview && (
                              <div className="mt-2 text-xs text-yellow-800 bg-yellow-100 border border-yellow-200 rounded p-2">
                                <p className="font-semibold mb-1">What to do:</p>
                                <p>This item is marked "delivered" but has no matching delivery load. Open the order and check this item, then:</p>
                                <ul className="list-disc ml-4 mt-1 space-y-0.5">
                                  <li>If it <span className="font-medium">was actually delivered</span> — it's fine, just dismiss the alert. No further action needed.</li>
                                  <li>If it <span className="font-medium">was NOT actually delivered</span> — drag it back to the In Hold column so it can be re-scheduled for delivery.</li>
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => { setShowFixDialog(false); setFixResults(null); }} className="bg-indigo-600 hover:bg-indigo-700">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {ReactDOM.createPortal(navConfirmDialog, document.body)}
      {ReactDOM.createPortal(agentDialog, document.body)}
      {ReactDOM.createPortal(fixDialog, document.body)}
      <div className="relative flex items-center gap-0.5" ref={panelRef}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleManualRefresh}
                className="h-7 w-7 text-gray-400 hover:text-gray-600"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshed ? 'text-green-500' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-gray-900 text-white border-gray-700">
              <p className="text-xs">{refreshed ? 'Refreshed!' : 'Refresh alerts now'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(!isOpen)}
                className="relative h-9 w-9"
                title="Monitoring Alerts"
              >
                <Bell className="w-5 h-5 text-gray-600" />
                {unresolved > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                    {unresolved > 9 ? '9+' : unresolved}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-gray-900 text-white border-gray-700">
              <p className="text-xs">View system monitoring alerts</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

      {isOpen && (
        <div className="absolute right-0 top-11 w-96 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">Monitoring Alerts</span>
                  {unresolved > 0 && (
                    <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">{unresolved}</Badge>
                  )}
                </div>
                {lastChecked && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Last checked: {new Date(lastChecked).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                  </p>
                )}
              </div>
            </div>

          </div>

          {/* Alert List */}
          <div className="max-h-[500px] overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400">
                <CheckCircle className="w-8 h-8 mb-2 text-green-400" />
                <p className="text-sm font-medium">All clear!</p>
                <p className="text-xs mt-1">No active monitoring alerts.</p>
              </div>
            ) : (
              alerts.map(alert => {
                const typeInfo = TYPE_LABELS[alert.type] || { label: alert.type, color: 'bg-gray-100 text-gray-700 border-gray-300' };
                return (
                  <div key={alert.id} className={`px-4 py-3 border-b border-gray-100 last:border-0 ${alert.order_id ? 'cursor-pointer' : ''} hover:bg-gray-50 transition-colors`} onClick={() => { console.log('Alert clicked:', alert.id, 'order_id:', alert.order_id); if (alert.order_id) { console.log('Has order_id, navigating to:', `${createPageUrl('OrderDetails')}?id=${alert.order_id}`); navigate(`${createPageUrl('OrderDetails')}?id=${alert.order_id}`); setIsOpen(false); } else { console.log('No order_id on this alert'); } }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                         <Badge className={`text-xs border mb-1 ${typeInfo.color} pointer-events-none`}>{typeInfo.label}</Badge>
                        <p className="text-sm text-gray-800 leading-snug">{alert.message}</p>
                        <div className="flex gap-3 mt-1 flex-wrap" onClick={e => e.stopPropagation()}>
                          {alert.type === 'orphanedItems' && alert.order_id && (
                            <OrphanedItemFixer alert={alert} onResolved={handleResolve} processingAlertId={processingAlertId} setProcessingAlertId={setProcessingAlertId} />
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                        {processingAlertId === alert.id ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setProcessingAlertId(null)}
                                  className="h-6 shrink-0 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 border-red-300"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-gray-900 text-white border-gray-700">
                                <p className="text-xs">Cancel AI agent processing</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAskAgent(alert)}
                                  className="h-6 shrink-0 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 border-indigo-300"
                                >
                                  <Zap className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-gray-900 text-white border-gray-700 max-w-xs">
                                <p className="text-xs">{alert.type === 'unconfirmedDeliveries' ? 'Go to order to confirm delivery' : 'Ask the AI agent to analyze and suggest an automated fix'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleClose(alert.id)}
                                className="h-6 shrink-0 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 px-2"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-gray-900 text-white border-gray-700">
                              <p className="text-xs">Close alert (will reappear if issue persists)</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResolve(alert.id)}
                                className="h-6 shrink-0 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 border-blue-300"
                              >
                                <CheckCircle className="w-3 h-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-gray-900 text-white border-gray-700">
                              <p className="text-xs">Mark as resolved (won't reappear)</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
}