import React from 'react';
import OrderDialogs from '@/components/orders/OrderDialogs';

export default function OrderDialogsWrapper({
  order, items, truckSettings, itemsNeedingLoad, receipts, allLoadItemsForOrder,
  deliveryMethodDialog, setDeliveryMethodDialog, deliveryDateValue, setDeliveryDateValue,
  handleDeliveryMethodConfirm, getLocalDateString, returnDialog, setReturnDialog,
  returnReceiptValue, setReturnReceiptValue, isDamaged, setIsDamaged, handleReturnConfirm,
  poDialog, setPoDialog, poValue, setPoValue, noPo, setNoPo, handlePoConfirm,
  addReturnDialog, setAddReturnDialog, createItemMutation, printPromptDialog, setPrintPromptDialog,
  executeMove, setIsPrintTicketOpen, soDialog, setSoDialog, soValue, setSoValue,
  updateItemMutation, setMoveDialogState, isDeleteDialogOpen, setIsDeleteDialogOpen,
  deleteOrderMutation, onArchiveOrder, isCompleteDialogOpen, setIsCompleteDialogOpen,
  handleCompleteDialogMarkComplete, handleCompleteDialogArchive, emailConfirmationDialog,
  setEmailConfirmationDialog, isCreateDeliveryDialogOpen, setIsCreateDeliveryDialogOpen,
  selectedTruckSettingId, setSelectedTruckSettingId, packingStrategy, setPackingStrategy,
  handleCreateDelivery, deliveryDate, setDeliveryDate,
  showReminderDialog, setShowReminderDialog,
  reminderDate, setReminderDate, reminderNotes, setReminderNotes, createReminderMutation,
  orderId, showNotificationPrompt, setShowNotificationPrompt, sendFirstDeliveryNotification,
}) {
  return (
    <OrderDialogs
      order={order} items={items} truckSettings={truckSettings} itemsNeedingLoad={itemsNeedingLoad}
      receipts={receipts} allLoadItemsForOrder={allLoadItemsForOrder}
      deliveryMethodDialog={deliveryMethodDialog} setDeliveryMethodDialog={setDeliveryMethodDialog}
      deliveryDateValue={deliveryDateValue} setDeliveryDateValue={setDeliveryDateValue}
      handleDeliveryMethodConfirm={handleDeliveryMethodConfirm} getLocalDateString={getLocalDateString}
      returnDialog={returnDialog} setReturnDialog={setReturnDialog}
      returnReceiptValue={returnReceiptValue} setReturnReceiptValue={setReturnReceiptValue}
      isDamaged={isDamaged} setIsDamaged={setIsDamaged} handleReturnConfirm={handleReturnConfirm}
      poDialog={poDialog} setPoDialog={setPoDialog} poValue={poValue} setPoValue={setPoValue}
      noPo={noPo} setNoPo={setNoPo} handlePoConfirm={handlePoConfirm}
      addReturnDialog={addReturnDialog} setAddReturnDialog={setAddReturnDialog}
      createItemMutation={createItemMutation} printPromptDialog={printPromptDialog}
      setPrintPromptDialog={setPrintPromptDialog} executeMove={executeMove}
      setIsPrintTicketOpen={setIsPrintTicketOpen} soDialog={soDialog} setSoDialog={setSoDialog}
      soValue={soValue} setSoValue={setSoValue} updateItemMutation={updateItemMutation}
      setMoveDialogState={setMoveDialogState} isDeleteDialogOpen={isDeleteDialogOpen}
      setIsDeleteDialogOpen={setIsDeleteDialogOpen} deleteOrderMutation={deleteOrderMutation}
      onArchiveOrder={onArchiveOrder} isCompleteDialogOpen={isCompleteDialogOpen}
      setIsCompleteDialogOpen={setIsCompleteDialogOpen}
      handleCompleteDialogMarkComplete={handleCompleteDialogMarkComplete}
      handleCompleteDialogArchive={handleCompleteDialogArchive}
      emailConfirmationDialog={emailConfirmationDialog} setEmailConfirmationDialog={setEmailConfirmationDialog}
      isCreateDeliveryDialogOpen={isCreateDeliveryDialogOpen}
      setIsCreateDeliveryDialogOpen={setIsCreateDeliveryDialogOpen}
      selectedTruckSettingId={selectedTruckSettingId} setSelectedTruckSettingId={setSelectedTruckSettingId}
      packingStrategy={packingStrategy} setPackingStrategy={setPackingStrategy}
      handleCreateDelivery={handleCreateDelivery} deliveryDate={deliveryDate} setDeliveryDate={setDeliveryDate}
      showReminderDialog={showReminderDialog}
      setShowReminderDialog={setShowReminderDialog} reminderDate={reminderDate}
      setReminderDate={setReminderDate} reminderNotes={reminderNotes}
      setReminderNotes={setReminderNotes} createReminderMutation={createReminderMutation}
      orderId={orderId} showNotificationPrompt={showNotificationPrompt}
      setShowNotificationPrompt={setShowNotificationPrompt}
      sendFirstDeliveryNotification={sendFirstDeliveryNotification}
    />
  );
}