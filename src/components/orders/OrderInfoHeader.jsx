import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { ArrowLeft, FileText, MapPin, Pencil, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import RenameReceiptDialog from '@/components/orders/RenameReceiptDialog';

export default function OrderInfoHeader({
  order, orderId, customers, uniqueReceipts, uniqueQuotes,
  onEditOrder, onLinkCustomer, onPrintMasterOrder, items, receipts
}) {
  const queryClient = useQueryClient();
  const [renameDialog, setRenameDialog] = useState({ isOpen: false, oldNumber: '' });

  const renameReceiptMutation = useMutation({
    mutationFn: async ({ oldNum, newNum }) => {
      // Fetch ALL items for this order fresh from DB to avoid stale/incomplete prop
      const allOrderItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);
      console.log('[RenameReceipt] orderId:', orderId, '| oldNum:', oldNum, '| newNum:', newNum, '| allOrderItems count:', allOrderItems.length);
      const itemsToUpdate = allOrderItems.filter((i) => i.receipt_number === oldNum);
      console.log('[RenameReceipt] itemsToUpdate count:', itemsToUpdate.length);
      const allReceipts = await base44.entities.Receipt.filter({ order_id: orderId });
      const receiptsToUpdate = allReceipts.filter((r) => r.receipt_number === oldNum);
      const allLoadsData = await base44.entities.Load.list('-created_date', 500);
      const loadsToUpdate = allLoadsData.filter((l) =>
      l.order_id === orderId &&
      Array.isArray(l.receipt_numbers) &&
      l.receipt_numbers.includes(oldNum)
      );
      const orderReceiptStr = order?.receipt_numbers || '';
      const newOrderReceiptStr = orderReceiptStr.split(',').map((n) => n.trim()).map((n) => n === oldNum ? newNum : n).join(', ');
      await Promise.all([
      ...itemsToUpdate.map((i) => base44.entities.OrderItem.update(i.id, { receipt_number: newNum })),
      ...receiptsToUpdate.map((r) => base44.entities.Receipt.update(r.id, { receipt_number: newNum })),
      ...loadsToUpdate.map((l) => base44.entities.Load.update(l.id, {
        receipt_numbers: l.receipt_numbers.map((n) => n === oldNum ? newNum : n)
      })),
      base44.entities.Order.update(orderId, { receipt_numbers: newOrderReceiptStr })]
      );
    },
    onSuccess: (_, { newNum }) => {
      queryClient.refetchQueries(['items', orderId]);
      queryClient.invalidateQueries(['receipts', orderId]);
      queryClient.invalidateQueries(['order', orderId]);
      queryClient.invalidateQueries(['orders']);
      toast.success(`Receipt number updated to #${newNum} across all records.`);
      setRenameDialog({ isOpen: false, oldNumber: '' });
    }
  });

  const customerName = order.company_name || (order.customer_id ? customers?.find((c) => c.id === order.customer_id)?.company : null) || order.customer_name;

  return (
    <>
      <div className="flex items-center gap-3">
        <Link to={createPageUrl(order.is_archived ? 'ArchivedOrders' : 'Dashboard')}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div className="px-1 py-8">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">{customerName}</h2>
              {order.job_name &&
              <div className="text-sm text-indigo-600 font-medium mt-1">
                  <span className="text-gray-500 font-normal">Job Name: </span>{order.job_name}
                </div>
              }
            </div>
            {!order.is_archived &&
            <>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-indigo-600"
              onClick={onPrintMasterOrder} title="Print Master Order">
                  <Printer className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-indigo-600"
              onClick={onEditOrder} title="Edit Order Details">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onLinkCustomer} title="Link to Customer">
                  Link Customer
                </Button>
              </>
            }
            {order.is_archived && <Badge className="bg-gray-500">Archived</Badge>}
          </div>
          <div className="flex gap-4 text-sm text-gray-500 mt-1">
            <span className="flex items-center gap-1 flex-wrap">
              <FileText className="w-3 h-3" />
              {uniqueReceipts.length > 0 ?
              uniqueReceipts.map((num, idx) =>
              <React.Fragment key={num}>
                    {idx > 0 && <span>, </span>}
                    <button
                  onClick={() => !order?.is_archived && setRenameDialog({ isOpen: true, oldNumber: num })}
                  className={`font-medium ${
                  receipts?.find((r) => r.receipt_number === num)?.is_paid ?
                  'text-green-600' :
                  ''} ${
                  order?.is_archived ? 'cursor-default' : 'hover:text-indigo-600 hover:underline cursor-pointer'}`}
                  title={order?.is_archived ? '' : 'Click to rename receipt number'}>
                  
                     {num}
                    </button>
                  </React.Fragment>
              ) :
              'No Receipt'}
              {uniqueQuotes.length > 0 && uniqueReceipts.length === 0 &&
              <span className="text-red-600 font-medium ml-2">Quotes: {uniqueQuotes.join(', ')}</span>
              }
            </span>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {order.job_address || 'No Address'}</span>
          </div>
        </div>
      </div>

      <RenameReceiptDialog
        isOpen={renameDialog.isOpen}
        onClose={() => setRenameDialog({ isOpen: false, oldNumber: '' })}
        oldNumber={renameDialog.oldNumber}
        isSaving={renameReceiptMutation.isPending}
        onSave={(newNum) => {
          renameReceiptMutation.mutate({ oldNum: renameDialog.oldNumber, newNum });
        }} />
      
    </>);

}