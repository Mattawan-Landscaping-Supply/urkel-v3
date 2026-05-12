import React from 'react';
import { GripVertical } from 'lucide-react';

export function SortableStopItem({ order, idx }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-white border-2 border-gray-200 rounded">
      <GripVertical className="w-5 h-5 text-gray-400 cursor-grab active:cursor-grabbing" />
      <div className="flex-1">
        <div className="font-semibold text-gray-900">Stop {idx + 1}: {order.customer_name}</div>
        {order.receipt_numbers.length > 0 && <div className="text-xs text-gray-600">Receipt: #{order.receipt_numbers.join(', ')}</div>}
      </div>
    </div>
  );
}

export function SortableLoadItem({ load, idx, isActive, onNavigate, allLoadItems, allOrderItems, allOrders, allLoadCustomerStops, allCustomers = [] }) {
  const loadItemsForThisLoad = allLoadItems.filter(item => item.load_id === load.id);
  const uniqueOrders = {};
  let hasOrderBasedItems = false;

  loadItemsForThisLoad.forEach(item => {
    const orderItem = item.order_item_id ? allOrderItems.find(oi => oi.id === item.order_item_id) : null;
    if (orderItem?.order_id) {
      hasOrderBasedItems = true;
      const order = allOrders.find(o => o.id === orderItem.order_id);
      if (order) {
        if (!uniqueOrders[order.id]) {
          const stopRecord = allLoadCustomerStops.find(s => s.order_id === order.id && s.load_id === load.id);
          let displayName = order.customer_name;
          if (order.customer_id) {
            const customer = allCustomers.find(c => c.id === order.customer_id);
            displayName = customer?.company || order.customer_name;
          }
          uniqueOrders[order.id] = {
            customer_name: displayName,
            receipt_numbers: new Set(),
            stop_order: stopRecord?.stop_order ?? 999
          };
        }
        if (orderItem.receipt_number) {
          uniqueOrders[order.id].receipt_numbers.add(orderItem.receipt_number);
        }
      }
    }
  });

  let ordersArray;

  // First, check if there are any LoadCustomerStop records for this load
  const loadsCustomerStopsForThisLoad = allLoadCustomerStops.filter(s => s.load_id === load.id);

  if (loadsCustomerStopsForThisLoad.length > 0) {
    // Use LoadCustomerStop records as the source of truth
    // Deduplicate by orderId — two stop records for the same order should merge
    const seenOrderIds = new Set();
    const deduped = loadsCustomerStopsForThisLoad.filter(stop => {
      if (seenOrderIds.has(stop.order_id)) return false;
      seenOrderIds.add(stop.order_id);
      return true;
    });

    ordersArray = deduped
      .map(stop => {
        // Extract receipts from LoadItems on THIS load that match this stop's order
        const receipts = new Set();
        loadItemsForThisLoad.forEach(loadItem => {
          const orderItem = loadItem.order_item_id ? allOrderItems.find(oi => oi.id === loadItem.order_item_id) : null;
          if (orderItem?.order_id === stop.order_id && orderItem?.receipt_number) {
            receipts.add(orderItem.receipt_number);
          }
        });
        
        // Display company name if available, otherwise customer name
        const order = allOrders.find(o => o.id === stop.order_id);
        let displayName = stop.customer_name;
        if (order?.customer_id) {
          const customer = allCustomers.find(c => c.id === order.customer_id);
          displayName = customer?.company || stop.customer_name;
        }
        
        return {
          orderId: stop.order_id,
          customer_name: displayName,
          receipt_numbers: Array.from(receipts),
          stop_order: stop.stop_order ?? 999
        };
      })
      .sort((a, b) => (a.stop_order ?? 999) - (b.stop_order ?? 999));
  } else if (Object.keys(uniqueOrders).length > 0) {
    // Fall back to order-based items if no LoadCustomerStop records exist
    ordersArray = Object.entries(uniqueOrders).map(([orderId, data]) => ({
      orderId,
      customer_name: data.customer_name,
      receipt_numbers: data.receipt_numbers.size > 0
        ? Array.from(data.receipt_numbers)
        : (load.receipt_numbers || []),
      stop_order: data.stop_order
    }));
    ordersArray.sort((a, b) => (a.stop_order ?? 999) - (b.stop_order ?? 999));
  } else {
    // Final fallback: use load.company_name || load.customer_name
    ordersArray = [{
      orderId: null,
      customer_name: load.company_name || load.customer_name,
      receipt_numbers: load.receipt_numbers || [],
      stop_order: 0
    }];
  }

  const primaryName = load.company_name || load.customer_name;

  return (
    <div
      className={`text-xs p-2 rounded flex items-center gap-2 ${
        isActive
          ? 'bg-indigo-600 text-white font-bold shadow-lg'
          : 'text-gray-700 hover:bg-indigo-100 hover:shadow'
      }`}
    >
      <GripVertical className={`w-4 h-4 flex-shrink-0 cursor-grab active:cursor-grabbing ${isActive ? 'text-white' : 'text-gray-400'}`} />
      <div onClick={onNavigate} className="flex-1 cursor-pointer">
        {ordersArray.map((order, orderIdx) => {
          // Skip secondary stops that have the same name as the primary — no point showing duplicates
          if (orderIdx > 0 && order.customer_name === primaryName) return null;
          return (
            <div key={order.orderId || orderIdx} className={orderIdx === 0 ? 'font-bold' : 'text-xs opacity-90 mt-0.5'}>
              {orderIdx === 0 ? `Load #${idx + 1} - ${primaryName}` : `+ ${order.customer_name}`}
            </div>
          );
        })}
      </div>
    </div>
  );
}
