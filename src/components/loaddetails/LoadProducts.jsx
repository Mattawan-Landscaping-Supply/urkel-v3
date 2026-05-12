import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Package } from 'lucide-react';

export default function LoadProducts({
  load, loadItems, allOrderItems, allOrders, products,
  availableItems, availableQuantities, setAvailableQuantities,
  addToLoadMutation, removeFromLoadMutation,
  handleAddToLoad, setIsCatalogOpen,
  consolidatedLoadInfo, loadMetrics, loadCustomerStops = [],
}) {
  const stopColors = [
    { bg: 'bg-indigo-50', border: 'border-indigo-300', header: 'bg-indigo-100', badge: 'bg-indigo-200 text-indigo-800', dot: 'bg-indigo-500' },
    { bg: 'bg-emerald-50', border: 'border-emerald-300', header: 'bg-emerald-100', badge: 'bg-emerald-200 text-emerald-800', dot: 'bg-emerald-500' },
    { bg: 'bg-amber-50', border: 'border-amber-300', header: 'bg-amber-100', badge: 'bg-amber-200 text-amber-800', dot: 'bg-amber-500' },
    { bg: 'bg-rose-50', border: 'border-rose-300', header: 'bg-rose-100', badge: 'bg-rose-200 text-rose-800', dot: 'bg-rose-500' },
    { bg: 'bg-violet-50', border: 'border-violet-300', header: 'bg-violet-100', badge: 'bg-violet-200 text-violet-800', dot: 'bg-violet-500' },
  ];

  // Build a map from order_id → stop color index (matches the "Items on Load" card)
  const orderColorMap = {};
  if (consolidatedLoadInfo) {
    consolidatedLoadInfo.forEach((stop, idx) => {
      if (stop.orderId) orderColorMap[stop.orderId] = idx % stopColors.length;
    });
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mx-6 mb-6 mt-6">
      {/* Items on Load */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" />
              Items on Load ({loadItems.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadItems.length === 0 ? (
            <div className="text-center py-12 text-gray-500 px-4">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No items on this load yet</p>
            </div>
          ) : (
            (() => {
              // Group items by order/customer


              // Build groups keyed by order_id — resolve "standalone" items via stop records
              const loadStops = loadCustomerStops; // stops for this load
              const primaryStopOrderId = loadStops.length > 0
                ? loadStops.sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0))[0].order_id
                : (load?.order_id || null);

              const groups = {};
              loadItems.forEach(item => {
                const orderItem = item.order_item_id ? allOrderItems.find(oi => oi.id === item.order_item_id) : null;
                const order = orderItem?.order_id ? allOrders.find(o => o.id === orderItem.order_id) : null;

                let resolvedOrderId = order?.id || null;
                let resolvedOrder = order;

                if (!resolvedOrderId) {
                  // Try to resolve via LoadCustomerStops — match by customer name on the load
                  // If only one stop exists, use that; otherwise fall back to primary stop
                  if (loadStops.length === 1) {
                    resolvedOrderId = loadStops[0].order_id;
                    resolvedOrder = allOrders.find(o => o.id === resolvedOrderId) || null;
                  } else if (primaryStopOrderId) {
                    resolvedOrderId = primaryStopOrderId;
                    resolvedOrder = allOrders.find(o => o.id === resolvedOrderId) || null;
                  }
                }

                const key = resolvedOrderId || 'primary';
                if (!groups[key]) {
                  groups[key] = { order: resolvedOrder, items: [] };
                }
                groups[key].items.push({ item, orderItem });
              });

              const groupEntries = Object.entries(groups);
              const isMultiStop = groupEntries.length > 1;

              return (
                <div className={isMultiStop ? 'space-y-2 p-3' : 'divide-y divide-gray-100'}>
                  {groupEntries.map(([key, { order, items }], groupIdx) => {
                    // Use the same color index as the Add Items card (from consolidatedLoadInfo)
                    const colorIdx = (consolidatedLoadInfo && order?.id)
                      ? (orderColorMap[order.id] ?? groupIdx)
                      : groupIdx;
                    const colors = stopColors[colorIdx % stopColors.length];

                    if (!isMultiStop) {
                      // Single stop - merge identical items
                      const grouped = {};
                      items.forEach(({ item, orderItem }) => {
                        const key = `${item.name}||${item.selected_color || ''}||${item.selected_unit || 'Pallet'}`;
                        if (!grouped[key]) {
                          grouped[key] = { item, orderItem, quantity: 0, items: [] };
                        }
                        grouped[key].quantity += item.quantity || 1;
                        grouped[key].items.push(item);
                      });

                      return Object.values(grouped).map(({ item, orderItem, quantity, items: groupedItems }) => {
                        return (
                          <div key={item.id} className="flex items-center justify-between px-4 py-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{item.name}</span>
                                {item.selected_color && <span className="text-xs text-gray-500">({item.selected_color})</span>}
                                <Badge className="text-xs bg-gray-100 text-gray-700 pointer-events-none">{quantity} {item.selected_unit || 'Pallet'}</Badge>
                              </div>
                              {order && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {order.customer_name}{orderItem?.receipt_number && ` · #${orderItem.receipt_number}`}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 ml-2">
                              <button
                                onClick={() => { const scrollY = window.scrollY; removeFromLoadMutation.mutate({ loadItem: groupedItems[groupedItems.length - 1], _scrollY: scrollY }); }}
                                disabled={removeFromLoadMutation.isPending}
                                className="px-2 py-1 text-xs font-semibold bg-gray-100 hover:bg-red-100 hover:text-red-700 disabled:opacity-50 rounded border border-gray-300 h-7"
                                title="Remove 1"
                              >−</button>
                              <span className="text-xs font-semibold text-gray-700 w-6 text-center">{quantity}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => { const scrollY = window.scrollY; groupedItems.forEach(li => removeFromLoadMutation.mutate({ loadItem: li, _scrollY: scrollY })); }} disabled={removeFromLoadMutation.isPending}
                                title="Remove all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      });
                    }

                    // Multi-stop: color-coded card per customer
                    const receiptNumbers = [...new Set(items.map(({ orderItem }) => orderItem?.receipt_number).filter(Boolean))];
                    return (
                      <div key={key} className={`rounded-lg border-2 ${colors.border} ${colors.bg} overflow-hidden`}>
                        {/* Customer header */}
                        <div className={`${colors.header} px-3 py-2 flex items-center gap-2`}>
                          <div className={`w-2.5 h-2.5 rounded-full ${colors.dot} shrink-0`} />
                          <span className="font-bold text-sm text-gray-900">
                            Stop {groupIdx + 1}: {order?.customer_name || load?.customer_name || 'Unknown'}
                          </span>
                          {receiptNumbers.length > 0 && (
                            <span className="text-xs text-gray-600 ml-auto">Receipt #{receiptNumbers.join(', #')}</span>
                          )}
                        </div>
                        {/* Items - merge identical items */}
                         <div className="divide-y divide-gray-200">
                           {(() => {
                             const grouped = {};
                             items.forEach(({ item, orderItem }) => {
                               const key = `${item.name}||${item.selected_color || ''}||${item.selected_unit || 'Pallet'}`;
                               if (!grouped[key]) {
                                 grouped[key] = { item, orderItem, quantity: 0, items: [] };
                               }
                               grouped[key].quantity += item.quantity || 1;
                               grouped[key].items.push(item);
                             });

                             return Object.values(grouped).map(({ item, orderItem, quantity, items: groupedItems }) => (
                               <div key={item.id} className="flex items-center justify-between px-3 py-2.5">
                                 <div className="flex-1">
                                   <div className="flex items-center gap-2 flex-wrap">
                                     <span className="font-medium text-sm">{item.name}</span>
                                     {item.selected_color && <span className="text-xs text-gray-500">({item.selected_color})</span>}
                                     <Badge className={`text-xs ${colors.badge} pointer-events-none`}>{quantity} {item.selected_unit || 'Pallet'}</Badge>
                                   </div>
                                 </div>
                                 <div className="flex items-center gap-1 ml-2">
                                   <button
                                     onClick={() => { const scrollY = window.scrollY; removeFromLoadMutation.mutate({ loadItem: groupedItems[groupedItems.length - 1], _scrollY: scrollY }); }}
                                     disabled={removeFromLoadMutation.isPending}
                                     className="px-2 py-1 text-xs font-semibold bg-gray-100 hover:bg-red-100 hover:text-red-700 disabled:opacity-50 rounded border border-gray-300 h-7"
                                     title="Remove 1"
                                   >−</button>
                                   <span className="text-xs font-semibold text-gray-700 w-6 text-center">{quantity}</span>
                                   <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                     onClick={() => { const scrollY = window.scrollY; groupedItems.forEach(li => removeFromLoadMutation.mutate({ loadItem: li, _scrollY: scrollY })); }} disabled={removeFromLoadMutation.isPending}
                                     title="Remove all">
                                     <Trash2 className="w-3.5 h-3.5" />
                                   </Button>
                                 </div>
                               </div>
                             ));
                           })()}
                         </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* Available Items to Add */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Items
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {availableItems.length === 0 ? (
           <div className="text-center py-12 text-gray-500 px-4">
             <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
             <p className="text-sm font-medium">All available items are already on this load</p>
             <p className="text-xs text-gray-400 mt-1">All in-hold items have been added</p>
           </div>
          ) : (
           (() => {
             // Group items by order_id first, then by product+color+unit within each order
             const orderGroups = {};
             availableItems.forEach(item => {
               const orderId = item.order_id || 'standalone';
               if (!orderGroups[orderId]) orderGroups[orderId] = [];
               orderGroups[orderId].push(item);
             });

             const isMultiOrder = Object.keys(orderGroups).length > 1;
             // Use color coding if any order has a color in the map (consolidated load)
             const hasColorMap = Object.keys(orderGroups).some(id => orderColorMap[id] !== undefined);

             return (
               <div className={isMultiOrder ? 'space-y-2 p-3' : 'divide-y divide-gray-100'}>
                 {Object.entries(orderGroups).map(([orderId, items]) => {
                   const order = allOrders.find(o => o.id === orderId);
                   const colorIdx = orderColorMap[orderId] ?? 0;
                   const colors = stopColors[colorIdx];
                   const stopIdx = consolidatedLoadInfo ? consolidatedLoadInfo.findIndex(s => s.orderId === orderId) : -1;

                   // Group items within this order by product+color+unit
                   const grouped = {};
                   items.forEach(item => {
                     const key = `${item.product_name}||${item.selected_color || ''}||${item.selected_unit || 'Pallet'}`;
                     if (!grouped[key]) grouped[key] = { ...item, quantity: 0, _itemIds: [] };
                     grouped[key].quantity += item.quantity || 0;
                     grouped[key]._itemIds.push(item.id);
                   });

                   const itemRows = Object.values(grouped).map(displayItem => {
                     const customQty = availableQuantities[displayItem.id];
                     const firstItem = availableItems.find(i => i.id === displayItem._itemIds[0]);
                     const isKeepTogether = firstItem?.keep_on_same_load === true;
                     // Default to full available quantity; locked items always use full qty
                     const effectiveQty = customQty !== undefined ? customQty : displayItem.quantity.toString();
                     const displayQty = isKeepTogether ? displayItem.quantity : effectiveQty;
                     return (
                       <div key={displayItem.id} className="flex items-center justify-between px-3 py-2.5">
                         <div className="flex-1">
                           <div className="flex items-center gap-2 flex-wrap">
                             <span className="font-medium text-sm">{displayItem.product_name}</span>
                             {displayItem.selected_color && (
                               <span className="text-xs text-gray-500">({displayItem.selected_color})</span>
                             )}
                             {isKeepTogether && (
                               <Badge className="text-xs bg-orange-100 text-orange-700 pointer-events-none">Locked</Badge>
                             )}

                           </div>
                           <div className="text-xs text-gray-400 mt-0.5">
                             {(() => {
                               const product = products.find(p => p.name === displayItem.product_name);
                               const unit = displayItem.selected_unit;
                               let weightPerUnit = 0;
                               if (product) {
                                 if (unit === 'Pallet') weightPerUnit = product.weight_pallet || 0;
                                 else if (unit === 'Each') weightPerUnit = product.weight_each || 0;
                                 else if (unit === 'Layer') weightPerUnit = product.weight_layer || 0;
                                 else weightPerUnit = product.weight_each || 0;
                               }
                               return (
                                 <>
                                   Available: {displayItem.quantity} {unit}
                                   {weightPerUnit > 0 && (
                                     <span className="ml-2 text-gray-400">· {weightPerUnit.toLocaleString()} lbs/{unit?.toLowerCase()}</span>
                                   )}
                                 </>
                               );
                             })()}
                           </div>
                           {!isKeepTogether && (
                             <div className="flex items-center gap-1 mt-1.5">
                               <button
                                 onClick={() => {
                                   const current = parseInt(effectiveQty) || displayItem.quantity;
                                   if (current > 1) setAvailableQuantities(prev => ({ ...prev, [displayItem.id]: (current - 1).toString() }));
                                 }}
                                 className="px-2 py-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 h-7"
                               >
                                 −
                               </button>
                               <Input
                                 type="number"
                                 min="1"
                                 max={displayItem.quantity}
                                 value={effectiveQty}
                                 onChange={e => {
                                   const val = e.target.value;
                                   if (val === '' || (parseInt(val) >= 1 && parseInt(val) <= displayItem.quantity)) {
                                     setAvailableQuantities(prev => ({ ...prev, [displayItem.id]: val }));
                                   }
                                 }}
                                 className="h-7 text-xs w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                               />
                               <button
                                 onClick={() => {
                                   const current = parseInt(effectiveQty) || displayItem.quantity;
                                   if (current < displayItem.quantity) setAvailableQuantities(prev => ({ ...prev, [displayItem.id]: (current + 1).toString() }));
                                 }}
                                 className="px-2 py-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 h-7"
                               >
                                 +
                               </button>
                             </div>
                           )}
                           {isKeepTogether && (
                             <div className="mt-1.5 text-xs font-semibold text-gray-700">
                               Qty: {displayItem.quantity}
                             </div>
                           )}
                         </div>
                         <Button
                           size="sm"
                           className="ml-2 bg-indigo-600 hover:bg-indigo-700 text-xs px-3"
                           onClick={() => {
                             const qty = parseInt(effectiveQty) || displayItem.quantity;
                             const firstItem = availableItems.find(i => i.id === displayItem._itemIds[0]);
                             if (!firstItem) return;

                             // Calculate weight of the full requested qty
                             const product = products.find(p => p.name === firstItem.product_name);
                             let weightPerUnit = 0;
                             if (product) {
                               if (firstItem.selected_unit === 'Pallet') weightPerUnit = product.weight_pallet || 0;
                               else if (firstItem.selected_unit === 'Each') weightPerUnit = product.weight_each || 0;
                               else if (firstItem.selected_unit === 'Layer') weightPerUnit = product.weight_layer || 0;
                               else weightPerUnit = product.weight_each || 0;
                             }
                             const totalAddWeight = weightPerUnit * qty;
                             const truckCapacity = loadMetrics?.maxWeight || Infinity;

                             console.log('weight check:', {
                               currentWeight: loadMetrics?.totalWeight,
                               addingWeight: totalAddWeight,
                               capacity: truckCapacity,
                               wouldExceed: (loadMetrics?.totalWeight || 0) + totalAddWeight > truckCapacity
                             });

                             // Build the split dispatch list (respects each sibling's own qty cap)
                             const dispatchList = [];
                             let remaining = qty;
                             displayItem._itemIds.forEach(itemId => {
                               if (remaining <= 0) return;
                               const item = availableItems.find(i => i.id === itemId);
                               if (item) {
                                 const toAdd = Math.min(remaining, item.quantity || 0);
                                 if (toAdd > 0) { dispatchList.push({ item, qty: toAdd }); remaining -= toAdd; }
                               }
                             });

                             if ((loadMetrics?.totalWeight || 0) + totalAddWeight > truckCapacity) {
                               // Trip the capacity warning — attach the dispatch list so confirm knows how to split
                               const syntheticItem = { ...firstItem, quantity: qty, _dispatchList: dispatchList };
                               handleAddToLoad(syntheticItem, qty);
                               return;
                             }

                             // Safe — dispatch splits normally
                             dispatchList.forEach(({ item, qty: toAdd }) => {
                               handleAddToLoad(item, toAdd);
                             });
                             setAvailableQuantities(prev => { const next = { ...prev }; delete next[displayItem.id]; return next; });
                           }}
                           disabled={false}
                           >
                           <Plus className="w-3.5 h-3.5" /> Add
                           </Button>
                       </div>
                     );
                   });

                   if (!isMultiOrder) {
                     return <div key={orderId} className="divide-y divide-gray-100">{itemRows}</div>;
                   }

                   return (
                     <div key={orderId} className={`rounded-lg border-2 ${colors.border} ${colors.bg} overflow-hidden`}>
                       <div className={`${colors.header} px-3 py-2 flex items-center gap-2`}>
                         <div className={`w-2.5 h-2.5 rounded-full ${colors.dot} shrink-0`} />
                         <span className="font-bold text-sm text-gray-900">
                           {stopIdx >= 0 ? `Stop ${stopIdx + 1}: ` : ''}{order?.customer_name || 'Standalone'}
                         </span>
                       </div>
                       <div className="divide-y divide-gray-200">{itemRows}</div>
                     </div>
                   );
                 })}
               </div>
             );
           })()
          )}
        </CardContent>
      </Card>
    </div>
  );
}