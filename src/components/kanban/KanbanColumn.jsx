import React from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function KanbanColumn({ title, id, items, children, color, headerColor, onAdd, onAddQuote, onAddLightspeed, onAddTooltip, groupBy, subGroupBy, extraGroups = [], extraQuoteGroups = [], allItems = [], renderGroupFooter, renderGroupHeader: customGroupHeader, useSubDroppables = false, columnFooter, columnHeader, collapsedGroups = {}, onToggleCollapse, selectedItems = [], onSelectionChange, onBatchMove, readOnly = false }) {
    let groupedItems = {};
    let sortedGroupKeys = [];
    let sortedItems = items;

    if (groupBy) {
        items.forEach(item => {
            let key;
            if (groupBy === 'date_completed') {
                const raw = item.date_completed;
                key = raw ? raw.split('T')[0] : 'Unknown Date';
            } else if (groupBy === 'hold_location') {
                key = item.hold_location || 'Unassigned';
            } else if (groupBy === 'receipt_number') {
                key = item.receipt_number || 'No Receipt';
            } else {
                key = item[groupBy] || 'Other';
            }
            if (!groupedItems[key]) groupedItems[key] = [];
            groupedItems[key].push(item);
        });

        // Within each date_completed group, sort items by product name so like items appear together
        if (groupBy === 'date_completed') {
            Object.keys(groupedItems).forEach(key => {
                groupedItems[key].sort((a, b) => (a.product_name || a.name || '').localeCompare(b.product_name || b.name || ''));
            });
        }

        extraGroups.forEach(group => { if (!groupedItems[group]) groupedItems[group] = []; });
        extraQuoteGroups.forEach(group => { if (!groupedItems[group]) groupedItems[group] = []; });

        sortedGroupKeys = Object.keys(groupedItems).sort((a, b) => {
            if (groupBy === 'date_completed') {
                if (a === 'Unknown Date') return 1;
                if (b === 'Unknown Date') return -1;
                const da = new Date((a.split('T')[0]) + 'T00:00:00');
                const db = new Date((b.split('T')[0]) + 'T00:00:00');
                return db - da;
            }
            if (groupBy === 'receipt_number') {
                // Sort by newest item created_date descending (newest receipts first)
                const getNewestDate = (key) => {
                    const grp = groupedItems[key] || [];
                    if (grp.length === 0) return Infinity; // empty groups (just added) appear first
                    return Math.max(...grp.map(i => new Date(i.created_date || 0).getTime()));
                };
                if (a === 'No Receipt') return 1;
                if (b === 'No Receipt') return -1;
                return getNewestDate(b) - getNewestDate(a);
            }
            if (a === 'No Receipt') return 1;
            if (b === 'No Receipt') return -1;
            if (a === 'Unassigned') return -1;
            if (b === 'Unassigned') return 1;
            return a.localeCompare(b);
        });
    }

    const defaultRenderGroupHeader = (key) => {
        if (groupBy === 'date_completed') {
            if (key === 'Unknown Date') return key;
            const d = new Date(key + 'T12:00:00');
            return isNaN(d.getTime()) ? key : format(d, 'MMM d, yyyy');
        }
        return key;
    };

    const renderItemList = (list, isSubDroppable = false) => {
        return list.map((item, index) => {
            const draggableIndex = isSubDroppable ? index : items.findIndex(i => i.id === item.id);
            const isInHoldAndVerified = item.status === 'in_hold' && item.is_verified;
            return (
                <Draggable key={item.draggableId || item.id} draggableId={item.draggableId || item.id} index={draggableIndex}>
                    {(provided, snapshot) => (
                        <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{ ...provided.draggableProps.style }}
                            className={`p-2 rounded-lg shadow-sm mb-1.5 ${isInHoldAndVerified ? 'bg-blue-50 border-2 border-blue-400' : 'bg-white border border-gray-200'} ${snapshot.isDragging ? 'shadow-lg rotate-2 ring-2 ring-indigo-400' : 'hover:border-indigo-300'}`}
                        >
                            {children(item)}
                        </div>
                    )}
                </Draggable>
            );
        });
    };

    // Only count selected items that are still present in the current items list with qty > 0
    const validSelectedCount = selectedItems ? selectedItems.filter(id => {
        const realId = (id || '').replace('_master', '');
        return items.some(i => i.id === realId && (i.quantity || 0) > 0);
    }).length : 0;

    const headerActions = (
        <div className="flex flex-row items-center gap-2">
            {validSelectedCount > 0 && !readOnly ? (
                <>
                    <Button variant="outline" size="sm" className="h-6 px-2 text-xs bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100" onClick={() => onBatchMove?.('on_order')}>To On Order</Button>
                    <Button variant="outline" size="sm" className="h-6 px-2 text-xs bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100" onClick={() => onBatchMove?.('in_hold')}>To In Hold</Button>
                </>
            ) : (
                <div className="flex flex-row items-center gap-3">
                    {onAdd && <Button variant="ghost" size="sm" className="h-auto px-2 py-0.5 text-xs" onClick={onAdd}>Add Receipt</Button>}
                    {onAddQuote && <Button variant="ghost" size="sm" className="h-auto px-2 py-0.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onAddQuote}>Add Quote</Button>}
                    {onAddLightspeed && <Button variant="ghost" size="sm" className="h-auto px-2 py-0.5 text-xs text-yellow-700 hover:text-yellow-800 hover:bg-yellow-50" onClick={onAddLightspeed}>⚡ LS Import</Button>}
                </div>
            )}
        </div>
    );

    if (useSubDroppables) {
        return (
            <div className={`flex flex-col h-full rounded-xl border ${color} bg-white shadow-sm overflow-hidden`}>
                <div className={`p-3 border-b ${color} ${headerColor}`}>
                    <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wider">{title}</h3>
                    {validSelectedCount > 0 && <Badge className="bg-indigo-600 text-white w-fit mt-1">{validSelectedCount} selected</Badge>}
                </div>
                {(onAdd || onAddQuote || onAddLightspeed || validSelectedCount > 0) && (
                    <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                        {headerActions}
                    </div>
                )}
                <Droppable droppableId={id}>
                    {(provided, snapshot) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className={`flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/50 transition-colors ${snapshot.isDraggingOver ? 'bg-indigo-50' : ''}`}>
                            {sortedGroupKeys.filter(key => groupedItems[key].length > 0).map(key => {
                                const groupList = groupedItems[key];
                                const droppableId = `${id}::${key}`;
                                return (
                                    <div key={key} className="space-y-2 bg-gray-100/50 p-2 rounded-lg border border-dashed border-gray-200 mb-4">
                                        {customGroupHeader ? customGroupHeader(key, groupList) : (
                                            <div className="flex items-center gap-2 text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">
                                                {defaultRenderGroupHeader(key)}
                                                <div className="h-px bg-gray-300 flex-1"></div>
                                                <span className="text-xs text-gray-400 font-normal">{groupList.length}</span>
                                            </div>
                                        )}
                                        <Droppable droppableId={droppableId}>
                                            {(subProvided, subSnapshot) => (
                                                <div {...subProvided.droppableProps} ref={subProvided.innerRef} className={`min-h-[60px] transition-colors rounded-md ${subSnapshot.isDraggingOver ? 'bg-indigo-50 ring-2 ring-indigo-100' : ''}`}>
                                                    {renderItemList(groupList, true)}
                                                    {subProvided.placeholder}
                                                </div>
                                            )}
                                        </Droppable>
                                        {renderGroupFooter && renderGroupFooter(key === 'No Receipt' ? '' : key)}
                                    </div>
                                );
                            })}
                            {columnFooter && <div className="mt-4">{columnFooter}</div>}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </div>
        );
    }

    return (
        <div className={`flex flex-col h-full rounded-xl border ${color} bg-white shadow-sm overflow-hidden`}>
            <div className={`p-3 border-b ${color} ${headerColor}`}>
                <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wider">{title}</h3>
                    {columnHeader && <div className="flex items-center gap-1">{columnHeader}</div>}
                </div>
                {validSelectedCount > 0 && <Badge className="bg-indigo-600 text-white w-fit mt-2">{validSelectedCount} selected</Badge>}
            </div>
            {(onAdd || onAddQuote || onAddLightspeed || validSelectedCount > 0) && (
                <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                    {headerActions}
                </div>
            )}
            <Droppable droppableId={id}>
                {(provided, snapshot) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className={`flex-1 overflow-y-auto transition-colors ${snapshot.isDraggingOver ? 'bg-gray-50' : ''}`}>
                        <div className="p-3 space-y-3">
                            {groupBy ? (
                                sortedGroupKeys.map(key => {
                                    const isCollapsed = collapsedGroups[key] || false;
                                    return (
                                        <div key={key} className="space-y-2">
                                            {customGroupHeader ? (
                                                customGroupHeader(key, groupedItems[key], isCollapsed, () => onToggleCollapse && onToggleCollapse(key))
                                            ) : (
                                                <div className="flex items-center gap-2 text-base font-bold text-gray-900 uppercase tracking-wider mt-4 mb-2 bg-gray-100 p-1 rounded">
                                                    {defaultRenderGroupHeader(key)}
                                                    <div className="h-px bg-gray-300 flex-1"></div>
                                                </div>
                                            )}
                                            {!isCollapsed && (
                                                <>
                                                    {renderItemList(groupedItems[key], false)}
                                                    {renderGroupFooter && renderGroupFooter(
                                                        key === 'No Receipt' ? '' : key,
                                                        groupedItems[key]?.some(i => i.is_quote) || extraQuoteGroups.includes(key)
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                renderItemList(sortedItems, false)
                            )}
                            {items.length === 0 && (
                                <div className="text-center py-8 text-gray-400 text-sm italic">No items in this stage</div>
                            )}
                            {columnFooter && <div className="mt-4">{columnFooter}</div>}
                        </div>
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>
        </div>
    );
}