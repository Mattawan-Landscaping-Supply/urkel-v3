import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { AlertTriangle, Calendar, Truck, Box, Package } from 'lucide-react';
import { format } from 'date-fns';
import { HOLD_LOCATIONS } from '@/lib/constants';

const STANDARD_LOCATIONS = HOLD_LOCATIONS;

export default function MoveItemDialog({ isOpen, onClose, onConfirm, itemId, targetColumn, targetLocation, customLocations = [], allItems = [], maxQtyOverride = null, batchMode = false, batchItems = [], isDirectShip = false }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [customLocationName, setCustomLocationName] = useState('');
  const [batchQuantities, setBatchQuantities] = useState({});
  const [moveDate, setMoveDate] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState(null); // 'delivery', 'pickup', 'direct_ship'

  const getLocalDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // Get fresh item directly from allItems using the itemId
  const item = allItems.find(i => i.id === itemId);
  // Use maxQtyOverride if provided (for master items with calculated remaining), otherwise use item quantity
  const maxQuantity = maxQtyOverride !== null ? maxQtyOverride : (item?.quantity || 1);

  // Get batch items data
  const batchItemsData = batchMode ? batchItems.map(id => {
    const realId = (id || '').replace('_master', '');
    const itemData = allItems.find(i => i.id === realId);
    // Calculate remaining quantity for master items
    const movedItems = allItems.filter(i => i.master_item_id === realId && i.status !== 'order');
    const totalMoved = movedItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
    const originalQty = itemData?.original_quantity || ((itemData?.quantity || 0) + totalMoved);
    const remaining = originalQty - totalMoved;
    return {
      ...itemData,
      id: realId,
      remainingQty: Math.max(0, remaining)
    };
  }).filter(Boolean).filter(item => item.remainingQty > 0) : [];

  useEffect(() => {
    if (isOpen) {
      // Reset to max quantity when dialog opens
      const max = maxQtyOverride !== null ? maxQtyOverride : (item?.quantity || 1);
      setQuantity(max);
      setSelectedLocation(targetLocation || '');
      setCustomLocationName('');
      setMoveDate(getLocalDateString());
      setCalendarOpen(false);
      setFulfillmentMethod(isDirectShip ? 'direct_ship' : null);
      
      // Initialize batch quantities to max for each item
      if (batchMode) {
        const initialQtys = {};
        batchItemsData.forEach(item => {
          initialQtys[item.id] = item.remainingQty;
        });
        setBatchQuantities(initialQtys);
      }
    }
  }, [isOpen, itemId, targetLocation, maxQtyOverride, item?.quantity, batchMode]);

  if (!batchMode && !item) return null;

  // Special handling for quote warning
  if (targetColumn === 'quote_warning') {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="bg-amber-100 p-4 rounded-full">
                <AlertTriangle className="w-12 h-12 text-amber-600" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">Stop!</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-center text-gray-700">
              This item is in a <span className="font-bold text-red-600">Quote</span> and must be converted to a Receipt (sale) before it may be moved.
            </p>
          </div>
          <DialogFooter className="flex justify-center gap-3">
            <Button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700">
              Okay, I Understand
            </Button>
            <Button
              variant="outline"
              className="border-orange-400 text-orange-700 hover:bg-orange-50"
              onClick={() => {
                onConfirm(maxQuantity || item?.quantity || 1, targetLocation || null, moveDate);
                onClose();
              }}
            >
              Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const columnLabels = {
    order: "Order",
    on_order: "On Order",
    in_hold: "In Hold",
    delivered: "Delivered",
    returned: "Returned"
  };

  const needsLocation = targetColumn === 'in_hold' && !targetLocation;
  const allLocations = [...Array.from(new Set([...STANDARD_LOCATIONS, ...customLocations].filter(Boolean))).sort(), 'Other'];

  const isDeliveredTarget = targetColumn === 'delivered';

  const handleSubmit = () => {
    const finalLocation = selectedLocation === 'Other' ? customLocationName : selectedLocation;
    if (batchMode) {
      onConfirm(batchQuantities, finalLocation || null, moveDate, fulfillmentMethod);
    } else {
      onConfirm(parseInt(quantity), finalLocation || null, moveDate, fulfillmentMethod);
    }
    onClose();
  };

  const canSubmit = (batchMode 
    ? Object.values(batchQuantities).every(q => parseInt(q) > 0) && (!needsLocation || (selectedLocation && (selectedLocation !== 'Other' || customLocationName.trim())))
    : parseInt(quantity) > 0 && parseInt(quantity) <= maxQuantity && (!needsLocation || (selectedLocation && (selectedLocation !== 'Other' || customLocationName.trim()))))
    && (!isDeliveredTarget || fulfillmentMethod !== null);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Move Items</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4 overflow-y-auto flex-1">
          {/* Date Picker - shown for all moves from master order */}
          <div className="grid gap-2">
            <Label>Move Date</Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="MM/DD/YY"
                className="flex-1"
                value={moveDate ? format(new Date(moveDate + 'T00:00:00'), 'MM/dd/yy') : ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length === 6) {
                    const mm = val.slice(0, 2);
                    const dd = val.slice(2, 4);
                    const yy = val.slice(4, 6);
                    setMoveDate(`20${yy}-${mm}-${dd}`);
                  }
                }}
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

          {batchMode ? (
            <>
              <p className="text-sm text-gray-500">
                Moving <span className="font-bold text-gray-900">{batchItemsData.length} products</span> to <span className="font-bold text-indigo-600">{columnLabels[targetColumn]}</span>
              </p>
              
              {needsLocation && (
                <div className="grid gap-2">
                  <Label>Select Location</Label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allLocations.map(loc => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {selectedLocation === 'Other' && (
                    <Input 
                      placeholder="Enter custom location name..."
                      value={customLocationName}
                      onChange={(e) => setCustomLocationName(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              )}

              <div className="grid gap-3 max-h-[400px] overflow-y-auto">
                <Label className="text-sm font-semibold">Quantity for each product:</Label>
                {batchItemsData.map(batchItem => (
                  <div key={batchItem.id} className="border rounded-lg p-3 space-y-2">
                    <div className="text-sm font-medium text-gray-900">{batchItem.product_name}</div>
                    {batchItem.selected_color && (
                      <div className="text-xs text-gray-500">Color: {batchItem.selected_color}</div>
                    )}
                    <div className="flex gap-2 items-center">
                      <Input 
                        type="number"
                        min="1"
                        max={batchItem.remainingQty}
                        value={batchQuantities[batchItem.id] || ''}
                        onChange={(e) => setBatchQuantities(prev => ({
                          ...prev,
                          [batchItem.id]: e.target.value
                        }))}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-500 shrink-0">Max: {batchItem.remainingQty}</span>
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => setBatchQuantities(prev => ({
                          ...prev,
                          [batchItem.id]: batchItem.remainingQty
                        }))}
                      >
                        All
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Moving <span className="font-bold text-gray-900">{item.product_name}</span> to <span className="font-bold text-indigo-600">{columnLabels[targetColumn]}</span>
              </p>
              
              {targetColumn === 'in_hold' && targetLocation && (
                <p className="text-sm text-gray-500">
                  Location: <span className="font-bold text-orange-600">{targetLocation}</span>
                </p>
              )}
              
              {needsLocation && (
                <div className="grid gap-2">
                  <Label>Select Location</Label>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a location..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allLocations.map(loc => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {selectedLocation === 'Other' && (
                    <Input 
                      placeholder="Enter custom location name..."
                      value={customLocationName}
                      onChange={(e) => setCustomLocationName(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="move-qty">Quantity to move (Max: {maxQuantity})</Label>
                <div className="flex gap-2">
                  <Input 
                    id="move-qty"
                    type="number"
                    min="1"
                    max={maxQuantity}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => setQuantity(maxQuantity)}
                  >
                    All
                  </Button>
                </div>
              </div>

              {isDeliveredTarget && (
                <div className="grid gap-2">
                  <Label>Fulfillment Method</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFulfillmentMethod('delivery')}
                      className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border-2 text-sm font-semibold transition-all ${fulfillmentMethod === 'delivery' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-blue-300 text-gray-600'}`}
                    >
                      <Truck className="w-5 h-5" />
                      Delivered
                    </button>
                    <button
                      type="button"
                      onClick={() => setFulfillmentMethod('pickup')}
                      className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border-2 text-sm font-semibold transition-all ${fulfillmentMethod === 'pickup' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 hover:border-green-300 text-gray-600'}`}
                    >
                      <Box className="w-5 h-5" />
                      Picked Up
                    </button>
                    <button
                      type="button"
                      onClick={() => setFulfillmentMethod('direct_ship')}
                      className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border-2 text-sm font-semibold transition-all ${fulfillmentMethod === 'direct_ship' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-purple-300 text-gray-600'}`}
                    >
                      <Package className="w-5 h-5" />
                      Direct Ship
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Move Items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}