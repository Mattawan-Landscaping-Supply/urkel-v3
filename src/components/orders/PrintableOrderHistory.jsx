import React from 'react';
import { Button } from '@/components/ui/button';
import { X, Printer } from 'lucide-react';
import { format } from 'date-fns';

export default function PrintableOrderHistory({ order, items, onClose }) {
  const today = format(new Date(), 'MMM d, yyyy');

  // Build timeline events
  const events = [];

  // 1. Get unique receipt numbers and quote numbers with their earliest item dates
  const receiptMap = {};
  const quoteMap = {};

  items.forEach(item => {
    if (item.receipt_number) {
      const targetMap = item.is_quote ? quoteMap : receiptMap;
      if (!targetMap[item.receipt_number]) {
        targetMap[item.receipt_number] = {
          items: [],
          date: item.date_ordered || item.created_date
        };
      }
      targetMap[item.receipt_number].items.push(item);
      // Use earliest date - prefer date_ordered over created_date
      const itemDate = item.date_ordered || item.created_date;
      if (itemDate < targetMap[item.receipt_number].date) {
        targetMap[item.receipt_number].date = itemDate;
      }
    }
  });

  // Add receipt events
  Object.entries(receiptMap).forEach(([receipt, data]) => {
    // Get master items (status='order') for this receipt to show original quantities
    const masterItems = data.items.filter(i => i.status === 'order');
    const itemDetails = masterItems.map(i => {
      const qty = i.original_quantity || i.quantity;
      return `${qty}x ${i.product_name}${i.selected_color ? ` (${i.selected_color})` : ''}${i.selected_unit ? ` - ${i.selected_unit}` : ''}`;
    }).join(', ');

    // Use earliest created_date from items as timestamp
    const earliestTimestamp = data.items.reduce((min, i) => 
      !min || i.created_date < min ? i.created_date : min, null);
    events.push({
      date: data.date,
      timestamp: earliestTimestamp || data.date,
      type: 'receipt_added',
      title: `Receipt #${receipt} Added`,
      details: itemDetails || 'Items added to order'
    });
  });

  // Add quote events - only show if they're still quotes (not converted)
  Object.entries(quoteMap).forEach(([quote, data]) => {
    // Get master items (status='order') for this quote to show original quantities
    const masterItems = data.items.filter(i => i.status === 'order');
    const itemDetails = masterItems.map(i => {
      const qty = i.original_quantity || i.quantity;
      return `${qty}x ${i.product_name}${i.selected_color ? ` (${i.selected_color})` : ''}${i.selected_unit ? ` - ${i.selected_unit}` : ''}`;
    }).join(', ');

    // Use earliest created_date from items as timestamp
    const earliestTimestamp = data.items.reduce((min, i) => 
      !min || i.created_date < min ? i.created_date : min, null);
    
    // Extract date part from timestamp for display
    const dateOnly = earliestTimestamp ? earliestTimestamp.split('T')[0] : data.date.split('T')[0];
    
    events.push({
      date: dateOnly,
      timestamp: earliestTimestamp || data.date,
      type: 'quote_added',
      title: `Quote #${quote} Added`,
      details: itemDetails || 'Items added to quote'
    });
  });

  // Add quote conversion events
  const conversions = {};
  items.forEach(item => {
    if (item.original_quote_number && !item.is_quote) {
      if (!conversions[item.original_quote_number]) {
        conversions[item.original_quote_number] = {
          newReceipt: item.receipt_number,
          date: item.updated_date,
          timestamp: item.updated_date,
          items: []
        };
      }
      // Use earliest updated_date for the conversion
      if (item.updated_date && item.updated_date < conversions[item.original_quote_number].timestamp) {
        conversions[item.original_quote_number].timestamp = item.updated_date;
        conversions[item.original_quote_number].date = item.updated_date;
      }
      conversions[item.original_quote_number].items.push(item);
    }
  });

  Object.entries(conversions).forEach(([quoteNum, data]) => {
    const itemDetails = data.items.map(i => {
      const qty = i.original_quantity || i.quantity;
      return `${qty}x ${i.product_name}${i.selected_color ? ` (${i.selected_color})` : ''}${i.selected_unit ? ` - ${i.selected_unit}` : ''}`;
    }).join(', ');

    // Extract date part from timestamp
    const dateOnly = data.date ? data.date.split('T')[0] : 'Unknown';
    
    events.push({
      date: dateOnly,
      timestamp: data.timestamp,
      type: 'quote_converted',
      title: `Quote #${quoteNum} Converted → Receipt #${data.newReceipt}`,
      details: itemDetails
    });
  });

  // 2. Items placed On Order (group by date AND PO number)
  const onOrderMap = {};
  items.filter(i => i.date_on_order).forEach(item => {
    // Group by date_on_order AND po_number
    const itemDate = item.date_on_order;
    const dateKey = itemDate ? itemDate.split('T')[0] : 'unknown';
    const poKey = item.po_number || 'no_po';
    const groupKey = `${dateKey}_${poKey}`;
    
    if (!onOrderMap[groupKey]) {
      onOrderMap[groupKey] = { items: [], timestamp: itemDate, date: dateKey, po_number: item.po_number };
    }
    // Use earliest timestamp for the group
    if (itemDate < onOrderMap[groupKey].timestamp) {
      onOrderMap[groupKey].timestamp = itemDate;
    }
    onOrderMap[groupKey].items.push(item);
  });

  Object.entries(onOrderMap).forEach(([groupKey, data]) => {
    // Group items by receipt number
    const byReceipt = {};
    data.items.forEach(i => {
      const receipt = i.receipt_number || '';
      if (!byReceipt[receipt]) byReceipt[receipt] = [];
      byReceipt[receipt].push(i);
    });
    
    const itemDetails = Object.entries(byReceipt).map(([receipt, receiptItems]) => {
      const products = receiptItems.map(i => 
        `${i.quantity}x ${i.product_name}${i.selected_color ? ` (${i.selected_color})` : ''}${i.selected_unit ? ` - ${i.selected_unit}` : ''}`
      ).join(', ');
      return receipt ? `**Receipt #${receipt}** ${products}` : products;
    }).join('; ');

    const title = data.po_number 
      ? `Placed on Order - P.O. #${data.po_number}`
      : 'Placed on Order';

    events.push({
      date: data.date,
      timestamp: data.timestamp,
      type: 'on_order',
      title: title,
      details: itemDetails
    });
  });

  // 3. Items moved to In Hold (by location)
  const arrivalMap = {};
  items.filter(i => i.date_arrived).forEach(item => {
    const arrDate = item.date_arrived;
    const location = item.hold_location || 'In Hold';
    const key = `${arrDate}_${location}`;
    if (!arrivalMap[key]) {
      arrivalMap[key] = { date: arrDate, location: location, items: [], timestamp: item.updated_date || item.created_date };
    }
    arrivalMap[key].items.push(item);
  });

  Object.entries(arrivalMap).forEach(([key, data]) => {
    // Group items by receipt number
    const byReceipt = {};
    data.items.forEach(i => {
      const receipt = i.receipt_number || '';
      if (!byReceipt[receipt]) byReceipt[receipt] = [];
      byReceipt[receipt].push(i);
    });
    
    const itemDetails = Object.entries(byReceipt).map(([receipt, receiptItems]) => {
      const products = receiptItems.map(i => {
        let detail = `${i.quantity}x ${i.product_name}${i.selected_color ? ` (${i.selected_color})` : ''}${i.selected_unit ? ` - ${i.selected_unit}` : ''}`;
        if (i.po_number) detail += ` [PO #${i.po_number}]`;
        return detail;
      }).join(', ');
      return receipt ? `**Receipt #${receipt}** ${products}` : products;
    }).join('; ');

    events.push({
      date: data.date,
      timestamp: data.timestamp,
      type: 'arrived',
      title: `Product moved to ${data.location}`,
      details: itemDetails
    });
  });

  // 4. Direct ships (group by date only)
  const directShipItems = items.filter(i => i.delivery_method === 'direct_ship' && i.status === 'delivered');
  const directShipMap = {};
  directShipItems.forEach(item => {
    const itemDate = item.date_completed || item.created_date;
    const dateKey = itemDate ? itemDate.split('T')[0] : 'unknown';
    
    if (!directShipMap[dateKey]) {
      directShipMap[dateKey] = {
        items: [],
        date: dateKey,
        sales_order_number: null
      };
    }
    // Capture S.O. number if any item has one
    if (item.sales_order_number) {
      directShipMap[dateKey].sales_order_number = item.sales_order_number;
    }
    directShipMap[dateKey].items.push(item);
  });

  Object.entries(directShipMap).forEach(([groupKey, data]) => {
    // Group items by receipt number
    const byReceipt = {};
    data.items.forEach(i => {
      const receipt = i.receipt_number || '';
      if (!byReceipt[receipt]) byReceipt[receipt] = [];
      byReceipt[receipt].push(i);
    });
    
    const itemDetails = Object.entries(byReceipt).map(([receipt, receiptItems]) => {
      const products = receiptItems.map(i => 
        `${i.quantity}x ${i.product_name}${i.selected_color ? ` (${i.selected_color})` : ''}${i.selected_unit ? ` - ${i.selected_unit}` : ''}`
      ).join(', ');
      return receipt ? `**Receipt #${receipt}** ${products}` : products;
    }).join('; ');

    const dsTimestamp = data.items.reduce((max, i) => {
      const ts = i.updated_date || i.created_date;
      return !max || ts > max ? ts : max;
    }, null);
    
    const title = data.sales_order_number 
      ? `Direct Ship - Sales Order #${data.sales_order_number}`
      : 'Direct Ship';
    
    events.push({
      date: data.date,
      timestamp: dsTimestamp || data.date,
      type: 'direct_ship',
      title: title,
      details: itemDetails
    });
  });

  // 5. Returns (split into damaged and regular returns)
  const returnedItems = items.filter(i => i.status === 'returned');
  const returnMap = {};
  returnedItems.forEach(item => {
    const returnDate = item.date_returned || item.updated_date?.split('T')[0] || item.created_date?.split('T')[0];
    const isDamaged = item.is_damaged || false;
    const receiptKey = isDamaged ? 'damaged' : (item.return_receipt_number || 'no_receipt');
    const key = `${returnDate}_${receiptKey}`;
    if (!returnMap[key]) {
      returnMap[key] = {
        date: returnDate,
        returnReceipt: item.return_receipt_number,
        isDamaged: isDamaged,
        items: []
      };
    }
    returnMap[key].items.push(item);
  });

  Object.entries(returnMap).forEach(([key, data]) => {
    const byReceipt = {};
    data.items.forEach(i => {
      const receipt = i.receipt_number || '';
      if (!byReceipt[receipt]) byReceipt[receipt] = [];
      byReceipt[receipt].push(i);
    });
    
    const itemDetails = Object.entries(byReceipt).map(([receipt, receiptItems]) => {
      const products = receiptItems.map(i => 
        `${i.quantity}x ${i.product_name}${i.selected_color ? ` (${i.selected_color})` : ''}${i.selected_unit ? ` - ${i.selected_unit}` : ''}`
      ).join(', ');
      return receipt ? `**Receipt #${receipt}** ${products}` : products;
    }).join('; ');

    const returnTimestamp = data.items.reduce((max, i) => {
      const ts = i.updated_date || i.created_date;
      return !max || ts > max ? ts : max;
    }, null);
    
    let title;
    if (data.isDamaged) {
      title = 'Product Returned - Damaged';
    } else if (data.returnReceipt) {
      title = `Product Returned - Return Receipt #${data.returnReceipt}`;
    } else {
      title = 'Product Returned';
    }
    
    events.push({
      date: data.date,
      timestamp: returnTimestamp || data.date,
      type: 'return',
      title: title,
      details: itemDetails
    });
  });

  // 6. Pickups and Deliveries (separate events for each method, excludes direct_ship)
  // Include items that were completed even if they were later returned
  const completedItems = items.filter(i => 
    (i.status === 'delivered' || (i.status === 'returned' && i.date_completed)) && 
    i.delivery_method !== 'direct_ship'
  );
  const pickupMap = {};
  const deliveryMap = {};
  
  completedItems.forEach(item => {
    // For date, try date_completed first, then extract date from updated_date, then created_date
    let compDate = item.date_completed;
    if (!compDate && item.updated_date) {
      compDate = typeof item.updated_date === 'string' 
        ? item.updated_date.split('T')[0] 
        : new Date(item.updated_date).toISOString().split('T')[0];
    }
    if (!compDate) {
      compDate = typeof item.created_date === 'string'
        ? item.created_date.split('T')[0]
        : new Date(item.created_date).toISOString().split('T')[0];
    }
    
    const method = item.delivery_method || 'pickup';
    const targetMap = method === 'pickup' ? pickupMap : deliveryMap;
    
    if (!targetMap[compDate]) {
      targetMap[compDate] = {
        date: compDate,
        items: []
      };
    }
    targetMap[compDate].items.push(item);
  });

  // Add pickup events
  Object.entries(pickupMap).forEach(([compDate, data]) => {
    const byReceipt = {};
    data.items.forEach(i => {
      const receipt = i.receipt_number || '';
      if (!byReceipt[receipt]) byReceipt[receipt] = [];
      byReceipt[receipt].push(i);
    });
    
    const itemDetails = Object.entries(byReceipt).map(([receipt, receiptItems]) => {
      const products = receiptItems.map(i => 
        `${i.quantity}x ${i.product_name}${i.selected_color ? ` (${i.selected_color})` : ''}${i.selected_unit ? ` - ${i.selected_unit}` : ''}`
      ).join(', ');
      return receipt ? `**Receipt #${receipt}** ${products}` : products;
    }).join('; ');

    const compTimestamp = data.items.reduce((max, i) => {
      const ts = i.updated_date || i.created_date;
      return !max || ts > max ? ts : max;
    }, null);
    
    events.push({
      date: compDate,
      timestamp: compTimestamp || compDate,
      type: 'pickup',
      title: 'Customer Pickup',
      details: itemDetails
    });
  });

  // Add delivery events
  Object.entries(deliveryMap).forEach(([compDate, data]) => {
    const byReceipt = {};
    data.items.forEach(i => {
      const receipt = i.receipt_number || '';
      if (!byReceipt[receipt]) byReceipt[receipt] = [];
      byReceipt[receipt].push(i);
    });
    
    const itemDetails = Object.entries(byReceipt).map(([receipt, receiptItems]) => {
      const products = receiptItems.map(i => 
        `${i.quantity}x ${i.product_name}${i.selected_color ? ` (${i.selected_color})` : ''}${i.selected_unit ? ` - ${i.selected_unit}` : ''}`
      ).join(', ');
      return receipt ? `**Receipt #${receipt}** ${products}` : products;
    }).join('; ');

    const compTimestamp = data.items.reduce((max, i) => {
      const ts = i.updated_date || i.created_date;
      return !max || ts > max ? ts : max;
    }, null);
    
    events.push({
      date: compDate,
      timestamp: compTimestamp || compDate,
      type: 'delivery',
      title: 'Delivered to Customer',
      details: itemDetails
    });
  });

  // Sort events by date (using date field, not timestamp, for consistent day-based sorting)
  events.sort((a, b) => {
    // Extract date part only for consistent sorting
    const getDateOnly = (evt) => {
      let dateStr = evt.date || evt.timestamp || '1970-01-01';
      // Extract just the date part (YYYY-MM-DD)
      if (dateStr.includes('T')) {
        dateStr = dateStr.split('T')[0];
      }
      return dateStr;
    };
    
    const dateA = getDateOnly(a);
    const dateB = getDateOnly(b);
    
    // Compare dates as strings (YYYY-MM-DD format sorts correctly as strings)
    return dateA.localeCompare(dateB);
  });

  // Remove duplicate events (same date, type, and title)
  const uniqueEvents = events.filter((event, index, self) => 
    index === self.findIndex(e => 
      e.date === event.date && e.type === event.type && e.title === event.title
    )
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    try {
      // Handle date-only strings (YYYY-MM-DD) by adding time to avoid timezone shift
      if (dateStr.length === 10 && dateStr.includes('-')) {
        return format(new Date(dateStr + 'T12:00:00'), 'MMM d, yyyy');
      }
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const getEventIcon = (type) => {
    switch(type) {
      case 'receipt_added': return '🧾';
      case 'quote_added': return '📝';
      case 'quote_converted': return '✅';
      case 'on_order': return '📦';
      case 'arrived': return '➡️';
      case 'direct_ship': return '🚛';
      case 'pickup': return '🛒';
      case 'delivery': return '🏠';
      case 'return': return '⮐';
      default: return '•';
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-100 z-50 overflow-auto">
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0.5in;
          }
          html, body {
            width: 8.5in;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-only {
            display: block !important;
          }
        }
        .print-only {
          display: none;
        }
      `}</style>

      {/* Action bar - hidden when printing */}
      <div className="print:hidden fixed top-0 left-0 right-0 bg-white shadow-md p-4 flex justify-between items-center z-10">
        <h2 className="font-semibold text-gray-700">Order History Preview</h2>
        <div className="flex gap-2">
          <Button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-700">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" /> Close
          </Button>
        </div>
      </div>

      {/* Print content */}
      <div className="max-w-[700px] mx-auto mt-20 print:mt-0 mb-8 print:mb-0 bg-white shadow-lg print:shadow-none">
        <div className="p-6 print:p-4">
          {/* Header */}
          <div className="border-b-2 border-gray-800 pb-3 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wide">Order History</h1>
                <div className="mt-2">
                  <p className="text-base font-semibold text-gray-800">{order?.customer_name}</p>
                  {order?.customer_phone && (
                    <p className="text-xs text-gray-600">{order.customer_phone}</p>
                  )}
                  {order?.job_name && (
                    <p className="text-xs text-gray-600"><span className="font-semibold">Job Name:</span> {order.job_name}</p>
                  )}
                  {order?.job_address && (
                    <p className="text-xs text-gray-500"><span className="font-semibold">Job Site Address:</span> {order.job_address}</p>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p className="print-only">Printed: {today}</p>
                {order?.delivery_date && (
                  <p className="mt-1">Target Delivery: {formatDate(order.delivery_date)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-2">
            {uniqueEvents.map((event, index) => (
              <div key={index} className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0">
                <div className="w-20 shrink-0 text-xs text-gray-500 pt-0.5">
                  {formatDate(event.date)}
                </div>
                <div className="w-5 shrink-0 text-center" style={event.type === 'return' ? {color: '#dc2626'} : {}}>
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{event.title}</p>
                  {event.details && (
                    <p className="text-xs text-gray-600 mt-0.5 break-words">
                      {event.details.split('**').map((part, i) => 
                        i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                      )}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {uniqueEvents.length === 0 && (
            <p className="text-center text-gray-500 py-8">No history events found</p>
          )}

          {/* Notes Section */}
          {order?.notes && (
            <div className="mt-6 pt-4 border-t-2 border-gray-300">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-2">Order Notes</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}