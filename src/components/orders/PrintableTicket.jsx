import React from 'react';
import { Button } from '@/components/ui/button';
import { X, Printer } from 'lucide-react';

export default function PrintableTicket({ order, items, onClose, onConfirmPrint }) {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="fixed inset-0 bg-gray-100 z-50 overflow-auto">
      {/* Print styles for portrait orientation */}
      <style>{`
        @page {
          size: portrait;
          margin: 0.5in;
        }
        @media print {
          @page {
            size: portrait;
            margin: 0.5in;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
      {/* Action bar - hidden when printing */}
      <div className="print:hidden fixed top-0 left-0 right-0 bg-white shadow-md p-4 flex justify-between items-center z-10">
        <h2 className="font-semibold text-gray-700">Print Preview</h2>
        <div className="flex gap-2">
          <Button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-700">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Button onClick={() => onConfirmPrint(items)} className="bg-green-600 hover:bg-green-700">
            Mark As Printed & Close
          </Button>
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" /> Close Preview
          </Button>
        </div>
      </div>
      
      {/* Print content */}
      <div className="max-w-[700px] mx-auto mt-20 print:mt-0 mb-8 print:mb-0 bg-white shadow-lg print:shadow-none">
        <div className="p-8 print:p-6 min-h-[calc(100vh-80px)] print:min-h-[9in] flex flex-col">
          {/* Header */}
          <div className="border-b border-gray-300 pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-bold text-gray-900 uppercase tracking-wide">Pick Up Ticket</h1>
                <div className="mt-3">
                  <p className="text-sm font-semibold text-gray-800">{order?.customer_name}</p>
                  {order?.customer_phone && (
                    <p className="text-xs text-gray-600">{order.customer_phone}</p>
                  )}
                  {order?.job_address && (
                    <p className="text-xs text-gray-500">{order.job_address}</p>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-gray-600">
                <p>{today}</p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b border-gray-400">
                <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500 uppercase w-16">Qty</th>
                <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500 uppercase w-24">Location</th>
                <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500 uppercase w-20">Receipt #</th>
                <th className="py-2 px-2 text-center text-xs font-semibold text-gray-500 uppercase w-12">✓</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id} className="border-b border-gray-200">
                  <td className="py-2 px-2">
                    <span className="text-sm font-medium text-gray-900">{item.quantity} {item.selected_unit}</span>
                  </td>
                  <td className="py-2 px-2">
                    <span className="text-sm text-gray-900 break-words">{item.product_name}</span>
                    {item.selected_color && (
                      <span className="text-xs text-gray-500 ml-2">({item.selected_color})</span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <span className="text-xs text-gray-600 break-words">{item.hold_location || '-'}</span>
                  </td>
                  <td className="py-2 px-2">
                    <span className="text-xs text-gray-600">{item.receipt_number || '-'}</span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <div className="inline-block w-4 h-4 border border-gray-400"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          <div className="flex justify-end mb-8 text-xs text-gray-600">
            <span>Total: <strong>{items.reduce((sum, i) => sum + (i.quantity || 0), 0)}</strong> items</span>
          </div>

          {/* Spacer to push signature to bottom */}
          <div className="flex-grow"></div>

          {/* Signature Section - at bottom */}
          <div className="mt-auto pt-8">
            <div className="border-t border-gray-300 mb-6"></div>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="border-b border-gray-800 h-10 mb-1"></div>
                <p className="text-xs text-gray-500">Customer Signature</p>
              </div>
              <div>
                <div className="border-b border-gray-800 h-10 mb-1"></div>
                <p className="text-xs text-gray-500">Loader Signature</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}