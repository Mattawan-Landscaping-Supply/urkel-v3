import React from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { ArrowUpDown, Users } from 'lucide-react';
import { SortableStopItem } from '@/components/loaddetails/LoadScheduleSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ProductCatalogDialog from '@/components/catalog/ProductCatalogDialog';

export default function LoadDialogs({
  isEditDialogOpen, setIsEditDialogOpen,
  editFormData, setEditFormData,
  truckSettings, handleSaveEdit,
  isDeleteDialogOpen, setIsDeleteDialogOpen,
  handleDeleteLoad,
  isPalletOverrideOpen, setIsPalletOverrideOpen,
  manualPalletCount, setManualPalletCount,
  handleSavePalletOverride,
  isConfirmDialogOpen, setIsConfirmDialogOpen,
  pendingItemAdd, confirmAddToLoad,
  isCatalogOpen, setIsCatalogOpen,
  handleAddProductFromCatalog, load,
  capacityWarning, setCapacityWarning,
  loadMetrics,
  editingStopOrderId, setEditingStopOrderId,
  editingStopData, setEditingStopData,
  updateOrderMutation, updateLoadMutation,
  loadId,
  showNoHoldItemsDialog, setShowNoHoldItemsDialog,
  navigate, createPageUrl,
  allOrders, allOrderItems, loadItems,
  addQuantities, setAddQuantities,
  addToLoadMutation, handleAddToLoad,
  confirmCapacityAdd,
  // Reorder Stops
  isReorderStopsOpen, setIsReorderStopsOpen,
  stopOrders, setStopOrders,
  consolidatedLoadInfo, allLoadCustomerStops,
  queryClient,
  // Same Customer Confirm
  sameCustomerConfirm, setSameCustomerConfirm,
  doCreateSameCustomer, totalStops,
  // Move Date Dialog
  moveDateDialog, setMoveDateDialog,
  _commitSaveEdit,
  // Link Order Dialog
  showLinkOrderDialog, setShowLinkOrderDialog,
  selectedExistingOrderId, setSelectedExistingOrderId,
}) {
  return (
    <>
      {/* Edit Load Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Delivery Details</DialogTitle>
            <DialogDescription>Update the delivery information for this load.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Customer Name</Label>
              <Input value={editFormData.customer_name} onChange={e => setEditFormData(f => ({ ...f, customer_name: e.target.value }))} />
            </div>
            <div>
              <Label>Job Site Address</Label>
              <Input value={editFormData.customer_address} onChange={e => setEditFormData(f => ({ ...f, customer_address: e.target.value }))} />
            </div>
            <div>
              <Label>Customer Phone</Label>
              <Input value={editFormData.customer_phone} onChange={e => setEditFormData(f => ({ ...f, customer_phone: e.target.value }))} />
            </div>
            <div>
              <Label>Delivery Date</Label>
              <Input type="date" value={editFormData.delivery_date} onChange={e => setEditFormData(f => ({ ...f, delivery_date: e.target.value }))} />
            </div>
            <div>
              <Label>Drop Location Notes</Label>
              <Textarea value={editFormData.drop_location_notes} onChange={e => setEditFormData(f => ({ ...f, drop_location_notes: e.target.value }))} />
            </div>
            <div>
              <Label>Truck Setting</Label>
              <Select value={editFormData.truck_setting_id} onValueChange={v => setEditFormData(f => ({ ...f, truck_setting_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select truck setting..." /></SelectTrigger>
                <SelectContent>
                  {truckSettings.map(ts => (
                    <SelectItem key={ts.id} value={ts.id}>{ts.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_paid"
                checked={editFormData.is_paid}
                onCheckedChange={checked => setEditFormData(f => ({ ...f, is_paid: !!checked }))}
              />
              <Label htmlFor="is_paid">Mark as Paid</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog handled by DeleteWithOptionsDialog in LoadDetails.jsx */}

      {/* Pallet Override Dialog */}
      <Dialog open={isPalletOverrideOpen} onOpenChange={setIsPalletOverrideOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Override Pallet Count</DialogTitle>
            <DialogDescription>Manually set the pallet count for this load.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Manual Pallet Count</Label>
            <Input
              type="number"
              value={manualPalletCount}
              onChange={e => setManualPalletCount(e.target.value)}
              placeholder="Enter pallet count..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPalletOverrideOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePalletOverride}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Add Non-Hold Item */}
      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add Item to Load?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingItemAdd && (
                <>
                  <strong>{pendingItemAdd.product_name}</strong> is currently in <strong>{pendingItemAdd.status}</strong> status, not In Hold.
                  Are you sure you want to add it to this delivery load?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsConfirmDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddToLoad}>Add Anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Capacity Warning Dialog */}
      <AlertDialog open={!!capacityWarning} onOpenChange={() => setCapacityWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Exceeds Weight Capacity</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Adding this item will exceed the truck's weight capacity. Are you sure you want to continue?</p>
                {capacityWarning?.exceedsWeight && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 text-sm">
                    <strong>New total:</strong> {capacityWarning.newWeight?.toLocaleString('en-US', { maximumFractionDigits: 0 })} lbs
                    &nbsp;/&nbsp;{loadMetrics?.maxWeight?.toLocaleString('en-US', { maximumFractionDigits: 0 })} lbs max
                  </div>
                )}
                {capacityWarning?.exceedsSpace && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 text-sm">
                    <strong>Space:</strong> {capacityWarning.newArea?.toFixed(1)} ft²
                    (max: {loadMetrics?.truckArea?.toFixed(1)} ft²)
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCapacityWarning(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600"
              onClick={confirmCapacityAdd}
            >
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Stop Dialog (for consolidated loads) */}
      <Dialog open={!!editingStopOrderId} onOpenChange={() => setEditingStopOrderId(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Stop Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Truck Setting</Label>
              <Select
                value={editingStopData.truck_setting_id || load?.truck_setting_id || ''}
                onValueChange={v => setEditingStopData(d => ({ ...d, truck_setting_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select truck setting..." /></SelectTrigger>
                <SelectContent>
                  {truckSettings.map(ts => (
                    <SelectItem key={ts.id} value={ts.id}>{ts.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Drop Location Notes</Label>
              <Textarea
                value={editingStopData.drop_location_notes || ''}
                onChange={e => setEditingStopData(d => ({ ...d, drop_location_notes: e.target.value }))}
                placeholder="Special instructions for this stop..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStopOrderId(null)}>Cancel</Button>
            <Button onClick={async () => {
              const updateData = { drop_location_notes: editingStopData.drop_location_notes };
              if (editingStopData.truck_setting_id) updateData.truck_setting_id = editingStopData.truck_setting_id;
              await updateLoadMutation.mutateAsync({ loadId, data: updateData });
              setEditingStopOrderId(null);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No Hold Items Dialog */}
      <Dialog open={showNoHoldItemsDialog} onOpenChange={setShowNoHoldItemsDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>No Items In Hold</DialogTitle>
            <DialogDescription>
              This order has no items currently in Hold status. You may want to add items from a different source or go back to the order.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoHoldItemsDialog(false)}>Stay on Load</Button>
            <Button onClick={() => {
              setShowNoHoldItemsDialog(false);
              if (load?.order_id) {
                navigate(createPageUrl(`OrderDetails?id=${load.order_id}`));
              }
            }}>Go to Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Catalog Dialog */}
      {isCatalogOpen && (
        <ProductCatalogDialog
          open={isCatalogOpen}
          onClose={() => setIsCatalogOpen(false)}
          onConfirm={handleAddProductFromCatalog}
          orderId={load?.order_id}
          mode="load"
        />
      )}

      {/* Reorder Stops Dialog */}
      <Dialog open={isReorderStopsOpen} onOpenChange={setIsReorderStopsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reorder Delivery Stops</DialogTitle>
            <DialogDescription>Click to reorder the sequence of customer stops</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              {(stopOrders || []).map((order, idx) => <SortableStopItem key={order.orderId} order={order} idx={idx} />)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReorderStopsOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              setIsReorderStopsOpen(false);
              queryClient.setQueryData(['allLoadCustomerStops'], (old) => {
                if (!old) return old;
                return old.map(stop => {
                  const newOrder = stopOrders.find(s => s.orderId === stop.order_id && stop.load_id === loadId);
                  if (newOrder) return { ...stop, stop_order: stopOrders.indexOf(newOrder) };
                  return stop;
                });
              });
              (async () => {
                const updates = stopOrders.map((order, idx) => {
                  const existingStop = allLoadCustomerStops.find(s => s.order_id === order.orderId && s.load_id === loadId);
                  if (existingStop) return base44.entities.LoadCustomerStop.update(existingStop.id, { stop_order: idx });
                  return base44.entities.LoadCustomerStop.create({ load_id: loadId, order_id: order.orderId, customer_name: order.customer_name, stop_order: idx });
                });
                await Promise.all(updates);
                queryClient.invalidateQueries(['loadCustomerStops', loadId]);
                queryClient.invalidateQueries(['allLoadCustomerStops']);
              })();
            }}>Save Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Same Customer Confirm Dialog */}
      <AlertDialog open={sameCustomerConfirm} onOpenChange={setSameCustomerConfirm}>
        <AlertDialogContent className="max-w-sm text-center">
          <AlertDialogHeader>
            <div className="flex justify-center mb-2">
              <div className="bg-purple-100 rounded-full p-3">
                <Users className="w-7 h-7 text-purple-600" />
              </div>
            </div>
            <AlertDialogTitle className="text-xl text-center">Same Customer Delivery</AlertDialogTitle>
            <AlertDialogDescription className="text-center space-y-1">
              <span className="block text-base font-semibold text-gray-800">{load?.customer_name}</span>
              <span className="block text-sm text-gray-500">
                {load?.delivery_date ? new Date(load.delivery_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}
              </span>
              <span className="block text-sm text-gray-500 mt-1">This will create <strong>Load {totalStops + 1}</strong> for this customer on the same date.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <AlertDialogCancel className="flex-1">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doCreateSameCustomer} className="flex-1 bg-purple-600 hover:bg-purple-700">
              <Users className="w-4 h-4 mr-2" />
              Create Load {totalStops + 1}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Date Dialog */}
      <AlertDialog open={!!moveDateDialog} onOpenChange={(open) => { if (!open) setMoveDateDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move Delivery Date?</AlertDialogTitle>
            <AlertDialogDescription>
              This order has {moveDateDialog ? moveDateDialog.otherLoads.length + 1 : 0} delivery load{(moveDateDialog?.otherLoads?.length ?? 0) > 0 ? 's' : ''} scheduled
              {moveDateDialog?.originalDate ? ` for ${new Date(moveDateDialog.originalDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}.
              Move just this load or all loads for {moveDateDialog?.customerName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setMoveDateDialog(null)}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={async () => { const data = moveDateDialog; setMoveDateDialog(null); await _commitSaveEdit(data.pendingEditFormData, false); }}>
              Move just this load
            </Button>
            <AlertDialogAction onClick={async () => { const data = moveDateDialog; setMoveDateDialog(null); await _commitSaveEdit(data.pendingEditFormData, true); }} className="bg-indigo-600 hover:bg-indigo-700">
              Move all loads for {moveDateDialog?.customerName}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link Order Dialog */}
      <Dialog open={showLinkOrderDialog} onOpenChange={setShowLinkOrderDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Link Delivery to Order</DialogTitle>
            <DialogDescription>This delivery is not linked to a master order. Would you like to create one or link to an existing order?</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button className="w-full justify-start h-auto py-4 px-4" variant="outline" onClick={async () => {
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              let receiptNumbers = [...(load.receipt_numbers || [])];
              for (const loadItem of loadItems) {
                if (loadItem.order_item_id) {
                  const orderItem = allOrderItems.find(oi => oi.id === loadItem.order_item_id);
                  if (orderItem?.receipt_number && !receiptNumbers.includes(orderItem.receipt_number)) receiptNumbers.push(orderItem.receipt_number);
                }
              }
              const newOrder = await base44.entities.Order.create({ customer_name: load.customer_name, customer_phone: load.customer_phone, job_address: load.customer_address, receipt_numbers: receiptNumbers.join(', '), is_archived: false });
              await Promise.all(receiptNumbers.map(receiptNum => base44.entities.Receipt.create({ order_id: newOrder.id, receipt_number: receiptNum, is_paid: false })));
              const orderItemCreations = loadItems.map(async (loadItem) => {
                let receiptNumber = receiptNumbers[0] || null;
                if (loadItem.order_item_id) {
                  const orderItem = allOrderItems.find(oi => oi.id === loadItem.order_item_id);
                  if (orderItem?.receipt_number) receiptNumber = orderItem.receipt_number;
                }
                const masterItem = await base44.entities.OrderItem.create({ order_id: newOrder.id, product_name: loadItem.name, quantity: loadItem.quantity || 1, original_quantity: loadItem.quantity || 1, selected_color: loadItem.selected_color, selected_unit: loadItem.selected_unit || 'Pallet', status: 'order', receipt_number: receiptNumber, is_quote: false, date_ordered: todayStr, keep_on_same_load: loadItem.keep_on_same_load || false });
                const deliveredItem = await base44.entities.OrderItem.create({ order_id: newOrder.id, product_name: loadItem.name, quantity: loadItem.quantity || 1, original_quantity: loadItem.quantity || 1, selected_color: loadItem.selected_color, selected_unit: loadItem.selected_unit || 'Pallet', status: 'delivered', delivery_method: 'delivery', date_completed: load.delivery_date, receipt_number: receiptNumber, is_quote: false, date_ordered: todayStr, keep_on_same_load: loadItem.keep_on_same_load || false, master_item_id: masterItem.id });
                await base44.entities.LoadItem.update(loadItem.id, { order_item_id: deliveredItem.id });
                return { masterItem, deliveredItem };
              });
              await Promise.all(orderItemCreations);
              await base44.entities.Load.update(loadId, { order_id: newOrder.id });
              queryClient.invalidateQueries(['orders']);
              queryClient.invalidateQueries(['load', loadId]);
              queryClient.invalidateQueries(['allOrderItems']);
              queryClient.invalidateQueries(['loadItems', loadId]);
              queryClient.invalidateQueries(['receipts']);
              setShowLinkOrderDialog(false);
              navigate(createPageUrl(`OrderDetails?id=${newOrder.id}&showneworder=true`));
            }}>
              <div className="text-left">
                <div className="font-semibold">Create New Master Order</div>
                <div className="text-xs text-gray-600 mt-1">Create a new order and link this delivery to it</div>
              </div>
            </Button>
            <div className="space-y-2">
              <div className="font-semibold text-sm">Link to Existing Order</div>
              <Select value={selectedExistingOrderId} onValueChange={setSelectedExistingOrderId}>
                <SelectTrigger><SelectValue placeholder="Choose an order..." /></SelectTrigger>
                <SelectContent>
                  {allOrders?.filter(o => !o.is_archived).map(order => (
                    <SelectItem key={order.id} value={order.id}>{order.customer_name} - {order.job_address || 'No address'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="w-full" onClick={async () => {
                await base44.entities.Load.update(loadId, { order_id: selectedExistingOrderId });
                queryClient.invalidateQueries(['load', loadId]);
                setShowLinkOrderDialog(false);
                navigate(createPageUrl(`OrderDetails?id=${selectedExistingOrderId}`));
              }} disabled={!selectedExistingOrderId}>Link and View Order</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkOrderDialog(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}