import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AddFromOrdersDialog({ isOpen, onClose, allOrders, loadItems, handleAddToLoad }) {
  const [search, setSearch] = useState('');

  // Fetch ALL in_hold order items across all orders when the dialog is open
  const { data: allInHoldItems = [], isLoading } = useQuery({
    queryKey: ['allInHoldItems'],
    queryFn: () => base44.entities.OrderItem.filter({ status: 'in_hold' }, '-created_date', 500),
    enabled: isOpen,
    staleTime: 30000,
  });

  const activeOrders = allOrders.filter(o => !o.is_archived && !o.is_completed);

  const orderGroups = activeOrders
    .map(order => {
      // Include quote items — they are physically in stock and deliverable
      const items = allInHoldItems.filter(i =>
        i.order_id === order.id &&
        (i.quantity || 0) > 0 &&
        !loadItems.some(li => li.order_item_id === i.id)
      );
      return { order, items };
    })
    .filter(({ order, items }) => {
      if (items.length === 0) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return order.customer_name?.toLowerCase().includes(q) ||
        items.some(i => i.product_name?.toLowerCase().includes(q));
    });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Items from Orders</DialogTitle>
          <DialogDescription>Select items from active orders to add to this load.</DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Search by customer or product..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mt-2"
        />
        <div className="flex-1 overflow-y-auto space-y-4 py-4 min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : orderGroups.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No in-hold items found across active orders.</p>
          ) : (
            orderGroups.map(({ order, items }) => (
              <div key={order.id} className="border border-gray-200 rounded-lg p-4">
                <div className="font-semibold text-gray-900 mb-3">{order.customer_name}</div>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm bg-gray-50 rounded p-2">
                      <div>
                        <span className="font-medium">{item.product_name}</span>
                        {item.selected_color && <span className="text-gray-500 ml-1">({item.selected_color})</span>}
                        <Badge className="ml-2 text-xs bg-yellow-100 text-yellow-800">{item.quantity} {item.selected_unit}</Badge>
                        {item.receipt_number && <span className="text-xs text-gray-500 ml-1">#{item.receipt_number}</span>}
                      </div>
                      <Button size="sm" onClick={() => {
                        handleAddToLoad(item);
                        onClose();
                      }}>Add</Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}