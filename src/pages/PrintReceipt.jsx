import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

export default function PrintReceipt() {
  const urlParams = new URLSearchParams(window.location.search);
  const loadId = urlParams.get('id');
  const navigate = useNavigate();
  const [selectedCustomerIndex, setSelectedCustomerIndex] = useState(null);
  const [missingAddressWarning, setMissingAddressWarning] = useState(false);

  const { data: load, isLoading: loadLoading } = useQuery({
    queryKey: ['load', loadId],
    queryFn: () => base44.entities.Load.get(loadId),
    enabled: !!loadId,
    staleTime: 0
  });

  // Fetch ALL active loads for the same delivery date so same-customer loads are combined
  const { data: allLoadsForDate = [] } = useQuery({
    queryKey: ['loadsForDate', load?.delivery_date, load?.customer_name],
    queryFn: async () => {
      const allLoads = await base44.entities.Load.list('-created_date', 500);
      return allLoads.filter(l =>
        l.delivery_date === load.delivery_date &&
        l.customer_name === load.customer_name &&
        (l.status === 'active' || !l.status)
      );
    },
    enabled: !!load?.delivery_date && !!load?.customer_name,
    staleTime: 0
  });

  const relevantLoadIds = allLoadsForDate.length > 0
    ? allLoadsForDate.map(l => l.id)
    : (loadId ? [loadId] : []);

  const { data: loadItems = [] } = useQuery({
    queryKey: ['loadItems', 'receipt', relevantLoadIds.sort().join(',')],
    queryFn: async () => {
      const items = await base44.entities.LoadItem.list('-created_date', 2000);
      return items.filter(item => relevantLoadIds.includes(item.load_id));
    },
    enabled: relevantLoadIds.length > 0,
    staleTime: 0
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    staleTime: 0
  });

  const { data: allOrderItems = [] } = useQuery({
    queryKey: ['allOrderItems'],
    queryFn: () => base44.entities.OrderItem.list()
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-created_date', 500)
  });

  const { data: loadCustomerStops = [] } = useQuery({
    queryKey: ['loadCustomerStops'],
    queryFn: () => base44.entities.LoadCustomerStop.list()
  });

  const doPrint = async () => {
    // If the load is part of a batch, mark ALL loads in that batch as receipts_printed
    if (load?.schedule_batch_id) {
      const allLoads = await base44.entities.Load.list('-created_date', 500);
      const batchLoads = allLoads.filter(l => l.schedule_batch_id === load.schedule_batch_id);
      await Promise.all(batchLoads.map(l =>
        base44.entities.Load.update(l.id, { receipts_printed: true })
      ));
    } else {
      // No batch ID, mark all loads for this date+customer
      const allLoads = await base44.entities.Load.list('-created_date', 500);
      const toMark = allLoads.filter(l =>
        l.delivery_date === load?.delivery_date &&
        l.customer_name === load?.customer_name
      );
      const idsToMark = toMark.length > 0 ? toMark.map(l => l.id) : (loadId ? [loadId] : []);
      await Promise.all(idsToMark.map(id =>
        base44.entities.Load.update(id, { receipts_printed: true })
      ));
    }
    
    window.print();
  };

  const handlePrint = () => {
    const group = customerGroups.length > 1 ? customerGroups[selectedCustomerIndex] : customerGroups[0];
    if (!group?.customer_address) {
      setMissingAddressWarning(true);
    } else {
      doPrint();
    }
  };

  const handleClose = () => {
    if (loadId) {
      navigate(createPageUrl(`LoadDetails?id=${loadId}`));
    } else {
      navigate(createPageUrl('Deliver'));
    }
  };

  if (loadLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!load) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Load not found</p>
      </div>
    );
  }

  // Group items by customer name + address (combine all stops for same customer/address)
  const itemsByCustomerKey = {};
  loadItems.forEach(item => {
    const orderItem = item.order_item_id ? allOrderItems.find(oi => oi.id === item.order_item_id) : null;
    const order = orderItem?.order_id ? orders.find(o => o.id === orderItem.order_id) : null;

    const customerName = order?.customer_name || load.customer_name || '';
    const customerAddress = order?.job_address || load.customer_address || '';
    const key = `${customerName}||${customerAddress}`;

    if (!itemsByCustomerKey[key]) {
      itemsByCustomerKey[key] = {
        customer_name: customerName,
        customer_address: customerAddress,
        customer_phone: order?.customer_phone || load.customer_phone || null,
        job_name: order?.job_name || null,
        items: [],
        receipt_numbers: new Set()
      };
    }
    itemsByCustomerKey[key].items.push(item);
    if (orderItem?.receipt_number) {
      itemsByCustomerKey[key].receipt_numbers.add(orderItem.receipt_number);
    }
  });

  // Convert to array of groups (one per unique customer+address)
  const customerGroups = Object.values(itemsByCustomerKey).map(group => ({
    ...group,
    receipt_numbers: Array.from(group.receipt_numbers).sort()
  }));

  // Show selection screen if multiple distinct customers
  if (customerGroups.length > 1 && selectedCustomerIndex === null) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <Button variant="ghost" onClick={handleClose}>
              <X className="w-4 h-4 mr-2" /> Back to Load
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Select Receipt to Print</h1>
          <p className="text-gray-600 mb-6">This load has multiple customers. Choose which receipt to print:</p>
          <div className="space-y-3">
            {customerGroups.map((customerGroup, idx) => {
              const receiptDisplay = customerGroup.receipt_numbers.length > 0
                ? customerGroup.receipt_numbers.join(', ')
                : 'N/A';
              return (
                <Card key={idx} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setSelectedCustomerIndex(idx)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-lg text-gray-900">{customerGroup.customer_name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{customerGroup.customer_address}</p>
                        <p className="text-sm text-indigo-600 mt-2 font-semibold">Receipt #: {receiptDisplay}</p>
                        <p className="text-xs text-gray-500 mt-1">{customerGroup.items.length} items</p>
                      </div>
                      <Button className="bg-indigo-600 hover:bg-indigo-700">Select</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Get the customer group to print
  const customerGroupToPrint = customerGroups.length > 1 ? customerGroups[selectedCustomerIndex] : customerGroups[0];

  if (!customerGroupToPrint) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">No items found for this receipt</p>
      </div>
    );
  }

  return (
          <div className="bg-white min-h-screen print:min-h-0 print:p-0 print:m-0 print:bg-white">
      <style>{`
        @media print {
          @page {
            size: 8.5in 11in;
            margin: 0.25in;
          }
          * {
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          html, body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: visible !important;
            height: auto !important;
            background-color: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body {
            width: 100% !important;
            background-color: white !important;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            padding: 0.25rem !important;
            margin: 0 !important;
          }
          .print-section {
            margin-bottom: 0.5rem !important;
          }
          .print-tight {
            padding: 0.25rem !important;
          }
          div, p, h1, h2, h3, h4, h5, h6, table, tr, td, th {
            background-color: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {/* Missing Address Warning Dialog */}
      <Dialog open={missingAddressWarning} onOpenChange={setMissingAddressWarning}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" /> Missing Address
            </DialogTitle>
            <DialogDescription asChild>
              <div className="mt-2 space-y-2">
                <p>This customer does not have a delivery address on file.</p>
                <p className="text-sm text-gray-600">You may want to add the address before printing, or print anyway.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMissingAddressWarning(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => { setMissingAddressWarning(false); doPrint(); }}>
              Print Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Bar */}
      <div className="no-print fixed top-16 right-4 flex gap-4 z-50">
        {customerGroups.length > 1 && (
          <Button onClick={() => setSelectedCustomerIndex(null)} variant="outline">
            Change Receipt
          </Button>
        )}
        <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700">
          Print Receipt
        </Button>
        <Button onClick={handleClose} variant="outline">
          <X className="w-4 h-4 mr-2" /> Close
        </Button>
      </div>

      {/* Printable Content */}
      {(() => {
        const customerGroup = customerGroupToPrint;

        // Combine items with same product name + unit + color into single rows
        const combinedItemsMap = {};
        customerGroup.items.forEach(item => {
          const key = `${item.name}||${item.selected_unit || ''}||${item.selected_color || ''}`;
          if (!combinedItemsMap[key]) {
            combinedItemsMap[key] = { ...item, quantity: 0 };
          }
          combinedItemsMap[key].quantity += (item.quantity || 1);
        });
        const combinedItems = Object.values(combinedItemsMap);

        // Product catalog weights are stored in lbs — no conversion needed
         let customerTotalWeight = 0;
         combinedItems.forEach(item => {
           const product = products.find(p => p.name === item.name);
           let weight = 0;
           if (product) {
             if (item.selected_unit === 'Pallet') weight = product.weight_pallet || 0;
             else if (item.selected_unit === 'Each') weight = product.weight_each || 0;
             else if (item.selected_unit === 'Layer') weight = product.weight_layer || 0;
           }
           if (!weight) weight = item.weight || 0;
           customerTotalWeight += weight * item.quantity;
         });
         const customerTotalWeightLbs = Math.round(customerTotalWeight);

        const receiptDisplay = customerGroup.receipt_numbers.length > 0 
          ? customerGroup.receipt_numbers.join(', ') 
          : 'N/A';

        const ReceiptContent = ({ copyLabel }) => (
          <div className="max-w-2xl mx-auto p-8 print:p-0 print:m-0 bg-white print-container">
          {/* Header with Logo */}
          <div className="flex items-start justify-between mb-4 print:mb-2 print-section">
            <div className="flex-1">
              {/* Company Logo */}
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6962ca7ed1a1badc683a33a7/9d4aee6ab_Screenshot2023-08-07145806.jpg"
                alt="Mattawan Landscaping Supply"
                className="h-16 object-contain mb-2"
              />
              
              {/* Company Info */}
              <div className="text-sm text-gray-800 leading-tight">
                <p className="font-medium">26333 Red Arrow Way</p>
                <p className="font-medium">Mattawan, MI 49071</p>
                <p className="font-medium">269-283-3040</p>
              </div>
            </div>

            {/* Date Section */}
            <div className="text-right">
              <p className="text-sm text-gray-600">Delivery Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {load.delivery_date ? format(new Date(load.delivery_date + 'T00:00:00'), 'MMMM dd, yyyy') : 'N/A'}
              </p>
            </div>
          </div>

          {/* Title and Receipt Number */}
          <div className="mb-4 print:mb-2 print-section">
            <h1 className="text-xl font-bold text-gray-900">DELIVERY RECEIPT</h1>
            <p className="text-base font-semibold text-gray-900 mt-2">
              Receipt #: <span className="text-indigo-600">
                {receiptDisplay}
              </span>
            </p>
          </div>

          {/* Ship To Section */}
          <div className="mb-4 print:mb-2 pb-3 print:pb-2 border-b-2 border-gray-300 print-section">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2">Ship To:</p>
            <h2 className="text-lg font-bold text-gray-900">{customerGroup.customer_name}</h2>
            {customerGroup.job_name && (
              <p className="text-sm font-semibold text-indigo-700">Job Name: {customerGroup.job_name}</p>
            )}
            <p className="text-sm text-gray-800">{customerGroup.customer_address}</p>
            {customerGroup.customer_phone && (
              <p className="text-sm text-gray-800">Phone: {customerGroup.customer_phone}</p>
            )}
          </div>

        {/* Products Delivered Section */}
        <div className="mb-4 print:mb-2 print-section">
          <div className="border-2 border-gray-300 rounded p-3 print:p-2 print-tight">
            <div className="bg-gray-200 p-2 -m-3 mb-3 rounded-t">
              <p className="text-sm font-bold text-gray-900 uppercase">Products Delivered:</p>
            </div>
            
            {/* Products Table */}
            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-2 font-bold text-gray-900 text-xs">Product</th>
                  <th className="text-center py-2 font-bold text-gray-900 text-xs">Weight Each</th>
                  <th className="text-center py-2 font-bold text-gray-900 text-xs">Qty</th>
                  <th className="text-center py-2 font-bold text-gray-900 text-xs">Driver Initials</th>
                </tr>
              </thead>
              <tbody>
                {combinedItems.map((item, idx) => {
                   const product = products.find(p => p.name === item.name);
                   let itemWeight = 0;
                   if (product) {
                     if (item.selected_unit === 'Pallet') itemWeight = product.weight_pallet || 0;
                     else if (item.selected_unit === 'Each') itemWeight = product.weight_each || 0;
                     else if (item.selected_unit === 'Layer') itemWeight = product.weight_layer || 0;
                   }
                   if (!itemWeight) itemWeight = item.weight || 0;
                   return (
                    <tr key={idx} className="border-b border-gray-300">
                      <td className="py-2 text-gray-900">
                        {item.name}
                        {item.selected_unit && <span className="text-xs text-gray-600"> ({item.selected_unit})</span>}
                        {item.selected_color && <span className="text-xs text-gray-600"> - {item.selected_color}</span>}
                      </td>
                      <td className="text-center py-2 text-gray-800">{itemWeight ? `${itemWeight.toFixed(0)} lbs` : '-'}</td>
                      <td className="text-center py-2 font-semibold text-gray-900">x{item.quantity || 1}</td>
                      <td className="text-center py-2"><div className="border border-gray-300 w-12 h-6 mx-auto"></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div className="grid grid-cols-2 gap-8 pt-2">
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Total Weight</p>
                <p className="text-lg font-bold text-gray-900">{customerTotalWeightLbs.toLocaleString()} lbs</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Number of Deliveries</p>
                <p className="text-lg font-bold text-gray-900">{relevantLoadIds.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Driver Notes Section */}
        <div className="mb-4 print:mb-2 print-section">
          <p className="text-sm font-bold text-gray-900 uppercase mb-2">Driver Notes:</p>
          <div className="border-2 border-gray-300 rounded p-3 h-16"></div>
        </div>

        {/* Recipient Acknowledgment Section */}
        <div className="mb-4 print:mb-2 print-section">
          <div className="border-2 border-gray-300 rounded p-3 print:p-2 print-tight">
            <p className="text-sm font-bold text-gray-900 uppercase mb-2">Recipient Acknowledgment:</p>
            <p className="text-sm text-gray-900 mb-3">I acknowledge receipt of the above products in good condition.</p>
            
            <div className="mb-2 pb-2 border-b border-gray-300 h-10"></div>
            <p className="text-gray-600 text-xs mb-3">Recipient Signature</p>

            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="border-b border-gray-300 h-6 mb-2"></div>
                <p className="text-gray-600 text-xs">Print Name</p>
              </div>
              <div>
                <div className="border-b border-gray-300 h-6 mb-2"></div>
                <p className="text-gray-600 text-xs">Date</p>
              </div>
            </div>
          </div>
        </div>

          {/* Footer */}
          <div className="text-center pt-2 print:pt-1 text-sm text-gray-600">
            Thank you for your business!
            {copyLabel && <span className="ml-4 text-xs text-gray-400 no-print">{copyLabel}</span>}
          </div>
          </div>
        );

        return (
          <>
            <ReceiptContent copyLabel="Copy 1" />
            <div style={{ pageBreakBefore: 'always' }}><ReceiptContent copyLabel="Copy 2" /></div>
          </>
        );
      })()}
    </div>
  );
}