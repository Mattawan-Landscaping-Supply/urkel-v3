import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function BatchProgressDialog({ 
  isOpen, 
  items = [],
  currentIndex = 0,
  title = "Processing Items" 
}) {
  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-[425px]" showClose={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Progress summary */}
          <div className="text-sm font-medium text-gray-600">
            Processing {currentIndex + 1} of {items.length} items...
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
            ></div>
          </div>

          {/* Item list */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 text-sm p-2 rounded bg-gray-50">
                {idx < currentIndex && (
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                )}
                {idx === currentIndex && (
                  <Loader2 className="w-4 h-4 text-indigo-600 flex-shrink-0 animate-spin" />
                )}
                {idx > currentIndex && (
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                )}
                <span className={idx < currentIndex ? 'text-gray-500' : 'text-gray-900'}>
                  {item}
                </span>
              </div>
            ))}
          </div>

          {/* Status message */}
          <div className="text-xs text-gray-500 text-center">
            Please wait while items are being processed...
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}