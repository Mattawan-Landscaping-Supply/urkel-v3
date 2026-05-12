import React from 'react';
import { Plus, MoreHorizontal, Pencil, X, Calendar, Palette, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from 'date-fns';
import KanbanColumn from '@/components/kanban/KanbanColumn';
import KanbanItemCard from '@/components/kanban/KanbanItemCard';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function MasterOrderColumn({
  items, columns, order, receipts, emptyReceipts, emptyQuotes,
  selectedMasterItems, setSelectedMasterItems, collapsedReceipts, setCollapsedReceipts,
  openCalendars, setOpenCalendars, handleAddReceipt, handleAddQuote,
  openCatalogForReceipt, handleVerifiedToggle, updateItemMutation, deleteItemMutation,
  setMoveDialogState, createOrUpdateReceiptMutation, orderId, queryClient, showArchivedError,
  onEditColor, products, onPaidToggle, onLightspeedImport, onPrintMasterOrder
}) {
  return (
    <KanbanColumn
      title="Master Order"
      id="order"
      items={columns.order}
      color="border-gray-200"
      headerColor="bg-gray-100"
      selectedItems={selectedMasterItems}
      onSelectionChange={setSelectedMasterItems}
      onBatchMove={(targetColumn) => {
        // Only include items that still have remaining quantity > 0
        const validSelected = selectedMasterItems.filter(id => {
          const realId = (id || '').replace('_master', '');
          const masterItem = columns.order.find(i => i.id === realId);
          return masterItem && masterItem.quantity > 0;
        });
        // Clean up stale selections
        if (validSelected.length !== selectedMasterItems.length) {
          setSelectedMasterItems(validSelected);
        }
        if (validSelected.length === 0) return;
        const firstItem = columns.order.find(i => i.id === validSelected[0]);
        if (!firstItem) return;
        setMoveDialogState({
          isOpen: true,
          itemId: firstItem.id,
          targetColumn,
          targetLocation: null,
          sourceColumn: 'order',
          maxQtyOverride: firstItem.quantity,
          batchMode: true,
          batchItems: validSelected
        });
      }}
      readOnly={order?.is_archived}
      onAdd={handleAddReceipt}
      onAddQuote={handleAddQuote}
      onAddLightspeed={!order?.is_archived ? onLightspeedImport : undefined}
      onAddTooltip="Add New Receipt"
      groupBy="receipt_number"
      extraGroups={emptyReceipts}
      extraQuoteGroups={emptyQuotes}
      allItems={items}
      collapsedGroups={collapsedReceipts}
      onToggleCollapse={(key) => setCollapsedReceipts(prev => ({ ...prev, [key]: !prev[key] }))}
      renderGroupHeader={(key, groupItems, isCollapsed, onToggle) => {
        const receiptKey = key === 'No Receipt' ? '' : key;
        const allItemsForReceipt = items?.filter(i => (i.receipt_number || '') === receiptKey) || [];
        const relevantItems = allItemsForReceipt.filter(i => !(i.status === 'order' && i.quantity <= 0));
        const allDelivered = relevantItems.length > 0 && relevantItems.every(i => i.status === 'delivered' || i.status === 'on_delivery');
        const isQuoteGroup = groupItems?.some(i => i.is_quote) || emptyQuotes.includes(key);
        const receiptRecord = receipts?.find(r => r.receipt_number === key);
        const isPaid = receiptRecord?.is_paid || false;
        const paidEmailSent = receiptRecord?.paid_email_sent || false;

        const handleConvertToReceipt = async (e) => {
          e.stopPropagation();
          const newReceiptNumber = prompt("Enter the new Receipt Number:");
          if (newReceiptNumber && newReceiptNumber.trim()) {
            try {
              const response = await base44.functions.invoke('convertQuoteToReceipt', {
                orderId, quoteNumber: key, newReceiptNumber: newReceiptNumber.trim()
              });
              if (response?.data?.success) toast.success(`Converted ${response.data.itemsConverted} items from quote to receipt`);
              queryClient.invalidateQueries(['items', orderId]);
              queryClient.invalidateQueries(['allOrderItems']);
              queryClient.invalidateQueries(['allLoadItems']);
            } catch (error) {
              toast.error("Failed to convert quote: " + error.message);
            }
          }
        };

        const handleTogglePaid = async () => {
          await createOrUpdateReceiptMutation.mutateAsync({ receipt_number: key, is_paid: !isPaid });
          if (!isPaid && onPaidToggle) onPaidToggle(key);
        };

        const handleEditNumber = async (e) => {
          e.stopPropagation();
          const newNumber = prompt(`Enter new ${isQuoteGroup ? 'Quote' : 'Receipt'} number:`, key);
          if (!newNumber || !newNumber.trim() || newNumber.trim() === key) return;
          const newNum = newNumber.trim();
          const oldNum = key;
          try {
            const allOrderItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);
            const itemsToUpdate = allOrderItems.filter(i => i.receipt_number === oldNum);
            const allReceipts = await base44.entities.Receipt.filter({ order_id: orderId });
            const receiptsToUpdate = allReceipts.filter(r => r.receipt_number === oldNum);
            const allLoadsData = await base44.entities.Load.filter({ order_id: orderId }, '-created_date', 500);
            const loadsToUpdate = allLoadsData.filter(l => Array.isArray(l.receipt_numbers) && l.receipt_numbers.includes(oldNum));
            const orderData = await base44.entities.Order.filter({ id: orderId });
            const orderRecord = orderData[0];
            const orderReceiptStr = orderRecord?.receipt_numbers || '';
            const newOrderReceiptStr = orderReceiptStr.split(',').map(n => n.trim()).map(n => n === oldNum ? newNum : n).join(', ');
            await Promise.all([
              ...itemsToUpdate.map(i => base44.entities.OrderItem.update(i.id, { receipt_number: newNum })),
              ...receiptsToUpdate.map(r => base44.entities.Receipt.update(r.id, { receipt_number: newNum })),
              ...loadsToUpdate.map(l => base44.entities.Load.update(l.id, { receipt_numbers: l.receipt_numbers.map(n => n === oldNum ? newNum : n) })),
              base44.entities.Order.update(orderId, { receipt_numbers: newOrderReceiptStr })
            ]);
            queryClient.invalidateQueries();
            toast.success(`Receipt #${oldNum} renamed to #${newNum} across all records.`);
          } catch (err) {
            toast.error('Failed to rename receipt: ' + err.message);
          }
        };

        const handleDeleteNumber = async (e) => {
          e.stopPropagation();
          if (confirm(`Delete ${isQuoteGroup ? 'Quote' : 'Receipt'} #${key}? This will delete all items under this ${isQuoteGroup ? 'quote' : 'receipt'}.`)) {
            // Await all item deletions first
            await Promise.all((groupItems || []).map(item => deleteItemMutation.mutateAsync(item.id)));
            // Delete the Receipt entity if it exists
            const receiptEntity = receipts?.find(r => r.receipt_number === key);
            if (receiptEntity) {
              await base44.entities.Receipt.delete(receiptEntity.id).catch(e => console.warn('Could not delete receipt entity:', e));
            }
            // Immediately invalidate both queries so UI updates without requiring a page refresh
            queryClient.invalidateQueries(['items', orderId]);
            queryClient.invalidateQueries(['receipts', orderId]);
          }
        };

        return (
          <div className="mt-4 mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={onToggle}
                className={`flex items-center gap-2 text-base font-bold uppercase tracking-wider p-1 rounded flex-1 text-left transition-colors ${
                  isQuoteGroup ? 'bg-red-100 text-red-800 hover:bg-red-200'
                  : allDelivered ? 'bg-green-100 text-green-800 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                <span className={`transform transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                {isQuoteGroup ? `Quote #${key}` : (key === 'No Receipt' ? key : `Receipt #${key}`)}
                <div className={`h-px flex-1 ${isQuoteGroup ? 'bg-red-300' : allDelivered ? 'bg-green-300' : 'bg-gray-300'}`}></div>
                <span className={`text-xs font-normal ${isQuoteGroup ? 'text-red-600' : allDelivered ? 'text-green-600' : 'text-gray-500'}`}>{groupItems?.length || 0}</span>
              </button>

              {paidEmailSent && !isQuoteGroup && key !== 'No Receipt' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 border border-blue-200 rounded px-2 py-0.5 text-xs font-medium">
                        📧 Email Sent
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Paid email notification was sent</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {!order?.is_archived && !isQuoteGroup && key !== 'No Receipt' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" onClick={handleTogglePaid}
                        className={`h-7 px-2 ${isPaid ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {isPaid ? '✓ Paid' : 'Mark Paid'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isPaid ? 'Mark as Unpaid' : 'Mark as Paid'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {!order?.is_archived && key !== 'No Receipt' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isQuoteGroup && <DropdownMenuItem onClick={handleConvertToReceipt}>Convert to Receipt</DropdownMenuItem>}
                    <DropdownMenuItem onClick={handleEditNumber}><Pencil className="w-3 h-3 mr-2" />Edit Number</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDeleteNumber} className="text-red-600"><X className="w-3 h-3 mr-2" />Delete {isQuoteGroup ? 'Quote' : 'Receipt'}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {!isQuoteGroup && !order?.is_archived && groupItems?.length > 0 && (
              <div className="flex items-center justify-between text-xs text-gray-500 bg-white p-1.5 rounded border border-gray-200 mt-1">
                <span className="text-xs font-medium">Sale Date:</span>
                <div className="flex items-center gap-1">
                  <Input type="text" placeholder="MM/DD/YY"
                    className="h-6 text-xs text-right border-none bg-transparent hover:text-indigo-600 w-24"
                    key={groupItems[0]?.date_ordered}
                    defaultValue={groupItems[0]?.date_ordered ? format(new Date(groupItems[0].date_ordered + 'T00:00:00'), 'MM/dd/yy') : ''}
                    onInput={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      let formatted = val;
                      if (val.length >= 2) formatted = val.slice(0, 2) + '/' + val.slice(2);
                      if (val.length >= 4) formatted = val.slice(0, 2) + '/' + val.slice(2, 4) + '/' + val.slice(4, 6);
                      e.target.value = formatted;
                    }}
                    onBlur={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val.length === 6) {
                        const mm = val.slice(0, 2), dd = val.slice(2, 4), yy = val.slice(4, 6);
                        const newDate = `20${yy}-${mm}-${dd}`;
                        groupItems.forEach(item => updateItemMutation.mutate({ id: item.id, data: { date_ordered: newDate } }));
                      }
                    }}
                  />
                  <Popover open={openCalendars[`sale_${key}`]} onOpenChange={(open) => setOpenCalendars(prev => ({ ...prev, [`sale_${key}`]: open }))}>
                    <PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-5 w-5 p-0"><Calendar className="h-3 w-3" /></Button></PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <CalendarComponent mode="single" selected={groupItems[0]?.date_ordered ? new Date(groupItems[0].date_ordered + 'T00:00:00') : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const yyyy = date.getFullYear(), mm = String(date.getMonth() + 1).padStart(2, '0'), dd = String(date.getDate()).padStart(2, '0');
                            groupItems.forEach(item => updateItemMutation.mutate({ id: item.id, data: { date_ordered: `${yyyy}-${mm}-${dd}` } }));
                            setOpenCalendars(prev => ({ ...prev, [`sale_${key}`]: false }));
                          }
                        }} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
          </div>
        );
      }}
      renderGroupFooter={(receipt, isQuote) => (
        <Button variant="ghost" size="sm"
          className={`w-full text-xs border border-dashed mt-2 h-auto whitespace-normal py-2 ${isQuote ? 'text-red-500 hover:text-red-700 border-red-300' : 'text-gray-500 hover:text-indigo-600 border-gray-300'}`}
          onClick={() => openCatalogForReceipt(receipt, isQuote)}>
          <Plus className="w-3 h-3 mr-1 shrink-0" /><span>Add Product to {isQuote ? `Quote #${receipt}` : receipt}</span>
        </Button>
      )}
    >
      {(item) => (
        <KanbanItemCard
          item={item}
          showCheckbox={false}
          showSelectCheckbox={true}
          fullyAllocated={item.quantity <= 0}
          isSelected={selectedMasterItems.includes(item.id)}
          onToggleSelect={(id) => setSelectedMasterItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])}
          showReceiptNumber={false}
          showBreakdown={true}
          onToggleVerify={handleVerifiedToggle}
          onUpdateQuantity={(id, val, extraData) => {
            const currentItem = items?.find(i => i.id === id);
            if (!currentItem) return;
            if (extraData) { updateItemMutation.mutate({ id, data: extraData }); return; }
            const movedItems = items.filter(i => i.master_item_id === id && i.status !== 'order');
            const totalMoved = movedItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
            const newRemaining = val - totalMoved;
            updateItemMutation.mutate({ id, data: { quantity: Math.max(0, newRemaining), original_quantity: val } });
          }}
          onDelete={async (id) => {
            const retryWithBackoff = async (fn, maxRetries = 3) => {
              for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                  return await fn();
                } catch (err) {
                  if (attempt < maxRetries - 1 && err?.status === 429) {
                    const delayMs = Math.min(1000 * Math.pow(2, attempt), 5000);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    continue;
                  }
                  throw err;
                }
              }
            };
            
            const childItems = items?.filter(i => i.master_item_id === id);
            if (childItems && childItems.length > 0) {
              // Delete child items with retries, with small delays to avoid rate limits
              for (const item of childItems) {
                await retryWithBackoff(() => base44.entities.OrderItem.delete(item.id));
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
            deleteItemMutation.mutate(id);
          }}
          onQuickToOnOrder={(item) => setMoveDialogState({ isOpen: true, itemId: item.id.replace('_master', ''), targetColumn: 'on_order', targetLocation: null, sourceColumn: 'order', maxQtyOverride: item.quantity })}
          onQuickToHold={(item) => setMoveDialogState({ isOpen: true, itemId: item.id.replace('_master', ''), targetColumn: 'in_hold', targetLocation: null, sourceColumn: 'order', maxQtyOverride: item.quantity })}
          onQuickReturn={(item) => setMoveDialogState({ isOpen: true, itemId: item.id.replace('_master', ''), targetColumn: 'returned', targetLocation: null, sourceColumn: 'order', maxQtyOverride: item.quantity })}
          onEditColor={!order?.is_archived ? onEditColor : null}
          products={products}
          readOnly={order?.is_archived}
          onReadOnlyClick={showArchivedError}
        />
      )}
    </KanbanColumn>
  );
}