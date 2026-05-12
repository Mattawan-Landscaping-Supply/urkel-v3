import React from 'react';
import { format } from 'date-fns';
import { Calendar, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import KanbanColumn from '@/components/kanban/KanbanColumn';
import KanbanItemCard from '@/components/kanban/KanbanItemCard';
import { createPageUrl } from '@/utils';

export default function DeliveredColumn({ items, openCalendars, setOpenCalendars, updateItemMutation, handleVerifiedToggle, handleKeepOnSameLoadToggle, setMoveDialogState, showArchivedError, order, loadItems = [], navigate, allLoads = [] }) {
  return (
    <KanbanColumn
      title="Delivered / Picked Up"
      id="delivered"
      items={items}
      color="border-green-200"
      headerColor="bg-green-50"
      groupBy="date_completed"
      renderGroupHeader={(key, groupItems) => (
        <div className="mt-4 mb-2">
          <div className="flex items-center gap-2 text-base font-bold uppercase tracking-wider p-1 rounded bg-gray-100 text-gray-900">
            <span className="whitespace-nowrap">
              {(() => {
                if (key === 'Unknown Date') return 'Unknown Date';
                const d = new Date(key + 'T12:00:00');
                return isNaN(d.getTime()) ? key : format(d, 'MMM d, yyyy');
              })()}
            </span>
            <Popover
              open={openCalendars[`completed_group_${key}`]}
              onOpenChange={(open) => setOpenCalendars(prev => ({ ...prev, [`completed_group_${key}`]: open }))}
            >
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                  <Calendar className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  mode="single"
                  selected={groupItems[0]?.date_completed ? new Date((groupItems[0].date_completed.split('T')[0]) + 'T00:00:00') : undefined}
                  onSelect={(date) => {
                    if (date) {
                      const yyyy = date.getFullYear();
                      const mm = String(date.getMonth() + 1).padStart(2, '0');
                      const dd = String(date.getDate()).padStart(2, '0');
                      const newDate = `${yyyy}-${mm}-${dd}`;
                      groupItems.forEach(item => updateItemMutation.mutate({ id: item.id, data: { date_completed: newDate } }));
                      setOpenCalendars(prev => ({ ...prev, [`completed_group_${key}`]: false }));
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
            <div className="h-px flex-1 bg-gray-300"></div>
            <span className="text-xs font-normal text-gray-500">{groupItems?.length || 0}</span>
          </div>
        </div>
      )}
    >
      {(item) => {
        const loadItem = loadItems.find(li => li.order_item_id === item.id);
        const load = loadItem ? allLoads.find(l => l.id === loadItem.load_id) : null;
        const isArchivedLoad = load?.status === 'archived';
        return (
        <KanbanItemCard
          item={item}
          showCheckbox={false}
          readOnlyQuantity={true}
          onToggleVerify={handleVerifiedToggle}
          onUpdateQuantity={(id, val) => updateItemMutation.mutate({ id, data: { quantity: val } })}
          onQuickReturn={(item) => setMoveDialogState({ isOpen: true, itemId: item.id, targetColumn: 'returned', targetLocation: null, sourceColumn: 'delivered', maxQtyOverride: item.quantity })}
          readOnly={order?.is_archived || isArchivedLoad}
          onReadOnlyClick={showArchivedError}
          allLoadItemsProp={loadItems}
          allLoadsProp={allLoads}
        >
          <div className="space-y-2">
            {isArchivedLoad && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs text-gray-700 font-medium">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full"></span>
                Archived Load — Read Only
              </div>
            )}
            <div className="flex items-center gap-2">
              <Select
                value={item.delivery_method || 'pickup'}
                onValueChange={(val) => {
                  if (!isArchivedLoad) updateItemMutation.mutate({ id: item.id, data: { delivery_method: val } });
                }}
                disabled={isArchivedLoad}
              >
                <SelectTrigger className={`h-6 w-auto text-[10px] font-medium border ${item.delivery_method === 'direct_ship' ? 'bg-purple-100 text-purple-800 border-purple-300' : item.delivery_method === 'pickup' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-green-100 text-green-800 border-green-300'}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="delivery">Delivered</SelectItem>
                  <SelectItem value="pickup">Picked Up</SelectItem>
                  <SelectItem value="direct_ship">Direct Ship</SelectItem>
                </SelectContent>
              </Select>
              {item.delivery_method === 'delivery' && navigate && (() => {
                const loadItem = loadItems.find(li => li.order_item_id === item.id);
                if (!loadItem) return null;
                return (
                  <Button
                    size="sm"
                    variant="outline"
                    className={`h-6 px-2 text-[10px] border-indigo-300 text-indigo-700 ${isArchivedLoad ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-indigo-50 hover:bg-indigo-100'}`}
                    onClick={() => !isArchivedLoad && navigate(createPageUrl(`LoadDetails?id=${loadItem.load_id}`))}
                    disabled={isArchivedLoad}
                    title={isArchivedLoad ? "Cannot edit archived load" : "View delivery load"}
                  >
                    <Truck className="w-3 h-3 mr-1" />
                    View Load
                  </Button>
                );
              })()}
            </div>
            {item.delivery_method === 'direct_ship' && item.sales_order_number && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-600 shrink-0">S.O. #:</span>
                <span className="text-xs text-gray-700">{item.sales_order_number}</span>
              </div>
            )}
            {item.bol_number && <div className="text-xs text-gray-400">BOL: {item.bol_number}</div>}
            {(item.selected_unit === 'Each' || item.selected_unit === 'Layer') && (
            <label className={`flex items-center gap-2 text-xs p-1.5 rounded border ${isArchivedLoad ? 'text-gray-400 bg-gray-100 border-gray-300 cursor-not-allowed' : 'text-gray-600 bg-gray-50 border-gray-200 cursor-pointer hover:bg-gray-100'}`}>
              <input
                type="checkbox"
                checked={item.keep_on_same_load === true}
                onChange={() => !isArchivedLoad && handleKeepOnSameLoadToggle(item.id)}
                disabled={isArchivedLoad}
                className="rounded w-3 h-3"
              />
              Keep all on same load
            </label>
            )}
          </div>
        </KanbanItemCard>
      );
      }}
    </KanbanColumn>
  );
}