import React from 'react';
import KanbanColumn from '@/components/kanban/KanbanColumn';
import KanbanItemCard from '@/components/kanban/KanbanItemCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Calendar, Truck } from 'lucide-react';
import { format } from 'date-fns';

export default function OnOrderColumn({
  columns, items, order, collapsedPOs, setCollapsedPOs,
  openCalendars, setOpenCalendars, updateItemMutation, setSoDialog, setSoValue,
  getLocalDateString, showArchivedError,
}) {
  return (
    <KanbanColumn
      title="On Order"
      id="on_order"
      items={columns.on_order}
      color="border-yellow-200"
      headerColor="bg-yellow-50"
      groupBy="po_number"
      collapsedGroups={collapsedPOs}
      onToggleCollapse={(key) => setCollapsedPOs(prev => ({ ...prev, [key]: !prev[key] }))}
      renderGroupHeader={(key, groupItems, isCollapsed, onToggle) => (
        <div className="mt-4 mb-2">
          <button
            onClick={onToggle}
            className="flex items-center gap-2 text-base font-bold uppercase tracking-wider p-1 rounded flex-1 text-left transition-colors w-full bg-gray-100 text-gray-900 hover:bg-gray-200"
          >
            <span className={`transform transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
            {key === 'No PO' ? 'No P.O.' : `P.O. #${key}`}
            <div className="h-px flex-1 bg-gray-300"></div>
            <span className="text-xs font-normal text-gray-500">{groupItems?.length || 0}</span>
          </button>
          {!isCollapsed && groupItems?.length > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-500 bg-white p-1.5 rounded border border-gray-200 mt-1">
              <span className="text-xs font-medium">Date Ordered:</span>
              <div className="flex items-center gap-1">
                <Input
                  type="text"
                  placeholder="MM/DD/YY"
                  className="h-6 text-xs text-right border-none bg-transparent hover:text-indigo-600 w-24"
                  key={groupItems[0]?.date_on_order}
                  defaultValue={groupItems[0]?.date_on_order ? format(new Date(groupItems[0].date_on_order + 'T00:00:00'), 'MM/dd/yy') : ''}
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
                      const mm = val.slice(0, 2);
                      const dd = val.slice(2, 4);
                      const yy = val.slice(4, 6);
                      const newDate = `20${yy}-${mm}-${dd}`;
                      groupItems.forEach(item => {
                        updateItemMutation.mutate({ id: item.id, data: { date_on_order: newDate } });
                      });
                    }
                  }}
                />
                <Popover open={openCalendars[`po_${key}`]} onOpenChange={(open) => setOpenCalendars(prev => ({ ...prev, [`po_${key}`]: open }))}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
                      <Calendar className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end" avoidCollisions={false} side="bottom">
                    <CalendarComponent
                      mode="single"
                      selected={groupItems[0]?.date_on_order ? new Date(groupItems[0].date_on_order + 'T00:00:00') : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const yyyy = date.getFullYear();
                          const mm = String(date.getMonth() + 1).padStart(2, '0');
                          const dd = String(date.getDate()).padStart(2, '0');
                          const newDate = `${yyyy}-${mm}-${dd}`;
                          groupItems.forEach(item => {
                            updateItemMutation.mutate({ id: item.id, data: { date_on_order: newDate } });
                          });
                          setOpenCalendars(prev => ({ ...prev, [`po_${key}`]: false }));
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
        </div>
      )}
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
        return (
          <KanbanItemCard
            item={item}
            showCheckbox={false}
            onToggleVerify={() => {}}
            onUpdateQuantity={(id, val) => updateItemMutation.mutate({ id, data: { quantity: val } })}
            maxQuantity={maxQty}
            readOnly={order?.is_archived}
            onReadOnlyClick={showArchivedError}
          >
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs border-dashed"
                onClick={() => {
                  setSoDialog({ isOpen: true, itemId: item.id, item: { ...item } });
                  setSoValue(item.sales_order_number || '');
                }}
              >
                <Truck className="w-3 h-3 mr-1" /> Direct Ship
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full h-7 text-xs bg-orange-100 hover:bg-orange-200 text-orange-800"
                onClick={() => updateItemMutation.mutate({ id: item.id, data: { status: 'in_hold', date_arrived: getLocalDateString() } })}
              >
                Mark Arrived (In Hold)
              </Button>
            </div>
          </KanbanItemCard>
        );
      }}
    </KanbanColumn>
  );
}