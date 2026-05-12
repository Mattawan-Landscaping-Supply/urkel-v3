import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Label } from "@/components/ui/label";
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Truck, Box, Package, Calendar, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const getLocalDateString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export default function BatchMoveToDeliveredDialog({ isOpen, onClose, onConfirm, selectedItems = [], isProcessing = false }) {
  const [moveDate, setMoveDate] = useState('');
  const [fulfillmentMethod, setFulfillmentMethod] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMoveDate(getLocalDateString());
      setFulfillmentMethod(null);
      setCalendarOpen(false);
    }
  }, [isOpen]);

  const canSubmit = fulfillmentMethod !== null && !isProcessing;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({ moveDate, fulfillmentMethod });
  };

  const methods = [
    { id: 'delivery', label: 'Delivered', icon: Truck, activeClass: 'border-blue-500 bg-blue-50 text-blue-700', hoverClass: 'hover:border-blue-300' },
    { id: 'pickup', label: 'Picked Up', icon: Box, activeClass: 'border-green-500 bg-green-50 text-green-700', hoverClass: 'hover:border-green-300' },
    { id: 'direct_ship', label: 'Direct Ship', icon: Package, activeClass: 'border-purple-500 bg-purple-50 text-purple-700', hoverClass: 'hover:border-purple-300' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={isProcessing ? undefined : onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Move {selectedItems.length} Item{selectedItems.length !== 1 ? 's' : ''} to Delivered</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="text-sm text-gray-500">
            All selected items will be moved using the same date and method.
          </div>

          {/* Date picker */}
          <div className="grid gap-2">
            <Label>Move Date</Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="MM/DD/YY"
                className="flex-1"
                value={moveDate ? format(new Date(moveDate + 'T00:00:00'), 'MM/dd/yy') : ''}
                readOnly
              />
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Calendar className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent
                    mode="single"
                    selected={moveDate ? new Date(moveDate + 'T00:00:00') : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const yyyy = date.getFullYear();
                        const mm = String(date.getMonth() + 1).padStart(2, '0');
                        const dd = String(date.getDate()).padStart(2, '0');
                        setMoveDate(`${yyyy}-${mm}-${dd}`);
                      }
                      setCalendarOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Fulfillment method */}
          <div className="grid gap-2">
            <Label>Fulfillment Method</Label>
            <div className="grid grid-cols-3 gap-2">
              {methods.map(({ id, label, icon: Icon, activeClass, hoverClass }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFulfillmentMethod(id)}
                  className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border-2 text-sm font-semibold transition-all ${fulfillmentMethod === id ? activeClass : `border-gray-200 text-gray-600 ${hoverClass}`}`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : `Move ${selectedItems.length} Item${selectedItems.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}