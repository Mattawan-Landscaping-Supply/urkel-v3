import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Plus, Truck, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';

export default function OptimizeDelivery() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const getToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const urlParams = new URLSearchParams(window.location.search);
  const isReoptimize = urlParams.get('reoptimize') === 'true';
  const urlOrderId = urlParams.get('orderId') || urlParams.get('orderid');
  const urlBatchId = urlParams.get('batchId') || urlParams.get('batchid') || urlParams.get('batch_id');
  const urlDeliveryDate = urlParams.get('deliveryDate') || urlParams.get('deliverydate') || urlParams.get('delivery_date');
  const returnLoadId = urlParams.get('loadId') || urlParams.get('loadid') || urlParams.get('load_id');

  const [selectedOrderIds, setSelectedOrderIds] = useState(urlOrderId ? [urlOrderId] : []);
  const [overflowTruckSettings, setOverflowTruckSettings] = useState({}); // { 2: truckId, 3: truckId, ... }
  const [deliveryDate, setDeliveryDate] = useState(urlDeliveryDate || getToday());
  const [loadTruckSettings, setLoadTruckSettings] = useState({});
  const [packingStrategy, setPackingStrategy] = useState('evenly');
  const [hasInitializedSettings, setHasInitializedSettings] = useState(false);
  const [hasInitializedStrategy, setHasInitializedStrategy] = useState(false);
  const [defaultTruckInitialized, setDefaultTruckInitialized] = useState(false);
  // Warning dialog state: shown when selected order has existing active loads
  const [activeLoadsWarning, setActiveLoadsWarning] = useState(null); // null | { loads: Load[], pendingAction: 'add' | 'reoptimize' }
  const [confirmedMode, setConfirmedMode] = useState(null); // null | 'add' | 'reoptimize'

  const { data: orders = [] } = useQuery({
    queryKey: ['orders', 'active'],
    queryFn: async () => {
      const allOrders = await base44.entities.Order.list('-created_date', 500);
      console.log('order sample:', allOrders[0]);
      const activeOrders = allOrders.filter(o => !o.is_archived && !o.is_completed);
      
      // Get all items to filter orders with available items
      const allItems = await base44.entities.OrderItem.list('-created_date', 500);
      
      // Get all receipts to attach to orders
      const allReceipts = await base44.entities.Receipt.list('-created_date', 500);
      
      // Keep only orders that have items in 'in_hold' status (available to ship)
      // Include quote items — they are physically in stock and deliverable
      const ordersWithItems = activeOrders.filter(order => {
        const orderItems = allItems.filter(item => 
          item.order_id === order.id && 
          item.status === 'in_hold'
        );
        return orderItems.length > 0;
      });
      
      // Attach receipt numbers to each order
      const ordersWithReceipts = ordersWithItems.map(order => {
        const receiptNums = allReceipts
          .filter(r => r.order_id === order.id)
          .map(r => r.receipt_number)
          .filter(Boolean);
        return { ...order, _receiptNumbers: receiptNums };
      });
      
      // Sort alphabetically by company_name if available, otherwise customer_name
      return ordersWithReceipts.sort((a, b) => {
        const nameA = a.company_name || a.customer_name;
        const nameB = b.company_name || b.customer_name;
        return nameA.localeCompare(nameB);
      });
    }
  });

  // When orderId is pre-selected from URL (e.g. BuildLoadDialog), fetch that order directly
  // so we always have its data even if the orders list excludes it (e.g. all items on_delivery)
  const { data: preSelectedOrder } = useQuery({
    queryKey: ['order', urlOrderId],
    queryFn: () => base44.entities.Order.get(urlOrderId),
    enabled: !!urlOrderId && !isReoptimize,
    staleTime: 30000,
  });

  const { data: truckSettings = [] } = useQuery({
    queryKey: ['truckSettings'],
    queryFn: async () => {
      const results = await base44.entities.TruckSettings.list();
      // Fallback: if list() returns empty, try filter
      if (!results || results.length === 0) {
        return await base44.entities.TruckSettings.filter({});
      }
      return results;
    },
    staleTime: 0,
    refetchOnMount: true,
    retry: 3
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('name', 500)
  });

  // Set default truck setting to "With Moffett" for new deliveries
  useEffect(() => {
    if (!isReoptimize && truckSettings.length > 0 && !defaultTruckInitialized) {
      const moffettSetting = truckSettings.find(ts => ts.name === 'With Moffett');
      if (moffettSetting) {
        console.log('Setting default truck to With Moffett:', moffettSetting.id);
        setLoadTruckSettings({ 'new': moffettSetting.id });
        setDefaultTruckInitialized(true);
      }
    }
  }, [isReoptimize, truckSettings, defaultTruckInitialized]);

  // Check if selected order already has active loads (new delivery mode only)
  const { data: existingActiveLoadsForOrder = [] } = useQuery({
    queryKey: ['loads', 'active-check', selectedOrderIds[0]],
    queryFn: async () => {
      if (!selectedOrderIds[0]) return [];
      const loads = await base44.entities.Load.filter({ order_id: selectedOrderIds[0] }, '-created_date', 500);
      return loads.filter(l => l.status !== 'archived');
    },
    enabled: !isReoptimize && selectedOrderIds.length > 0,
    staleTime: 0
  });

  const { data: existingLoads = [], isLoading: loadsLoading } = useQuery({
    queryKey: ['loads', urlBatchId, urlDeliveryDate],
    queryFn: async () => {
      if (!isReoptimize) return [];
      const loads = await base44.entities.Load.list('delivery_order', 500);
      
      console.log('All loads:', loads.length);
      console.log('Filter params - batchId:', urlBatchId, 'orderId:', urlOrderId, 'date:', urlDeliveryDate);
      
      // Filter by batch_id first, fall back to order_id+date if batch yields nothing
      let filtered;
      if (urlBatchId) {
        filtered = loads.filter(l => l.schedule_batch_id === urlBatchId && l.status !== 'archived');
        // Fallback: batch_id stale/missing — use order+date instead
        if (filtered.length === 0 && urlOrderId && urlDeliveryDate) {
          console.log('Batch ID returned 0 results — falling back to order_id + date filter');
          filtered = loads.filter(l =>
            l.order_id === urlOrderId &&
            l.delivery_date === urlDeliveryDate &&
            l.status !== 'archived'
          );
        }
      } else if (urlOrderId && urlDeliveryDate) {
        filtered = loads.filter(l =>
          l.order_id === urlOrderId &&
          l.delivery_date === urlDeliveryDate &&
          l.status !== 'archived'
        );
      } else {
        filtered = [];
      }
      
      console.log('Existing loads found:', filtered.length, filtered);
      return filtered.sort((a, b) => (a.delivery_order || 0) - (b.delivery_order || 0));
    },
    enabled: isReoptimize && (!!urlBatchId || (!!urlOrderId && !!urlDeliveryDate))
  });

  const { data: loadItems = [] } = useQuery({
    queryKey: ['loadItems', existingLoads],
    queryFn: async () => {
      if (existingLoads.length === 0) return [];
      const allItems = await base44.entities.LoadItem.list();
      const loadIds = existingLoads.map(l => l.id);
      const filtered = allItems.filter(item => loadIds.includes(item.load_id));
      console.log('Load items found for reoptimize:', filtered.length, 'items');
      return filtered;
    },
    enabled: existingLoads.length > 0
  });

  // Initialize truck settings from existing loads when they're loaded (only once)
  useEffect(() => {
    if (isReoptimize && existingLoads.length > 0 && !hasInitializedSettings) {
      const initialSettings = {};
      existingLoads.forEach(load => {
        if (load.truck_setting_id) {
          initialSettings[load.id] = load.truck_setting_id;
        }
      });
      console.log('Initializing truck settings from existing loads:', initialSettings);
      setLoadTruckSettings(initialSettings);
      setHasInitializedSettings(true);
    }
  }, [existingLoads, isReoptimize, hasInitializedSettings]);

  // Do NOT inherit packing strategy from existing loads — always default to maxout
  // (removed: was causing reoptimize to re-use stale 'evenly' strategy)

  const { data: items = {}, isLoading: isItemsLoading } = useQuery({
    queryKey: ['orderItems', selectedOrderIds],
    queryFn: async () => {
      if (selectedOrderIds.length === 0) return {};
      // Fetch directly by order_id for accuracy — avoids 500-item global list limit
      const orderId = selectedOrderIds[0];
      const allItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);
      // Include quote items — they are physically in stock and deliverable
      const filtered = allItems.filter(i =>
        i.status === 'in_hold' &&
        (i.quantity || 0) > 0
      );
      const alreadyOnLoad = allItems.filter(i =>
        i.status === 'on_delivery'
      );
      console.log('Order items for optimization:', filtered);
      console.log('Items already on a load:', alreadyOnLoad);
      return { available: filtered, alreadyOnLoad };
    },
    enabled: selectedOrderIds.length > 0 && !isReoptimize
  });

  // Build ordered truck settings: load1=primary, load2+=user overflow selections
  const buildOrderedTruckSettings = (primaryId, loadsNeeded, overflow) => {
    const arr = [primaryId];
    for (let i = 2; i <= Math.max(loadsNeeded || 1, 5); i++) {
      arr.push(overflow[i] || primaryId);
    }
    return arr;
  };

  const createOptimizedDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (selectedOrderIds.length === 0) {
        throw new Error('Please select at least one order');
      }

      // If this is a URL-driven reoptimize
      if (isReoptimize) {
        const missingSettings = existingLoads.filter(l => !loadTruckSettings[l.id]);
        if (missingSettings.length > 0) {
          throw new Error('Please assign truck settings to all stops');
        }

        // Try to get items from existing LoadItems; if empty, fall back to in_hold items
        let itemIds = loadItems.filter(item => item.order_item_id).map(item => item.order_item_id);
        
        if (itemIds.length === 0) {
          // Fallback: fetch all in_hold items for this order
          const allOrderItems = await base44.entities.OrderItem.filter({ order_id: selectedOrderIds[0] });
          const inHoldItems = allOrderItems.filter(i => i.status === 'in_hold' && (i.quantity || 0) > 0); // include quote items
          itemIds = inHoldItems.map(i => i.id);
          
          if (itemIds.length === 0) {
            throw new Error('No items found to optimize. The delivery stops may be empty and there are no in-hold items.');
          }
        }

        // Do NOT inherit truck list from existing loads — that locks in the old load count.
        // Instead pass the single truck the user selected and let the algorithm decide how many loads are needed.
        const existingLoadIds = existingLoads.map(l => l.id);
        // In reoptimize mode, truck settings are keyed by load.id not 'new'
        const primaryTruckId = loadTruckSettings['new'] || Object.values(loadTruckSettings)[0] || null;

        const response = await base44.functions.invoke('createLoadsFromDeliveredItems', {
          orderId: selectedOrderIds[0],
          deliveredOrderItemIds: itemIds,
          packingStrategy: packingStrategy,
          truckSettingId: primaryTruckId,
          orderedTruckSettings: buildOrderedTruckSettings(primaryTruckId, loadAdvisory?.loadsNeeded, overflowTruckSettings),
          existingLoadIds: existingLoadIds,
          isReoptimize: true
        });

        return response.data.loads;
      }

      // New delivery mode — check if there are active loads and user hasn't confirmed yet
      if (existingActiveLoadsForOrder.length > 0 && confirmedMode === null) {
        setActiveLoadsWarning({ loads: existingActiveLoadsForOrder });
        throw new Error('__SHOW_WARNING__');
      }

      if (itemsNeedingLoad.length === 0) {
        if (itemsAlreadyOnLoad.length > 0) {
          throw new Error('All items for this order are already assigned to a delivery load. Go to LoadMaster to view existing deliveries.');
        }
        throw new Error('No items available to load. Make sure items are in In Hold status.');
      }

      // confirmedMode === 'reoptimize': delete existing loads and repack everything
      if (confirmedMode === 'reoptimize') {
        const allOnDeliveryItems = await base44.entities.OrderItem.filter({ order_id: selectedOrderIds[0], status: 'on_delivery' });
        const allItemIds = [
          ...itemsNeedingLoad.map(i => i.id),
          ...allOnDeliveryItems.map(i => i.id) // include quote items
        ];
        const existingLoadIds = existingActiveLoadsForOrder.map(l => l.id);

        const response = await base44.functions.invoke('createLoadsFromDeliveredItems', {
          orderId: selectedOrderIds[0],
          deliveredOrderItemIds: allItemIds,
          truckSettingId: loadTruckSettings['new'],
          orderedTruckSettings: buildOrderedTruckSettings(loadTruckSettings['new'], loadAdvisory?.loadsNeeded, overflowTruckSettings),
          deliveryDate: deliveryDate,
          packingStrategy: packingStrategy,
          existingLoadIds: existingLoadIds,
          isReoptimize: true
        });
        return response.data.loads;
      }

      // confirmedMode === 'add' (or no existing loads): just add new loads for in_hold items only
      const response = await base44.functions.invoke('createLoadsFromDeliveredItems', {
        orderId: selectedOrderIds[0],
        deliveredOrderItemIds: itemsNeedingLoad.map(i => i.id),
        truckSettingId: loadTruckSettings['new'],
        orderedTruckSettings: buildOrderedTruckSettings(loadTruckSettings['new'], loadAdvisory?.loadsNeeded, overflowTruckSettings),
        deliveryDate: deliveryDate,
        packingStrategy: packingStrategy,
        isReoptimize: false
      });

      return response.data.loads;
    },
    onSuccess: (loads) => {
      toast.success(`Created ${loads.length} optimized delivery load${loads.length > 1 ? 's' : ''}!`);
      // Nuke ALL per-order caches so OrderDetails always re-fetches fresh data from DB
      // This is critical: items just moved to on_delivery in DB, cache still shows in_hold
      if (selectedOrderIds[0]) {
        queryClient.removeQueries({ queryKey: ['loads', selectedOrderIds[0]] });
        queryClient.removeQueries({ queryKey: ['allLoadItemsRaw', selectedOrderIds[0]] });
        queryClient.removeQueries({ queryKey: ['items', selectedOrderIds[0]] });
      }
      queryClient.removeQueries({ queryKey: ['loads'] });
      queryClient.removeQueries({ queryKey: ['allLoadItems'] });
      queryClient.removeQueries({ queryKey: ['loadItems'] });
      if (loads.length > 0) {
        // replace: true so OptimizeDelivery is removed from history —
        // back button from LoadDetails goes straight to OrderDetails, not back here
        navigate(createPageUrl(`LoadDetails?id=${loads[0].id}`), { replace: true });
      } else {
        navigate(createPageUrl('Deliver'), { replace: true });
      }
    },
    onError: (error) => {
      if (error.message === '__SHOW_WARNING__') return; // Handled by dialog
      toast.error(error.message || 'Failed to create optimized delivery');
    }
  });

  const handleSelectOrder = (orderId) => {
    setSelectedOrderIds([orderId]);
    setConfirmedMode(null); // Reset on order change
  };

  const itemsNeedingLoad = items?.available || [];
  const itemsAlreadyOnLoad = items?.alreadyOnLoad || [];

  // Load Optimization Advisor: progressive per-load planning
  const loadAdvisory = useMemo(() => {
    if (isReoptimize || !loadTruckSettings['new'] || truckSettings.length === 0) return null;

    const selectedTruck = truckSettings.find(t => t.id === loadTruckSettings['new']);
    if (!selectedTruck) return null;

    // Show loading state while items are still fetching
    if (isItemsLoading) {
      return { loadsNeeded: null, totalWeight: 0, warnings: ['Calculating...'], suggestions: [], remainingAfterPlanned: 0, nextLoadNum: null, isLoading: true };
    }

    // If no in_hold items but there are on_delivery items, show informational message
    if (itemsNeedingLoad.length === 0) {
      const onDeliveryCount = itemsAlreadyOnLoad.length;
      if (onDeliveryCount > 0) {
        return { loadsNeeded: null, totalWeight: 0, warnings: [`All ${onDeliveryCount} item${onDeliveryCount > 1 ? 's are' : ' is'} already on an active load — nothing left to plan.`], suggestions: [], remainingAfterPlanned: 0, nextLoadNum: null };
      }
      return { loadsNeeded: null, totalWeight: 0, warnings: ['No items in In Hold status — nothing to load.'], suggestions: [], remainingAfterPlanned: 0, nextLoadNum: null };
    }

    const noMoffettTruck = truckSettings.find(t => t.name === 'No Moffett');
    const highwayNoMoffett = truckSettings.find(t => t.name === 'Highway No Moffett');

    // Calculate total weight
    let itemsWithNoWeight = 0;
    const totalWeight = itemsNeedingLoad.reduce((sum, item) => {
      const qty = item.quantity || 1;
      const unit = (item.selected_unit || '').toLowerCase();
      const product = products.find(p => p.name === item.product_name);
      let w = 0;
      if (unit === 'pallet') {
        w = product?.weight_pallet || item.weight_per_unit || 0;
      } else {
        w = product?.weight_each || item.weight_per_unit || 0;
      }
      if (w === 0) itemsWithNoWeight++;
      return sum + (qty * w);
    }, 0);

    const warnings = [];
    const suggestions = [];

    if (totalWeight <= 0 || itemsWithNoWeight === itemsNeedingLoad.length) {
      warnings.push('No weight data available — load count cannot be estimated.');
      suggestions.push('Add weight values to products in the catalog to enable load estimates.');
      return { loadsNeeded: null, totalWeight: 0, warnings, suggestions, remainingAfterPlanned: 0, nextLoadNum: null };
    }

    if (itemsWithNoWeight > 0) {
      warnings.push(`${itemsWithNoWeight} item${itemsWithNoWeight > 1 ? 's have' : ' has'} no weight data — estimate may be low.`);
    }

    // Walk through each planned load slot and subtract capacity progressively
    // Slot 1 = primary truck, slot 2+ = user's overflow selections (or unselected)
    const plannedTrucks = [selectedTruck];
    for (let i = 2; i <= 6; i++) {
      const overflowId = overflowTruckSettings[i];
      if (overflowId) {
        const t = truckSettings.find(ts => ts.id === overflowId);
        if (t) plannedTrucks.push(t);
      }
    }

    let remaining = totalWeight;
    for (const truck of plannedTrucks) {
      if (remaining <= 0) break;
      remaining -= (truck.max_weight_capacity || 0);
    }
    // remaining > 0 means we need more trucks; remaining <= 0 means all planned trucks cover it

    // Figure out what "next load" number would be
    const nextLoadNum = remaining > 0 ? plannedTrucks.length + 1 : null;

    // Summary line
    const truckCap = selectedTruck.max_weight_capacity || 0;
    if (remaining <= 0) {
      const loadsNeeded = plannedTrucks.length;
      const fits = loadsNeeded === 1 ? '✅ Fits in 1 load' : `✅ Fits in ${loadsNeeded} loads`;
      warnings.push(`${fits} — ${Math.round(totalWeight).toLocaleString()} lbs total.`);
    } else {
      const loadsPlanned = plannedTrucks.length;
      warnings.push(`⚠️ ${Math.round(totalWeight).toLocaleString()} lbs total · ${loadsPlanned} load${loadsPlanned > 1 ? 's' : ''} planned · ${Math.round(remaining).toLocaleString()} lbs still unassigned — select truck for Load ${nextLoadNum}.`);
    }

    // Suggestions: better alternatives (only when overflow)
    const firstTruckCap = selectedTruck.max_weight_capacity || 0;
    const isWithMoffett = selectedTruck.name === 'With Moffett';
    if (remaining > 0 && isWithMoffett && noMoffettTruck) {
      const noMoffettCap = noMoffettTruck.max_weight_capacity || 0;
      const altLoads = noMoffettCap > 0 ? Math.ceil(totalWeight / noMoffettCap) : null;
      if (altLoads !== null) {
        suggestions.push(`No Moffett fits in ${altLoads} load${altLoads > 1 ? 's' : ''} (${noMoffettCap.toLocaleString()} lbs each).`);
      }
    }
    if (remaining > 0 && highwayNoMoffett) {
      const highwayCap = highwayNoMoffett.max_weight_capacity || 0;
      const altLoads = highwayCap > 0 ? Math.ceil(totalWeight / highwayCap) : null;
      if (altLoads !== null) {
        suggestions.push(`Highway No Moffett fits in ${altLoads} load${altLoads > 1 ? 's' : ''} (${highwayCap.toLocaleString()} lbs each).`);
      }
    }
    if (packingStrategy === 'evenly' && nextLoadNum) {
      suggestions.push('Max Out packing fills each truck completely and may reduce total loads.');
    }

    // loadsNeeded for backend: total needed based on planned + remaining
    const loadsNeeded = remaining > 0
      ? plannedTrucks.length + Math.ceil(remaining / (plannedTrucks[plannedTrucks.length - 1]?.max_weight_capacity || 48000))
      : plannedTrucks.length;

    return { loadsNeeded, totalWeight, warnings, suggestions, remainingAfterPlanned: remaining, nextLoadNum };
  }, [loadTruckSettings, overflowTruckSettings, truckSettings, itemsNeedingLoad, itemsAlreadyOnLoad, packingStrategy, isReoptimize, products, isItemsLoading]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Active Loads Warning Dialog */}
      <AlertDialog open={!!activeLoadsWarning} onOpenChange={(open) => { if (!open) setActiveLoadsWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              This order already has active deliveries
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-3">
                  There {activeLoadsWarning?.loads.length === 1 ? 'is' : 'are'} already{' '}
                  <strong>{activeLoadsWarning?.loads.length} active delivery load{activeLoadsWarning?.loads.length === 1 ? '' : 's'}</strong> for this order.
                  What would you like to do?
                </p>
                <div className="space-y-2 text-sm">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                    <strong>Add New Load</strong> — Only packs the remaining in-hold items into a new delivery. Existing loads are untouched.
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                    <strong>Re-optimize All</strong> — Deletes all existing loads and re-packs everything (including on-delivery items) from scratch.
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              className="border-blue-500 text-blue-700 hover:bg-blue-50"
              onClick={() => {
                setConfirmedMode('add');
                setActiveLoadsWarning(null);
                setTimeout(() => createOptimizedDeliveryMutation.mutate(), 0);
              }}
            >
              Add New Load
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setConfirmedMode('reoptimize');
                setActiveLoadsWarning(null);
                setTimeout(() => createOptimizedDeliveryMutation.mutate(), 0);
              }}
            >
              Re-optimize All
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => returnLoadId ? navigate(createPageUrl(`LoadDetails?id=${returnLoadId}`)) : navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Truck className="w-8 h-8" />
          {isReoptimize ? 'Reoptimize Delivery' : 'New Optimized Delivery'}
        </h1>
        <p className="text-gray-600 mt-2">
          {isReoptimize 
            ? 'Assign truck settings to each stop and reoptimize the delivery schedule' 
            : 'Select an order and create optimized delivery loads'}
        </p>
      </div>

      <div className="grid gap-6">
        {/* Pre-selected order banner — shown when orderId came from URL (e.g. BuildLoadDialog) */}
        {!isReoptimize && urlOrderId && (() => {
          const preOrder = preSelectedOrder || orders.find(o => o.id === urlOrderId);
          const orderName = preOrder
            ? (preOrder.company_name || preOrder.customer_name)
            : 'Loading order...';
          const receiptNums = preOrder?._receiptNumbers?.length > 0
            ? preOrder._receiptNumbers.map(n => `#${String(n).replace(/^#/, '')}`).join(' · ')
            : null;
          return (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">✓</div>
                  <div>
                    <div className="text-xs text-indigo-600 font-medium uppercase tracking-wide">Building load for</div>
                    <div className="font-bold text-indigo-900 text-lg">{orderName}</div>
                    {receiptNums && <div className="text-xs text-indigo-600">{receiptNums}</div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Select Orders - only show if not reoptimizing AND no order pre-selected from URL */}
        {!isReoptimize && !urlOrderId && (
          <Card>
            <CardHeader>
              <CardTitle>Select Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {orders.length === 0 ? (
                  <p className="text-gray-500 text-sm">No active orders available</p>
                ) : (
                  orders.map(order => (
                    <label key={order.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="selectedOrder"
                        checked={selectedOrderIds.includes(order.id)}
                        onChange={() => handleSelectOrder(order.id)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{order.company_name || order.customer_name}</div>
                        {(() => {
                          // Prefer receipts from Receipt entity; fall back to order.receipt_numbers
                          let nums = order._receiptNumbers && order._receiptNumbers.length > 0
                            ? order._receiptNumbers
                            : (Array.isArray(order.receipt_numbers)
                                ? order.receipt_numbers
                                : (typeof order.receipt_numbers === 'string'
                                    ? order.receipt_numbers.split(',').map(s => s.trim()).filter(Boolean)
                                    : []));
                          if (!nums || nums.length === 0) return null;
                          const display = nums.map(n => `#${String(n).replace(/^#/, '')}`).join(' · ');
                          return <div className="text-xs text-gray-500">{display}</div>;
                        })()}
                        {order.company_name && <div className="text-xs text-gray-500">{order.customer_name}</div>}
                        <div className="text-sm text-gray-600">{order.job_address}</div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings - shown BEFORE items summary */}
        {!isReoptimize && (
          <Card>
            <CardHeader>
              <CardTitle>Delivery Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Delivery Date</Label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="grid gap-2">
                <Label>Truck Setting</Label>
                <Select
                  value={loadTruckSettings['new'] || ''}
                  onValueChange={(val) => { setLoadTruckSettings(prev => ({ ...prev, 'new': val })); setOverflowTruckSettings({}); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select truck setting..." />
                  </SelectTrigger>
                  <SelectContent>
                    {truckSettings.map(ts => (
                      <SelectItem key={ts.id} value={ts.id}>{ts.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Packing Strategy</Label>
                <Select value={packingStrategy} onValueChange={setPackingStrategy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maxout">Max Out - Fill each truck completely</SelectItem>
                    <SelectItem value="evenly">Evenly Distribute - Spread products across trucks</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Load Optimization Advisor */}
              {loadAdvisory && (loadAdvisory.warnings.length > 0 || loadAdvisory.suggestions.length > 0) && (() => {
                const isGreen = loadAdvisory.loadsNeeded === 1;
                const isGray = loadAdvisory.loadsNeeded === null;
                const borderCls = isGreen ? 'border-green-200 bg-green-50' : isGray ? 'border-gray-200 bg-gray-50' : 'border-amber-200 bg-amber-50';
                const titleCls = isGreen ? 'text-green-800' : isGray ? 'text-gray-600' : 'text-amber-800';
                const textCls  = isGreen ? 'text-green-700' : isGray ? 'text-gray-500' : 'text-amber-700';
                const subCls   = isGreen ? 'border-green-200' : isGray ? 'border-gray-200' : 'border-amber-200';
                const tipCls   = isGreen ? 'text-green-600' : isGray ? 'text-gray-500' : 'text-amber-600';
                return (
                  <div className={`rounded-lg border ${borderCls} p-3 space-y-1.5 text-sm`}>
                    <div className={`font-semibold ${titleCls} flex items-center gap-1.5`}>
                      <AlertTriangle className="w-4 h-4" />
                      Load Advisor
                    </div>
                    {loadAdvisory.warnings.map((w, i) => (
                      <div key={i} className={textCls}>{w}</div>
                    ))}
                    {/* Progressive per-load truck selectors — already-chosen loads + next needed one */}
                    {/* Show confirmed overflow selections as read-only rows */}
                    {Object.entries(overflowTruckSettings).sort(([a],[b]) => Number(a)-Number(b)).map(([loadNum, truckId]) => {
                      const t = truckSettings.find(ts => ts.id === truckId);
                      return (
                        <div key={loadNum} className="flex items-center gap-2 pt-1">
                          <label className="text-sm font-medium text-amber-800 whitespace-nowrap">Truck for Load {loadNum}:</label>
                          <Select
                            value={truckId}
                            onValueChange={(val) => setOverflowTruckSettings(prev => ({ ...prev, [Number(loadNum)]: val }))}
                          >
                            <SelectTrigger className="h-8 text-sm bg-white border-amber-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {truckSettings.map(ts => (
                                <SelectItem key={ts.id} value={ts.id}>{ts.name} ({(ts.max_weight_capacity || 0).toLocaleString()} lbs)</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            onClick={() => setOverflowTruckSettings(prev => { const n = {...prev}; delete n[Number(loadNum)]; return n; })}
                            className="text-amber-500 hover:text-red-500 text-xs"
                            title="Remove this load"
                          >✕</button>
                        </div>
                      );
                    })}
                    {/* Show the next unassigned load selector only if weight still unassigned */}
                    {loadAdvisory.nextLoadNum && (
                      <div className="flex items-center gap-2 pt-1">
                        <label className="text-sm font-medium text-amber-800 whitespace-nowrap">Truck for Load {loadAdvisory.nextLoadNum}:</label>
                        <Select
                          value=""
                          onValueChange={(val) => setOverflowTruckSettings(prev => ({ ...prev, [loadAdvisory.nextLoadNum]: val }))}
                        >
                          <SelectTrigger className="h-8 text-sm bg-white border-amber-300">
                            <SelectValue placeholder="Select truck..." />
                          </SelectTrigger>
                          <SelectContent>
                            {truckSettings.map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name} ({(t.max_weight_capacity || 0).toLocaleString()} lbs)</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {loadAdvisory.suggestions.length > 0 && (
                      <div className={`pt-1 border-t ${subCls} space-y-1`}>
                        {loadAdvisory.suggestions.map((s, i) => (
                          <div key={i} className={`${tipCls} flex items-start gap-1.5`}>
                            <span className="mt-0.5">💡</span>
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Warning: items already on a load */}
        {!isReoptimize && itemsAlreadyOnLoad.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-amber-800 text-sm">
            <strong>⚠️ {itemsAlreadyOnLoad.length} item{itemsAlreadyOnLoad.length > 1 ? 's are' : ' is'} already assigned to a delivery load</strong> and will not be included in this optimization. Use Reoptimize on the existing delivery to adjust those loads.
          </div>
        )}

        {/* Items Summary */}
        {!isReoptimize && itemsNeedingLoad.length > 0 && (
          <Card>
            <CardHeader>
              {(() => {
                const consolidatedRows = Object.values(
                  itemsNeedingLoad.reduce((acc, item) => {
                    const key = `${item.product_name}||${item.selected_unit}||${item.selected_color || ''}`;
                    if (acc[key]) { acc[key].quantity += item.quantity; } else { acc[key] = { ...item, quantity: item.quantity }; }
                    return acc;
                  }, {})
                );
                return <CardTitle>Items to Load ({consolidatedRows.length})</CardTitle>;
              })()}
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.values(
                  itemsNeedingLoad.reduce((acc, item) => {
                    const key = `${item.product_name}||${item.selected_unit}||${item.selected_color || ''}`;
                    if (acc[key]) {
                      acc[key].quantity += item.quantity;
                    } else {
                      acc[key] = { ...item, quantity: item.quantity };
                    }
                    return acc;
                  }, {})
                ).map(item => (
                  <div key={`${item.product_name}-${item.selected_unit}-${item.selected_color}`} className="text-sm text-gray-600 flex justify-between p-2 bg-gray-50 rounded">
                    <span>{item.quantity} {item.selected_unit} - {item.product_name}</span>
                    {item.selected_color && <span className="text-gray-500">{item.selected_color}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Existing Loads Summary for Reoptimize */}
        {isReoptimize && existingLoads.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Current Delivery Stops ({existingLoads.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {existingLoads.map((load, idx) => (
                  <div key={load.id} className="p-3 bg-gray-50 rounded border">
                    <div className="font-semibold text-gray-900">Stop #{idx + 1} - {load.customer_name}</div>
                    <div className="text-sm text-gray-600 mt-1">{load.customer_address}</div>
                    {load.receipt_number && (
                      <div className="text-xs text-gray-500 mt-1">Receipt: #{load.receipt_number}</div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings */}
        {isReoptimize && (
          loadsLoading ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-gray-500">Loading delivery stops...</p>
              </CardContent>
            </Card>
          ) : existingLoads.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Assign Truck Settings for Each Stop</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {existingLoads.map((load, idx) => (
                  <div key={load.id} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-semibold text-gray-900">Stop #{idx + 1} - {load.customer_name}</div>
                        <div className="text-sm text-gray-600">{load.customer_address}</div>
                      </div>
                    </div>
                    <div className="grid gap-2 mt-3">
                      <Label className="text-xs">Truck Setting for this stop</Label>
                      <Select 
                        key={load.id}
                        value={loadTruckSettings[load.id] || ''} 
                        onValueChange={(val) => {
                          console.log(`Setting truck for load ${load.id} (${load.customer_name}) to:`, val);
                          setLoadTruckSettings(prev => {
                            const updated = { ...prev, [load.id]: val };
                            console.log('Updated loadTruckSettings:', updated);
                            return updated;
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select truck setting..." />
                        </SelectTrigger>
                        <SelectContent>
                          {truckSettings.map(ts => (
                            <SelectItem key={ts.id} value={ts.id}>
                              {ts.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}

                <div className="grid gap-2 pt-4 border-t">
                  <Label>Packing Strategy</Label>
                  <Select value={packingStrategy} onValueChange={setPackingStrategy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="maxout">Max Out - Fill each truck completely</SelectItem>
                      <SelectItem value="evenly">Evenly Distribute - Spread products across trucks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-red-500 mb-2">No delivery stops found</p>
                <div className="text-sm text-gray-600">
                  <p>Looking for: {urlBatchId ? `Batch ID: ${urlBatchId}` : `Order ID: ${urlOrderId}, Date: ${urlDeliveryDate}`}</p>
                  <p className="mt-1">Check the browser console for debugging information.</p>
                </div>
              </CardContent>
            </Card>
          )
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => returnLoadId ? navigate(createPageUrl(`LoadDetails?id=${returnLoadId}`)) : navigate(-1)}
          >
            Cancel
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={() => createOptimizedDeliveryMutation.mutate()}
            disabled={
              selectedOrderIds.length === 0 || 
              (isReoptimize ? existingLoads.some(l => !loadTruckSettings[l.id]) : !loadTruckSettings['new']) || 
              createOptimizedDeliveryMutation.isPending ||
              createOptimizedDeliveryMutation.isSuccess
            }
          >
            {createOptimizedDeliveryMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isReoptimize ? 'Reoptimizing...' : 'Creating...'}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                {isReoptimize ? 'Reoptimize Delivery' : 'Create Optimized Delivery'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}