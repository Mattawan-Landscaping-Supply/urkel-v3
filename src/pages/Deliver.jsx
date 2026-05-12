import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { safeLower, displayName, getLocalDateString, LOAD_STATUS } from '@/lib/utils';
import { Search, Truck, Plus, Loader2, Trash2, Archive, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

export default function Deliver() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isNewManualOpen, setIsNewManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ customer_name: '', delivery_date: getLocalDateString(), truck_setting_id: '' });

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['loads', 'all'],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const all = await base44.entities.Load.list('-delivery_date', 500);
      return all.filter(l => l.status !== LOAD_STATUS.ARCHIVED);
    },
  });

  const { data: truckSettings = [] } = useQuery({
    queryKey: ['truckSettings'],
    staleTime: 10 * 60 * 1000,
    queryFn: () => base44.entities.TruckSettings.list('name', 500),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const deleteLoadMutation = useMutation({
    mutationFn: async (loadId) => {
      // Capture ID before anything async
      const lid = loadId;
      // Fetch fresh items
      const items = await base44.entities.LoadItem.filter({ load_id: lid });
      // Restore OrderItems to in_hold
      await Promise.all(items.map(li =>
        base44.entities.OrderItem.update(li.order_item_id, { status: 'in_hold', delivery_method: null })
      ));
      // Delete LoadItems
      await Promise.all(items.map(li => base44.entities.LoadItem.delete(li.id)));
      // Delete Load
      await base44.entities.Load.delete(lid);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['loads'] });
      queryClient.removeQueries({ queryKey: ['items'] });
      toast.success('Load deleted. Items returned to In Hold.');
      setDeleteConfirm(null);
    },
    onError: (e) => toast.error('Delete failed: ' + e.message),
  });

  const archiveLoadMutation = useMutation({
    mutationFn: (id) => base44.entities.Load.update(id, { status: LOAD_STATUS.ARCHIVED }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['loads'] });
      toast.success('Load archived.');
    },
  });

  const createManualLoadMutation = useMutation({
    mutationFn: async (data) => {
      const allLoads = await base44.entities.Load.filter({ delivery_date: data.delivery_date });
      const active = allLoads.filter(l => l.status !== LOAD_STATUS.ARCHIVED);
      const maxOrder = active.reduce((m, l) => Math.max(m, l.delivery_order ?? -1), -1);
      return base44.entities.Load.create({
        ...data,
        status: LOAD_STATUS.ACTIVE,
        delivery_order: maxOrder + 1,
        name: `${data.customer_name} - ${data.delivery_date}`,
      });
    },
    onSuccess: (load) => {
      queryClient.removeQueries({ queryKey: ['loads'] });
      setIsNewManualOpen(false);
      navigate(createPageUrl(`LoadDetails?id=${load.id}`));
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  // ── Group by date ─────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const q = safeLower(search);
    const filtered = loads.filter(l =>
      !q ||
      safeLower(l.customer_name).includes(q) ||
      safeLower(l.company_name).includes(q) ||
      safeLower(l.delivery_date).includes(q)
    );
    const byDate = {};
    filtered.forEach(l => {
      const d = l.delivery_date || 'Unknown';
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(l);
    });
    // Sort dates descending
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, ls]) => ({ date, loads: ls.sort((a, b) => (a.delivery_order ?? 99) - (b.delivery_order ?? 99)) }));
  }, [loads, search]);

  const today = getLocalDateString();

  const statusBadge = (l) => {
    if (l.status === LOAD_STATUS.DELIVERED) return <Badge className="bg-green-100 text-green-800 text-xs">Delivered</Badge>;
    if (l.delivery_date < today) return <Badge variant="destructive" className="text-xs">Overdue</Badge>;
    if (l.delivery_date === today) return <Badge className="bg-blue-100 text-blue-800 text-xs">Today</Badge>;
    return <Badge variant="outline" className="text-xs">Upcoming</Badge>;
  };

  return (
    <div className="flex h-full">
      <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Truck className="w-5 h-5" /> Deliveries</h1>
          <Button size="sm" onClick={() => setIsNewManualOpen(true)}><Plus className="w-4 h-4 mr-1" /> Manual Delivery</Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search deliveries…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : grouped.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No deliveries found.</p>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ date, loads: dayLoads }) => (
              <div key={date}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {date === today ? '📦 Today' : (() => { try { return format(parseISO(date), 'EEEE, MMMM d, yyyy'); } catch { return date; } })()}
                </h2>
                <div className="space-y-2">
                  {dayLoads.map(load => (
                    <Card key={load.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(createPageUrl(`LoadDetails?id=${load.id}`))}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 truncate">{load.name}</span>
                            {statusBadge(load)}
                          </div>
                          {load.customer_address && <p className="text-xs text-gray-400 truncate mt-0.5">{load.customer_address}</p>}
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-amber-600" onClick={e => { e.stopPropagation(); archiveLoadMutation.mutate(load.id); }}>
                            <Archive className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-600" onClick={e => { e.stopPropagation(); setDeleteConfirm(load); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Load?</AlertDialogTitle>
            <AlertDialogDescription>
              All items on <strong>{deleteConfirm?.name}</strong> will be returned to In Hold. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteLoadMutation.mutate(deleteConfirm.id)} disabled={deleteLoadMutation.isPending}>
              {deleteLoadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Delivery Dialog */}
      <Dialog open={isNewManualOpen} onOpenChange={setIsNewManualOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Manual Delivery</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Customer Name</Label><Input value={manualForm.customer_name} onChange={e => setManualForm(p => ({ ...p, customer_name: e.target.value }))} /></div>
            <div><Label>Delivery Date</Label><Input type="date" value={manualForm.delivery_date} onChange={e => setManualForm(p => ({ ...p, delivery_date: e.target.value }))} /></div>
            <div>
              <Label>Truck</Label>
              <Select value={manualForm.truck_setting_id} onValueChange={v => setManualForm(p => ({ ...p, truck_setting_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select truck…" /></SelectTrigger>
                <SelectContent>{truckSettings.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewManualOpen(false)}>Cancel</Button>
            <Button onClick={() => createManualLoadMutation.mutate(manualForm)} disabled={!manualForm.customer_name || createManualLoadMutation.isPending}>
              {createManualLoadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
