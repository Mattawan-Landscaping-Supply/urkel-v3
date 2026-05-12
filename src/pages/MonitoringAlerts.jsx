import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Zap, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

export default function MonitoringAlerts() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [agentSuggestion, setAgentSuggestion] = useState(null);
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [confirmingFix, setConfirmingFix] = useState(false);
  const [fixResults, setFixResults] = useState(null);
  const [showFixDialog, setShowFixDialog] = useState(false);
  const [processingAlertId, setProcessingAlertId] = useState(null);

  const { data: allAlerts = [], isLoading, refetch } = useQuery({
    queryKey: ['monitoringAlerts'],
    queryFn: async () => {
      const alerts = await base44.entities.MonitoringAlert.list('-created_date', 500);
      return alerts.filter(a => a.type !== 'lastChecked');
    },
    staleTime: 30000,
    refetchInterval: 30000
  });

  const unresolvedAlerts = allAlerts.filter(a => !a.is_resolved);
  const resolvedAlerts = allAlerts.filter(a => a.is_resolved);

  const markResolvedMutation = useMutation({
    mutationFn: (alertId) => base44.entities.MonitoringAlert.update(alertId, { is_resolved: true }),
    onSuccess: () => {
      queryClient.invalidateQueries(['monitoringAlerts']);
      refetch();
    }
  });

  const handleAskAgent = async (alert) => {
    console.log('Bolt clicked — alert:', JSON.stringify({ id: alert.id, type: alert.type, order_id: alert.order_id }));
    // For noLoadBuilt alerts, first check if a load now exists — if so, dismiss the alert
    if (alert.type === 'noLoadBuilt' && alert.order_id) {
      setProcessingAlertId(alert.id);
      try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        const allLoads = await base44.entities.Load.list('-created_date', 500);
        const loadExists = allLoads.some(l =>
          l.order_id === alert.order_id &&
          l.delivery_date === tomorrowStr &&
          l.status !== 'archived'
        );
        if (loadExists) {
          await base44.entities.MonitoringAlert.delete(alert.id);
          queryClient.invalidateQueries(['monitoringAlerts']);
          refetch();
          toast.success('Load found — alert dismissed.');
          return;
        }
      } catch (e) {
        // If check fails, fall through to navigate
      } finally {
        setProcessingAlertId(null);
        queryClient.invalidateQueries(['monitoringAlerts']);
      }
      navigate(`${createPageUrl('OptimizeDelivery')}?orderId=${alert.order_id}`);
      return;
    }
    // For orphaned_delivery, show analysis dialog first, then allow auto-fix
    if (alert.type === 'orphaned_delivery' && alert.order_id) {
      setProcessingAlertId(alert.id);
      try {
        const orderItems = await base44.entities.OrderItem.filter({ order_id: alert.order_id }, '-created_date', 500);
        const orphans = orderItems.filter(i => !i.master_item_id && i.status !== 'order');
        const childIds = new Set(orderItems.filter(i => i.master_item_id).map(i => i.master_item_id));
        const trulyOrphaned = orphans.filter(i => !childIds.has(i.id));
        if (trulyOrphaned.length === 0) {
          await base44.entities.MonitoringAlert.delete(alert.id);
          queryClient.invalidateQueries(['monitoringAlerts']);
          refetch();
          toast.success('No orphaned items found — alert cleared.');
          return;
        }
        // Build a suggestion object to show in the agent dialog
        setAgentSuggestion({
          alertId: alert.id,
          riskLevel: 'HIGH',
          analysis: `${trulyOrphaned.length} item(s) on this order have a delivered status but are missing the required child delivery records. This happens when a delivery was confirmed at the master-item level without properly splitting the quantity into a child record.`,
          impact: 'Without child records, the delivery history is incomplete and the Master Order view cannot accurately show what was delivered versus what remains. Reports and receipt reconciliation may be incorrect.',
          affectedItems: trulyOrphaned.map(i => ({
            productName: i.product_name,
            quantity: i.original_quantity || i.quantity,
            unit: i.selected_unit,
            color: i.selected_color,
            status: i.status,
            receiptNumber: i.receipt_number,
          })),
          recommendation: `Create a child delivery record for each of the ${trulyOrphaned.length} affected item(s) and reset the master item quantity to 0. This restores the correct split structure without losing any delivery history.`,
          autoFixFunction: '__orphaned_delivery_inline__',
          _orphanedItems: trulyOrphaned,
        });
        setShowAgentDialog(true);
      } catch (e) {
        toast.error('Failed to analyze alert: ' + e.message);
      } finally {
        setProcessingAlertId(null);
      }
      return;
    }

    // For unconfirmedDeliveries, check if items are still on_delivery — if none are, delete the alert; if yes, navigate to order
    if (alert.type === 'unconfirmedDeliveries' && alert.order_id) {
      setProcessingAlertId(alert.id);
      try {
        const orderItems = await base44.entities.OrderItem.filter({ order_id: alert.order_id }, '-created_date', 500);
        const stillOnDelivery = orderItems.some(i => i.status === 'on_delivery');
        if (!stillOnDelivery) {
          await base44.entities.MonitoringAlert.delete(alert.id);
          queryClient.invalidateQueries(['monitoringAlerts']);
          refetch();
          toast.success('Delivery already confirmed — alert cleared.');
        } else {
          navigate(`${createPageUrl('OrderDetails')}?id=${alert.order_id}`);
          // After navigating, delete the alert so it doesn't linger once confirmed
          await base44.entities.MonitoringAlert.delete(alert.id);
          queryClient.invalidateQueries(['monitoringAlerts']);
        }
      } finally {
        setProcessingAlertId(null);
      }
      return;
    }
    // For ready_to_archive, navigate to Completed Orders
    if (alert.type === 'ready_to_archive') {
      navigate(createPageUrl('CompletedOrders'));
      queryClient.invalidateQueries(['monitoringAlerts']);
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
        setAgentSuggestion({ ...res.data.suggestion, alertId: alert.id });
        setShowAgentDialog(true);
      } else {
        toast.error('Agent could not generate a suggestion for this alert type. Try acknowledging it manually.');
      }
    } catch (e) {
      toast.error('Failed to analyze alert');
    } finally {
      setProcessingAlertId(null);
      queryClient.invalidateQueries(['monitoringAlerts']);
    }
  };

  const handleConfirmFix = async () => {
    if (!agentSuggestion?.autoFixFunction) return;
    setConfirmingFix(true);
    const suggestion = agentSuggestion;
    try {
      // Inline fix for orphaned_delivery (no backend function needed)
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
          await base44.entities.OrderItem.update(master.id, { status: 'order', quantity: 0 });
          details.push({ itemName: master.product_name, action: `Child delivery record created; master reset to status: order, quantity: 0`, details: `Color: ${master.selected_color || 'N/A'} • Unit: ${master.selected_unit} • Qty: ${childQty}` });
        }
        await base44.entities.MonitoringAlert.delete(suggestion.alertId);
        setShowAgentDialog(false);
        setAgentSuggestion(null);
        setFixResults({ message: `Fixed ${trulyOrphaned.length} orphaned item(s) — child records created and masters reset.`, details });
        setShowFixDialog(true);
        queryClient.invalidateQueries(['monitoringAlerts']);
        refetch();
        return;
      }

      const res = await base44.functions.invoke(suggestion.autoFixFunction, suggestion.params || {});
      if (res.data?.success) {
        setShowAgentDialog(false);
        setAgentSuggestion(null);
        setFixResults(res.data);
        setShowFixDialog(true);
        await base44.entities.MonitoringAlert.update(suggestion.alertId, { is_resolved: true });
        queryClient.invalidateQueries(['monitoringAlerts']);
        refetch();
        toast.success(res.data.message || 'Fix applied successfully');
      } else {
        toast.error(res.data?.error || 'Fix failed');
      }
    } catch (e) {
      toast.error('Failed to apply fix: ' + (e.message || 'Unknown error'));
    } finally {
      setConfirmingFix(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Monitoring Alerts</h1>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Unresolved Alerts */}
          {unresolvedAlerts.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-red-700 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6" />
                {unresolvedAlerts.length} Issue{unresolvedAlerts.length !== 1 ? 's' : ''} Requiring Attention
              </h2>
              <div className="grid gap-4">
                {unresolvedAlerts.map(alert => (
                  <Card key={alert.id} className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-red-600">{alert.type.replace(/([A-Z])/g, ' $1').trim()}</Badge>
                            <span className="text-xs text-gray-600">
                              {new Date(alert.created_date).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-gray-800">{alert.message}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                           <Button 
                             onClick={() => handleAskAgent(alert)}
                             disabled={processingAlertId === alert.id}
                             className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                           >
                             {processingAlertId === alert.id ? (
                               <>
                                 <Loader2 className="w-4 h-4 animate-spin" />
                                 Analyzing...
                               </>
                             ) : (
                               <>
                                 <Zap className="w-4 h-4" />
                                  {alert.type === 'noLoadBuilt' ? 'Build Load' : alert.type === 'unconfirmedDeliveries' ? 'Go to Order' : alert.type === 'ready_to_archive' ? 'View Completed' : alert.type === 'orphaned_delivery' ? 'Auto-Fix' : 'Ask Agent'}
                               </>
                             )}
                           </Button>
                           <Button 
                             onClick={() => markResolvedMutation.mutate(alert.id)}
                             disabled={markResolvedMutation.isPending}
                             className="bg-blue-600 hover:bg-blue-700"
                           >
                             Acknowledge
                           </Button>
                         </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Resolved Alerts */}
          {resolvedAlerts.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-green-700 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                {resolvedAlerts.length} Resolved
              </h2>
              <div className="grid gap-2 opacity-60">
                {resolvedAlerts.map(alert => (
                  <Card key={alert.id} className="border-green-200 bg-green-50">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <Badge className="bg-green-600 mb-2">{alert.type.replace(/([A-Z])/g, ' $1').trim()}</Badge>
                          <p className="text-sm text-gray-700">{alert.message}</p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {unresolvedAlerts.length === 0 && resolvedAlerts.length === 0 && (
            <Card>
              <CardContent className="pt-12 pb-12 text-center">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900">All Clear</h3>
                <p className="text-gray-600 mt-2">No monitoring issues detected</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Agent Suggestion Dialog */}
      <Dialog open={showAgentDialog} onOpenChange={(open) => { if (!open) { setShowAgentDialog(false); setAgentSuggestion(null); } }}>
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
              {agentSuggestion.affectedItems && agentSuggestion.affectedItems.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-2">Affected Items:</p>
                  <div className="bg-gray-50 rounded border border-gray-200 p-3 max-h-48 overflow-y-auto">
                    <ul className="space-y-2">
                      {agentSuggestion.affectedItems.map((item, idx) => (
                        <li key={idx} className="text-xs text-gray-700 border-b border-gray-200 pb-2 last:border-0">
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-gray-600 mt-0.5">
                            {item.quantity} {item.unit || item.selected_unit} {item.color && `• ${item.color}`}
                            {item.status && ` • Status: ${item.status}`}
                            {item.receiptNumber && ` • Receipt: ${item.receiptNumber}`}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1">Recommended Action:</p>
                <p className="text-sm text-gray-700 leading-relaxed">{agentSuggestion.recommendation}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAgentDialog(false); setAgentSuggestion(null); }}>Close</Button>
            {agentSuggestion?.autoFixFunction && (
              <Button onClick={handleConfirmFix} disabled={confirmingFix} className="bg-indigo-600 hover:bg-indigo-700">
                {confirmingFix ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Apply Fix
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fix Results Dialog */}
      <Dialog open={showFixDialog} onOpenChange={(open) => { if (!open) { setShowFixDialog(false); setFixResults(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Fix Applied Successfully</DialogTitle></DialogHeader>
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
                    {fixResults.details.map((detail, idx) => (
                      <div key={idx} className="border rounded p-3 bg-gray-50 border-gray-200">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
                          <div className="flex-1 min-w-0">
                            {detail.itemName && <p className="text-sm font-medium text-gray-900">{detail.itemName}</p>}
                            <p className="text-xs text-gray-700 mt-1">{detail.action}</p>
                            {detail.details && <p className="text-xs text-gray-600 mt-1">{detail.details}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setShowFixDialog(false); setFixResults(null); }} className="bg-indigo-600 hover:bg-indigo-700">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}