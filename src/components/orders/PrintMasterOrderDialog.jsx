import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';

export default function PrintMasterOrderDialog({ isOpen, onClose, order, items, receipts }) {
  const printRef = useRef(null);

  const handlePrint = () => {
    window.print();
  };

  if (!order || !items) return null;

  // Get receipts for this order and filter out zero-quantity items
  const orderReceipts = receipts || [];
  const itemsByReceipt = {};
  
  items.filter(item => (item.quantity || 0) > 0).forEach(item => {
    const receipt = item.receipt_number || 'No Receipt';
    if (!itemsByReceipt[receipt]) {
      itemsByReceipt[receipt] = [];
    }
    itemsByReceipt[receipt].push(item);
  });

  // Deduplicate items within each receipt (merge same product/unit/color/status)
  Object.keys(itemsByReceipt).forEach(receipt => {
    const deduped = {};
    itemsByReceipt[receipt].forEach(item => {
      const key = `${item.product_name}|${item.selected_unit}|${item.selected_color || ''}|${item.status}`;
      if (!deduped[key]) {
        deduped[key] = { ...item, quantity: 0 };
      }
      deduped[key].quantity += (item.quantity || 0);
    });
    itemsByReceipt[receipt] = Object.values(deduped).filter(item => item.quantity > 0);
  });

  // Flatten all deduped items for summary counts
  const dedupedItems = Object.values(itemsByReceipt).flat();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl overflow-visible">
        <DialogHeader>
          <DialogTitle>Print Master Order</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4 print:hidden">
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Button variant="outline" onClick={onClose} className="gap-2">
            <X className="w-4 h-4" />
            Close
          </Button>
        </div>

        <div ref={printRef} className="bg-white p-2 print:p-2 w-full h-[calc(100vh-300px)] overflow-y-auto print:overflow-visible print:h-auto" style={{pageBreakAfter: 'avoid'}}>
          <style>{`
            @media print {
              body { margin: 0; padding: 0; }
              .print-container { margin: 0; padding: 0.5in; width: 8.5in; height: 11in; }
            }
          `}</style>
          
          {/* Header - Compact */}
          <div className="mb-3 pb-2 border-b print:mb-2 print:pb-1.5">
            <h1 className="text-lg font-bold mb-0.5 print:text-base">{order.customer_name}</h1>
            {order.company_name && <p className="text-xs text-gray-600 print:text-xs">Company: {order.company_name}</p>}
            {order.job_address && <p className="text-xs text-gray-600 print:text-xs">Address: {order.job_address}</p>}
            {order.customer_phone && <p className="text-xs text-gray-600 print:text-xs">Phone: {order.customer_phone}</p>}
            <div className="flex gap-4 mt-1 print:text-xs text-xs text-gray-500">
              <span>ID: {order.id}</span>
              <span>{new Date().toLocaleDateString()}</span>
            </div>
          </div>

          {/* Summary - Ultra Compact */}
          <div className="mb-2 grid grid-cols-3 gap-2 text-center print:gap-1 print:mb-2">
            <div className="p-1.5 bg-gray-50 rounded print:p-1">
              <p className="text-sm font-bold text-indigo-600 print:text-xs">{dedupedItems.length}</p>
              <p className="text-xs text-gray-600 print:text-xs">Items</p>
            </div>
            <div className="p-1.5 bg-gray-50 rounded print:p-1">
              <p className="text-sm font-bold text-blue-600 print:text-xs">{orderReceipts.length}</p>
              <p className="text-xs text-gray-600 print:text-xs">Receipts</p>
            </div>
            <div className="p-1.5 bg-gray-50 rounded print:p-1">
              <p className="text-sm font-bold text-green-600 print:text-xs">{dedupedItems.filter(i => i.status === 'delivered').length}</p>
              <p className="text-xs text-gray-600 print:text-xs">Delivered</p>
            </div>
          </div>

          {/* Receipts and Items - Compact */}
          <div className="space-y-2 print:space-y-1">
            {Object.entries(itemsByReceipt).map(([receiptNum, receiptItems]) => (
              <div key={receiptNum} className="border rounded p-1.5 print:p-1 print:border-gray-300">
                <h3 className="font-bold text-xs mb-1 pb-0.5 border-b print:text-xs">
                  {receiptNum === 'No Receipt' ? 'No Receipt' : `Receipt #${receiptNum}`}
                </h3>
                <table className="w-full text-xs print:text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50 print:bg-gray-100">
                      <th className="text-left py-0.5 px-1 print:py-0.5">Product</th>
                      <th className="text-center py-0.5 px-0.5 w-8 print:w-6">Unit</th>
                      <th className="text-center py-0.5 px-0.5 w-10 print:w-8">Color</th>
                      <th className="text-center py-0.5 px-0.5 w-7 print:w-6">Qty</th>
                      <th className="text-center py-0.5 px-0.5 w-14 print:w-12">Location</th>
                      <th className="text-center py-0.5 px-0.5 w-16 print:w-12">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptItems.map((item, idx) => (
                      <tr key={idx} className="border-b print:border-gray-200 text-xs">
                        <td className="py-0.5 px-1">{item.product_name}</td>
                        <td className="text-center py-0.5 px-0.5 text-xs">{item.selected_unit}</td>
                        <td className="text-center py-0.5 px-0.5 text-xs">{item.selected_color || '—'}</td>
                        <td className="text-center py-0.5 px-0.5 text-xs">{item.quantity}</td>
                        <td className="text-center py-0.5 px-0.5 text-xs">{item.hold_location || '—'}</td>
                        <td className="text-center py-0.5 px-0.5">
                          <span className={`text-xs font-semibold ${
                            item.status === 'delivered' ? 'text-green-700' :
                            item.status === 'on_delivery' ? 'text-blue-700' :
                            item.status === 'in_hold' ? 'text-yellow-700' :
                            item.status === 'on_order' ? 'text-orange-700' :
                            item.status === 'returned' ? 'text-red-700' :
                            'text-gray-700'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}