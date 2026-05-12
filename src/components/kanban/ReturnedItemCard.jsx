import React from 'react';
import KanbanItemCard from './KanbanItemCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from 'date-fns';

export default function ReturnedItemCard({ item, order, openCalendars, setOpenCalendars, updateItemMutation, handleVerifiedToggle, deleteItemMutation, showArchivedError }) {
  return (
    <KanbanItemCard
      item={item}
      showCheckbox={false}
      readOnlyQuantity={false}
      onToggleVerify={handleVerifiedToggle}
      onUpdateQuantity={(id, val) => updateItemMutation.mutate({ id, data: { quantity: val } })}
      onDelete={(id) => deleteItemMutation.mutate(id)}
      readOnly={order?.is_archived}
      onReadOnlyClick={showArchivedError}
    >
      <div className="space-y-2">
        {item.is_damaged && (
          <div className="bg-gray-100 border border-gray-300 rounded p-2 text-center">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">⚠️ Damaged</span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 p-1.5 rounded border border-gray-100">
          <div className="flex items-center gap-1 shrink-0">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-xs">Returned:</span>
          </div>
          <div className="flex items-center gap-1">
            <Input
              type="text"
              placeholder="MM/DD/YY"
              className="h-6 text-xs text-right border-none bg-transparent hover:text-indigo-600 w-24"
              defaultValue={item.date_returned ? format(new Date(item.date_returned + 'T00:00:00'), 'MM/dd/yy') : ''}
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
                  updateItemMutation.mutate({ id: item.id, data: { date_returned: `20${yy}-${mm}-${dd}` } });
                }
              }}
            />
            <Popover open={openCalendars[`returned_${item.id}`]} onOpenChange={(open) => setOpenCalendars(prev => ({...prev, [`returned_${item.id}`]: open}))}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
                  <Calendar className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  mode="single"
                  selected={item.date_returned ? new Date(item.date_returned + 'T00:00:00') : undefined}
                  onSelect={(date) => {
                    if (date) {
                      const yyyy = date.getFullYear();
                      const mm = String(date.getMonth() + 1).padStart(2, '0');
                      const dd = String(date.getDate()).padStart(2, '0');
                      updateItemMutation.mutate({ id: item.id, data: { date_returned: `${yyyy}-${mm}-${dd}` } });
                      setOpenCalendars(prev => ({...prev, [`returned_${item.id}`]: false}));
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </KanbanItemCard>
  );
}