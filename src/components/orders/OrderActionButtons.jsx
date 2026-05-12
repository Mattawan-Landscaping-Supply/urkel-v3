import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Printer, AlertCircle, Bell, RefreshCcw, X, MoreVertical } from 'lucide-react';

export default function OrderActionButtons({
  items, order, receipts, allLoadItemsForOrder,
  onPrintTicket, onOrderHistory, onResetNotification, onSendNotification,
  onAddReminder, onReturnItem, onDeleteOrder, queryClient, orderId,
  isSendingNotification = false
}) {
  const unprintedPickupCount = items?.filter(i =>
    i.quantity > 0 && i.ticket_printed !== true &&
    (i.status === 'in_hold' || (i.status === 'delivered' && i.delivery_method === 'pickup'))
  ).length || 0;

  const notificationButton = (() => {
    const confirmedDeliveredItems = items?.filter(i => i.status === 'delivered' &&
      (i.delivery_method === 'pickup' || i.delivery_method === 'direct_ship' ||
       allLoadItemsForOrder?.some(li => li.order_item_id === i.id))) || [];
    const deliveredReceiptNumbers = new Set(confirmedDeliveredItems.map(i => i.receipt_number).filter(r => r));
    const unpaidDeliveredReceipts = Array.from(deliveredReceiptNumbers).filter(receiptNum => {
      const receiptEntity = receipts?.find(r => r.receipt_number === receiptNum);
      return !receiptEntity || !receiptEntity.is_paid;
    });
    if (unpaidDeliveredReceipts.length === 0) return null;
    return order.first_item_moved_notification_sent ? 'reset' : 'send';
  })();

  return (
    <div className="flex justify-between gap-2">
      <div className="flex gap-2">
        {/* Desktop buttons */}
         <div className="hidden md:flex flex-wrap gap-2">
           {unprintedPickupCount > 0 && !order?.is_archived && (
             <Button variant="outline" className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100" onClick={onPrintTicket}>
               <Printer className="w-4 h-4 mr-2" /> Print Pick Up Ticket
             </Button>
           )}
           <Button variant="outline" onClick={onOrderHistory}><Printer className="w-4 h-4 mr-2" /> Order History</Button>
           {notificationButton === 'reset' && (
             <Button variant="outline" className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100" onClick={onResetNotification}>
               <AlertCircle className="w-4 h-4 mr-2" /> Reset Notification
             </Button>
           )}
           {notificationButton === 'send' && (
              <Button variant="outline" className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100" onClick={onSendNotification} disabled={isSendingNotification}>
                <AlertCircle className="w-4 h-4 mr-2" /> {isSendingNotification ? 'Sending...' : 'Send Notification'}
              </Button>
            )}
           {!order?.is_archived && (
             <Button variant="outline" className="bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100" onClick={onAddReminder}>
               <Bell className="w-4 h-4 mr-2" /> Add Delivery Reminder
             </Button>
           )}
           {!order?.is_archived && (
             <Button variant="outline" className="bg-red-50 border-red-300 text-red-700 hover:bg-red-100" onClick={onReturnItem}>
               <RefreshCcw className="w-4 h-4 mr-2" /> Return Item
             </Button>
           )}
           <Button variant="destructive" className="bg-red-600 hover:bg-red-700" onClick={onDeleteOrder}>
             <X className="w-4 h-4 mr-2" /> Delete Order
           </Button>
         </div>

        {/* Mobile dropdown */}
         <div className="flex md:hidden">
           <DropdownMenu>
             <DropdownMenuTrigger asChild>
               <Button variant="outline" size="icon"><MoreVertical className="w-4 h-4" /></Button>
             </DropdownMenuTrigger>
             <DropdownMenuContent align="end">
               {unprintedPickupCount > 0 && !order?.is_archived && (
                 <DropdownMenuItem onClick={onPrintTicket}><Printer className="w-4 h-4 mr-2 text-purple-600" /> Print Pick Up Ticket</DropdownMenuItem>
               )}
               <DropdownMenuItem onClick={onOrderHistory}><Printer className="w-4 h-4 mr-2" /> Order History</DropdownMenuItem>
               {notificationButton === 'reset' && (
                 <DropdownMenuItem onClick={onResetNotification}><AlertCircle className="w-4 h-4 mr-2 text-blue-600" /> Reset Notification</DropdownMenuItem>
               )}
               {notificationButton === 'send' && (
                  <DropdownMenuItem onClick={onSendNotification} disabled={isSendingNotification}>
                    <AlertCircle className="w-4 h-4 mr-2 text-green-600" /> {isSendingNotification ? 'Sending...' : 'Send Notification'}
                  </DropdownMenuItem>
                )}
               {!order?.is_archived && (
                 <DropdownMenuItem onClick={onAddReminder}><Bell className="w-4 h-4 mr-2 text-amber-600" /> Add Delivery Reminder</DropdownMenuItem>
               )}
               {!order?.is_archived && (
                 <DropdownMenuItem onClick={onReturnItem}><RefreshCcw className="w-4 h-4 mr-2 text-red-600" /> Return Item</DropdownMenuItem>
               )}
               <DropdownMenuItem onClick={onDeleteOrder} className="text-red-600 focus:text-red-600">
                 <X className="w-4 h-4 mr-2" /> Delete Order
               </DropdownMenuItem>
             </DropdownMenuContent>
           </DropdownMenu>
         </div>
      </div>
    </div>
  );
}