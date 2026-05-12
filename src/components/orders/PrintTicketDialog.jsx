import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from "@/components/ui/checkbox";
import { Printer } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PrintableTicket from './PrintableTicket';

export default function PrintTicketDialog({ isOpen, onClose, orderId, items, order, onItemsUpdated, onConfirmPrint, initialSelectedIds }) {
  const [selectedItems, setSelectedItems] = useState([]);
  const [itemQuantities, setItemQuantities] = useState({});
  const [showPrint, setShowPrint] = useState(false);

  // Reset and pre-select items whenever dialog opens
  // Note: uses printableItems which is computed below — we recompute inline here to avoid ordering issues
  React.useEffect(() => {
    if (!isOpen) return;
    setShowPrint(false);
    const eligible = items.filter(i => 
      i.quantity > 0 &&
      i.status !== 'returned' &&
      i.status !== 'on_delivery' &&
      i.ticket_printed !== true &&
      (i.status === 'in_hold' || (i.status === 'delivered' && i.delivery_method === 'pickup'))
    );
    // Group same as below
    const gMap = new Map();
    eligible.forEach(i => {
      const key = `${i.product_name}||${i.selected_color || ''}||${i.selected_unit || ''}||${i.receipt_number || ''}`;
      if (gMap.has(key)) {
        const ex = gMap.get(key);
        ex._groupedIds.push(i.id);
        ex.quantity += i.quantity;
      } else {
        gMap.set(key, { ...i, quantity: i.quantity, _groupedIds: [i.id] });
      }
    });
    const grouped = Array.from(gMap.values());
    const toSelect = initialSelectedIds && initialSelectedIds.length > 0
      ? grouped.filter(i => i._groupedIds.some(id => initialSelectedIds.includes(id)))
      : grouped;
    setSelectedItems(toSelect.map(i => i.id));
    const qtys = {};
    toSelect.forEach(i => { qtys[i.id] = i.quantity; });
    setItemQuantities(qtys);
  }, [isOpen]);

  const toggleItem = (itemId) => {
    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        // Remove item
        const newSelected = prev.filter(id => id !== itemId);
        // Remove quantity
        setItemQuantities(q => {
          const newQ = { ...q };
          delete newQ[itemId];
          return newQ;
        });
        return newSelected;
      } else {
        // Add item with default quantity
        const item = printableItems.find(i => i.id === itemId) || items.find(i => i.id === itemId);
        setItemQuantities(q => ({ ...q, [itemId]: item ? item.quantity : 1 }));
        return [...prev, itemId];
      }
    });
  };

  const updateQuantity = (itemId, newQty) => {
    const item = printableItems.find(i => i.id === itemId);
    const qty = Math.max(1, Math.min(parseInt(newQty) || 1, item ? item.quantity : 999));
    setItemQuantities(prev => ({ ...prev, [itemId]: qty }));
  };

  const selectAll = () => {
    const newSelected = printableItems.map(i => i.id);
    const newQuantities = {};
    printableItems.forEach(i => {
      newQuantities[i.id] = i.quantity;
    });
    setSelectedItems(newSelected);
    setItemQuantities(newQuantities);
  };

  const deselectAll = () => {
    setSelectedItems([]);
    setItemQuantities({});
  };

  const handlePrint = async () => {
    // Mark selected items as delivered BEFORE showing print dialog
    const today = new Date().toISOString().split('T')[0];
    const itemsToUpdate = printableItems.filter(i => selectedItems.includes(i.id));
    
    try {
      for (const item of itemsToUpdate) {
        const requestedQty = itemQuantities[item.id] || item.quantity;
        // Find all original items that make up this grouped item and update them
        const originalItems = items.filter(oi => 
          oi.product_name === item.product_name &&
          oi.selected_color === item.selected_color &&
          oi.selected_unit === item.selected_unit &&
          oi.receipt_number === item.receipt_number &&
          oi.quantity > 0 &&
          (oi.status === 'in_hold' || (oi.status === 'delivered' && oi.delivery_method === 'pickup'))
        );
        
        // Update each original item with the requested quantity (proportionally if needed)
        let remainingQtyToMark = requestedQty;
        for (const origItem of originalItems) {
          if (remainingQtyToMark <= 0) break;
          const qtyToMark = Math.min(origItem.quantity, remainingQtyToMark);
          await base44.entities.OrderItem.update(origItem.id, {
            status: 'delivered',
            delivery_method: 'pickup',
            date_completed: today
          });
          remainingQtyToMark -= qtyToMark;
        }
      }
      
      // Invalidate items query so Kanban refreshes
      onItemsUpdated?.();
      
      // Now show the print dialog
      setShowPrint(true);
    } catch (e) {
      console.error('Failed to mark items as delivered:', e);
      // Still show print dialog even if update fails
      setShowPrint(true);
    }
  };

  // Filter to show items eligible for a pick-up ticket:
  // - in_hold items not yet printed
  // - delivered items with delivery_method='pickup' not yet printed
  const eligibleItems = items.filter(i => 
    i.quantity > 0 &&
    i.status !== 'returned' &&
    i.status !== 'on_delivery' &&
    i.ticket_printed !== true &&
    (
      i.status === 'in_hold' ||
      (i.status === 'delivered' && i.delivery_method === 'pickup')
    )
  );

  // Group identical product+color+unit+receipt combinations, summing quantities
  const groupMap = new Map();
  eligibleItems.forEach(i => {
    const key = `${i.product_name}||${i.selected_color || ''}||${i.selected_unit || ''}||${i.receipt_number || ''}`;
    if (groupMap.has(key)) {
      const existing = groupMap.get(key);
      existing._groupedIds.push(i.id);
      existing.quantity += i.quantity;
    } else {
      groupMap.set(key, { ...i, quantity: i.quantity, _groupedIds: [i.id] });
    }
  });
  const printableItems = Array.from(groupMap.values());

  const selectedPrintItems = printableItems
    .filter(i => selectedItems.includes(i.id))
    .flatMap(item => {
      const requestedQty = itemQuantities[item.id] || item.quantity;
      // Distribute quantity back across original item ids proportionally for ticket marking
      return [{ ...item, quantity: requestedQty }];
    });

  if (showPrint) {
    return <PrintableTicket 
      order={order} 
      items={selectedPrintItems} 
      onClose={() => { setShowPrint(false); }} 
      onConfirmPrint={() => { 
        onConfirmPrint(selectedPrintItems); 
        setShowPrint(false);
        onClose();
      }} 
    />;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] print:hidden">
        <DialogHeader>
          <DialogTitle>Select Items for Pick Up Ticket</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <div className="flex justify-between mb-4">
            <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>Clear All</Button>
          </div>
          
          <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-lg p-3">
            {printableItems.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">No items available</p>
            ) : (
              printableItems.map(item => (
                <div 
                  key={item.id} 
                  className="flex items-center gap-3 p-2 rounded hover:bg-gray-50"
                >
                  <Checkbox 
                    checked={selectedItems.includes(item.id)}
                    onCheckedChange={() => toggleItem(item.id)}
                  />
                  <div className="flex-1">
                    <span className="font-medium">{item.product_name}</span>
                    {item.selected_color && (
                      <span className="text-gray-500 ml-2">- {item.selected_color}</span>
                    )}
                    {item.receipt_number && (
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded ml-2">
                        #{item.receipt_number}
                      </span>
                    )}
                  </div>
                  {selectedItems.includes(item.id) ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max={item.quantity}
                        value={itemQuantities[item.id] || item.quantity}
                        onChange={(e) => updateQuantity(item.id, e.target.value)}
                        className="w-16 h-8 text-sm"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-gray-600 text-sm">/ {item.quantity} {item.selected_unit}</span>
                    </div>
                  ) : (
                    <span className="text-gray-600 font-medium">x{item.quantity} {item.selected_unit}</span>
                  )}
                </div>
              ))
            )}
          </div>
          
          <p className="text-sm text-gray-500 mt-3">
            {selectedItems.length} item(s) selected
          </p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handlePrint} 
            disabled={selectedItems.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Printer className="w-4 h-4 mr-2" /> Print Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}