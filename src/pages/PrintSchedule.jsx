import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

export default function PrintSchedule() {
  // Read the date ONCE on mount and store it in a ref so it survives print-triggered re-renders
  // (window.print() can cause the browser to briefly clear search params on some browsers)
  const deliveryDateRef = useRef(new URLSearchParams(window.location.search).get('delivery_date'));
  const deliveryDate = deliveryDateRef.current;
  const queryClient = useQueryClient();
  const [missingAddressWarning, setMissingAddressWarning] = useState(null); // { stops: [] }

  const { data: allLoads = [], isLoading: loadsLoading } = useQuery({
    queryKey: ['loads', 'schedule', deliveryDate],
    queryFn: async () => {
      const allLoads = await base44.entities.Load.list('delivery_order', 500);
      // Get all active and delivered loads for this delivery date, sorted by delivery_order ascending
      return allLoads
        .filter(l => l.delivery_date === deliveryDate && (l.status === 'active' || l.status === 'delivered'))
        .sort((a, b) => {
          const orderDiff = (a.delivery_order || 0) - (b.delivery_order || 0);
          if (orderDiff !== 0) return orderDiff;
          // Stable tie-break: use created_date ascending so Load 1 always comes before Load 2
          return new Date(a.created_date) - new Date(b.created_date);
        });
    },
    enabled: !!deliveryDate,
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  const { data: allLoadItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['loadItems', 'schedule', deliveryDate],
    queryFn: async () => {
      const items = await base44.entities.LoadItem.list('-created_date', 500);
      const loadIds = allLoads.map(l => l.id);
      return items.filter(item => loadIds.includes(item.load_id));
    },
    enabled: allLoads.length > 0,
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  // Filter loads to only include those with at least one item with quantity > 0
  // Sort by delivery_order ascending to ensure correct print order
  const loads = allLoads.filter(load => {
    const loadItems = allLoadItems.filter(item => item.load_id === load.id);
    return loadItems.some(item => (item.quantity || 0) > 0);
  }).sort((a, b) => {
    const orderDiff = (a.delivery_order ?? 999) - (b.delivery_order ?? 999);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.created_date) - new Date(b.created_date);
  });

  const { data: allOrderItems = [] } = useQuery({
    queryKey: ['allOrderItems'],
    queryFn: () => base44.entities.OrderItem.list('-created_date', 500),
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  const { data: allOrders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-created_date', 500),
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  const { data: loadCustomerStops = [] } = useQuery({
    queryKey: ['loadCustomerStops'],
    queryFn: () => base44.entities.LoadCustomerStop.list(),
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  const { data: allCustomers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list(),
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  const { data: truckSettings = [] } = useQuery({
    queryKey: ['truckSettings'],
    queryFn: () => base44.entities.TruckSettings.list(),
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  const doPrint = async () => {
    // Fetch current load data to get batch ID
    const currentLoad = allLoads.length > 0 ? allLoads[0] : null;
    const batchId = currentLoad?.schedule_batch_id;

    if (batchId) {
      // If part of a batch, mark ALL loads in that batch as schedule_printed
      const allLoadsData = await base44.entities.Load.list('-created_date', 500);
      const batchLoads = allLoadsData.filter(l => l.schedule_batch_id === batchId);
      await Promise.all(batchLoads.map(l => base44.entities.Load.update(l.id, { schedule_printed: true })));
    } else {
      // No batch ID, mark all loads for this date
      await Promise.all(allLoads.map(l => base44.entities.Load.update(l.id, { schedule_printed: true })));
    }
    
    window.print();
    // Immediately invalidate the today-banner query so the banner re-evaluates
    queryClient.invalidateQueries(['loads', 'today-banner']);
  };

  const handlePrint = () => {
    // Check for missing addresses across all stops
    const missingStops = [];
    loadsWithMetrics.forEach(load => {
      if (load.isConsolidated) {
        load.customerStops.forEach(stop => {
          if (!stop.customer_address) missingStops.push(stop.customer_name || 'Unknown');
        });
      } else {
        // Also fall back to the linked order's job_address
        const linkedOrder = load.order_id ? allOrders.find(o => o.id === load.order_id) : null;
        const effectiveAddress = load.customer_address || linkedOrder?.job_address;
        if (!effectiveAddress) missingStops.push(load.customer_name || 'Unknown');
      }
    });
    if (missingStops.length > 0) {
      setMissingAddressWarning({ stops: missingStops });
    } else {
      doPrint();
    }
  };

  const handleClose = () => {
    window.history.back();
  };

  const getDisplayName = (order) => {
    if (!order) return '';
    if (order.company_name) return order.company_name;
    const customer = order.customer_id ? allCustomers.find(c => c.id === order.customer_id) : null;
    return customer?.company || order.customer_name || '';
  };

  if (loadsLoading || itemsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (loads.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">No loads found for this delivery schedule</p>
      </div>
    );
  }

  // Calculate metrics for each load and identify consolidation
  const loadsWithMetrics = loads.map(load => {
    const loadItems = allLoadItems.filter(item => item.load_id === load.id);
    let totalWeight = 0;
    let totalPallets = 0;

    // Identify unique customers/orders on this load
    const uniqueOrders = {};
    const ownReceiptNumbers = new Set();
    loadItems.forEach(item => {
      const orderItem = item.order_item_id ? allOrderItems.find(oi => oi.id === item.order_item_id) : null;
      if (orderItem?.order_id) {
        const order = allOrders.find(o => o.id === orderItem.order_id);
        if (order && !uniqueOrders[order.id]) {
           const stopRecord = loadCustomerStops.find(s => s.order_id === order.id && s.load_id === load.id);
           uniqueOrders[order.id] = {
             customer_name: getDisplayName(order),
             customer_address: order.job_address,
             job_name: order.job_name || null,
             stop_order: stopRecord?.stop_order ?? 999
           };
         }
        // Only collect receipt numbers belonging to the primary order (non-consolidated)
        if (order?.id === load.order_id && orderItem.receipt_number) {
          ownReceiptNumbers.add(orderItem.receipt_number);
        }
      }
    });

    const customerStops = Object.values(uniqueOrders).sort((a, b) => (a.stop_order ?? 999) - (b.stop_order ?? 999));
    const isConsolidated = customerStops.length > 1;

    loadItems.forEach(loadItem => {
      const product = products.find(p => p.name === loadItem.name);
      const quantity = loadItem.quantity || 1;
      // Product catalog weights are stored in lbs — no conversion needed
      let weightPerUnit = 0;
      if (product) {
        if (loadItem.selected_unit === 'Pallet') {
          weightPerUnit = product.weight_pallet || 0;
        } else if (loadItem.selected_unit === 'Each') {
          weightPerUnit = product.weight_each || 0;
        } else if (loadItem.selected_unit === 'Layer') {
          weightPerUnit = product.weight_layer || 0;
        }
      } else if (loadItem.weight) {
        // Custom item: weight is stored in lbs per unit on LoadItem
        weightPerUnit = loadItem.weight;
      }
      if (weightPerUnit > 0) {
        totalWeight += weightPerUnit * quantity;
      }

      // Calculate pallets
      const itemCountsAsPallet = loadItem.counts_as_pallet !== false && product?.counts_as_pallet !== false;
      if (!itemCountsAsPallet) {
        // Don't count toward pallets
      } else if (loadItem.selected_unit === 'Pallet') {
        // When unit is Pallet, always count quantity directly
        totalPallets += quantity;
      } else {
        // Each/Layer units always count as 1 pallet (use manual override for exceptions)
        totalPallets += 1;
      }
    });

    // Use manual override if set
    const displayPallets = load.manual_pallet_count !== null && load.manual_pallet_count !== undefined 
      ? load.manual_pallet_count 
      : totalPallets;

    // Fall back to the linked order's job_address if load.customer_address is empty
    const linkedOrder = load.order_id ? allOrders.find(o => o.id === load.order_id) : null;
    const effectiveAddress = load.customer_address || linkedOrder?.job_address || '';
    const effectivePhone = load.customer_phone || linkedOrder?.customer_phone || '';

    return {
      ...load,
      customer_address: effectiveAddress,
      customer_phone: effectivePhone,
      items: loadItems,
      totalWeight: totalWeight, // weights are already in lbs (matching LoadDetails)
      totalPallets: displayPallets,
      isConsolidated,
      customerStops,
      ownReceiptNumbers: Array.from(ownReceiptNumbers),
      driver_notes: load.driver_notes,
      driver_instructions: load.driver_instructions
    };
  });

  // Helper to render driver notes at a specific position for a load
  const renderDriverNotes = (load, afterStop) => {
    const notes = (load.driver_notes || []).filter(n => n.after_stop === afterStop);
    // Also migrate legacy driver_instructions into position "after last stop" if no new notes exist
    const legacyNotes = !load.driver_notes?.length && load.driver_instructions && afterStop === 0
      ? [{ text: load.driver_instructions, after_stop: 0 }]
      : [];
    const allNotes = [...legacyNotes, ...notes];
    if (allNotes.length === 0) return null;
    return allNotes.map((note, idx) => (
      <div key={idx} style={{ backgroundColor: '#fed7aa', border: '2px solid #ea580c', borderRadius: '4px', padding: '6px 10px', marginBottom: '6px' }}>
        <p style={{ color: '#000', fontWeight: 'bold', fontSize: '11px', margin: '0 0 2px 0' }}>📋 DRIVER NOTE:</p>
        <p style={{ color: '#000', fontSize: '11px', margin: 0, whiteSpace: 'pre-wrap' }}>{note.text}</p>
      </div>
    ));
  };

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 0.5in 0.75in 0.75in 0.75in;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            margin: 0;
            padding: 0;
            background: white !important;
          }
          html, body {
            overflow: hidden;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-before: always;
          }
          /* Hide scrollbar in print */
          ::-webkit-scrollbar {
            display: none;
          }
          * {
            scrollbar-width: none;
          }
          .drop-notes-box {
            background-color: #fef08a !important;
            border: 2px solid #ca8a04 !important;
            color: #000 !important;
            display: block !important;
            padding: 8px 12px !important;
            margin-bottom: 8px !important;
            border-radius: 4px !important;
          }
          .drop-notes-box p {
            color: #000 !important;
            font-weight: bold !important;
            font-size: 14px !important;
          }
        }
        /* Hide scrollbar on screen too */
        ::-webkit-scrollbar {
          display: none;
        }
        * {
          scrollbar-width: none;
        }
      `}</style>

      {/* Missing Address Warning Dialog */}
      <Dialog open={!!missingAddressWarning} onOpenChange={() => setMissingAddressWarning(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" /> Missing Address
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 mt-2">
                <p>The following stops are missing a delivery address:</p>
                <ul className="list-disc list-inside text-sm font-semibold text-gray-800">
                  {missingAddressWarning?.stops.map((name, i) => <li key={i}>{name}</li>)}
                </ul>
                <p className="text-sm text-gray-600">You may want to add the address before printing, or print anyway.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMissingAddressWarning(null)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => { setMissingAddressWarning(null); doPrint(); }}>
              Print Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Bar - Hidden when printing */}
      <div className="no-print fixed top-16 right-4 flex gap-4 z-50">
        <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700">
          Print Delivery Schedule
        </Button>
        <Button onClick={handleClose} variant="outline">
          <X className="w-4 h-4 mr-2" /> Close
        </Button>
      </div>

      {/* Printable Content */}
      <div className="max-w-5xl mx-auto p-4">
        {/* Header */}
        <div className="mb-4 pb-2 border-b border-gray-400">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Delivery Schedule</h1>
              <p className="text-xs text-gray-600">{format(new Date(), 'MMMM d, yyyy')}</p>
            </div>
            <p className="text-sm text-gray-600">{loads.length} Stops</p>
          </div>
        </div>

        {/* Delivery Stops */}
        {loadsWithMetrics.map((load, index) => (
          <div key={load.id} className="mb-3 pb-3 border-b border-gray-300">
            {/* Driver notes BEFORE this stop (after_stop = 0 means before stop 1) */}
            {renderDriverNotes(load, 0)}

            {/* Stop Header */}
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-start gap-2">
                <span className="text-2xl font-bold text-gray-900 min-w-[32px]">{index + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-gray-900">
                      {load.isConsolidated 
                        ? `Consolidated - ${load.customerStops.length} Stops`
                        : load.company_name || load.customer_name
                      }
                    </h2>


                  </div>
                  {(() => {
                    const truckSetting = truckSettings.find(ts => ts.id === load.truck_setting_id);
                    return (
                      <p className="text-xs text-gray-600">🚛 {truckSetting ? truckSetting.name : (load.truck_setting_id ? 'Loading...' : 'No truck setting')}</p>
                    );
                  })()}
                  {(load.job_name || load.customerStops?.[0]?.job_name) && (
                    <p className="text-xs font-semibold text-indigo-700">Job Name: {load.job_name || load.customerStops?.[0]?.job_name}</p>
                  )}
                  <p className="text-xs text-gray-700">{load.customer_address}</p>
                  {load.customer_phone && (
                    <p className="text-xs text-gray-600">{load.customer_phone}</p>
                  )}
                  
                  {/* Show all customer stops if consolidated */}
                  {load.isConsolidated && (
                    <div className="mt-2 p-2 bg-gray-100 rounded border border-gray-300">
                      <p className="text-xs font-semibold text-gray-700 mb-1">Delivery Stops:</p>
                      {load.customerStops.map((stop, stopIdx) => (
                        <div key={stopIdx} className="text-xs text-gray-900 ml-2">
                          {stopIdx + 1}. {stop.customer_name}{stop.job_name ? ` — Job Name: ${stop.job_name}` : ''} - {stop.customer_address}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-sm font-bold text-gray-900">{load.totalPallets} Pallets</p>
            </div>

            {/* Drop Instructions */}
            {load.drop_location_notes && (
              <div className="mb-2 pl-8" style={{ marginBottom: '8px', paddingLeft: '2rem' }}>
                <div style={{ backgroundColor: '#fef08a', border: '1px solid #ca8a04', borderRadius: '4px', padding: '4px 8px', display: 'block' }}>
                  <p style={{ color: '#000', fontWeight: 'bold', fontSize: '11px', margin: 0 }}>📍 DROP NOTES: {load.drop_location_notes}</p>
                </div>
              </div>
            )}

            {/* Products - Group by customer if consolidated */}
            <div className="pl-8">
              {load.isConsolidated ? (
                // Consolidated load - show products grouped by customer stop
                <div className="space-y-3">
                  {load.customerStops.map((stop, stopIdx) => {
                    // Find items for this customer
                    const stopItems = load.items.filter(item => {
                      const orderItem = item.order_item_id ? allOrderItems.find(oi => oi.id === item.order_item_id) : null;
                      const itemOrder = orderItem?.order_id ? allOrders.find(o => o.id === orderItem.order_id) : null;
                      return itemOrder?.customer_name === stop.customer_name;
                    });

                    if (stopItems.length === 0) return null;

                    // Calculate weight for this stop
                      let stopWeight = 0;
                      stopItems.forEach(item => {
                        const product = products.find(p => p.name === item.name);
                        let itemWeight = 0;
                        if (product) {
                          if (item.selected_unit === 'Pallet') {
                            itemWeight = product.weight_pallet || 0;
                          } else if (item.selected_unit === 'Each') {
                            itemWeight = product.weight_each || 0;
                          } else if (item.selected_unit === 'Layer') {
                            itemWeight = product.weight_layer || 0;
                          }
                        } else if (item.weight) {
                          itemWeight = item.weight;
                        }
                        stopWeight += itemWeight * (item.quantity || 1);
                      });

                    return (
                      <React.Fragment key={stopIdx}>
                      <div className="border-2 border-indigo-300 rounded p-2 bg-indigo-50">
                        <div className="font-bold text-sm text-indigo-900 mb-1">
                          Stop {stopIdx + 1}: {stop.customer_name}
                        </div>
                        <div className="text-xs text-indigo-800 mb-2">{stop.customer_address}</div>
                        
                        <table className="w-full text-sm bg-white rounded">
                          <thead>
                            <tr className="border-b border-gray-300">
                              <th className="text-left py-1 px-2 font-semibold text-gray-700">Qty</th>
                              <th className="text-left py-1 px-2 font-semibold text-gray-700">Product</th>
                              <th className="text-left py-1 px-2 font-semibold text-gray-700">Color</th>
                              <th className="text-left py-1 px-2 font-semibold text-gray-700">Location</th>
                              <th className="text-left py-1 px-2 font-semibold text-gray-700">Receipt #</th>
                              <th className="text-right py-1 px-2 font-semibold text-gray-700">Weight</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const merged = {};
                              stopItems.forEach(item => {
                                const key = `${item.name}||${item.selected_color || ''}||${item.selected_unit || ''}`;
                                if (!merged[key]) {
                                  merged[key] = { ...item, quantity: 0 };
                                }
                                merged[key].quantity += item.quantity || 1;
                              });
                              return Object.values(merged).map((item, idx) => {
                                const product = products.find(p => p.name === item.name);
                                let itemWeight = 0;
                                if (product) {
                                  if (item.selected_unit === 'Pallet') {
                                    itemWeight = product.weight_pallet || 0;
                                  } else if (item.selected_unit === 'Each') {
                                    itemWeight = product.weight_each || 0;
                                  } else if (item.selected_unit === 'Layer') {
                                    itemWeight = product.weight_layer || 0;
                                  }
                                } else if (item.weight) {
                                  itemWeight = item.weight;
                                }
                                 const totalWeight = itemWeight * item.quantity;
                                const orderItem = item.order_item_id ? allOrderItems.find(oi => oi.id === item.order_item_id) : null;

                                return (
                                  <tr key={idx} className="border-b border-gray-100 last:border-b-0">
                                    <td className="py-1 px-2 font-semibold">
                                      {item.quantity} {item.selected_unit || 'Each'}
                                    </td>
                                    <td className="py-1 px-2">{item.name}</td>
                                    <td className="py-1 px-2 text-gray-600">{item.selected_color || 'N/A'}</td>
                                    <td className="py-1 px-2 text-gray-600">{item.original_hold_location || '—'}</td>
                                    <td className="py-1 px-2 text-gray-600">
                                      {orderItem?.receipt_number ? `#${orderItem.receipt_number}` : 'N/A'}
                                    </td>
                                    <td className="py-1 px-2 text-right font-semibold">
                                      {totalWeight.toFixed(0)} lbs
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-indigo-400">
                              <td className="py-1 px-2 font-bold" colSpan="5">Stop Total</td>
                              <td className="py-1 px-2 text-right font-bold">
                                {stopWeight.toFixed(0)} lbs
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      {/* Driver notes after this sub-stop (stopIdx+1 = after stop 1, etc.) */}
                      {renderDriverNotes(load, stopIdx + 1)}
                      </React.Fragment>
                    );
                  })}
                  
                  {/* Overall total for consolidated load */}
                  <div className="border-t-2 border-gray-400 pt-2">
                    <div className="flex justify-between items-center font-bold">
                      <span>TOTAL LOAD WEIGHT</span>
                      <span>{load.totalWeight.toLocaleString('en-US', { maximumFractionDigits: 0 })} lbs</span>
                    </div>
                  </div>
                </div>
              ) : (
                // Single customer load - show regular table
                <React.Fragment>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="text-left py-1 font-semibold text-gray-700">Qty</th>
                      <th className="text-left py-1 font-semibold text-gray-700">Product</th>
                      <th className="text-left py-1 font-semibold text-gray-700">Color</th>
                      <th className="text-left py-1 font-semibold text-gray-700">Location</th>
                      <th className="text-left py-1 font-semibold text-gray-700">Receipt #</th>
                      <th className="text-right py-1 font-semibold text-gray-700">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const merged = {};
                      load.items.forEach(item => {
                        const key = `${item.name}||${item.selected_color || ''}||${item.selected_unit || ''}`;
                        if (!merged[key]) {
                          merged[key] = { ...item, quantity: 0 };
                        }
                        merged[key].quantity += item.quantity || 1;
                      });
                      return Object.values(merged).map((item, idx) => {
                        const product = products.find(p => p.name === item.name);
                        let itemWeight = 0;
                        if (product) {
                          if (item.selected_unit === 'Pallet') {
                            itemWeight = product.weight_pallet || 0;
                          } else if (item.selected_unit === 'Each') {
                            itemWeight = product.weight_each || 0;
                          } else if (item.selected_unit === 'Layer') {
                            itemWeight = product.weight_layer || 0;
                          }
                        } else if (item.weight) {
                          itemWeight = item.weight;
                        }
                        const totalWeight = itemWeight * item.quantity;
                        const orderItem = item.order_item_id ? allOrderItems.find(oi => oi.id === item.order_item_id) : null;

                        return (
                          <tr key={idx}>
                            <td className="py-1 font-semibold">
                              {item.quantity} {item.selected_unit || 'Each'}
                            </td>
                            <td className="py-1">{item.name}</td>
                            <td className="py-1 text-gray-600">{item.selected_color || 'N/A'}</td>
                            <td className="py-1 text-gray-600">{item.original_hold_location || '—'}</td>
                            <td className="py-1 text-gray-600">
                              {orderItem?.receipt_number ? `#${orderItem.receipt_number}` : 'N/A'}
                            </td>
                            <td className="py-1 text-right font-semibold">
                              {totalWeight.toFixed(0)} lbs
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-400">
                      <td className="py-1 font-bold" colSpan="5">Total Weight</td>
                      <td className="py-1 text-right font-bold">
                        {load.totalWeight.toLocaleString('en-US', { maximumFractionDigits: 0 })} lbs
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {/* Driver notes after single stop */}
                {renderDriverNotes(load, 1)}
                </React.Fragment>
              )}
            </div>

            {/* Remove the old single driver_instructions block - now handled above */}
          </div>
        ))}
      </div>
    </div>
  );
}