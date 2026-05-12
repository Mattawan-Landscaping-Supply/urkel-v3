import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { 
  Search, 
  ArrowLeft, 
  Loader2,
  Trash2,
  ArchiveRestore
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { format } from 'date-fns';

export default function ArchivedOrders() {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteOrderId, setDeleteOrderId] = useState(null);
  const [unarchiveOrderId, setUnarchiveOrderId] = useState(null);
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', 'archived'],
    queryFn: async () => {
      const [allOrders, allReceipts, allOrderItems] = await Promise.all([
        base44.entities.Order.list('-updated_date', 500),
        base44.entities.Receipt.list('-created_date', 500),
        base44.entities.OrderItem.list('-created_date', 500)
      ]);
      return allOrders
        .filter(o => o.is_archived)
        .sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date))
        .map(order => {
          // Get receipt numbers from Receipt entities
          const orderReceipts = allReceipts.filter(r => r.order_id === order.id);
          const derivedReceipts = [...new Set(orderReceipts.map(r => r.receipt_number).filter(Boolean))].sort();
          
          // Get latest delivery date from delivered OrderItems
          const deliveredItems = allOrderItems.filter(i => i.order_id === order.id && i.status === 'delivered' && i.date_completed);
          const actualDeliveryDates = deliveredItems.length > 0 
            ? [...new Set(deliveredItems.map(i => i.date_completed))].sort().reverse()
            : [];
          
          return {
            ...order,
            derivedReceipts,
            actualDeliveryDates,
            anyPaidEmailSent: orderReceipts.some(r => r.paid_email_sent)
          };
        });
    },
    staleTime: 60000
  });

  const unarchiveMutation = useMutation({
    mutationFn: async ({ orderId, destination }) => {
      const updates = { is_archived: false };
      if (destination === 'completed') {
        updates.is_completed = true;
      } else {
        updates.is_completed = false;
      }
      return base44.entities.Order.update(orderId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['orders', 'archived']);
      queryClient.invalidateQueries(['orders']);
      setUnarchiveOrderId(null);
    }
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId) => {
      // Get all order items
      const items = await base44.entities.OrderItem.filter({ order_id: orderId });
      
      // Delete all associated LoadItems first (to avoid orphaned references)
      const allLoadItems = await base44.entities.LoadItem.list('-created_date', 500);
      const loadItemsToDelete = allLoadItems.filter(li => 
        items.some(item => item.id === li.order_item_id)
      );
      await Promise.all(loadItemsToDelete.map(li => base44.entities.LoadItem.delete(li.id)));
      
      // Delete all order items
      await Promise.all(items.map(item => base44.entities.OrderItem.delete(item.id)));
      
      // Delete all receipts for this order
      const receipts = await base44.entities.Receipt.filter({ order_id: orderId });
      await Promise.all(receipts.map(r => base44.entities.Receipt.delete(r.id)));
      
      // Finally delete the order
      return base44.entities.Order.delete(orderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['orders', 'archived']);
      setDeleteOrderId(null);
    }
  });

  const filteredOrders = orders?.filter(order => 
    (order.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.derivedReceipts?.join(', ').toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link to={createPageUrl('Dashboard')}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Archived Orders</h1>
          <p className="text-gray-500 mt-1">History of completed fulfillments.</p>
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input 
          className="pl-10 bg-white shadow-sm border-gray-200 py-6"
          placeholder="Search archives..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500">No archived orders found.</p>
            </div>
          ) : (
            filteredOrders.map(order => (
              <Card key={order.id} className="hover:shadow-md transition-shadow duration-200 border-gray-200 bg-gray-50 opacity-80 hover:opacity-100">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <Link to={createPageUrl(`OrderDetails?id=${order.id}&from=ArchivedOrders`)} className="flex-1">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {order.customer_name}
                        </h3>
                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                          <span>Receipts: {order.derivedReceipts && order.derivedReceipts.length > 0 ? order.derivedReceipts.join(', ') : 'None'}</span>
                          <span>•</span>
                          <span>Delivered: {order.actualDeliveryDates && order.actualDeliveryDates.length > 0 ? format(new Date(order.actualDeliveryDates[0]), 'MMM d, yyyy') : 'None'}</span>
                        </div>
                        {order.job_address && (
                          <div className="mt-2 text-sm text-gray-700 bg-yellow-100 px-3 py-1.5 rounded-md border border-yellow-200 inline-block">
                            {order.job_address}
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="flex items-center gap-2">
                      {order.anyPaidEmailSent && (
                        <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">
                          💰 Paid Email Sent
                        </Badge>
                      )}
                      <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-300">
                        Archived
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                        title="Unarchive order"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setUnarchiveOrderId(order.id);
                        }}
                      >
                        <ArchiveRestore className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteOrderId(order.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <AlertDialog open={!!unarchiveOrderId} onOpenChange={(open) => !open && setUnarchiveOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unarchive Order</AlertDialogTitle>
            <AlertDialogDescription>
              Where would you like to send this order?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => unarchiveMutation.mutate({ orderId: unarchiveOrderId, destination: 'active' })}
            >
              Active Orders
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => unarchiveMutation.mutate({ orderId: unarchiveOrderId, destination: 'completed' })}
            >
              Completed Orders
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteOrderId} onOpenChange={(open) => !open && setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Archived Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this order and all its items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteOrderMutation.mutate(deleteOrderId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}