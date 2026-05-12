import React, { useState, useRef, useEffect } from 'react';
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from '@/components/ui/textarea';
import { Truck, Box, Package, Printer, Bell, CalendarIcon } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, parseISO } from 'date-fns';

function MiniCalendar({ value, onChange, onClose }) {
  const [viewDate, setViewDate] = useState(value ? parseISO(value) : new Date());
  const start = startOfWeek(startOfMonth(viewDate));
  const end = endOfWeek(endOfMonth(viewDate));
  const days = [];
  let d = start;
  while (d <= end) { days.push(d); d = addDays(d, 1); }
  const selected = value ? parseISO(value) : null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-64">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-1 rounded hover:bg-gray-100 text-gray-600 font-bold text-lg leading-none">‹</button>
        <span className="text-sm font-semibold text-gray-800">{format(viewDate, 'MMMM yyyy')}</span>
        <button type="button" onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-1 rounded hover:bg-gray-100 text-gray-600 font-bold text-lg leading-none">›</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(day => (
          <div key={day} className="text-center text-xs text-gray-400 font-medium py-1">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day, i) => {
          const isSelected = selected && isSameDay(day, selected);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, viewDate);
          return (
            <button key={i} type="button"
              onClick={() => { onChange(format(day, 'yyyy-MM-dd')); onClose(); }}
              className={`text-xs rounded-full w-7 h-7 mx-auto flex items-center justify-center transition-colors
                ${isSelected ? 'bg-amber-500 text-white font-semibold' : ''}
                ${!isSelected && isToday ? 'border border-amber-400 text-amber-600 font-semibold' : ''}
                ${!isSelected && !isCurrentMonth ? 'text-gray-300' : ''}
                ${!isSelected && isCurrentMonth && !isToday ? 'text-gray-700 hover:bg-gray-100' : ''}
              `}
            >{format(day, 'd')}</button>
          );
        })}
      </div>
    </div>
  );
}

function DatePickerButton({ value, onChange }) {
  const [showCal, setShowCal] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!showCal) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setShowCal(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCal]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setShowCal(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all"
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>
          {value ? format(parseISO(value), 'MMM d, yyyy') : 'Select a date'}
        </span>
        <CalendarIcon className="w-4 h-4 text-gray-400" />
      </button>
      {showCal && (
        <div className="absolute top-full left-0 mt-1 z-[100]">
          <MiniCalendar value={value} onChange={onChange} onClose={() => setShowCal(false)} />
        </div>
      )}
    </div>
  );
}

function PickupAddMoreDialog({ open, pendingMove, holdItems, executeMove, getLocalDateString, onDone, onCancel }) {
  const [selectedItems, setSelectedItems] = React.useState({});  // { [itemId]: qty }
  const [isExecuting, setIsExecuting] = React.useState(false);

  // Reset on open
  React.useEffect(() => {
    if (open) setSelectedItems({});
  }, [open]);

  const toggleItem = (item) => {
    setSelectedItems(prev => {
      if (prev[item.id] !== undefined) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return { ...prev, [item.id]: item.quantity };
    });
  };

  const setQty = (itemId, maxQty, value) => {
    const parsed = parseInt(value, 10);
    const clamped = isNaN(parsed) ? 1 : Math.max(1, Math.min(maxQty, parsed));
    setSelectedItems(prev => ({ ...prev, [itemId]: clamped }));
  };

  const handleDone = async () => {
    setIsExecuting(true);
    try {
      const today = getLocalDateString();
      const allMovedIds = [];

      // Execute the original pending move first
      if (pendingMove) {
        const { item, quantity, updates } = pendingMove;
        await executeMove(item, quantity, updates);
        allMovedIds.push(item.id);
      }

      // Execute additional selected hold items as pickups using chosen qty
      for (const [itemId, qty] of Object.entries(selectedItems)) {
        const holdItem = holdItems.find(i => i.id === itemId);
        if (!holdItem) continue;
        await executeMove(holdItem, qty, {
          status: 'delivered',
          delivery_method: 'pickup',
          date_completed: today,
          ticket_printed: false,
        });
        allMovedIds.push(itemId);
      }

      onDone(allMovedIds);
    } finally {
      setIsExecuting(false);
    }
  };

  // Filter out the item already being picked up (from pendingMove)
  const pendingItemId = pendingMove?.item?.id;
  const otherHoldItems = holdItems.filter(i => i.id !== pendingItemId);
  const selectedCount = Object.keys(selectedItems).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader><DialogTitle>Add More Items to This Pickup?</DialogTitle></DialogHeader>
        <div className="py-2">
          <p className="text-sm text-gray-600 mb-3">
            The following items are currently In Hold. Select any you'd also like to include in this pickup ticket.
          </p>
          {otherHoldItems.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-4">No other items in hold.</p>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-lg p-3">
              {otherHoldItems.map(item => {
                const isChecked = selectedItems[item.id] !== undefined;
                const qty = selectedItems[item.id] ?? item.quantity;
                return (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleItem(item)}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleItem(item)}>
                      <span className="font-medium text-sm">{item.product_name}</span>
                      {item.selected_color && <span className="text-gray-500 text-sm ml-1">- {item.selected_color}</span>}
                      {item.receipt_number && <span className="ml-2 text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">#{item.receipt_number}</span>}
                    </div>
                    {isChecked ? (
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="w-6 h-6 rounded border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                          onClick={() => setQty(item.id, item.quantity, qty - 1)}
                          disabled={qty <= 1}
                        >−</button>
                        <Input
                          type="number"
                          min={1}
                          max={item.quantity}
                          value={qty}
                          onChange={(e) => setQty(item.id, item.quantity, e.target.value)}
                          className="w-14 h-7 text-center text-sm px-1"
                        />
                        <button
                          type="button"
                          className="w-6 h-6 rounded border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                          onClick={() => setQty(item.id, item.quantity, qty + 1)}
                          disabled={qty >= item.quantity}
                        >+</button>
                        <span className="text-xs text-gray-400 ml-1">{item.selected_unit}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500 shrink-0">{item.quantity} {item.selected_unit}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleDone} disabled={isExecuting}>
            <Printer className="w-4 h-4 mr-2" />
            {isExecuting ? 'Processing...' : selectedCount > 0 ? `Done — Print Ticket (${selectedCount + 1} items)` : 'No — Print Ticket Now'}
          </Button>
          <Button variant="outline" className="w-full" onClick={onCancel} disabled={isExecuting}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// force rebuild
export default function OrderDialogs({
  order,
  items,
  truckSettings,
  itemsNeedingLoad,
  receipts,
  allLoadItemsForOrder,

  deliveryMethodDialog, setDeliveryMethodDialog,
  deliveryDateValue, setDeliveryDateValue,
  handleDeliveryMethodConfirm,
  getLocalDateString,

  returnDialog, setReturnDialog,
  returnReceiptValue, setReturnReceiptValue,
  isDamaged, setIsDamaged,
  handleReturnConfirm,

  poDialog, setPoDialog,
  poValue, setPoValue,
  noPo, setNoPo,
  handlePoConfirm,

  addReturnDialog, setAddReturnDialog,
  createItemMutation,

  printPromptDialog, setPrintPromptDialog,
  executeMove,
  setIsPrintTicketOpen,

  soDialog, setSoDialog,
  soValue, setSoValue,
  updateItemMutation,
  setMoveDialogState,

  isDeleteDialogOpen, setIsDeleteDialogOpen,
  deleteOrderMutation,
  deleteProgress,
  onArchiveOrder,

  isCompleteDialogOpen, setIsCompleteDialogOpen,
  handleCompleteDialogMarkComplete,
  handleCompleteDialogArchive,

  emailConfirmationDialog, setEmailConfirmationDialog,

  isCreateDeliveryDialogOpen, setIsCreateDeliveryDialogOpen,
  selectedTruckSettingId, setSelectedTruckSettingId,
  packingStrategy, setPackingStrategy,
  handleCreateDelivery,
  deliveryDate, setDeliveryDate,

  showReminderDialog, setShowReminderDialog,
  reminderDate, setReminderDate,
  reminderNotes, setReminderNotes,
  createReminderMutation,
  orderId,

  showNotificationPrompt, setShowNotificationPrompt,
  sendFirstDeliveryNotification,
}) {
  return (
    <>
      {/* Delivery Method Dialog */}
      <Dialog open={deliveryMethodDialog.isOpen} onOpenChange={(open) => {
        if (!open) { setDeliveryMethodDialog({ isOpen: false, itemId: null, quantity: null, updates: null, item: null }); setDeliveryDateValue(''); }
      }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>How was this item fulfilled?</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <Label>Delivery Date</Label>
              <input type="date" value={deliveryDateValue} onChange={(e) => setDeliveryDateValue(e.target.value)} onClick={(e) => e.stopPropagation()} className="px-3 py-2 border border-gray-300 rounded-md text-sm w-full" />
            </div>
            <Button className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700" onClick={() => handleDeliveryMethodConfirm('delivery', deliveryDateValue || getLocalDateString())}><Truck className="w-5 h-5 mr-2" /> Delivered</Button>
            <Button className="w-full h-12 text-base bg-green-600 hover:bg-green-700" onClick={() => handleDeliveryMethodConfirm('pickup', deliveryDateValue || getLocalDateString())}><Box className="w-5 h-5 mr-2" /> Picked Up</Button>
            <Button className="w-full h-12 text-base bg-purple-600 hover:bg-purple-700" onClick={() => handleDeliveryMethodConfirm('direct_ship', deliveryDateValue || getLocalDateString())}><Package className="w-5 h-5 mr-2" /> Direct Ship</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Receipt Dialog */}
      <Dialog open={returnDialog.isOpen} onOpenChange={(open) => {
        if (!open) { setReturnDialog({ isOpen: false, itemId: null, quantity: null, updates: null, item: null }); setReturnReceiptValue(''); setIsDamaged(false); }
      }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Return Item</DialogTitle></DialogHeader>
          <div className="py-4">
            <form onSubmit={(e) => { e.preventDefault(); if (isDamaged || returnReceiptValue.trim()) handleReturnConfirm(returnReceiptValue.trim(), isDamaged); }}>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox id="isDamaged" checked={isDamaged} onCheckedChange={setIsDamaged} />
                  <label htmlFor="isDamaged" className="text-sm text-gray-700 cursor-pointer">Item is damaged (no receipt required)</label>
                </div>
                {!isDamaged && <Input value={returnReceiptValue} onChange={(e) => setReturnReceiptValue(e.target.value)} placeholder="Return Receipt #" autoFocus required={!isDamaged} />}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="outline" onClick={() => { setReturnDialog({ isOpen: false, itemId: null, quantity: null, updates: null, item: null }); setReturnReceiptValue(''); setIsDamaged(false); }}>Cancel</Button>
                <Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={!isDamaged && !returnReceiptValue.trim()}>Confirm Return</Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* PO Number Dialog */}
      <Dialog open={poDialog.isOpen} onOpenChange={(open) => {
        if (!open) { setPoDialog({ isOpen: false, itemId: null, quantity: null, updates: null, item: null }); setPoValue(''); setNoPo(false); }
      }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Enter PO Number</DialogTitle></DialogHeader>
          <div className="py-4">
            <form onSubmit={(e) => { e.preventDefault(); if (poValue.trim() !== '' || noPo) handlePoConfirm(poValue.trim()); }}>
              <Input value={poValue} onChange={(e) => setPoValue(e.target.value)} placeholder="PO Number" className="mb-3" autoFocus disabled={noPo} />
              <div className="flex items-center space-x-2 mb-4">
                <Checkbox id="noPo" checked={noPo} onCheckedChange={setNoPo} />
                <label htmlFor="noPo" className="text-sm text-gray-600 cursor-pointer">No PO (proceed without PO number)</label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setPoDialog({ isOpen: false, itemId: null, quantity: null, updates: null, item: null }); setPoValue(''); setNoPo(false); }}>Cancel</Button>
                <Button type="submit" className="bg-yellow-600 hover:bg-yellow-700" disabled={poValue.trim() === '' && !noPo}>Place On Order</Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Return Dialog */}
      <Dialog open={addReturnDialog.isOpen} onOpenChange={(open) => !open && setAddReturnDialog({ isOpen: false, receipt: '', description: '' })}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Add Miscellaneous Return</DialogTitle></DialogHeader>
          <div className="py-4">
            <form onSubmit={async (e) => {
              e.preventDefault();
              const { returnReceipt, returnDescription, returnColor, returnQty } = e.target.elements;
              if (returnReceipt.value.trim() && returnDescription.value.trim() && returnColor.value.trim() && returnQty.value) {
                await createItemMutation.mutateAsync({ product_name: returnDescription.value.trim(), quantity: parseInt(returnQty.value), status: 'returned', return_receipt_number: returnReceipt.value.trim(), date_returned: getLocalDateString(), selected_color: returnColor.value.trim() });
                setAddReturnDialog({ isOpen: false, receipt: '', description: '' });
              }
            }}>
              <div className="space-y-4">
                <div className="grid gap-2"><Label htmlFor="returnReceipt">Return Receipt Number</Label><Input id="returnReceipt" name="returnReceipt" placeholder="Return Receipt #" required /></div>
                <div className="grid gap-2"><Label htmlFor="returnDescription">Product Description</Label><Textarea id="returnDescription" name="returnDescription" placeholder="Describe the returned product..." className="h-20" required /></div>
                <div className="grid gap-2"><Label htmlFor="returnColor">Color</Label><Input id="returnColor" name="returnColor" placeholder="Enter color..." required /></div>
                <div className="grid gap-2"><Label htmlFor="returnQty">Quantity</Label><Input id="returnQty" name="returnQty" type="number" min="1" defaultValue="1" required /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="outline" onClick={() => setAddReturnDialog({ isOpen: false, receipt: '', description: '' })}>Cancel</Button>
                <Button type="submit" className="bg-red-600 hover:bg-red-700">Add Return</Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Ticket Prompt Dialog — "Add more items to this pickup?" */}
      <PickupAddMoreDialog
        open={printPromptDialog.isOpen}
        pendingMove={printPromptDialog.pendingMove}
        holdItems={items ? items.filter(i => i.status === 'in_hold' && (i.quantity || 0) > 0) : []}
        executeMove={executeMove}
        getLocalDateString={getLocalDateString}
        onDone={(allMovedItemIds) => {
          setPrintPromptDialog({ isOpen: false, itemIds: allMovedItemIds, pendingMove: null });
          setTimeout(() => setIsPrintTicketOpen(true), 200);
        }}
        onCancel={() => {
          setPrintPromptDialog({ isOpen: false, itemIds: [], pendingMove: null });
        }}
      />

      {/* Sales Order Dialog */}
      <Dialog open={soDialog.isOpen} onOpenChange={(open) => { if (!open) { setSoDialog({ isOpen: false, itemId: null, item: null }); setSoValue(''); } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Enter Sales Order Number</DialogTitle></DialogHeader>
          <div className="py-4">
            <form onSubmit={(e) => {
              e.preventDefault();
              const item = soDialog.item;
              if (!item) return;
              updateItemMutation.mutate({ id: item.id, data: { sales_order_number: soValue.trim() } });
              setSoDialog({ isOpen: false, itemId: null, item: null });
              setSoValue('');
              let maxQty = item.quantity;
              if (item.master_item_id) {
                const masterItem = items?.find(i => i.id === item.master_item_id);
                if (masterItem) {
                  const allMovedItems = items.filter(i => i.master_item_id === item.master_item_id && i.status !== 'order');
                  const totalMoved = allMovedItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
                  const originalQty = masterItem.original_quantity || (masterItem.quantity + totalMoved);
                  const otherItems = allMovedItems.filter(i => i.id !== item.id);
                  const otherUsed = otherItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
                  maxQty = originalQty - otherUsed;
                }
              }
              setMoveDialogState({ isOpen: true, itemId: item.id, targetColumn: 'delivered', targetLocation: null, sourceColumn: 'on_order', maxQtyOverride: maxQty, isDirectShip: true });
            }}>
              <Input value={soValue} onChange={(e) => setSoValue(e.target.value)} placeholder="Sales Order Number" className="mb-4" autoFocus />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => { setSoDialog({ isOpen: false, itemId: null, item: null }); setSoValue(''); }}>Cancel</Button>
                <Button type="submit" className="bg-purple-600 hover:bg-purple-700">Continue</Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Order Dialog */}
      <Dialog open={isDeleteDialogOpen || deleteOrderMutation.isPending} onOpenChange={deleteOrderMutation.isPending ? undefined : setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[460px]" onEscapeKeyDown={deleteOrderMutation.isPending ? (e) => e.preventDefault() : undefined} onInteractOutside={deleteOrderMutation.isPending ? (e) => e.preventDefault() : undefined}>
          {deleteOrderMutation.isPending && deleteProgress ? (
            /* Progress overlay while deleting */
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-gray-900">
                  <Loader2 className="w-5 h-5 animate-spin text-red-600" />
                  Deleting Order...
                </DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-3">
                <p className="text-sm text-gray-600">{deleteProgress.stage || 'Working...'}</p>
                {deleteProgress.total > 0 && (
                  <>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((deleteProgress.current / deleteProgress.total) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-right">
                      {deleteProgress.current} / {deleteProgress.total} · {Math.round((deleteProgress.current / deleteProgress.total) * 100)}% complete
                    </p>
                  </>
                )}
              </div>
            </>
          ) : (
            /* Normal delete options */
            <>
              <DialogHeader><DialogTitle className="text-gray-900">Remove Order</DialogTitle></DialogHeader>
              <div className="py-2 space-y-4">
                <p className="text-sm text-gray-600">How would you like to remove this order?</p>

                {/* Archive Option - Recommended */}
                <div className="border-2 border-indigo-200 rounded-lg p-4 bg-indigo-50">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                      <span className="text-indigo-600 text-lg">📦</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-indigo-900 text-sm">Archive Order <span className="ml-1 text-xs font-normal bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded">Recommended</span></p>
                      <p className="text-xs text-indigo-700 mt-1">Hides the order from active views but keeps all data safe. You can restore it any time from Archived Orders.</p>
                    </div>
                  </div>
                  <Button
                    className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => { onArchiveOrder?.(); setIsDeleteDialogOpen(false); }}
                  >
                    Archive Order
                  </Button>
                </div>

                {/* Permanent Delete Option */}
                <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <span className="text-red-600 text-lg">🗑️</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-red-900 text-sm">Delete Permanently</p>
                      <p className="text-xs text-red-700 mt-1">Permanently removes the order and all associated items. <strong>This cannot be undone.</strong></p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    className="w-full mt-3 bg-red-600 hover:bg-red-700"
                    onClick={() => { deleteOrderMutation.mutate(); setIsDeleteDialogOpen(false); }}
                  >
                    Delete Permanently
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="w-full" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Order Complete Dialog */}
      <Dialog open={isCompleteDialogOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[450px]" onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle className="text-green-600">Order Complete! 🎉</DialogTitle></DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">All products have been delivered or returned.</p>
            <p className="text-sm text-gray-600 mb-6">How would you like to proceed?</p>
            
            {/* Check if all receipts are paid */}
            {(() => {
              const deliveredItems = items?.filter(i => i.status === 'delivered' || i.status === 'on_delivery') || [];
              const deliveredReceiptNumbers = new Set(deliveredItems.map(i => i.receipt_number).filter(r => r));
              const allReceiptsPaid = Array.from(deliveredReceiptNumbers).every(receiptNum => {
                const receiptEntity = receipts?.find(r => r.receipt_number === receiptNum);
                return receiptEntity && receiptEntity.is_paid;
              });
              
              return allReceiptsPaid ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-green-900 mb-2">✓ All receipts are paid</p>
                  <p className="text-xs text-green-700">This order is ready to archive.</p>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-amber-900 mb-2">⚠ Some receipts are unpaid</p>
                  <p className="text-xs text-amber-700">Move to Completed Orders until all receipts are paid.</p>
                </div>
              );
            })()}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsCompleteDialogOpen(false)}>Keep Active</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleCompleteDialogMarkComplete}>
              {(() => {
                const deliveredItems = items?.filter(i => i.status === 'delivered' || i.status === 'on_delivery') || [];
                const deliveredReceiptNumbers = new Set(deliveredItems.map(i => i.receipt_number).filter(r => r));
                const allReceiptsPaid = Array.from(deliveredReceiptNumbers).every(receiptNum => {
                  const receiptEntity = receipts?.find(r => r.receipt_number === receiptNum);
                  return receiptEntity && receiptEntity.is_paid;
                });
                return allReceiptsPaid ? 'Archive Order' : 'Mark as Completed';
              })()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Confirmation Dialog */}
      <Dialog open={emailConfirmationDialog.isOpen} onOpenChange={(open) => !open && setEmailConfirmationDialog({ isOpen: false, message: '' })}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle className="text-green-600">✓ Notification Sent</DialogTitle></DialogHeader>
          <div className="py-4"><p className="text-sm text-gray-600">{emailConfirmationDialog.message}</p></div>
          <DialogFooter><Button className="bg-green-600 hover:bg-green-700" onClick={() => setEmailConfirmationDialog({ isOpen: false, message: '' })}>Okay</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Delivery Dialog */}
      <Dialog open={isCreateDeliveryDialogOpen} onOpenChange={setIsCreateDeliveryDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Create Delivery Load(s)</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <Label>Delivery Date</Label>
              <input id="delivery-date-input" type="date" value={deliveryDate} onChange={(e) => { console.log('date picked:', e.target.value); setDeliveryDate(e.target.value); }} className="px-3 py-2 border border-gray-300 rounded-md text-sm w-full" onClick={(e) => e.stopPropagation()} />
            </div>
            <div className="grid gap-2">
              <Label>Truck Setting</Label>
              <Select value={selectedTruckSettingId || ''} onValueChange={setSelectedTruckSettingId}>
                <SelectTrigger><SelectValue placeholder="Select truck setting..." /></SelectTrigger>
                <SelectContent>{truckSettings.map(ts => <SelectItem key={ts.id} value={ts.id}>{ts.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Packing Strategy</Label>
              <Select value={packingStrategy} onValueChange={setPackingStrategy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maxout">Max Out - Fill each truck completely</SelectItem>
                  <SelectItem value="evenly">Evenly Distribute - Spread products across trucks</SelectItem>
                  <SelectItem value="manual">Manual Build - Build load manually</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              {(() => {
                const consolidatedItems = Object.values(
                  itemsNeedingLoad.reduce((acc, item) => {
                    const key = `${item.product_name}||${item.selected_unit}||${item.selected_color || ''}`;
                    if (acc[key]) {
                      acc[key].quantity += item.quantity;
                      acc[key].keep_on_same_load = acc[key].keep_on_same_load || item.keep_on_same_load;
                    } else {
                      acc[key] = { ...item, quantity: item.quantity };
                    }
                    return acc;
                  }, {})
                );
                return (
                  <p className="text-sm font-medium text-gray-700 mb-2">Items to Load ({consolidatedItems.length}):</p>
                );
              })()}
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {Object.values(
                  itemsNeedingLoad.reduce((acc, item) => {
                    const key = `${item.product_name}||${item.selected_unit}||${item.selected_color || ''}`;
                    if (acc[key]) {
                      acc[key].quantity += item.quantity;
                      acc[key].keep_on_same_load = acc[key].keep_on_same_load || item.keep_on_same_load;
                    } else {
                      acc[key] = { ...item, quantity: item.quantity };
                    }
                    return acc;
                  }, {})
                ).map(item => (
                  <div key={`${item.product_name}-${item.selected_unit}-${item.selected_color}`} className="text-xs text-gray-600 flex justify-between">
                    <span>{item.quantity} {item.selected_unit} - {item.product_name}</span>
                    {item.keep_on_same_load && (item.selected_unit === 'Each' || item.selected_unit === 'Layer') && <span className="text-blue-600 font-medium">🔗 Same Load</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateDeliveryDialogOpen(false)}>Add More to Load</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleCreateDelivery} disabled={(packingStrategy !== 'manual' && !selectedTruckSettingId) || !deliveryDate}>
              {packingStrategy === 'manual' ? 'Build Manually' : 'Create Load'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Delivery Reminder Dialog */}
      <Dialog open={showReminderDialog} onOpenChange={(open) => {
        setShowReminderDialog(open);
        if (open) {
          setReminderDate(format(new Date(), 'yyyy-MM-dd'));
        } else {
          setReminderDate('');
          setReminderNotes('');
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Add Delivery Reminder</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Delivery Date</Label>
              <DatePickerButton value={reminderDate} onChange={setReminderDate} />
            </div>
            <div className="grid gap-2">
              <Label>Notes (Optional)</Label>
              <Textarea value={reminderNotes} onChange={(e) => setReminderNotes(e.target.value)} placeholder="Add notes about this delivery..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReminderDialog(false); setReminderDate(''); setReminderNotes(''); }}>Cancel</Button>
            <Button onClick={() => createReminderMutation.mutate({ order_id: orderId, customer_name: order?.customer_name, scheduled_date: reminderDate, notes: reminderNotes, is_resolved: false })} disabled={!reminderDate || reminderDate <= new Date().toISOString().split('T')[0]} className="bg-amber-600 hover:bg-amber-700">Create Reminder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification Prompt Dialog */}
      <Dialog open={showNotificationPrompt} onOpenChange={(open) => { if (!open) setShowNotificationPrompt(false); }}>
        <DialogContent className="sm:max-w-[500px] border-2 border-green-300" onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex items-center gap-3 pb-2 border-b border-green-200">
              <Bell className="w-6 h-6 text-green-600" />
              <DialogTitle className="text-gray-900">Send Delivery Notification?</DialogTitle>
            </div>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-gray-700">This order has delivered items with unpaid receipts. Send a notification email to your team?</p>
            <p className="text-xs text-gray-500">Tip: If the receipt has been paid but not marked in the system, mark it as paid first.</p>
          </div>
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => { setShowNotificationPrompt(false); }} className="border-gray-300">Skip</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white font-semibold" onClick={sendFirstDeliveryNotification}><Bell className="w-4 h-4 mr-2" /> Send Notification</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}