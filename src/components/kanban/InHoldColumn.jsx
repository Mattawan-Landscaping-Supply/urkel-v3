import React from 'react';
import KanbanColumn from '@/components/kanban/KanbanColumn';
import KanbanItemCard from '@/components/kanban/KanbanItemCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Calendar, CheckSquare, Square } from 'lucide-react';
import { format } from 'date-fns';
import { HOLD_LOCATIONS } from '@/lib/constants';

export default function InHoldColumn({
  columns, items, order, customLocations,
  openCalendars, setOpenCalendars, updateItemMutation,
  handleVerifiedToggle, handleQuantityUpdate, handleLocationHeaderChange,
  handleKeepOnSameLoadToggle, setMoveDialogState, mergeDuplicateHoldItems, showArchivedError,
  queryClient,
  onEditColor, products,
  // Batch move props
  batchSelectionMode, setBatchSelectionMode, selectedHoldItemIds, setSelectedHoldItemIds,
  onBatchMoveSelected,
}) {

  const toggleItemSelection = (itemId) => {
    setSelectedHoldItemIds(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const inHoldCount = columns.in_hold.length;

  return (
    <KanbanColumn
      title="In Hold"
      id="in_hold"
      items={columns.in_hold}
      color="border-orange-200"
      headerColor="bg-orange-50"
      groupBy="hold_location"
      useSubDroppables={true}
      extraGroups={customLocations}
      columnHeader={
        !order?.is_archived && inHoldCount > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {batchSelectionMode ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-gray-500 hover:text-red-600"
                  onClick={() => { setBatchSelectionMode(false); setSelectedHoldItemIds([]); }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-xs bg-green-600 hover:bg-green-700 text-white px-2"
                  disabled={selectedHoldItemIds.length === 0}
                  onClick={onBatchMoveSelected}
                >
                  Move Selected ({selectedHoldItemIds.length})
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                  onClick={() => setBatchSelectionMode(true)}
                >
                  Batch Move
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-gray-500 hover:text-indigo-600"
                  onClick={mergeDuplicateHoldItems}
                >
                  Merge Duplicates
                </Button>
              </>
            )}
          </div>
        )
      }
      renderGroupHeader={(key, groupItems) => {
        const standardLocs = HOLD_LOCATIONS;
        const allLocs = Array.from(new Set([...standardLocs, ...customLocations, key].filter(Boolean))).sort();
        const options = [...allLocs, 'Other'];
        return (
          <div className="mb-2">
            <Select value={key} onValueChange={(val) => handleLocationHeaderChange(val, groupItems)}>
              <SelectTrigger className="w-full h-9 font-bold text-gray-800 bg-white border-gray-300 shadow-sm uppercase tracking-wider text-xs">
                <span className="truncate w-full text-left">{key}</span>
              </SelectTrigger>
              <SelectContent>
                {options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        );
      }}
    >
      {(item) => {
        let maxQty = null;
        if (item.master_item_id) {
          const masterItem = items?.find(i => i.id === item.master_item_id);
          if (masterItem) {
            const allMovedItems = items.filter(i => i.master_item_id === item.master_item_id && i.status !== 'order');
            const totalMoved = allMovedItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
            const originalQty = masterItem.original_quantity || (masterItem.quantity + totalMoved);
            const otherItems = allMovedItems.filter(i => i.id !== item.id);
            const otherUsed = otherItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
            maxQty = originalQty - otherUsed;
          }
        }
        const isSelected = selectedHoldItemIds?.includes(item.id);

        return (
          <div className={batchSelectionMode ? `relative` : ''}>
            {batchSelectionMode && (
              <button
                className={`absolute left-1 top-1 z-10 p-0.5 rounded transition-colors ${isSelected ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-400'}`}
                onClick={() => toggleItemSelection(item.id)}
              >
                {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </button>
            )}
          <div
            className={batchSelectionMode ? `cursor-pointer ${isSelected ? 'ring-2 ring-indigo-400 rounded-lg' : 'opacity-75'}` : ''}
            onClick={batchSelectionMode ? () => toggleItemSelection(item.id) : undefined}
          >
          <KanbanItemCard
            item={item}
            showCheckbox={!batchSelectionMode}
            checkboxTooltip="Click to verify product is in hold"
            onToggleVerify={handleVerifiedToggle}
            onUpdateQuantity={(id, val) => handleQuantityUpdate(item, val)}
            maxQuantity={maxQty}
            readOnly={order?.is_archived || batchSelectionMode}
            onReadOnlyClick={batchSelectionMode ? undefined : showArchivedError}
            onEditColor={!order?.is_archived && !batchSelectionMode ? onEditColor : undefined}
            products={products}
          >
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 p-1.5 rounded border border-gray-100">
                <div className="flex items-center gap-1 shrink-0">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="text-xs">Arrived:</span>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    placeholder="MM/DD/YY"
                    className="h-6 text-xs text-right border-gray-200 bg-white hover:bg-gray-50 w-24"
                    key={item.date_arrived}
                    defaultValue={item.date_arrived ? format(new Date(item.date_arrived + 'T00:00:00'), 'MM/dd/yy') : ''}
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
                        updateItemMutation.mutate({ id: item.id, data: { date_arrived: `20${yy}-${mm}-${dd}` } });
                      }
                    }}
                  />
                  <Popover open={openCalendars[`arrived_${item.id}`]} onOpenChange={(open) => setOpenCalendars(prev => ({ ...prev, [`arrived_${item.id}`]: open }))}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 p-0 hover:bg-gray-200">
                        <Calendar className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end" avoidCollisions={false} side="bottom">
                      <CalendarComponent
                        mode="single"
                        selected={item.date_arrived ? new Date(item.date_arrived + 'T00:00:00') : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const yyyy = date.getFullYear();
                            const mm = String(date.getMonth() + 1).padStart(2, '0');
                            const dd = String(date.getDate()).padStart(2, '0');
                            updateItemMutation.mutate({ id: item.id, data: { date_arrived: `${yyyy}-${mm}-${dd}` } });
                            setOpenCalendars(prev => ({ ...prev, [`arrived_${item.id}`]: false }));
                          }
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full h-7 text-xs bg-green-100 hover:bg-green-200 text-green-800"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  let mq = item.quantity;
                  if (item.master_item_id) {
                    const mi = items?.find(i => i.id === item.master_item_id);
                    if (mi) {
                      const moved = items.filter(i => i.master_item_id === item.master_item_id && i.status !== 'order');
                      const totalMoved = moved.reduce((s, i) => s + (i.quantity || 0), 0);
                      const orig = mi.original_quantity || (mi.quantity + totalMoved);
                      const otherUsed = moved.filter(i => i.id !== item.id).reduce((s, i) => s + (i.quantity || 0), 0);
                      mq = orig - otherUsed;
                    }
                  }
                  setMoveDialogState({ isOpen: true, itemId: item.id, targetColumn: 'delivered', targetLocation: null, sourceColumn: 'hold_button', maxQtyOverride: mq, isDirectShip: false });
                }}
              >
                Fulfill
              </Button>
              {(item.selected_unit === 'Each' || item.selected_unit === 'Layer') && (
              <label className="flex items-center gap-2 text-xs text-gray-600 p-1.5 bg-gray-50 rounded border border-gray-200 cursor-pointer hover:bg-gray-100">
                <input type="checkbox" checked={item.keep_on_same_load === true} onChange={() => handleKeepOnSameLoadToggle(item.id)} className="rounded w-3 h-3" />
                Keep all on same load
              </label>
              )}
            </div>
          </KanbanItemCard>
          </div>
          </div>
        );
      }}
    </KanbanColumn>
  );
}