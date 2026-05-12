import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Package, Plus, Trash2, AlertCircle, Loader2, Scale, Ruler, Edit, Users, FileText, Printer, Zap, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Calendar, List, Truck, GripVertical, MapPin, ArrowUpDown, MoreVertical } from 'lucide-react';
import { SortableStopItem, SortableLoadItem } from '@/components/loaddetails/LoadScheduleSidebar';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import LoadDialogs from '@/components/loaddetails/LoadDialogs';
import LoadProducts from '@/components/loaddetails/LoadProducts';
import DriverNotesEditor from '@/components/loaddetails/DriverNotesEditor';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { notificationEvents } from '@/components/NotificationCenter';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ProductCatalogDialog from '@/components/catalog/ProductCatalogDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


export default function LoadDetails() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Use a ref as a stable fallback — once we see a valid ID we keep it even if
  // the param momentarily disappears during a re-render (e.g. React Router flush).
  const loadIdRef = useRef(null);
  const rawLoadId = searchParams.get('id');
  if (rawLoadId) loadIdRef.current = rawLoadId;
  const loadId = loadIdRef.current;

  // Retry-before-error state: if loadId is missing on mount, wait up to 3 s
  const [paramRetryCount, setParamRetryCount] = useState(0);
  const PARAM_RETRY_MAX = 6; // 6 × 500 ms = 3 s
  useEffect(() => {
    if (loadId) return; // already have it
    if (paramRetryCount >= PARAM_RETRY_MAX) return;
    const t = setTimeout(() => setParamRetryCount(c => c + 1), 500);
    return () => clearTimeout(t);
  }, [loadId, paramRetryCount]);

  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [pendingAddressChange, setPendingAddressChange] = useState(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [pendingItemAdd, setPendingItemAdd] = useState(null);
  const [pendingDispatch, setPendingDispatch] = useState(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [moveDateDialog, setMoveDateDialog] = useState(null);
  const [isPalletOverrideOpen, setIsPalletOverrideOpen] = useState(false);
  const [manualPalletCount, setManualPalletCount] = useState('');
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [addQuantities, setAddQuantities] = useState({});
  const [availableQuantities, setAvailableQuantities] = useState({});
  const [capacityWarning, setCapacityWarning] = useState(null);
  const [isReorderStopsOpen, setIsReorderStopsOpen] = useState(false);
  const [stopOrders, setStopOrders] = useState([]);
  const [isDraggingActive, setIsDraggingActive] = useState(false);
  const [editingStopOrderId, setEditingStopOrderId] = useState(null);
  const [editingStopData, setEditingStopData] = useState({});
  const [showLinkOrderDialog, setShowLinkOrderDialog] = useState(false);
  const [sameCustomerConfirm, setSameCustomerConfirm] = useState(false);
  const [showNoHoldItemsDialog, setShowNoHoldItemsDialog] = useState(false);
  const [selectedExistingOrderId, setSelectedExistingOrderId] = useState('');
  const [dropNotesValue, setDropNotesValue] = useState('');
  const dropNotesTimerRef = useRef(null);
  const [driverNotes, setDriverNotes] = useState([]);
  const driverNotesTimerRef = useRef(null);
  const [editFormData, setEditFormData] = useState({
    customer_name: '',
    customer_address: '',
    customer_phone: '',
    delivery_date: '',
    drop_location_notes: '',
    truck_setting_id: '',
    is_paid: false
  });

  const { data: load, isLoading: loadLoading, isError: loadError } = useQuery({
    queryKey: ['load', loadId],
    queryFn: async () => {
      try {
        return await base44.entities.Load.get(loadId);
      } catch (e) {
        if (e?.message?.includes('not found')) return null;
        throw e;
      }
    },
    enabled: !!loadId,
    retry: 1,
    retryDelay: 2000,
    staleTime: 60000
  });

  const { data: allOrders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const orders = await base44.entities.Order.list('-created_date', 500);
      return orders.filter(o => !o.is_archived);
    },
    staleTime: 30000,
    retry: false
  });

  const { data: allCustomers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list(),
    staleTime: 60000,
    retry: false
  });

  const { data: allLoadCustomerStops = [] } = useQuery({
    queryKey: ['allLoadCustomerStops'],
    queryFn: () => base44.entities.LoadCustomerStop.list(),
    staleTime: 60000,
    retry: false
  });

  const { data: allOrderItems = [] } = useQuery({
    queryKey: ['allOrderItems', load?.order_id, loadId, allLoadCustomerStops.filter(s => s.load_id === loadId).map(s => s.order_id).sort().join(',')],
    queryFn: async () => {
      const stopOrderIds = allLoadCustomerStops
        .filter(s => s.load_id === loadId)
        .map(s => s.order_id)
        .filter(Boolean);
      const baseIds = load?.order_id ? [load.order_id] : [];
      const orderIds = [...new Set([...baseIds, ...stopOrderIds])];
      if (orderIds.length === 0) return [];
      const results = await Promise.all(
        orderIds.map(orderId =>
          base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500)
        )
      );
      return results.flat();
    },
    enabled: !!load?.order_id || allLoadCustomerStops.some(s => s.load_id === loadId),
    staleTime: 30000
  });

  const { data: loadItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['loadItems', loadId],
    queryFn: () => base44.entities.LoadItem.filter({ load_id: loadId }, 'created_date', 500),
    enabled: !!loadId,
    staleTime: 0,
    refetchOnMount: true
  });

  // Use allOrderItems and filter locally to ensure we always have the data
  const orderItems = React.useMemo(() => {
    if (!load?.order_id) return [];
    return allOrderItems.filter(item => item.order_id === load.order_id);
  }, [load?.order_id, allOrderItems]);

  // Sync drop notes from loaded data (only on initial load / load change)
  useEffect(() => {
    if (load) {
      setDropNotesValue(load.drop_location_notes || '');
      setDriverNotes(load.driver_notes || []);
    }
  }, [load?.id]);

  const handleDropNotesChange = (e) => {
    const value = e.target.value;
    setDropNotesValue(value);
    if (dropNotesTimerRef.current) clearTimeout(dropNotesTimerRef.current);
    dropNotesTimerRef.current = setTimeout(() => {
      updateLoadMutation.mutate({ loadId, data: { drop_location_notes: value } });
    }, 1500);
  };

  const handleDriverNotesChange = (updatedNotes) => {
    setDriverNotes(updatedNotes);
    if (driverNotesTimerRef.current) clearTimeout(driverNotesTimerRef.current);
    driverNotesTimerRef.current = setTimeout(() => {
      updateLoadMutation.mutate({ loadId, data: { driver_notes: updatedNotes } });
    }, 500);
  };

  // On arrival at this load page, invalidate the allOrderItems query so in-hold items are fresh.
  const hasInvalidatedOnArrival = React.useRef(false);
  React.useEffect(() => {
    if (!loadId || hasInvalidatedOnArrival.current) return;
    hasInvalidatedOnArrival.current = true;
    queryClient.invalidateQueries({ queryKey: ['allOrderItems'], exact: false });
  }, [loadId]);

  // Check if there are no in_hold items for the linked order and show dialog
  const hasCheckedHoldItems = React.useRef(false);
  React.useEffect(() => {
    if (hasCheckedHoldItems.current) return;
    if (load?.order_id && !itemsLoading && allOrderItems.length > 0 && loadItems.length === 0) {
      hasCheckedHoldItems.current = true;
      const orderItemsForLoad = allOrderItems.filter(i => i.order_id === load.order_id && !i.is_quote);
      const hasHoldItems = orderItemsForLoad.some(i => i.status === 'in_hold' && (i.quantity || 0) > 0);
      if (!hasHoldItems && orderItemsForLoad.length > 0) {
        setShowNoHoldItemsDialog(true);
      }
    }
  }, [load?.order_id, itemsLoading, allOrderItems, loadItems.length]);

  // Check if ?edit=true parameter is in URL to auto-open edit dialog
  // IMPORTANT: use a ref so this only fires ONCE per page load — re-renders from
  // scrolling or data updates must NOT re-trigger this, and navigate() must never
  // be called with a potentially-undefined loadId.
  const hasHandledEditParam = React.useRef(false);
  React.useEffect(() => {
    if (hasHandledEditParam.current) return;       // run at most once
    if (!loadId) return;                           // never navigate without a valid id
    if (searchParams.get('edit') !== 'true') return;
    if (!load || itemsLoading) return;             // wait for data before opening dialog

    hasHandledEditParam.current = true;
    setEditFormData({
      customer_name: load.customer_name || '',
      customer_address: load.customer_address || '',
      customer_phone: load.customer_phone || '',
      delivery_date: load.delivery_date || '',
      drop_location_notes: load.drop_location_notes || '',
      truck_setting_id: load.truck_setting_id || '',
      is_paid: load.is_paid || false
    });
    setIsEditDialogOpen(true);
    // Strip ?edit=true from URL without adding to history
    navigate(createPageUrl(`LoadDetails?id=${loadId}`), { replace: true });
  }, [load, loadId, itemsLoading]);

  const { data: allLoads = [], refetch: refetchLoads } = useQuery({
    queryKey: ['loads', 'active'],
    queryFn: async () => {
      const loads = await base44.entities.Load.list('delivery_order', 500);
      // Include 'scheduled' loads — they should appear in the Delivery Schedule sidebar
      return loads.filter(l => l.status === 'active' || l.status === 'delivered' || l.status === 'scheduled');
    },
    staleTime: 0,
    refetchOnMount: 'always',  // 'always' refetches even if cache exists (not just on first mount)
    retry: false
  });

  const { data: allLoadItems = [] } = useQuery({
    queryKey: ['allLoadItems'],
    queryFn: () => base44.entities.LoadItem.list('-created_date', 500),
    staleTime: 0,
    refetchOnMount: true,
    retry: false
  });

  const { data: loadCustomerStops = [] } = useQuery({
    queryKey: ['loadCustomerStops', loadId],
    queryFn: async () => {
      if (!loadId) return [];
      const stops = await base44.entities.LoadCustomerStop.filter({ load_id: loadId }, 'stop_order', 500);
      return stops.sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
    },
    enabled: !!loadId,
    staleTime: 30000,
    retry: false
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list()
  });

  const { data: truckSettings = [] } = useQuery({
    queryKey: ['truckSettings'],
    queryFn: () => base44.entities.TruckSettings.list()
  });

  // Group loads by delivery date - only show current load's date
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const currentLoadDate = load?.delivery_date || null;

  // Include the current load even if allLoads hasn't refreshed yet, but exclude archived loads
  const allLoadsWithCurrent = React.useMemo(() => {
    if (!load) return allLoads.filter(l => l.status !== 'archived');
    const activeLoads = allLoads.filter(l => l.status !== 'archived');
    if (load.status === 'archived') return activeLoads; // Don't re-add an archived load
    const already = activeLoads.some(l => l.id === load.id);
    return already ? activeLoads : [...activeLoads, load];
  }, [allLoads, load]);

  const loadsByDate = allLoadsWithCurrent.reduce((acc, l) => {
    const date = l.delivery_date || 'No Date';
    const isSameBatch = load?.schedule_batch_id && l.schedule_batch_id === load.schedule_batch_id;
    const isSameOrder = load?.order_id && l.order_id === load.order_id;
    const isCurrentDate = l.delivery_date === currentLoadDate || (!l.delivery_date && !currentLoadDate);
    if (isCurrentDate || isSameBatch || isSameOrder) {
      if (!acc[date]) acc[date] = [];
      if (!acc[date].find(x => x.id === l.id)) acc[date].push(l);
    }
    return acc;
  }, {});

  const deliveryDates = Object.keys(loadsByDate).sort();

  const currentTruckSetting = truckSettings.find(ts => ts.id === load?.truck_setting_id) || truckSettings.find(ts => ts.is_active) || truckSettings[0];
  
  // Get loads for current date only for stop counting - filter to only loads with items
  const loadsForCurrentDate = currentLoadDate ? (loadsByDate[currentLoadDate] || []).filter(l => {
    if (l.id === loadId) return true;
    if (load?.order_id && l.order_id === load.order_id) return true;
    if (load?.schedule_batch_id && l.schedule_batch_id === load.schedule_batch_id) return true;
    const loadItemsForThisLoad = allLoadItems.filter(item => item.load_id === l.id);
    return loadItemsForThisLoad.length > 0;
  }) : [];
  const stopIndex = loadsForCurrentDate.findIndex(l => l.id === loadId);
  const stopNumber = stopIndex >= 0 ? stopIndex + 1 : 1;
  const totalStops = loadsForCurrentDate.length > 0 ? loadsForCurrentDate.length : 1;

  // Calculate consolidated load info
  const consolidatedLoadInfo = useMemo(() => {
    if (!loadId) return null;
    
    const loadItemsForThisLoad = allLoadItems.filter(item => item.load_id === loadId);
    const uniqueOrders = {};
    loadItemsForThisLoad.forEach(item => {
      const orderItem = item.order_item_id ? allOrderItems.find(oi => oi.id === item.order_item_id) : null;
      if (orderItem?.order_id) {
        const order = allOrders.find(o => o.id === orderItem.order_id);
        if (order && !uniqueOrders[order.id]) {
          const stopRecord = allLoadCustomerStops.find(s => s.order_id === order.id && s.load_id === loadId);
          uniqueOrders[order.id] = {
            customer_name: order.customer_name,
            receipt_numbers: new Set(),
            stop_order: stopRecord?.stop_order ?? 999
          };
        }
        if (order && orderItem.receipt_number) {
          uniqueOrders[order.id].receipt_numbers.add(orderItem.receipt_number);
        }
      }
    });
    
    const ordersArray = Object.entries(uniqueOrders).map(([orderId, data]) => ({
      orderId,
      ...data,
      receipt_numbers: Array.from(data.receipt_numbers)
    }));
    
    ordersArray.sort((a, b) => (a.stop_order ?? 999) - (b.stop_order ?? 999));
    
    return ordersArray.length > 1 ? ordersArray : null;
  }, [loadId, allLoadItems, allOrderItems, allOrders, allLoadCustomerStops]);

  const updateLoadMutation = useMutation({
    mutationFn: ({ loadId, data }) => base44.entities.Load.update(loadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['load', loadId]);
      queryClient.removeQueries({ queryKey: ['loads'] });
    }
  });

  const handleScheduleDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;

    const dateKey = currentLoadDate || 'No Date';
    const sortedLoads = [...(loadsByDate[dateKey] || [])].filter(l => {
      const isSameOrderOrBatch = (load?.order_id && l.order_id === load.order_id) || (load?.schedule_batch_id && l.schedule_batch_id === load.schedule_batch_id);
      const loadItemsForThisLoad = allLoadItems.filter(item => item.load_id === l.id);
      return loadItemsForThisLoad.length > 0 || isSameOrderOrBatch || l.id === loadId;
    }).sort((a, b) => (a.delivery_order ?? 999) - (b.delivery_order ?? 999));

    const reordered = [...sortedLoads];
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);

    queryClient.setQueryData(['loads', 'active'], (old) => {
      if (!old) return old;
      const newDeliveryOrders = {};
      reordered.forEach((l, idx) => { newDeliveryOrders[l.id] = idx; });
      return old.map(l => newDeliveryOrders[l.id] !== undefined ? { ...l, delivery_order: newDeliveryOrders[l.id] } : l);
    });

    await Promise.all(
      reordered.map((l, idx) => base44.entities.Load.update(l.id, { delivery_order: idx }))
    );
    queryClient.invalidateQueries(['loads', 'active']);
    queryClient.removeQueries({ queryKey: ['loads'] });
  };

  // Always nuke items cache before going back to OrderDetails so it re-fetches fresh from DB
  const navigateToOrder = (oId) => {
    if (oId) queryClient.removeQueries({ queryKey: ['items', oId] });
    navigate(createPageUrl(`OrderDetails?id=${oId}`));
  };

  const deleteLoadMutation = useMutation({
    mutationFn: async ({ loadId, capturedOrderId }) => {
      // Resolve orderId: use captured arg first, then closure, then DB fetch as last resort
      let orderId = capturedOrderId || load?.order_id;
      if (!orderId) {
        // Load might have been cleared from cache — fetch directly from DB
        try {
          const freshLoad = await base44.entities.Load.get(loadId);
          orderId = freshLoad?.order_id;
        } catch (e) {
          console.warn('Could not fetch load for orderId:', e);
        }
      }

      // Always re-fetch LoadItems fresh from DB — never trust stale closure cache
      const freshLoadItems = await base44.entities.LoadItem.filter({ load_id: loadId });

      // Step 1: Reset OrderItems to in_hold — BUT only if not referenced by another active load
      // e.g. if Load #1 and Load #2 share the same order_item_id, deleting #2 must NOT reset it
      const orderItemIdsOnThisLoad = freshLoadItems
        .map(i => i.order_item_id)
        .filter(Boolean);

      // Get all loads for this order (excluding the one being deleted)
      const orderLoadsForCheck = orderId
        ? await base44.entities.Load.filter({ order_id: orderId }).catch(() => [])
        : [];
      const otherActiveLoadIds = orderLoadsForCheck
        .filter(l => l.id !== loadId && l.status !== 'archived')
        .map(l => l.id);

      // Fetch LoadItems for all sibling loads to find shared order_item_ids
      const siblingLoadItemsArrays = await Promise.all(
        otherActiveLoadIds.map(lid =>
          base44.entities.LoadItem.filter({ load_id: lid }).catch(() => [])
        )
      );
      const orderItemIdsOnOtherLoads = new Set(
        siblingLoadItemsArrays.flat().map(i => i.order_item_id).filter(Boolean)
      );

      // Only reset items NOT referenced by another active load
      const orderItemIdsToReset = orderItemIdsOnThisLoad
        .filter(oid => !orderItemIdsOnOtherLoads.has(oid));

      await Promise.all(
        freshLoadItems
          .filter(item => item.order_item_id && orderItemIdsToReset.includes(item.order_item_id))
          .map(item =>
            base44.entities.OrderItem.update(item.order_item_id, {
              status: 'in_hold',
              hold_location: item.original_hold_location || null,
              date_completed: null,
              delivery_method: null
            }).catch(e => console.warn('Failed to reset order item:', e))
          )
      );

      // Step 2: Delete all LoadItems (using fresh list from DB)
      await Promise.all(
        freshLoadItems.map(item =>
          base44.entities.LoadItem.delete(item.id).catch(e => console.warn('Failed to delete load item:', e))
        )
      );

      // Step 3: Delete the Load record itself
      await base44.entities.Load.delete(loadId);

      // Step 4: Check if there are other active loads for this order
      const remainingLoads = await base44.entities.Load.filter({ order_id: orderId });
      const activeRemaining = remainingLoads.filter(l => l.status !== 'archived' && l.id !== loadId);

      return { orderId, siblingLoadId: activeRemaining.length > 0 ? activeRemaining[0].id : null };
    },
    onSuccess: (data, variables) => {
      const targetOrderId = variables?.capturedOrderId || data?.orderId;

      // Invalidate caches immediately — must include ['loads', orderId] for OrderDetails
      const invalidOrderId = variables?.capturedOrderId || data?.orderId;
      // HARD REMOVE every cache that touches loads or items — no invalidateQueries (contradicts remove)
      // This ensures Deliver.jsx, OrderDetails, and LoadDetails all re-fetch fresh from DB
      queryClient.removeQueries({ queryKey: ['loads'] });
      queryClient.removeQueries({ queryKey: ['allLoadItems'] });
      queryClient.removeQueries({ queryKey: ['allOrderItems'] });
      queryClient.removeQueries({ queryKey: ['allLoadItemsRaw'] }); // all orderId variants
      queryClient.removeQueries({ queryKey: ['items'] });           // all orderId variants

      if (data?.siblingLoadId) {
        // Other loads exist for this order — stay in LoadDetails, go to sibling
        // Also clear items cache and sibling's loadItems cache so everything refetches fresh
        queryClient.removeQueries({ queryKey: ['items', invalidOrderId] });
        queryClient.removeQueries({ queryKey: ['loadItems', data.siblingLoadId] });
        navigate(createPageUrl(`LoadDetails?id=${data.siblingLoadId}`));
        // Force sidebar allLoads to re-fetch AFTER navigation so deleted load disappears
        setTimeout(() => refetchLoads(), 150);
      } else {
        // Last load deleted — go back to OrderDetails with fresh cache
        if (targetOrderId) {
          queryClient.removeQueries({ queryKey: ['items', targetOrderId] });
          navigateToOrder(targetOrderId);
        } else {
          navigate(createPageUrl('Deliver'));
        }
      }
    },
    onError: (error) => {
      console.error('Failed to delete load:', error);
    }
  });

  const clearAllLoadMutation = useMutation({
    mutationFn: async () => {
      const clearedItemIds = [];
      const restoredOrderItems = [];
      for (const item of loadItems) {
        if (item.order_item_id) {
          await base44.entities.OrderItem.update(item.order_item_id, {
            status: item.original_status || 'in_hold',
            hold_location: item.original_hold_location || null,
            date_completed: null,
            // Do NOT force delivery_method to 'pickup' — preserve the item's original delivery method.
            // fulfillOrderItem sets 'delivery' when added to a load; removing from a load should
            // restore to null so the item can be re-added to any load type.
            delivery_method: null
          });
          restoredOrderItems.push({ id: item.order_item_id, original_status: item.original_status || 'in_hold' });
        }
        await base44.entities.LoadItem.delete(item.id);
        clearedItemIds.push(item.id);
      }
      return { clearedItemIds, restoredOrderItems };
    },
    onSuccess: ({ clearedItemIds, restoredOrderItems }) => {
      queryClient.setQueryData(['loadItems', loadId], []);
      const allOrderItemsKey = ['allOrderItems', load?.order_id, loadId, allLoadCustomerStops.filter(s => s.load_id === loadId).map(s => s.order_id).sort().join(',')];
      queryClient.setQueryData(allOrderItemsKey, (old) => {
        if (!old) return old;
        return old.map(i => {
          const restored = restoredOrderItems.find(r => r.id === i.id);
          return restored ? { ...i, status: restored.original_status } : i;
        });
      });
      if (load?.order_id) {
        queryClient.setQueryData(['items', load.order_id], (old) => {
          if (!old) return old;
          return old.map(i => {
            const restored = restoredOrderItems.find(r => r.id === i.id);
            return restored ? { ...i, status: restored.original_status } : i;
          });
        });
      }
    }
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ orderId, data }) => base44.entities.Order.update(orderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['orders']);
    }
  });

  const addToLoadMutation = useMutation({
    mutationFn: async ({ orderItem }) => {
      if (orderItem.is_quote) {
        throw new Error('Cannot add quote items to delivery loads. Please convert the quote to a receipt first.');
      }

      const qty = Number(orderItem.quantity);

      const payload = { loadId, orderItemId: orderItem.id, quantity: qty };
      console.log('fulfillOrderItem payload:', JSON.stringify(payload));
      const response = await base44.functions.invoke('fulfillOrderItem', payload);

      if (response?.data?.emailSent) {
        alert(`✅ Email notification sent for first delivery!`);
      }

      return response?.data || null;
    },
    onError: (err) => {
      console.error('addToLoad error full details:', err, err?.response?.data, err?.response?.status);
      alert(`Failed to add item to load: ${err?.message || 'Unknown error'}`);
      queryClient.invalidateQueries({ queryKey: ['loadItems', loadId] });
      queryClient.invalidateQueries({ queryKey: ['allOrderItems'], exact: false });
    },
    onSuccess: async (data) => {
      const { loadItem: newLoadItem, orderItem: updatedOrderItem, orderId } = data || {};

      // Update loadItems cache directly
      if (newLoadItem) {
        queryClient.setQueryData(['loadItems', loadId], (old) =>
          old ? [...old.filter(i => i.id !== newLoadItem.id), newLoadItem] : [newLoadItem]
        );
      }

      // Update allOrderItems cache — for partial delivery, updatedOrderItem is a newly-created split item
      // not yet in cache. Append it if missing so it resolves to the correct stop (not "Standalone").
      if (updatedOrderItem) {
        const allOrderItemsKey = ['allOrderItems', load?.order_id, loadId, allLoadCustomerStops.filter(s => s.load_id === loadId).map(s => s.order_id).sort().join(',')];
        queryClient.setQueryData(allOrderItemsKey, (old) => {
          if (!old) return old;
          const exists = old.some(i => i.id === updatedOrderItem.id);
          return exists
            ? old.map(i => i.id === updatedOrderItem.id ? updatedOrderItem : i)
            : [...old, updatedOrderItem];
        });
        if (orderId) {
          queryClient.setQueryData(['items', orderId], (old) =>
            old ? old.map(i => i.id === updatedOrderItem.id ? updatedOrderItem : i) : old
          );
        }
      }

      // Ensure a LoadCustomerStop exists for this item's order (Fix 1)
      const itemOrderId = updatedOrderItem?.order_id || orderId;
      if (itemOrderId) {
        const existingStop = allLoadCustomerStops.find(s => s.load_id === loadId && s.order_id === itemOrderId);
        if (!existingStop) {
          const order = allOrders.find(o => o.id === itemOrderId);
          if (order) {
            const currentStops = allLoadCustomerStops.filter(s => s.load_id === loadId);
            const nextStopOrder = currentStops.length;
            await base44.entities.LoadCustomerStop.create({
              load_id: loadId,
              order_id: itemOrderId,
              customer_name: order.customer_name,
              stop_order: nextStopOrder
            });
            queryClient.invalidateQueries(['loadCustomerStops', loadId]);
            queryClient.invalidateQueries(['allLoadCustomerStops']);
          }
        }
      }

      // Reset print flags since load contents changed
      await base44.entities.Load.update(loadId, { schedule_printed: false, receipts_printed: false });
    }
  });

  const removeFromLoadMutation = useMutation({
    mutationFn: async ({ loadItem, _scrollY }) => {
      const response = await base44.functions.invoke('unfulfillOrderItem', {
        loadItemId: loadItem.id
      });
      return {
        loadDeleted: response?.data?.loadWasDeleted || false,
        deletedLoadId: response?.data?.loadId,
        orderItemId: response?.data?.orderItemId,
        removedLoadItemId: loadItem.id,
        restoredOrderItemId: loadItem.order_item_id,
        _scrollY,
      };
    },
    onSuccess: async ({ removedLoadItemId, restoredOrderItemId, _scrollY }) => {
      // Optimistically remove item from cache without triggering a full re-fetch
      queryClient.setQueryData(['loadItems', loadId], (old) =>
        old ? old.filter(i => i.id !== removedLoadItemId) : old
      );
      if (restoredOrderItemId) {
        const allOrderItemsKey = ['allOrderItems', load?.order_id, loadId, allLoadCustomerStops.filter(s => s.load_id === loadId).map(s => s.order_id).sort().join(',')];
        queryClient.setQueryData(allOrderItemsKey, (old) =>
          old ? old.map(i => i.id === restoredOrderItemId ? { ...i, status: 'in_hold' } : i) : old
        );
        if (load?.order_id) {
          queryClient.setQueryData(['items', load.order_id], (old) =>
            old ? old.map(i => i.id === restoredOrderItemId ? { ...i, status: 'in_hold' } : i) : old
          );
        }
      }
      await base44.entities.Load.update(loadId, { schedule_printed: false, receipts_printed: false });
      queryClient.invalidateQueries(['loads', 'today-banner']);
      // Update load cache in place (setQueryData) to avoid scroll-resetting re-mount
      queryClient.setQueryData(['load', loadId], (old) =>
        old ? { ...old, schedule_printed: false, receipts_printed: false } : old
      );
      // Restore scroll position after any React re-renders triggered above
      if (_scrollY !== undefined) {
        requestAnimationFrame(() => window.scrollTo(0, _scrollY));
      }
    }
  });

  const addProductToLoadMutation = useMutation({
      mutationFn: async (itemData) => {
        const allProducts = await base44.entities.Product.list();
        const product = allProducts.find(p => p.name === itemData.product_name);
        let countsAsSinglePallet = false;
        if (itemData.selected_unit !== 'Pallet') countsAsSinglePallet = product?.counts_as_single_pallet || false;
        let itemWeightLbs = null;
        if (product) {
          if (itemData.selected_unit === 'Pallet') itemWeightLbs = product.weight_pallet || null;
          else if (itemData.selected_unit === 'Each') itemWeightLbs = product.weight_each || null;
          else if (itemData.selected_unit === 'Layer') itemWeightLbs = product.weight_layer || null;
        } else if (itemData.weight) {
          itemWeightLbs = itemData.weight;
        }

        await base44.entities.LoadItem.create({
          load_id: loadId,
          name: itemData.product_name,
          quantity: itemData.quantity,
          selected_color: itemData.selected_color,
          selected_unit: itemData.selected_unit,
          category: itemData.category || 'Other',
          counts_as_pallet: product?.counts_as_pallet !== false,
          counts_as_single_pallet: countsAsSinglePallet,
          ...(itemWeightLbs !== null ? { weight: itemWeightLbs } : {})
        });

        if (itemData.receipt_number) {
          const currentLoad = await base44.entities.Load.get(loadId);
          const existingNumbers = Array.isArray(currentLoad.receipt_numbers) ? currentLoad.receipt_numbers : [];
          if (!existingNumbers.includes(itemData.receipt_number)) {
            existingNumbers.push(itemData.receipt_number);
            await base44.entities.Load.update(loadId, {
              receipt_numbers: existingNumbers
            });
          }
        }
      },
    onSuccess: () => {
      queryClient.invalidateQueries(['load', loadId]);
      queryClient.invalidateQueries(['loadItems', loadId]);
    }
  });

  const handleEditLoad = () => {
    let customerName = load.customer_name || '';
    let customerAddress = load.customer_address || '';
    let customerPhone = load.customer_phone || '';

    if (loadItems.length > 0) {
      const firstLoadItem = loadItems[0];
      if (firstLoadItem.order_item_id) {
        const orderItem = allOrderItems.find(oi => oi.id === firstLoadItem.order_item_id);
        if (orderItem?.order_id) {
          const order = allOrders.find(o => o.id === orderItem.order_id);
          if (order) {
            customerName = order.customer_name || '';
            customerAddress = order.job_address || '';
            customerPhone = order.customer_phone || '';
          }
        }
      }
    }

    setEditFormData({
      customer_name: customerName,
      customer_address: customerAddress,
      customer_phone: customerPhone,
      delivery_date: load.delivery_date || '',
      drop_location_notes: load.drop_location_notes || '',
      truck_setting_id: load.truck_setting_id || '',
      is_paid: load.is_paid || false
    });
    setIsEditDialogOpen(true);
    };

  const restoreOrphanedItems = async (affectedLoadIds) => {
    const affectedLoadItems = allLoadItems.filter(li => affectedLoadIds.includes(li.load_id));
    const orderItemIds = [...new Set(affectedLoadItems.map(li => li.order_item_id).filter(Boolean))];
    if (orderItemIds.length === 0) return;

    const freshAllLoadItems = await base44.entities.LoadItem.list('-created_date', 500);
    const freshAllLoads = await base44.entities.Load.list('delivery_order', 500);
    const activeLoadIds = new Set(freshAllLoads.filter(l => l.status === 'active').map(l => l.id));

    for (const orderItemId of orderItemIds) {
      const activeCoverage = freshAllLoadItems.find(
        li => li.order_item_id === orderItemId && activeLoadIds.has(li.load_id)
      );
      if (!activeCoverage) {
        const oi = allOrderItems.find(i => i.id === orderItemId);
        if (oi && oi.status === 'on_delivery') {
          const originalHoldLocation = affectedLoadItems.find(li => li.order_item_id === orderItemId)?.original_hold_location || null;
          await base44.entities.OrderItem.update(orderItemId, {
            status: 'in_hold',
            hold_location: originalHoldLocation || oi.hold_location || null,
          });
        }
      }
    }
    queryClient.invalidateQueries(['allOrderItems']);
  };

  const handleSaveEdit = async () => {
    const dateChanged = editFormData.delivery_date !== load.delivery_date;

    if (dateChanged) {
      const otherOrderLoads = load.order_id
        ? allLoads.filter(l => l.id !== loadId && l.order_id === load.order_id && l.status !== 'archived')
        : [];

      if (otherOrderLoads.length > 0) {  
        setIsEditDialogOpen(false);
        setMoveDateDialog({
          newDate: editFormData.delivery_date,
          otherLoads: otherOrderLoads,
          customerName: load.customer_name,
          originalDate: load.delivery_date,
          pendingEditFormData: { ...editFormData }
        });
        return;
      }
    }

    await _commitSaveEdit(editFormData, false);
  };

  const _commitSaveEdit = async (formData, moveAllLoads) => {
    const dateChanged = formData.delivery_date !== load.delivery_date;

    if (dateChanged && moveAllLoads && load.order_id) {
      const otherOrderLoads = allLoads.filter(l => l.id !== loadId && l.order_id === load.order_id && l.status !== 'archived');
      await Promise.all(
        otherOrderLoads.map(l =>
          base44.entities.Load.update(l.id, { delivery_date: formData.delivery_date, schedule_printed: false, receipts_printed: false })
        )
      );  
      if (dateChanged) {
        await restoreOrphanedItems(otherOrderLoads.map(l => l.id));
      }
    }

    if (dateChanged) {
      await restoreOrphanedItems([loadId]);
    }

    updateLoadMutation.mutate({
      loadId,
      data: { ...formData, schedule_printed: false, receipts_printed: false }
    });
    if (load?.order_id && formData.customer_address !== load.customer_address) {
      updateOrderMutation.mutate({
        orderId: load.order_id,
        data: { job_address: formData.customer_address }
      });
    }
    setIsEditDialogOpen(false);
  };

  const handleDeleteLoad = () => {
    // Fire-and-forget audit log — don't block the delete on it
    base44.functions.invoke('logDeletionEvent', {
      entityType: 'Load',
      entityId: loadId,
      entityName: load?.customer_name || 'Unnamed Load',
      isPermanent: true,
      customerName: load?.customer_name,
      receiptNumbers: load?.receipt_numbers || [],
      orderId: load?.order_id
    }).catch(e => console.warn('Failed to log deletion:', e));
    const capturedOrderId = load?.order_id;
    deleteLoadMutation.mutate({ loadId, capturedOrderId });
  };

  const handleSameCustomer = async () => {
    if (!load.customer_name) {
      alert('Cannot create delivery: No customer name found on this load.');
      return;
    }
    if (!load.delivery_date) {
      alert('Cannot create delivery: No delivery date set on this load. Please set a delivery date first.');
      return;
    }
    setSameCustomerConfirm(true);
  };

  const doCreateSameCustomer = async () => {
    setSameCustomerConfirm(false);
    let orderId = load.order_id;
    if (!orderId && loadItems.length > 0) {
      for (const li of loadItems) {
        if (li.order_item_id) {
          const oi = allOrderItems.find(x => x.id === li.order_item_id);
          if (oi?.order_id) { orderId = oi.order_id; break; }
        }
      }
    }
    const allExistingLoads = await base44.entities.Load.list('delivery_order', 500);
    const loadsForDate = allExistingLoads.filter(l => l.delivery_date === load.delivery_date && l.status !== 'archived');
    const newDeliveryOrder = loadsForDate.length;  
    const newLoad = await base44.entities.Load.create({
      name: `${load.customer_name} - Delivery ${totalStops + 1}`,
      order_id: orderId || load.order_id || null,
      customer_name: load.customer_name,
      customer_address: load.customer_address,
      customer_phone: load.customer_phone,
      delivery_date: load.delivery_date,
      truck_setting_id: load.truck_setting_id,
      schedule_batch_id: load.schedule_batch_id,
      delivery_order: newDeliveryOrder,
      status: 'active'
    });
    queryClient.removeQueries({ queryKey: ['loads'] });
    navigate(createPageUrl(`LoadDetails?id=${newLoad.id}`));
  };

  const handlePalletOverride = () => {
    setManualPalletCount(load.manual_pallet_count?.toString() || '');
    setIsPalletOverrideOpen(true);
  };

  const handleSavePalletOverride = () => {
    updateLoadMutation.mutate({
      loadId,
      data: { manual_pallet_count: parseInt(manualPalletCount) || null }
    });
    setIsPalletOverrideOpen(false);
  };

  const handleClearAllLoad = () => {
    if (confirm('Are you sure you want to remove all products from this load?')) {
      clearAllLoadMutation.mutate();
    }
  };

  const handlePrintSchedule = () => {
    if (load?.delivery_date) {
      navigate(createPageUrl(`PrintSchedule?delivery_date=${load.delivery_date}`));
    }
  };

  const handlePrintReceipt = () => {
    navigate(createPageUrl(`PrintReceipt?id=${loadId}`));
  };

  const handleAddProductFromCatalog = async (itemData) => {
    await addProductToLoadMutation.mutateAsync(itemData);
  };

  const handleUpdateOrderAddress = () => {
    if (load?.order_id && pendingAddressChange) {
      updateOrderMutation.mutate({
        orderId: load.order_id,
        data: { job_address: pendingAddressChange.newAddress }
      });
    }
    setIsAddressDialogOpen(false);
    setPendingAddressChange(null);
  };

  const handleAddToLoad = (orderItem, customQuantity = null) => {
    const itemToAdd = customQuantity !== null 
      ? { ...orderItem, quantity: customQuantity }
      : orderItem;

    const product = products.find(p => p.name === itemToAdd.product_name);
    let itemWeightLbs = 0;
    if (itemToAdd.selected_unit === 'Pallet') {
      itemWeightLbs = (product?.weight_pallet || 0) * itemToAdd.quantity;
    } else if (itemToAdd.selected_unit === 'Each') {
      itemWeightLbs = (product?.weight_each || 0) * itemToAdd.quantity;
    } else if (itemToAdd.selected_unit === 'Layer') {
      itemWeightLbs = (product?.weight_layer || 0) * itemToAdd.quantity;
    } else {
      itemWeightLbs = (product?.weight_each || 0) * itemToAdd.quantity;
    }

    let itemArea = 0;
    if (product?.counts_as_pallet !== false) {
      const palletWidth = product?.pallet_width || 3.5;
      const palletDepth = product?.pallet_depth || 4;
      const effectiveQty = (itemToAdd.keep_on_same_load || product?.counts_as_single_pallet) ? 1 : itemToAdd.quantity;
      itemArea = palletWidth * palletDepth * effectiveQty;
    }

    const newWeight = loadMetrics.totalWeight + itemWeightLbs;
    const newArea = loadMetrics.palletArea + itemArea;

    const exceedsWeight = newWeight > loadMetrics.maxWeight;
    const exceedsSpace = newArea > loadMetrics.truckArea;

    if (exceedsWeight || exceedsSpace) {
      setCapacityWarning({
        exceedsWeight,
        exceedsSpace,
        itemName: itemToAdd.product_name,
        itemUnit: itemToAdd.selected_unit,
        itemWeight: itemWeightLbs,
        itemArea,
        newWeight,
        newArea,
        orderItem: itemToAdd,
        _dispatchList: itemToAdd._dispatchList || null
      });
      return;
    }

    if (itemToAdd.status === 'in_hold') {
      addToLoadMutation.mutate({ orderItem: itemToAdd });
    } else {
      setPendingItemAdd(itemToAdd);
      setIsConfirmDialogOpen(true);
    }
  };

  const confirmAddToLoad = () => {
    if (pendingItemAdd) {
      addToLoadMutation.mutate({ orderItem: pendingItemAdd });
    }
    setIsConfirmDialogOpen(false);
    setPendingItemAdd(null);
  };

  const confirmCapacityAdd = () => {
    const warning = capacityWarning;
    setCapacityWarning(null);
    if (!warning) return;
    if (warning._dispatchList) {
      warning._dispatchList.forEach(({ item, qty }) => {
        if (item.status === 'in_hold') {
          addToLoadMutation.mutate({ orderItem: { ...item, quantity: qty } });
        } else {
          setPendingItemAdd({ ...item, quantity: qty });
          setIsConfirmDialogOpen(true);
        }
      });
    } else {
      const item = warning.orderItem;
      if (item.status === 'in_hold') {
        addToLoadMutation.mutate({ orderItem: item });
      } else {
        setPendingItemAdd(item);
        setIsConfirmDialogOpen(true);
      }
    }
  };

  const relevantOrderIds = useMemo(() => {
    const ids = new Set();
    if (load?.order_id) ids.add(load.order_id);
    loadItems.forEach(li => {
      const oi = li.order_item_id ? allOrderItems.find(x => x.id === li.order_item_id) : null;
      if (oi?.order_id) ids.add(oi.order_id);
    });
    if (consolidatedLoadInfo) {
      consolidatedLoadInfo.forEach(stop => { if (stop.orderId) ids.add(stop.orderId); });
    }
    return ids;
  }, [load?.order_id, loadItems, allOrderItems, consolidatedLoadInfo]);

  const availableItems = useMemo(() => {
    return allOrderItems.filter(item => {
      if (item.is_quote) return false;
      if (!relevantOrderIds.has(item.order_id)) return false;
      const isOnThisLoad = loadItems.some(li => li.order_item_id === item.id);
      // Allow in_hold items OR on_delivery items already on this load; also allow items not yet fully allocated (qty > 0 after loads)
      if (item.status !== 'in_hold' && item.status !== 'on_delivery') return false;
      if (item.status === 'on_delivery' && !isOnThisLoad) return false;
      const qtyOnThisLoad = loadItems
        .filter(li => li.order_item_id === item.id)
        .reduce((sum, li) => sum + (li.quantity || 0), 0);
      const qtyOnOtherActiveLoads = allLoadItems
         .filter(li => li.order_item_id === item.id && li.load_id !== loadId && allLoads.some(l => l.id === li.load_id && (l.status === 'active' || l.status === 'delivered')))
         .reduce((sum, li) => sum + (li.quantity || 0), 0);
       const remainingQty = (item.quantity || 0) - qtyOnThisLoad - qtyOnOtherActiveLoads;
       return remainingQty > 0;
    }).map(item => {
      const qtyOnThisLoad = loadItems
        .filter(li => li.order_item_id === item.id)
        .reduce((sum, li) => sum + (li.quantity || 0), 0);
      const qtyOnOtherActiveLoads = allLoadItems
        .filter(li => li.order_item_id === item.id && li.load_id !== loadId && allLoads.some(l => l.id === li.load_id && (l.status === 'active' || l.status === 'delivered')))
        .reduce((sum, li) => sum + (li.quantity || 0), 0);
      const remainingQty = (item.quantity || 0) - qtyOnThisLoad - qtyOnOtherActiveLoads;
      return { ...item, quantity: remainingQty };  
    });
  }, [allOrderItems, relevantOrderIds, loadItems, allLoadItems, allLoads, loadId]);

  const loadMetrics = useMemo(() => {
    let totalWeight = 0;
    let totalPallets = 0;
    let palletArea = 0;

    loadItems.forEach(loadItem => {
       const product = products.find(p => p.name === loadItem.name);
       const quantity = loadItem.quantity || 1;

       let weight = 0;
       if (product) {
         let weightPerUnit = 0;
         if (loadItem.selected_unit === 'Pallet') {
           weightPerUnit = product.weight_pallet || 0;
         } else if (loadItem.selected_unit === 'Each') {
           weightPerUnit = product.weight_each || 0;
         } else if (loadItem.selected_unit === 'Layer') {
           weightPerUnit = product.weight_layer || 0;
         }
         weight = (weightPerUnit || loadItem.weight || 0) * quantity;
       } else if (loadItem.weight) {
         weight = loadItem.weight * quantity;
       }
       totalWeight += weight;

      if (loadItem.counts_as_pallet === false || product?.counts_as_pallet === false) {
        // Don't count
      } else if (loadItem.selected_unit === 'Pallet') {
        totalPallets += quantity;
      } else {
        totalPallets += 1;
      }

      if (loadItem.counts_as_pallet !== false && product?.counts_as_pallet !== false) {
        const palletWidth = product?.pallet_width || 3.5;
        const palletDepth = product?.pallet_depth || 4;

        let effectiveQuantity;
        if (loadItem.selected_unit === 'Pallet') {
          effectiveQuantity = quantity;
        } else if (loadItem.counts_as_single_pallet === true || product?.counts_as_single_pallet === true) {
          effectiveQuantity = 1;
        } else {
          effectiveQuantity = quantity;
        }

        const itemArea = palletWidth * palletDepth * effectiveQuantity;
        palletArea += itemArea;
      }
    });

    const displayPallets = load?.manual_pallet_count !== null && load?.manual_pallet_count !== undefined 
      ? load.manual_pallet_count 
      : totalPallets;

    const weightInLbs = totalWeight;
    const maxWeight = currentTruckSetting?.max_weight_capacity || 48000;
    const weightPercentage = maxWeight > 0 ? (weightInLbs / maxWeight) * 100 : 0;

    const truckLength = currentTruckSetting?.length || 24;
    const truckWidth = currentTruckSetting?.width || 8;
    const truckArea = truckLength * truckWidth;
    const spacePercentage = truckArea > 0 ? (palletArea / truckArea) * 100 : 0;

    const warningThreshold = currentTruckSetting?.warning_threshold || 90;
    
    const weightRemaining = maxWeight - weightInLbs;
    const spaceRemaining = truckArea - palletArea;

    return {
      totalWeight: weightInLbs,
      maxWeight,
      weightPercentage,
      totalPallets: displayPallets,
      palletArea,
      truckArea,
      spacePercentage,
      warningThreshold,
      weightRemaining,
      spaceRemaining,
      weightStatus: weightPercentage >= 100 ? 'danger' : weightPercentage >= warningThreshold ? 'warning' : 'optimal',
      spaceStatus: spacePercentage >= 100 ? 'danger' : spacePercentage >= warningThreshold ? 'warning' : 'optimal'
    };
  }, [loadItems, products, currentTruckSetting, load?.manual_pallet_count]);

  if (loadLoading || productsLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!loadId) {
    // Still within the 3-second retry window — show a spinner instead of an error
    if (paramRetryCount < PARAM_RETRY_MAX) {
      return (
        <div className="flex justify-center items-center h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      );
    }
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No load ID provided in URL.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loadError || !load) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Load not found. It may have been deleted.</AlertDescription>
        </Alert>
        <Button onClick={() => navigate(createPageUrl('DeliveryCalendar'))} className="mt-4">
          Back to Calendar
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto pb-12">
      {/* Delete Progress Overlay */}
      {deleteLoadMutation.isPending && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center gap-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 w-80">
            <Loader2 className="w-10 h-10 animate-spin text-red-500" />
            <p className="text-lg font-semibold text-gray-800">Deleting Delivery...</p>
            <p className="text-sm text-gray-500 text-center">Restoring items to In Hold and cleaning up load records. Please wait.</p>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="bg-red-500 h-2 rounded-full animate-pulse w-full" />
            </div>
          </div>
        </div>
      )}
      {/* Top Header Bar */}
      <div className="bg-white border-b border-gray-200 p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Truck className="w-8 h-8" />
              LoadMaster
            </h1>
            <p className="text-gray-500 mt-1">Delivery Schedule Workstation</p>
            {(() => {
              const allDates = [...new Set(allLoadsWithCurrent.filter(l => l.delivery_date).map(l => l.delivery_date))].sort();
              const currentDateIdx = allDates.indexOf(load?.delivery_date || '');
              const prevDate = currentDateIdx > 0 ? allDates[currentDateIdx - 1] : null;
              const nextDate = currentDateIdx < allDates.length - 1 ? allDates[currentDateIdx + 1] : null;

              const navigateToDate = (date) => {
                const loadsOnDate = allLoadsWithCurrent.filter(l => l.delivery_date === date);
                if (loadsOnDate.length > 0) {
                  loadsOnDate.sort((a, b) => (a.delivery_order || 0) - (b.delivery_order || 0));
                  navigate(createPageUrl(`LoadDetails?id=${loadsOnDate[0].id}`));
                }
              };

              return (
                <div className="flex items-center gap-1 mt-3">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" disabled={!prevDate} onClick={() => prevDate && navigateToDate(prevDate)} title={prevDate ? `Go to ${new Date(prevDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-gray-700">
                    {load?.delivery_date 
                      ? new Date(load.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                      : new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                    }
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" disabled={!nextDate} onClick={() => nextDate && navigateToDate(nextDate)} title={nextDate ? `Go to ${new Date(nextDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              );
            })()}
          </div>
          <div className="flex items-start gap-2">
            {/* Desktop buttons */}
            <div className="hidden md:flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <Button onClick={handlePrintSchedule} variant="outline" className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100">
                  <FileText className="w-4 h-4 mr-2" />Print Schedule
                </Button>
                <Button onClick={handlePrintReceipt} variant="outline" className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100">
                   <Printer className="w-4 h-4 mr-2" />Print Receipt
                 </Button>
                {(() => {
                  const linkedOrder = load.order_id ? allOrders.find(o => o.id === load.order_id) : null;
                  const alreadyNotified = load.delivery_notification_sent || linkedOrder?.first_item_moved_notification_sent;
                  const hasDeliveredItem = loadItems.some(li => { const oi = li.order_item_id ? allOrderItems.find(x => x.id === li.order_item_id) : null; return oi?.status === 'delivered'; });
                  return !load.is_paid && !alreadyNotified && loadItems.length > 0 && hasDeliveredItem;
                })() && (
                  <Button onClick={async () => { if (confirm('Send delivery notification email?')) { try { const response = await base44.functions.invoke('sendDeliveryNotification', { loadId }); if (response?.data?.sent) { alert(`✅ Notification sent to ${response.data.recipients?.join(', ')}`); } else { alert(response?.data?.message || 'Notification not sent.'); } await base44.entities.Load.update(loadId, { delivery_notification_sent: true }); await queryClient.invalidateQueries(['load', loadId]); await queryClient.invalidateQueries(['loads', 'active']); notificationEvents.emit(); } catch (error) { alert('Failed to send notification. Please try again.'); } } }} className="bg-orange-500 hover:bg-orange-600 text-white">
                    <FileText className="w-4 h-4 mr-2" />Send Delivery Notification
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => navigate(createPageUrl(`OptimizeDelivery?orderid=${load.order_id}&reoptimize=true${load.schedule_batch_id ? `&batchid=${load.schedule_batch_id}` : ''}&deliverydate=${load.delivery_date}&loadid=${loadId}`))} className="bg-purple-600 hover:bg-purple-700">
                  <Zap className="w-4 h-4 mr-2" />Reoptimize
                </Button>
                <Button onClick={handleSameCustomer} className="bg-purple-600 hover:bg-purple-700">
                  <Users className="w-4 h-4 mr-2" />Same Customer
                </Button>
                <Button onClick={() => navigate(createPageUrl(`Deliver`) + `?manual=true&date=${load.delivery_date || ''}`)} className="bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="w-4 h-4 mr-2" />New Delivery
                </Button>

                <Button onClick={() => setIsDeleteDialogOpen(true)} variant="destructive" className="bg-red-600 hover:bg-red-700">
                  <Trash2 className="w-4 h-4 mr-2" />Delete Delivery
                </Button>
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Delivery: {load?.company_name || load?.customer_name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete this delivery load and restore all products to in-hold status. The order will not be affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteLoad()} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Mobile dropdown */}
            <div className="flex md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handlePrintSchedule}><FileText className="w-4 h-4 mr-2 text-purple-600" />Print Schedule</DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePrintReceipt}><Printer className="w-4 h-4 mr-2 text-green-600" />Print Receipt</DropdownMenuItem>
                  {(() => {
                    const linkedOrder = load.order_id ? allOrders.find(o => o.id === load.order_id) : null;
                    const alreadyNotified = load.delivery_notification_sent || linkedOrder?.first_item_moved_notification_sent;
                    const hasDeliveredItem = loadItems.some(li => { const oi = li.order_item_id ? allOrderItems.find(x => x.id === li.order_item_id) : null; return oi?.status === 'delivered'; });
                    return !load.is_paid && !alreadyNotified && loadItems.length > 0 && hasDeliveredItem ? (
                      <DropdownMenuItem onClick={async () => { if (confirm('Send delivery notification email?')) { try { const response = await base44.functions.invoke('sendDeliveryNotification', { loadId }); if (response?.data?.sent) { alert(`✅ Notification sent to ${response.data.recipients?.join(', ')}`); } else { alert(response?.data?.message || 'Notification not sent.'); } await base44.entities.Load.update(loadId, { delivery_notification_sent: true }); await queryClient.invalidateQueries(['load', loadId]); notificationEvents.emit(); } catch (error) { alert('Failed to send notification. Please try again.'); } } }}>
                        <FileText className="w-4 h-4 mr-2 text-orange-500" />Send Notification
                      </DropdownMenuItem>
                    ) : null;
                  })()}
                  <DropdownMenuItem onClick={() => navigate(createPageUrl(`OptimizeDelivery?orderid=${load.order_id}&reoptimize=true${load.schedule_batch_id ? `&batchid=${load.schedule_batch_id}` : ''}&deliverydate=${load.delivery_date}&loadid=${loadId}`))}>
                    <Zap className="w-4 h-4 mr-2 text-purple-600" />Reoptimize
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSameCustomer}><Users className="w-4 h-4 mr-2 text-purple-600" />Same Customer</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl(`Deliver`) + `?manual=true&date=${load.delivery_date || ''}`)}><Plus className="w-4 h-4 mr-2 text-indigo-600" />New Delivery</DropdownMenuItem>

                  <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)} className="text-red-600 focus:text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" />Delete Delivery
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Current Load Header and Delivery Schedule */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 mx-6 items-stretch">
        <div className="h-full">
          <Card className="h-full">
            <CardContent className="p-6">
              <div className="flex-1">
                {!consolidatedLoadInfo ? (
                  <>
                     <div className="flex items-center gap-2 mb-1 flex-wrap justify-between">
                       <div className="flex items-center gap-2 flex-wrap">
                         {(() => {
                            const loadItemsForThisLoad = allLoadItems.filter(item => item.load_id === loadId);
                            let customerName = null;
                            let orderId = null;
                            for (const item of loadItemsForThisLoad) {
                              const orderItem = item.order_item_id ? allOrderItems.find(oi => oi.id === item.order_item_id) : null;
                              if (orderItem?.order_id) {
                                const order = allOrders.find(o => o.id === orderItem.order_id);
                                if (order) { customerName = order.company_name || order.customer_name; orderId = order.id; break; }
                              }
                            }
                            if (!orderId) orderId = load.order_id;
                            const order = orderId ? allOrders.find(o => o.id === orderId) : null;
                            const customer = order?.customer_id ? allCustomers.find(c => c.id === order.customer_id) : null;
                            const companyName = customer?.company || null;
                            const displayName = companyName || customerName || load.customer_name || 'Unnamed Load';
                            const subName = companyName ? (customerName || load.customer_name) : null;
                            return (
                              <div>
                                <h2 className="text-2xl font-bold text-gray-900">{displayName}</h2>
                                {subName && <p className="text-sm text-gray-500 font-normal">{subName}</p>}
                              </div>
                            );
                          })()}
                         {(() => {
                           const receiptNumbers = new Set();
                           loadItems.forEach(item => {
                             const orderItem = item.order_item_id ? allOrderItems.find(oi => oi.id === item.order_item_id) : null;
                             if (orderItem?.receipt_number) receiptNumbers.add(orderItem.receipt_number);
                           });
                           const numbersArray = Array.from(receiptNumbers).sort();
                           return numbersArray.length > 0 && numbersArray.map((num, idx) => (
                             <Badge key={idx} title="Receipt #" className="bg-yellow-400 text-yellow-900 text-xs px-2.5 py-1 cursor-default hover:bg-yellow-400 hover:text-yellow-900">#{num}</Badge>
                           ));
                         })()}
                       </div>
                       <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => {
                            if (loadItems.length > 0) {
                              const firstLoadItem = loadItems[0];
                              if (firstLoadItem.order_item_id) {
                                const orderItem = allOrderItems.find(oi => oi.id === firstLoadItem.order_item_id);
                                if (orderItem?.order_id) {
                                  const order = allOrders.find(o => o.id === orderItem.order_id);
                                  if (order) { navigateToOrder(orderItem.order_id); return; }
                                }
                              }
                            }
                            if (load.order_id) {
                              const order = allOrders.find(o => o.id === load.order_id);
                              if (order) { navigateToOrder(load.order_id); return; }
                            }
                            setShowLinkOrderDialog(true);
                          }} className="h-7 px-2 text-indigo-600 border-indigo-300 hover:bg-indigo-50">
                            <FileText className="w-3 h-3 mr-1" />View Order
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleEditLoad} className="h-7 px-2">
                            <Edit className="w-3 h-3 mr-1" />Edit
                          </Button>
                        </div>
                     </div>
                     <p className="text-sm text-gray-600 mb-1">{load.customer_address || allOrders.find(o => o.id === load.order_id)?.job_address || ''}</p>
                     <div className="mt-2 space-y-2">
                        <textarea className="w-full text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-md p-2 outline-none resize-none min-h-[32px] focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-all" placeholder="📍 Drop notes..." value={dropNotesValue} rows={2} onChange={handleDropNotesChange} />
                        <DriverNotesEditor notes={driverNotes} totalStops={consolidatedLoadInfo ? consolidatedLoadInfo.length : 1} onChange={handleDriverNotesChange} />
                      </div>
                     <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="bg-blue-100 text-blue-800 border border-blue-300 text-sm py-1.5 px-3 font-semibold rounded-md inline-flex items-center gap-1 hover:bg-blue-200 transition-colors">
                            🚚 {currentTruckSetting?.name || 'No Truck Setting'}<ChevronDown className="w-3 h-3 ml-1" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {truckSettings.map(ts => (
                            <DropdownMenuItem key={ts.id} onClick={() => updateLoadMutation.mutate({ loadId, data: { truck_setting_id: ts.id, schedule_printed: false, receipts_printed: false } })} className={ts.id === load?.truck_setting_id ? 'font-bold bg-blue-50' : ''}>
                              🚚 {ts.name} — {ts.max_weight_capacity?.toLocaleString()} lbs
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {load.is_paid && (
                        <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-sm py-1.5 px-3 font-semibold pointer-events-none">💵 Paid</Badge>
                      )}
                      {(load.delivery_notification_sent || allOrders.find(o => o.id === load.order_id)?.first_item_moved_notification_sent) && (
                        <Badge title="Delivery Notification Email Sent" className="bg-green-100 text-green-800 border border-green-300 text-sm py-1.5 px-3 font-semibold cursor-default hover:bg-green-100 hover:text-green-800">✅ Notified</Badge>
                      )}
                     </div>
                  </>
                ) : null}
                
                {/* Show multiple customers if consolidated load */}
                {consolidatedLoadInfo && (
                  <div className="p-4 bg-gradient-to-r from-indigo-100 to-blue-100 border-2 border-indigo-600 rounded-lg shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                      <Badge className="bg-indigo-600 text-white text-sm px-3 py-1">Consolidated Load - {consolidatedLoadInfo.length} stops</Badge>
                      <Button size="sm" variant="outline" onClick={() => { setStopOrders(consolidatedLoadInfo); setIsReorderStopsOpen(true); }} className="h-7">
                        <ArrowUpDown className="w-3 h-3 mr-1" />Reorder Stops
                      </Button>
                    </div>
                    <div className="space-y-2 text-sm">
                      {consolidatedLoadInfo.map((order, idx) => {
                        const orderDetails = allOrders.find(o => o.id === order.orderId);
                        return (
                          <div key={order.orderId} className="p-2 bg-white rounded border border-indigo-300 flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="text-indigo-900">
                                <span className="font-bold">Stop {idx + 1}:</span> <span className="font-semibold">{order.customer_name}</span>
                                {order.receipt_numbers.length > 0 && <span className="ml-2 text-indigo-600">#{order.receipt_numbers.join(', ')}</span>}
                              </div>
                              {orderDetails?.job_address && <div className="text-xs text-gray-700 mt-0.5">{orderDetails.job_address}</div>}
                              <div className="text-xs text-gray-600 mt-1">🚚 {currentTruckSetting?.name || 'No Truck Setting'}</div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="outline" onClick={() => navigateToOrder(order.orderId)} className="h-7 px-2 text-indigo-600 border-indigo-300 hover:bg-indigo-50">
                                <FileText className="w-3 h-3 mr-1" />Order
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setEditingStopOrderId(order.orderId); setEditingStopData({ customer_name: order.customer_name, customer_address: orderDetails?.job_address || '', customer_phone: orderDetails?.customer_phone || '', drop_location_notes: load.drop_location_notes || '' }); }} className="h-7 px-2">
                                <Edit className="w-3 h-3 mr-1" />Edit
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => { const currentIndex = loadsForCurrentDate.findIndex(l => l.id === loadId); if (currentIndex > 0) navigate(createPageUrl(`LoadDetails?id=${loadsForCurrentDate[currentIndex - 1].id}`)); }} disabled={stopNumber === 1} className="h-8">
                    <ChevronUp className="w-4 h-4 mr-1" />Previous
                  </Button>
                  <p className="text-gray-600 text-base px-3">{consolidatedLoadInfo ? `Load ${stopNumber} (${consolidatedLoadInfo.length} Stops)` : `Load ${stopNumber} of ${totalStops}`}</p>
                  <Button variant="outline" size="sm" onClick={() => { const currentIndex = loadsForCurrentDate.findIndex(l => l.id === loadId); if (currentIndex < loadsForCurrentDate.length - 1) navigate(createPageUrl(`LoadDetails?id=${loadsForCurrentDate[currentIndex + 1].id}`)); }} disabled={stopNumber === totalStops} className="h-8">
                    Next<ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Delivery Schedule */}
        <Card className="border-2 border-indigo-200 bg-indigo-50 h-full">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <List className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-gray-900 text-base">Delivery Schedule</h3>
            </div>
            <p className="text-xs text-gray-600 mb-3 italic">Drag to reorder stops</p>
            <div className="space-y-3">
              {deliveryDates.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No scheduled deliveries</p>
              ) : (
                deliveryDates.map(date => {
                  const dateLoads = loadsByDate[date] || [];
                  return (
                    <div key={date} className="border-b border-indigo-200 pb-2 last:border-b-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="font-semibold text-xs text-gray-900">
                          {date === 'No Date' ? 'No Date' : date === todayStr ? 'Today' : new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <Badge className="ml-auto bg-indigo-200 text-indigo-800 text-xs h-5 pointer-events-none">
                          {dateLoads.filter(l => { const isSameOrderOrBatch = (load?.order_id && l.order_id === load.order_id) || (load?.schedule_batch_id && l.schedule_batch_id === load.schedule_batch_id); const loadItemsForLoad = allLoadItems.filter(item => item.load_id === l.id); return loadItemsForLoad.length > 0 || isSameOrderOrBatch || l.id === loadId; }).length} {dateLoads.filter(l => { const isSameOrderOrBatch = (load?.order_id && l.order_id === load.order_id) || (load?.schedule_batch_id && l.schedule_batch_id === load.schedule_batch_id); const loadItemsForLoad = allLoadItems.filter(item => item.load_id === l.id); return loadItemsForLoad.length > 0 || isSameOrderOrBatch || l.id === loadId; }).length === 1 ? 'stop' : 'stops'}
                        </Badge>
                      </div>
                      <div className="space-y-1 ml-5">
                        <DragDropContext onDragEnd={handleScheduleDragEnd}>
                          <Droppable droppableId={`schedule-${date}`}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.droppableProps}>
                                {[...dateLoads.filter(l => { const isSameOrderOrBatch = (load?.order_id && l.order_id === load.order_id) || (load?.schedule_batch_id && l.schedule_batch_id === load.schedule_batch_id); const loadItemsForLoad = allLoadItems.filter(item => item.load_id === l.id); return loadItemsForLoad.length > 0 || isSameOrderOrBatch || l.id === loadId; })].sort((a, b) => (a.delivery_order ?? 999) - (b.delivery_order ?? 999)).map((l, loadIdx) => (
                                  <Draggable key={l.id} draggableId={l.id} index={loadIdx}>
                                    {(dragProvided, dragSnapshot) => (
                                      <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps} className={`mb-1 rounded ${dragSnapshot.isDragging ? 'opacity-80 shadow-lg' : ''}`}>
                                        <SortableLoadItem load={l} idx={loadIdx} isActive={l.id === loadId} onNavigate={() => navigate(createPageUrl(`LoadDetails?id=${l.id}`))} allLoadItems={allLoadItems} allOrderItems={allOrderItems} allOrders={allOrders} allLoadCustomerStops={allLoadCustomerStops} allCustomers={allCustomers} />
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </DragDropContext>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Load Capacity + Truck Bed Space */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mx-6 mb-6">
        <Card className={`border-2 ${loadMetrics.weightStatus === 'danger' ? 'border-red-500 bg-red-50' : loadMetrics.weightStatus === 'warning' ? 'border-yellow-500 bg-yellow-50' : 'border-green-500 bg-green-50'}`}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-sm">Load Capacity</h3>
              </div>
              {loadMetrics.weightStatus === 'optimal' && <Badge className="bg-green-100 text-green-700 border-green-300 pointer-events-none text-xs">✓ OPTIMAL</Badge>}
            </div>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-2xl font-bold text-gray-900">{loadMetrics.totalWeight.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              <span className="text-xs text-gray-600">lbs / {loadMetrics.maxWeight.toLocaleString('en-US', { maximumFractionDigits: 0 })}lbs</span>
            </div>
            <div className="space-y-1 mb-2">
              <div className="flex justify-between text-xs text-gray-600"><span>Usage</span><span>{loadMetrics.weightPercentage.toFixed(1)}%</span></div>
              <div className="w-full bg-gray-300 rounded-full h-3">
                <div className={`h-3 rounded-full transition-all ${loadMetrics.weightStatus === 'danger' ? 'bg-red-600' : loadMetrics.weightStatus === 'warning' ? 'bg-yellow-500' : 'bg-gray-900'}`} style={{ width: `${Math.min(loadMetrics.weightPercentage, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>0lbs</span>
                <span className="text-orange-600 font-semibold" title={`Warning threshold: ${loadMetrics.warningThreshold}%`}>{loadMetrics.warningThreshold}% ⚠️</span>
                <span>{loadMetrics.maxWeight.toLocaleString('en-US', { maximumFractionDigits: 0 })}lbs</span>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-300">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-semibold text-gray-700">Pallets:</span>
                    <span className="text-lg font-bold text-gray-900">{loadMetrics.totalPallets}</span>
                  </div>
                  <Button variant="link" size="sm" className="text-blue-600 h-auto p-0 text-xs self-start ml-5" onClick={handlePalletOverride}>Override</Button>
                </div>
                <div className="text-sm font-bold text-green-600">+{loadMetrics.weightRemaining.toLocaleString('en-US', { maximumFractionDigits: 0 })} lbs left</div>
              </div>
              <Button variant="outline" size="sm" className="text-red-600 border-red-300 hover:bg-red-50 h-7 text-xs" onClick={handleClearAllLoad} disabled={loadItems.length === 0}>
                <Trash2 className="w-3 h-3 mr-1" />Clear Load
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-2 ${loadMetrics.spaceStatus === 'danger' ? 'border-red-500 bg-red-50' : loadMetrics.spaceStatus === 'warning' ? 'border-yellow-500 bg-yellow-50' : 'border-green-500 bg-green-50'}`}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Ruler className="w-4 h-4 text-gray-700" />
              <h3 className="font-bold text-gray-900 text-sm">Truck Bed Space</h3>
            </div>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-2xl font-bold text-gray-900">{loadMetrics.palletArea.toFixed(1)}</span>
              <span className="text-xs text-gray-600">ft² / {loadMetrics.truckArea.toFixed(1)}ft²</span>
            </div>
            <div className="relative bg-gray-200 rounded-lg h-14 overflow-hidden border-2 border-gray-400 mb-2">
              <div className="absolute top-0 bottom-0 bg-gray-900 transition-all duration-300" style={{ width: `${Math.min(loadMetrics.spacePercentage, 100)}%` }}></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{loadMetrics.spacePercentage.toFixed(1)}%</span>
              </div>
            </div>
            <div className="flex justify-around pt-2 border-t border-gray-300">
              <div className="text-center"><div className="text-lg font-bold text-gray-900">{loadMetrics.spacePercentage.toFixed(1)}%</div><div className="text-xs text-gray-600">Bed Filled</div></div>
              <div className="text-center"><div className="text-lg font-bold text-green-600">+{loadMetrics.spaceRemaining.toFixed(1)}</div><div className="text-xs text-gray-600">ft² Remaining</div></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <LoadProducts
        load={load} loadItems={loadItems} allOrderItems={allOrderItems} allOrders={allOrders} products={products}
        availableItems={availableItems} availableQuantities={availableQuantities} setAvailableQuantities={setAvailableQuantities}
        addToLoadMutation={addToLoadMutation} removeFromLoadMutation={removeFromLoadMutation}
        handleAddToLoad={handleAddToLoad} setIsCatalogOpen={setIsCatalogOpen}
        consolidatedLoadInfo={consolidatedLoadInfo} loadMetrics={loadMetrics}
        loadCustomerStops={loadCustomerStops}
      />

      <LoadDialogs
        isEditDialogOpen={isEditDialogOpen} setIsEditDialogOpen={setIsEditDialogOpen}
        editFormData={editFormData} setEditFormData={setEditFormData}
        truckSettings={truckSettings} handleSaveEdit={handleSaveEdit}
        isPalletOverrideOpen={isPalletOverrideOpen} setIsPalletOverrideOpen={setIsPalletOverrideOpen}
        manualPalletCount={manualPalletCount} setManualPalletCount={setManualPalletCount}
        handleSavePalletOverride={handleSavePalletOverride}
        isConfirmDialogOpen={isConfirmDialogOpen} setIsConfirmDialogOpen={setIsConfirmDialogOpen}
        pendingItemAdd={pendingItemAdd} confirmAddToLoad={confirmAddToLoad}
        isCatalogOpen={isCatalogOpen} setIsCatalogOpen={setIsCatalogOpen}
        handleAddProductFromCatalog={handleAddProductFromCatalog} load={load}
        capacityWarning={capacityWarning} setCapacityWarning={setCapacityWarning}
        loadMetrics={loadMetrics}
        editingStopOrderId={editingStopOrderId} setEditingStopOrderId={setEditingStopOrderId}
        editingStopData={editingStopData} setEditingStopData={setEditingStopData}
        updateOrderMutation={updateOrderMutation} updateLoadMutation={updateLoadMutation}
        loadId={loadId}
        showNoHoldItemsDialog={showNoHoldItemsDialog} setShowNoHoldItemsDialog={setShowNoHoldItemsDialog}
        navigate={navigate} createPageUrl={createPageUrl}
        allOrders={allOrders} allOrderItems={allOrderItems} loadItems={loadItems}
        addQuantities={addQuantities} setAddQuantities={setAddQuantities}
        addToLoadMutation={addToLoadMutation} handleAddToLoad={handleAddToLoad}
        confirmCapacityAdd={confirmCapacityAdd}
        isReorderStopsOpen={isReorderStopsOpen} setIsReorderStopsOpen={setIsReorderStopsOpen}
        stopOrders={stopOrders} setStopOrders={setStopOrders}
        consolidatedLoadInfo={consolidatedLoadInfo} allLoadCustomerStops={allLoadCustomerStops}
        queryClient={queryClient}
        sameCustomerConfirm={sameCustomerConfirm} setSameCustomerConfirm={setSameCustomerConfirm}
        doCreateSameCustomer={doCreateSameCustomer} totalStops={totalStops}
        moveDateDialog={moveDateDialog} setMoveDateDialog={setMoveDateDialog}
        _commitSaveEdit={_commitSaveEdit}
        showLinkOrderDialog={showLinkOrderDialog} setShowLinkOrderDialog={setShowLinkOrderDialog}
        selectedExistingOrderId={selectedExistingOrderId} setSelectedExistingOrderId={setSelectedExistingOrderId}
      />
    </div>
  );
}