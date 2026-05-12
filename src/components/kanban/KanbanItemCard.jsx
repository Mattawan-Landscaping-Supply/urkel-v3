import React, { useState, useEffect } from 'react';
import { CheckSquare, Square, X, Package, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function QuantityInput({ item, onUpdateQuantity, maxQuantity, totalQty }) {
  const qtyToUse = totalQty !== undefined ? totalQty : item.quantity;
  const [localValue, setLocalValue] = useState(qtyToUse);
  
  useEffect(() => {
    setLocalValue(qtyToUse);
  }, [qtyToUse]);

  const handleChange = (e) => {
    const val = parseInt(e.target.value) || 0;
    
    // If there's a max and user is trying to exceed it, show error and don't allow
    if (maxQuantity !== undefined && maxQuantity !== null && val > maxQuantity) {
      alert(`Cannot set quantity to ${val}. Maximum available is ${maxQuantity}.`);
      return;
    }
    
    setLocalValue(e.target.value);
  };

  const handleBlur = (e) => {
    const val = parseInt(e.target.value) || 1;
    if (val !== qtyToUse) {
      if (typeof onUpdateQuantity === 'function') {
        onUpdateQuantity(item.id, val);
      }
    }
    setLocalValue(qtyToUse);
  };

  const widthClass = totalQty !== undefined ? "w-14" : "w-12";

  return (
    <Input 
      type="number" 
      min="1"
      max={maxQuantity}
      className={`h-6 ${widthClass} px-0.5 text-center text-xs ${totalQty !== undefined ? 'font-bold' : ''} bg-white border-gray-200 focus-visible:ring-1`}
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export default function KanbanItemCard({ 
  item, 
  showCheckbox, 
  checkboxTooltip,
  onToggleVerify, 
  onUpdateQuantity, 
  onDelete,
  onRemoveFromColumn,
  showReceiptNumber = true,
  showBreakdown = false,
  readOnlyQuantity = false,
  maxQuantity,
  readOnly = false,
  onReadOnlyClick,
  onQuickToHold,
  onQuickToOnOrder,
  onQuickReturn,
  showSelectCheckbox = false,
  isSelected = false,
  onToggleSelect,
  onEditColor,
  products,
  fullyAllocated = false,
  allLoadItemsProp = [],
  allLoadsProp = [],
  children 
}) {
  const navigate = useNavigate();

  // Load data is passed in as props from the parent to avoid N+1 queries per card
  // allLoadItems and allLoads should be fetched once at the page level
  const loadsWithItem = (allLoadItemsProp || []).filter(li => li.order_item_id === item.id);
  const relevantLoads = (allLoadsProp || []).filter(l =>
    loadsWithItem.some(li => li.load_id === l.id)
  ).sort((a, b) => (a.delivery_order || 0) - (b.delivery_order || 0));
  const firstLoad = relevantLoads[0];

  const handleOnLoadClick = () => {
    if (firstLoad) {
      navigate(createPageUrl(`LoadDetails?id=${firstLoad.id}`));
    }
  };

  const hasBreakdown = item.breakdown && (item.breakdown.onOrder > 0 || item.breakdown.inHold > 0 || item.breakdown.delivered > 0 || item.breakdown.pickedUp > 0 || item.breakdown.onDelivery > 0 || item.breakdown.returned > 0);
  const originalTotal = item.originalQty || item.quantity;
  
  // Determine highlight status - only highlight when ALL items are in the SAME column
  // No highlight if items are split across multiple columns
  const allMoved = showBreakdown && item.breakdown && item.breakdown.remaining === 0;
  const totalCompleted = (item.breakdown?.delivered || 0) + (item.breakdown?.pickedUp || 0) + (item.breakdown?.onDelivery || 0);
  const isFullyDelivered = allMoved && totalCompleted === originalTotal;
  const isFullyInHold = allMoved && item.breakdown.inHold === originalTotal;
  const isFullyOnOrder = allMoved && item.breakdown.onOrder === originalTotal;
  
  // Determine the background style for the breakdown section
  const getBreakdownStyle = () => {
    if (isFullyDelivered) return 'bg-green-50 border-green-200';
    if (isFullyInHold) return 'bg-orange-50 border-orange-200';
    if (isFullyOnOrder) return 'bg-yellow-50 border-yellow-200';
    return 'bg-gray-50 border-gray-100';
  };
  
  return (
    <div className="flex flex-col gap-1">
      {/* Selection checkbox for batch operations and delete button */}
      {fullyAllocated && (
        <div className="mb-1">
          <span className="inline-flex items-center bg-gray-200 text-gray-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            Fully Allocated
          </span>
        </div>
      )}
      {(showSelectCheckbox || (!readOnly && onDelete)) && (
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <div className="flex items-center gap-1.5">
            {showSelectCheckbox && (
              <>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect?.(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-xs text-gray-500">Select for batch move</span>
              </>
            )}
          </div>
          {!readOnly && onDelete && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-gray-400 hover:text-red-500 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}
      
      {/* Verified badge above product name */}
      {showCheckbox && item.is_verified && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            if (readOnly) {
              onReadOnlyClick?.();
            } else {
              onToggleVerify(item);
            }
          }}
          className={`text-green-600 font-semibold text-xs text-left ${readOnly ? 'cursor-not-allowed opacity-50' : 'hover:text-green-700'}`}
        >
          Verified
        </button>
      )}

      {/* Row 1: Title and Checkbox */}
      <div className="flex items-start gap-1.5">
        {showCheckbox && !item.is_verified && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (readOnly) {
                  onReadOnlyClick?.();
                } else {
                  onToggleVerify(item);
                }
              }}
              title={checkboxTooltip || "Verify item"}
              className={`shrink-0 mt-0.5 text-gray-300 hover:text-gray-400 ${readOnly ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <Square className="w-5 h-5" />
            </button>
          )}

        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="font-medium text-sm leading-tight flex-1 flex items-center gap-1.5 flex-wrap" title={item.product_name}>
                <span className="break-words">{item.product_name}</span>
                {item.selected_color && (
                  onEditColor ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditColor(item, products); }}
                      title="Click to change color"
                      className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 border border-gray-200 px-1.5 py-px rounded text-xs font-medium shrink-0 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors cursor-pointer"
                    >
                      {item.selected_color}
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                    </button>
                  ) : (
                    <div className="inline-flex items-center justify-center bg-gray-100 text-gray-800 border border-gray-200 px-1.5 py-px rounded text-xs font-medium shrink-0">
                      {item.selected_color}
                    </div>
                  )
                )}
              </div>
              {!readOnly && (
                <div className="flex flex-col gap-1">
                  {onQuickToOnOrder && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 px-1 text-[10px] bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickToOnOrder(item);
                      }}
                    >
                      <Package className="w-2.5 h-2.5 mr-0.5" />
                      Put On Order
                    </Button>
                  )}
                  {onQuickToHold && !item.is_quote && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 px-1 text-[10px] bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickToHold(item);
                      }}
                    >
                      <Package className="w-2.5 h-2.5 mr-0.5" />
                      Send To Hold
                    </Button>
                  )}
                  {onQuickReturn && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 px-1 text-[10px] bg-red-50 border-red-200 text-red-700 hover:bg-red-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickReturn(item);
                      }}
                    >
                      <Package className="w-2.5 h-2.5 mr-0.5" />
                      Return
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-0.5 flex flex-wrap gap-1">
              {false && item.selected_color && null}

              {/* Receipt Number Badge */}
              {showReceiptNumber && item.receipt_number && (
                <div 
                  className="inline-flex items-center gap-1 bg-yellow-300 text-gray-900 border border-yellow-400 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm"
                  title={`Receipt Number: ${item.receipt_number}`}
                >
                  #{item.receipt_number}
                </div>
              )}

              {/* Return Receipt Number Badge - only show for returned items */}
              {showReceiptNumber && item.status === 'returned' && item.return_receipt_number && (
                <div 
                  className="inline-flex items-center gap-1 bg-red-300 text-gray-900 border border-red-400 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm"
                  title={`Return Receipt Number: ${item.return_receipt_number}`}
                >
                  Return #{item.return_receipt_number}
                </div>
              )}
            </div>

            {/* Status Badge for non-order items */}
            {item.status && item.status !== 'order' && !children && (
              <div className="mt-0.5">
                <Badge 
                  variant="outline" 
                  className={`text-[10px] h-5 px-1.5 font-medium ${
                    item.status === 'on_order' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                    item.status === 'in_hold' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                    item.status === 'delivered' ? 'bg-green-100 text-green-800 border-green-300' :
                    'bg-gray-50'
                  }`}
                  title={`Status: ${item.status.replace('_', ' ')}`}
                >
                  {item.status.replace('_', ' ')}
                </Badge>
              </div>
            )}
        </div>
      </div>
      
      {/* Row 2: Quantity Display for Master Order */}
      {showBreakdown && (
        <div className={`p-1.5 rounded-md border space-y-0.5 ${getBreakdownStyle()}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">Total Ordered:</span>
            <div className="flex items-center gap-1">
              {readOnly ? (
                <div className="flex items-center gap-1">
                  <span className="h-6 w-14 flex items-center justify-center text-xs font-bold text-gray-700">
                    {item.originalQty || item.quantity}
                  </span>
                  {item.selected_unit && (
                    <div 
                      className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        item.selected_unit === 'Pallet' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                        item.selected_unit === 'Each' ? 'bg-green-100 text-green-800 border border-green-200' :
                        item.selected_unit === 'Layer' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-gray-100 text-gray-800 border border-gray-200'
                      }`}
                      title={`Unit: ${item.selected_unit}`}
                    >
                      {item.selected_unit}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <QuantityInput 
                    item={item}
                    onUpdateQuantity={onUpdateQuantity}
                    totalQty={item.originalQty || item.quantity}
                  />
                  {item.selected_unit && (
                    <div 
                      className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        item.selected_unit === 'Pallet' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                        item.selected_unit === 'Each' ? 'bg-green-100 text-green-800 border border-green-200' :
                        item.selected_unit === 'Layer' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-gray-100 text-gray-800 border border-gray-200'
                      }`}
                      title={`Unit: ${item.selected_unit}`}
                    >
                      {item.selected_unit}
                    </div>
                  )}
                </>
              )}
              </div>
              </div>

              {hasBreakdown && (
            <div className="pt-1 border-t border-gray-200 space-y-0.5">
              {item.breakdown.remaining > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Remaining:</span>
                  <span className="font-medium text-gray-700">{item.breakdown.remaining}</span>
                </div>
              )}
              {item.breakdown.onOrder > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-yellow-600">On Order:</span>
                  <span className="font-medium text-yellow-700">{item.breakdown.onOrder}</span>
                </div>
              )}
              {item.breakdown.inHold > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-orange-600">In Hold:</span>
                  <span className="font-medium text-orange-700">{item.breakdown.inHold}</span>
                </div>
              )}
              {item.breakdown.pickedUp > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-600">Picked Up:</span>
                  <span className="font-medium text-blue-700">{item.breakdown.pickedUp}</span>
                </div>
              )}
              {item.breakdown.onDelivery > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-600">On Delivery:</span>
                  <span className="font-medium text-emerald-700">{item.breakdown.onDelivery}</span>
                </div>
              )}
              {item.breakdown.delivered > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-600">Delivered:</span>
                  <span className="font-medium text-green-700">{item.breakdown.delivered}</span>
                </div>
              )}
              {item.breakdown.returned > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-red-600">Returned:</span>
                  <span className="font-medium text-red-700">{item.breakdown.returned}</span>
                </div>
              )}
            </div>
          )}
          
          {!hasBreakdown && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Remaining:</span>
              <span className="font-medium text-gray-700">{item.quantity}</span>
            </div>
          )}
        </div>
      )}

      {/* On Load Badge - only show when item is on_delivery (awaiting dispatch) */}
      {item.status === 'on_delivery' && loadsWithItem.length > 0 && (
        <div 
          onClick={handleOnLoadClick}
          className="bg-green-100 border-2 border-green-500 rounded p-1.5 flex items-center gap-1.5 cursor-pointer hover:bg-green-200 transition-colors"
          title={`Click to view delivery - Stop ${firstLoad?.delivery_order !== undefined ? (firstLoad.delivery_order + 1) : '?'}`}
        >
          <span className="text-green-700 font-bold text-xs">✓ ON LOAD</span>
        </div>
      )}

      {/* Row 2 (alt): Controls for non-master items */}
      {!showBreakdown && (
        <div className="flex items-center justify-between bg-gray-50 p-1 rounded-md border border-gray-100 overflow-hidden">
           <span className="text-[10px] text-gray-500 font-medium ml-1 shrink-0">Qty:</span>
           <div className="flex items-center gap-1 shrink-0">
              {readOnlyQuantity || readOnly ? (
                  <div className="flex items-center gap-1">
                    <span className="h-6 w-12 flex items-center justify-center text-sm font-medium text-gray-700">
                        {item.quantity}
                    </span>
                    {item.selected_unit && (
                      <div 
                        className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          item.selected_unit === 'Pallet' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          item.selected_unit === 'Each' ? 'bg-green-100 text-green-800 border border-green-200' :
                          item.selected_unit === 'Layer' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          'bg-gray-100 text-gray-800 border border-gray-200'
                        }`}
                        title={`Unit: ${item.selected_unit}`}
                      >
                        {item.selected_unit}
                      </div>
                    )}
                    </div>
                    ) : (
                  <>
                    <QuantityInput 
                        item={item}
                        onUpdateQuantity={onUpdateQuantity}
                        maxQuantity={maxQuantity}
                    />
                    {item.selected_unit && (
                      <div 
                        className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          item.selected_unit === 'Pallet' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          item.selected_unit === 'Each' ? 'bg-green-100 text-green-800 border border-green-200' :
                          item.selected_unit === 'Layer' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          'bg-gray-100 text-gray-800 border border-gray-200'
                        }`}
                        title={`Unit: ${item.selected_unit}`}
                      >
                        {item.selected_unit}
                      </div>
                    )}
                  </>
              )}
              {!readOnly && (onDelete || onRemoveFromColumn) && (
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-gray-400 hover:text-red-500 shrink-0"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onRemoveFromColumn) {
                            onRemoveFromColumn(item.id);
                        } else {
                            onDelete(item.id);
                        }
                    }}
                >
                    <X className="w-3 h-3" />
                </Button>
              )}
           </div>
        </div>
      )}

      {/* Row 3: Custom Controls (PO, Location, etc) */}
      {children && (
        <div className="pt-0.5 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}