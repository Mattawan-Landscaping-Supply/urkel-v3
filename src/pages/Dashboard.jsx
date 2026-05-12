import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { safeLower, displayName, getLocalDateString } from '@/lib/utils';
import { Search, Plus, ChevronRight, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import AIAssistant from '@/components/AIAssistant';

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newOrder, setNewOrder] = useState({ company_name: '', customer_name: '', customer_phone: '', job_name: '', job_address: '' });
  const [companySuggestions, setCompanySuggestions] = useState([]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: rawOrders = [], isLoading } = useQuery({
    queryKey: ['orders', 'active'],
    staleTime: 2 * 60 * 1000,
    refetchOnMount: true,
    queryFn: async () => {
      const [allOrders, allItems, allReceipts] = await Promise.all([
        base44.entities.Order.list('-created_date', 500),
        base44.entities.OrderItem.list('-created_date', 500),
        base44.entities.Receipt.list('-created_date', 500),
      ]);
      return allOrders
        .filter(o => !o.is_archived && !o.is_completed)
        .sort((a, b) => safeLower(displayName(a)).localeCompare(safeLower(displayName(b))))
        .map(order => {
          const items = allItems.filter(i => i.order_id === order.id);
          const receipts = allReceipts.filter(r => r.order_id === order.id);
          const unpaidCount = receipts.filter(r => !r.is_paid).length;
          const inHoldCount = items.filter(i => i.status === 'in_hold').length;
          const onDeliveryCount = items.filter(i => i.status === 'on_delivery').length;
          return { ...order, _items: items, _receipts: receipts, _unpaidCount: unpaidCount, _inHoldCount: inHoldCount, _onDeliveryCount: onDeliveryCount };
        });
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => base44.entities.Customer.list('-created_date', 500),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createOrderMutation = useMutation({
    mutationFn: (data) => base44.entities.Order.create(data),
    onSuccess: (created) => {
      queryClient.removeQueries({ queryKey: ['orders', 'active'] });
      setIsCreateOpen(false);
      setNewOrder({ company_name: '', customer_name: '', customer_phone: '', job_name: '', job_address: '' });
      navigate(createPageUrl(`OrderDetails?id=${created.id}`));
    },
    onError: (e) => toast.error('Failed to create order: ' + e.message),
  });

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = rawOrders.filter(o => {
    if (!search.trim()) return true;
    const q = safeLower(search);
    return (
      safeLower(o.company_name).includes(q) ||
      safeLower(o.customer_name).includes(q) ||
      safeLower(o.job_address).includes(q) ||
      safeLower(o.job_name).includes(q) ||
      (o._receipts || []).some(r => safeLower(r.receipt_number).includes(q))
    );
  });

  // ── Company auto-suggest ───────────────────────────────────────────────────
  const handleCompanyInput = (val) => {
    setNewOrder(p => ({ ...p, company_name: val }));
    if (val.length > 1) {
      const matches = customers.filter(c => safeLower(c.company).includes(safeLower(val))).slice(0, 5);
      setCompanySuggestions(matches);
    } else {
      setCompanySuggestions([]);
    }
  };

  const selectCompany = (c) => {
    setNewOrder(p => ({ ...p, company_name: c.company, customer_name: c.name || p.customer_name, customer_phone: c.phone || p.customer_phone }));
    setCompanySuggestions([]);
  };

  const handleCreate = () => {
    if (!newOrder.customer_name.trim() && !newOrder.company_name.trim()) {
      toast.error('Please enter a customer or company name.');
      return;
    }
    createOrderMutation.mutate({ ...newOrder, is_archived: false, is_completed: false });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      {/* Search + New */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search orders…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> New Order
        </Button>
      </div>

      {/* Order list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-12">{search ? 'No orders match your search.' : 'No active orders.'}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => (
            <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(createPageUrl(`OrderDetails?id=${order.id}`))}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{displayName(order)}</span>
                    {order._unpaidCount > 0 && <Badge variant="destructive" className="text-xs">Unpaid</Badge>}
                    {order._onDeliveryCount > 0 && <Badge className="bg-blue-100 text-blue-800 text-xs">On Delivery</Badge>}
                  </div>
                  {order.job_address && <p className="text-sm text-gray-500 truncate mt-0.5">{order.job_address}</p>}
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {(order._receipts || []).map(r => (
                      <span key={r.id} className="text-xs text-gray-400">#{r.receipt_number}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-3 shrink-0">
                  {order._inHoldCount > 0 && (
                    <span className="text-sm text-amber-600 font-medium">{order._inHoldCount} in hold</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Order Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Label>Company Name</Label>
              <Input value={newOrder.company_name} onChange={e => handleCompanyInput(e.target.value)} placeholder="ABC Landscaping" />
              {companySuggestions.length > 0 && (
                <div className="absolute z-10 w-full bg-white border rounded shadow-lg mt-1">
                  {companySuggestions.map(c => (
                    <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm" onClick={() => selectCompany(c)}>
                      <span className="font-medium">{c.company}</span>{c.name && <span className="text-gray-500 ml-2">({c.name})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div><Label>Contact Name</Label><Input value={newOrder.customer_name} onChange={e => setNewOrder(p => ({ ...p, customer_name: e.target.value }))} placeholder="John Smith" /></div>
            <div><Label>Phone</Label><Input value={newOrder.customer_phone} onChange={e => setNewOrder(p => ({ ...p, customer_phone: e.target.value }))} placeholder="(269) 555-0000" /></div>
            <div><Label>Job Name</Label><Input value={newOrder.job_name} onChange={e => setNewOrder(p => ({ ...p, job_name: e.target.value }))} placeholder="Front walkway" /></div>
            <div><Label>Job Address</Label><Input value={newOrder.job_address} onChange={e => setNewOrder(p => ({ ...p, job_address: e.target.value }))} placeholder="123 Main St" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createOrderMutation.isPending}>
              {createOrderMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AIAssistant />
    </div>
  );
}
