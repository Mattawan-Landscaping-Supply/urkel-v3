import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function PrintableSummary() {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('id');

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => base44.entities.Order.get(orderId),
    enabled: !!orderId
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['items', orderId],
    queryFn: () => base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500),
    enabled: !!orderId
  });

  const handlePrint = () => {
    window.print();
  };

  const handleClose = () => {
    window.close();
  };

  if (orderLoading || itemsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Order not found</p>
      </div>
    );
  }

  const deliveredItems = items?.filter(i => i.status === 'delivered') || [];

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 0.5in;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Action Bar - Hidden when printing */}
      <div className="no-print fixed top-4 right-4 flex gap-2 z-50">
        <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700">
          Print Summary
        </Button>
        <Button onClick={handleClose} variant="outline">
          <X className="w-4 h-4 mr-2" /> Close
        </Button>
      </div>

      {/* Printable Content */}
      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Order Summary</h1>
          <p className="text-gray-600">First Item Delivered</p>
        </div>

        {/* Order Information */}
        <div className="border-2 border-gray-300 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-gray-900">Customer Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Customer Name</p>
              <p className="font-semibold text-gray-900">{order.customer_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="font-semibold text-gray-900">{order.customer_phone || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Job Site Address</p>
              <p className="font-semibold text-gray-900">{order.job_address || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Delivery Date</p>
              <p className="font-semibold text-gray-900">
                {order.delivery_date ? format(new Date(order.delivery_date + 'T00:00:00'), 'MMM d, yyyy') : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Receipt Numbers</p>
              <p className="font-semibold text-gray-900">{order.receipt_numbers || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Date</p>
              <p className="font-semibold text-gray-900">{format(new Date(), 'MMM d, yyyy')}</p>
            </div>
          </div>
        </div>

        {/* Delivered Items */}
        <div className="border-2 border-gray-300 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-gray-900">Items Delivered</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2 text-gray-700">Quantity</th>
                <th className="text-left py-2 text-gray-700">Product</th>
                <th className="text-left py-2 text-gray-700">Color</th>
                <th className="text-left py-2 text-gray-700">Receipt #</th>
                <th className="text-left py-2 text-gray-700">Method</th>
              </tr>
            </thead>
            <tbody>
              {deliveredItems.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-200">
                  <td className="py-2">{item.quantity} {item.selected_unit || 'Each'}</td>
                  <td className="py-2">{item.product_name}</td>
                  <td className="py-2">{item.selected_color || 'N/A'}</td>
                  <td className="py-2">{item.receipt_number || 'N/A'}</td>
                  <td className="py-2">
                    {item.delivery_method === 'pickup' ? 'Picked Up' : 
                     item.delivery_method === 'direct_ship' ? 'Direct Ship' : 'Delivered'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Notes Section */}
        {order.notes && (
          <div className="border-2 border-gray-300 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Notes</h2>
            <p className="text-gray-900 whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}