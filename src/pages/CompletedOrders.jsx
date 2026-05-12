import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Search, ArrowLeft, Package, Archive, Loader2, Phone, MapPin, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const isOrderReadyToArchive = (order, allItems, allReceipts) => {
  if (order.is_archived) return false;
  const orderItems = allItems.filter(i => i.order_id === order.id && (i.quantity || 0) > 0);
  if (orderItems.length === 0) return false;
  const allItemsDone = orderItems.every(i => i.status === 'delivered' || i.status === 'returned');
  const orderReceipts = allReceipts.filter(r => r.order_id === order.id);
  if (orderReceipts.length === 0) return false;
  const allPaid = orderReceipts.every(r => r.is_paid === true);
  return allItemsDone && allPaid;
};

export default function CompletedOrders() {
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  const { data: queryData, isLoading } = useQuery({
    queryKey: ['orders', 'completed'],
    queryFn: async () => {
      const [allOrders, orderItemsData, allReceipts, allLoadItems] = await Promise.all([
        base44.entities.Order.list('-updated_date', 500),
        base44.entities.OrderItem.list('-created_date', 500),
        base44.entities.Receipt.list('-created_date', 500),
        base44.entities.LoadItem.list('-created_date', 500)
      ]);
      const allItems = [...orderItemsData];

      // Filter orders that are either marked as completed OR computed as complete
      const orders = allOrders.filter(o => !o.is_archived).map(order => {
        const orderItems = allItems.filter(i => i.order_id === order.id);
        
        // Extract unique receipt numbers
        const itemReceipts = orderItems
          .filter(i => !i.is_quote)
          .map(i => i.receipt_number)
          .filter(r => r && r.trim() !== '');
        const uniqueReceipts = [...new Set(itemReceipts)].sort();
        
        // Extract unique quote numbers
        const itemQuotes = orderItems
          .filter(i => i.is_quote)
          .map(i => i.receipt_number)
          .filter(r => r && r.trim() !== '');
        const uniqueQuotes = [...new Set(itemQuotes)].sort();
        
        // Check if all receipts are paid
        const orderReceipts = allReceipts.filter(r => r.order_id === order.id);
        const allPaid = uniqueReceipts.length > 0 && uniqueReceipts.every(receiptNum => 
          orderReceipts.find(r => r.receipt_number === receiptNum)?.is_paid
        );
        const anyPaidEmailSent = orderReceipts.some(r => r.paid_email_sent);
        
        // Get actual delivery dates from all delivered/on_delivery items with a date_completed
        const deliveredItems = orderItems.filter(i => {
          if ((i.status !== 'delivered' && i.status !== 'on_delivery') || !i.date_completed) return false;
          if (i.is_quote) return false;
          return true;
        });
        const actualDeliveryDates = [...new Set(deliveredItems.map(i => i.date_completed))].sort();
        
        // Compute isOrderComplete
        const isOrderComplete = orderItems.length > 0 && orderItems.every(item => {
          if (item.is_quote && (item.quantity || 0) > 0) return false;
          if (item.status === 'order' && (item.quantity || 0) === 0) return true;
          if (item.status === 'order' && (item.quantity || 0) > 0) {
            const deliveredChildren = orderItems.filter(child => 
              child.master_item_id === item.id && 
              child.status === 'delivered'
            );
            const fulfilledQuantity = deliveredChildren.reduce((sum, child) => sum + (child.quantity || 0), 0);
            return fulfilledQuantity >= (item.quantity || 0);
          }
          // on_delivery items are NOT complete — still in transit, not yet confirmed
          if (item.status === 'on_delivery') return false;
          if (item.status === 'returned') return true;
          if (item.status === 'delivered') {
            if (item.delivery_method === 'pickup' || item.delivery_method === 'direct_ship') {
              return true;
            }
            if (item.delivery_method === 'delivery') {
              const isOnLoad = allLoadItems.some(li => li.order_item_id === item.id);
              return isOnLoad;
            }
          }
          return false;
        }) && orderItems.some(i => i.status === 'delivered' || i.status === 'returned');
        
        return { 
          ...order, 
          derivedReceipts: uniqueReceipts, 
          derivedQuotes: uniqueQuotes,
          allReceiptsPaid: allPaid,
          anyPaidEmailSent,
          actualDeliveryDates,
          isOrderComplete,
          allOrderItems: orderItems
        };
      }).filter(order => order.is_completed === true || (order.isOrderComplete && order.is_completed !== false)); // Only show completed orders
      
      return { orders, allItems, allReceipts };
    },
    staleTime: 60000
  });

  const { orders, allItems, allReceipts } = queryData || { orders: [], allItems: [], allReceipts: [] };
  console.log('sample receipt:', JSON.stringify(allReceipts?.[0]));

  const moveToActiveMutation = useMutation({
    mutationFn: (orderId) => base44.entities.Order.update(orderId, { is_completed: false }),
    onSuccess: () => {
      queryClient.invalidateQueries(['orders']);
      queryClient.invalidateQueries(['orders', 'active', 'dashboard']);
    }
  });

  const archiveOrderMutation = useMutation({
    mutationFn: (orderId) => base44.entities.Order.update(orderId, { is_archived: true }),
    onSuccess: () => {
      queryClient.invalidateQueries(['orders']);
    }
  });

  const filteredOrders = orders.filter(order => 
    (order.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (order.derivedReceipts || []).some(r => (r || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link to={createPageUrl('Dashboard')}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Completed Orders</h1>
          <p className="text-gray-500 mt-1">Orders ready for archival</p>
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input 
          className="pl-10 bg-white shadow-sm border-gray-200"
          placeholder="Search completed orders..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {filteredOrders.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500">No completed orders found.</p>
            </div>
          ) : (
            filteredOrders.map(order => (
              <Card key={order.id} className="hover:shadow-lg transition-shadow duration-200 border-gray-200 group overflow-hidden">
                <CardContent className="p-0">
                  <Link to={createPageUrl(`OrderDetails?id=${order.id}&from=CompletedOrders`)} className="block cursor-pointer">
                    {/* Header Section */}
                    <div className="p-4 pb-3 bg-gradient-to-br from-gray-50 to-white border-b border-gray-100">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors mb-1">
                            {order.customer_name}
                          </h3>
                          <div className="space-y-1">
                            {order.customer_phone && (
                              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                <Phone className="w-3.5 h-3.5" />
                                {order.customer_phone}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                                <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span className="text-gray-800 font-medium text-xs">{order.job_address || 'No address'}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {order.first_item_moved_notification_sent && (
                            <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-xs px-2 py-0.5">
                              📧 Notified
                            </Badge>
                          )}
                          {order.anyPaidEmailSent && (
                            <Badge className="bg-green-100 text-green-700 border-green-300 text-xs px-2 py-0.5">
                              💰 Paid Email Sent
                            </Badge>
                          )}
                          <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-xs font-bold whitespace-nowrap">
                            ✓ Completed
                          </Badge>
                        </div>
                      </div>

                      {/* Fulfillment Dates */}
                      {order.actualDeliveryDates && order.actualDeliveryDates.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 mb-2">
                          <span className="text-xs text-gray-600 font-medium shrink-0">Fulfillment Dates:</span>
                          {order.actualDeliveryDates.map(date => (
                            <Badge key={date} className="bg-green-100 text-green-700 border-green-300 text-xs whitespace-nowrap">
                              {(() => { const [y, m, d] = date.split('-'); const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${months[parseInt(m) - 1]} ${parseInt(d)}`; })()}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Receipts */}
                      <div className="flex flex-wrap gap-1.5 items-center justify-between">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {order.derivedReceipts && order.derivedReceipts.length > 0 && (
                            <>
                              <span className="text-xs font-semibold text-gray-600">Receipts:</span>
                              {order.derivedReceipts.map(receipt => (
                                <div key={receipt} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-1 rounded-md text-xs font-semibold shadow-sm" title={`Receipt #${receipt}`}>
                                  <FileText className="w-3 h-3" />
                                  #{receipt}
                                </div>
                              ))}
                            </>
                          )}
                          {(!order.derivedReceipts || order.derivedReceipts.length === 0) && (
                            <span className="text-xs text-gray-400 italic">No receipt #</span>
                          )}
                          {order.derivedQuotes && order.derivedQuotes.length > 0 && (!order.derivedReceipts || order.derivedReceipts.length === 0) && (
                            <div className="flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 px-2 py-1 rounded-md text-xs font-semibold" title={`Quote #${order.derivedQuotes.join(', ')}`}>
                              Quote: {order.derivedQuotes.join(', ')}
                            </div>
                          )}
                          {order.allReceiptsPaid && (
                            <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">
                              ✓ Paid
                            </Badge>
                          )}
                        </div>

                      </div>
                    </div>
                  </Link>

                  {/* Notes Section */}
                  <div className="px-4 pb-3">
                    <textarea
                      key={order.id}
                      className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2 outline-none resize-none min-h-[32px] focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                      placeholder="Add notes..."
                      defaultValue={order.notes || ''}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const newNotes = e.target.value;
                        if (newNotes !== (order.notes || '')) {
                          base44.entities.Order.update(order.id, { notes: newNotes });
                        }
                      }}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="px-4 pb-4 pt-0 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        moveToActiveMutation.mutate(order.id);
                      }}
                      disabled={moveToActiveMutation.isPending}
                      className="flex-1 text-xs"
                    >
                      <Package className="w-3 h-3 mr-1" />
                      Move to Active
                    </Button>
                    {isOrderReadyToArchive(order, allItems, allReceipts) ? (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          archiveOrderMutation.mutate(order.id);
                        }}
                        disabled={archiveOrderMutation.isPending}
                        className="flex-1 text-xs archive-ready-btn bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Archive className="w-3 h-3 mr-1" />
                        Ready To Archive
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          archiveOrderMutation.mutate(order.id);
                        }}
                        disabled={archiveOrderMutation.isPending}
                        className="flex-1 text-xs"
                      >
                        <Archive className="w-3 h-3 mr-1" />
                        Archive
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}