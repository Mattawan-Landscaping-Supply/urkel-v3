import React, { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext } from '@hello-pangea/dnd';
import { ArrowLeft, Plus, MapPin, Truck, X, FileText, Loader2, Pencil, Bell, AlertCircle } from 'lucide-react';
import ProductCatalogDialog from '@/components/catalog/ProductCatalogDialog';
import MoveItemDialog from '@/components/kanban/MoveItemDialog';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import EditOrderDialog from '@/components/orders/EditOrderDialog';
import PrintTicketDialog from '@/components/orders/PrintTicketDialog';
import PrintableOrderHistory from '@/components/orders/PrintableOrderHistory';
import KanbanColumn from '@/components/kanban/KanbanColumn';
import MasterOrderColumn from '@/components/kanban/MasterOrderColumn';
import OnDeliverySection from '@/components/kanban/OnDeliverySection';
import OrderDialogsWrapper from '@/components/orders/OrderDialogsWrapper';
import ManualReturnDialog from '@/components/orders/ManualReturnDialog';
import LinkCustomerDialog from '@/components/orders/LinkCustomerDialog';
import AddNewCustomerDialog from '@/components/orders/AddNewCustomerDialog';
import BatchProgressDialog from '@/components/orders/BatchProgressDialog';
import BatchMoveToDeliveredDialog from '@/components/kanban/BatchMoveToDeliveredDialog';
import OnOrderColumn from '@/components/kanban/OnOrderColumn';
import InHoldColumn from '@/components/kanban/InHoldColumn';
import DeliveredColumn from '@/components/kanban/DeliveredColumn';
import OrderActionButtons from '@/components/orders/OrderActionButtons';
import LightspeedImportDialog from '@/components/lightspeed/LightspeedImportDialog';
import DeliveryRemindersSection from '@/components/orders/DeliveryRemindersSection';
import EditColorDialog from '@/components/orders/EditColorDialog';
import OrderInfoHeader from '@/components/orders/OrderInfoHeader';
import PrintMasterOrderDialog from '@/components/orders/PrintMasterOrderDialog';
import PaidNotificationDialog from '@/components/orders/PaidNotificationDialog';
import BuildLoadDialog from '@/components/orders/BuildLoadDialog';

// Helper to get today's date in local timezone as YYYY-MM-DD
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function OrderDetails() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('id');

  const showArchivedError = () => {
    toast.error("Order is Archived", {
      description: "This order must be reopened before changes can be made.",
    });
  };

  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [catalogInitialReceipt, setCatalogInitialReceipt] = useState('');
  const [catalogInitialIsQuote, setCatalogInitialIsQuote] = useState(false);
  const [emptyReceipts, setEmptyReceipts] = useState([]); // For receipts with no items yet
  const [emptyQuotes, setEmptyQuotes] = useState([]); // For quotes with no items yet
  const [customLocations, setCustomLocations] = useState([]); 

  const [moveDialogState, setMoveDialogState] = useState({
    isOpen: false,
    itemId: null,
    targetColumn: null,
    targetLocation: null,
    sourceColumn: null,
    maxQtyOverride: null,
    isDirectShip: false
  });
  
  const [deliveryMethodDialog, setDeliveryMethodDialog] = useState({
    isOpen: false,
    itemId: null,
    quantity: null,
    updates: null
  });
  
  const [returnDialog, setReturnDialog] = useState({
    isOpen: false,
    itemId: null,
    quantity: null,
    updates: null,
    item: null
  });

  const [returnReceiptValue, setReturnReceiptValue] = useState('');
  const [isDamaged, setIsDamaged] = useState(false);

  const [printPromptDialog, setPrintPromptDialog] = useState({
    isOpen: false,
    itemIds: [],
    pendingMove: null
  });

  const [addReturnDialog, setAddReturnDialog] = useState({
    isOpen: false,
    receipt: '',
    description: ''
  });

  const [poDialog, setPoDialog] = useState({
    isOpen: false,
    itemId: null,
    quantity: null,
    updates: null,
    item: null
  });

  const [poValue, setPoValue] = useState('');
  const [noPo, setNoPo] = useState(false);

  const [soDialog, setSoDialog] = useState({
    isOpen: false,
    itemId: null,
    item: null
  });

  const [soValue, setSoValue] = useState('');
  
  const [isEditOrderOpen, setIsEditOrderOpen] = useState(false);
  const [isPrintTicketOpen, setIsPrintTicketOpen] = useState(false);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [collapsedReceipts, setCollapsedReceipts] = useState({});
  const [collapsedPOs, setCollapsedPOs] = useState({});
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(null);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [selectedMasterItems, setSelectedMasterItems] = useState([]);
  const [openCalendars, setOpenCalendars] = useState({});
  const [isLinkCustomerOpen, setIsLinkCustomerOpen] = useState(false);
  const [isAddNewCustomerOpen, setIsAddNewCustomerOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ name: '', phone: '', company: '', notes: '' });
  const [emailConfirmationDialog, setEmailConfirmationDialog] = useState({ isOpen: false, message: '' });
  const [isCreateDeliveryDialogOpen, setIsCreateDeliveryDialogOpen] = useState(false);
  const [selectedTruckSettingId, setSelectedTruckSettingId] = useState(null);
  const [packingStrategy, setPackingStrategy] = useState('maxout');
  const [deliveryDate, setDeliveryDate] = useState(() => getLocalDateString());
  const deliveryDateRef = useRef(deliveryDate);
  useEffect(() => { deliveryDateRef.current = deliveryDate; }, [deliveryDate]);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNotes, setReminderNotes] = useState('');
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [isManualReturnOpen, setIsManualReturnOpen] = useState(false);
  const [isLightspeedImportOpen, setIsLightspeedImportOpen] = useState(false);
  const [isPrintMasterOrderOpen, setIsPrintMasterOrderOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('order');
  // rescheduleReminder state moved into DeliveryRemindersSection
  const [batchProgressState, setBatchProgressState] = useState({
    isOpen: false,
    items: [],
    currentIndex: 0,
    title: 'Processing Items'
  });

  const [paidNotificationDialog, setPaidNotificationDialog] = useState({ isOpen: false, receiptNumber: null, isSending: false });
  const [showBuildLoadDialog, setShowBuildLoadDialog] = useState(false);
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  // Batch Move to Delivered state
  const [batchSelectionMode, setBatchSelectionMode] = useState(false);
  const [selectedHoldItemIds, setSelectedHoldItemIds] = useState([]);
  const [batchMoveDialogOpen, setBatchMoveDialogOpen] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [editColorDialog, setEditColorDialog] = useState({ isOpen: false, item: null, availableColors: [] });
  const [isSavingColor, setIsSavingColor] = useState(false);

  const handleEditColor = (item, allProducts) => {
    const product = allProducts?.find(p => p.name === item.product_name);
    const availableColors = product?.colors || [];
    setEditColorDialog({ isOpen: true, item, availableColors });
  };

  const handleSaveColor = async (newColor) => {
    const { item } = editColorDialog;
    if (!item || !newColor || newColor === item.selected_color) return;
    setIsSavingColor(true);
    try {
      // Update the master OrderItem
      await base44.entities.OrderItem.update(item.id.replace('_master', ''), { selected_color: newColor });
      // Find and update all child OrderItems linked to this master
      const childItems = items?.filter(i => i.master_item_id === item.id.replace('_master', '')) || [];
      await Promise.all(childItems.map(ci => base44.entities.OrderItem.update(ci.id, { selected_color: newColor })));
      // Find ALL LoadItems for ANY of these order item IDs and update them
      const allOrderItemIds = [item.id.replace('_master', ''), ...childItems.map(ci => ci.id)];
      const allLoadItems = await base44.entities.LoadItem.list('-created_date', 500);
      const matchingLoadItems = allLoadItems.filter(li => allOrderItemIds.includes(li.order_item_id));
      await Promise.all(matchingLoadItems.map(li => base44.entities.LoadItem.update(li.id, { selected_color: newColor })));
      setEditColorDialog({ isOpen: false, item: null, availableColors: [] });
      await queryClient.refetchQueries(['items', orderId]);
      toast.success(`Color updated to ${newColor}`);
    } catch (err) {
      toast.error('Failed to update color: ' + err.message);
    } finally {
      setIsSavingColor(false);
    }
  };

  const handleManualReturnConfirm = async (form) => {
    await createItemMutation.mutateAsync({
      product_name: form.product_name.trim(),
      quantity: form.quantity,
      selected_unit: form.selected_unit,
      selected_color: '',
      receipt_number: form.receipt_number || '',
      return_receipt_number: form.is_damaged ? '' : form.return_receipt_number,
      is_damaged: form.is_damaged,
      status: 'returned',
      date_returned: getLocalDateString(),
    });
  };

  // -- QUERIES --

  const { data: order, isLoading: isOrderLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => base44.entities.Order.get(orderId),
    enabled: !!orderId
  });

  const { data: items = [], isLoading: isItemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['items', orderId],
    queryFn: () => base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500),
    enabled: !!orderId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list('-created_date', 500)
  });

  const { data: receipts } = useQuery({
    queryKey: ['receipts', orderId],
    queryFn: () => base44.entities.Receipt.filter({ order_id: orderId }),
    enabled: !!orderId
  });

  const { data: truckSettings = [] } = useQuery({
    queryKey: ['truckSettings'],
    queryFn: () => base44.entities.TruckSettings.list()
  });

  const { data: loads = [] } = useQuery({
    queryKey: ['loads', orderId],
    queryFn: async () => {
      // Always filter by order_id directly — never rely on list() which may miss new loads
      // or return stale cached data across orders
      const orderLoads = await base44.entities.Load.filter({ order_id: orderId });
      return (orderLoads || []).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!orderId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Single query for all load items — used to derive both loadItems and allLoadItemsForOrder
  const { data: allLoadItemsRaw = [], isLoading: loadItemsLoading } = useQuery({
    queryKey: ['allLoadItemsRaw', orderId],
    queryFn: async () => {
      // Use loads already fetched for this order — no extra Load fetch needed
      // loads query runs in parallel with this one so we re-fetch them directly here
      const orderLoads = await base44.entities.Load.filter({ order_id: orderId });
      if (!orderLoads || orderLoads.length === 0) return [];
      const loadIds = orderLoads.map(l => l.id);
      if (loadIds.length === 0) return [];
      const results = await Promise.all(loadIds.map(lid => base44.entities.LoadItem.filter({ load_id: lid })));
      return results.flat();
    },
    enabled: !!orderId,
    staleTime: 0,
    keepPreviousData: true
  });

  // Load items that are on active loads for this order (for the OnDeliverySection)
  const loadItems = useMemo(() => {
    if (loads.length === 0) return [];
    const loadIds = new Set(loads.map(l => l.id));
    return allLoadItemsRaw.filter(li => loadIds.has(li.load_id));
  }, [allLoadItemsRaw, loads]);

  // All load items linked to this order's order items (including archived loads)
  const allLoadItemsForOrder = useMemo(() => {
    if (!items) return [];
    const orderItemIds = new Set(items.map(i => i.id));
    return allLoadItemsRaw.filter(li => li.order_item_id && orderItemIds.has(li.order_item_id));
  }, [allLoadItemsRaw, items]);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list()
  });

  const { data: deliveryReminders = [] } = useQuery({
    queryKey: ['deliveryReminders', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const reminders = await base44.entities.DeliveryReminder.filter({ order_id: orderId });
      return reminders.filter(r => !r.is_resolved);
    },
    enabled: !!orderId
  });

  // Listen for Lightspeed import triggered from nav
  useEffect(() => {
    const handler = () => { if (!order?.is_archived) setIsLightspeedImportOpen(true); };
    window.addEventListener('openLightspeedImport', handler);
    return () => window.removeEventListener('openLightspeedImport', handler);
  }, [order]);

  // Real-time subscription for delivery reminders
  useEffect(() => {
    const unsubscribe = base44.entities.DeliveryReminder.subscribe((event) => {
      queryClient.removeQueries(['deliveryReminders']);
    });
    return unsubscribe;
  }, [queryClient]);

  // Check for new order from standalone load and ask about notification
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('showneworder') === 'true' && order && items && receipts) {
      // Remove the parameter
      window.history.replaceState({}, '', createPageUrl(`OrderDetails?id=${orderId}`));
      
      // Check if there are unpaid delivered items
      const deliveredItems = items?.filter(i => i.status === 'delivered') || [];
      const deliveredReceiptNumbers = new Set(deliveredItems.map(i => i.receipt_number).filter(r => r));
      const unpaidDeliveredReceipts = Array.from(deliveredReceiptNumbers).filter(receiptNum => {
        const receiptEntity = receipts?.find(r => r.receipt_number === receiptNum);
        return !receiptEntity || !receiptEntity.is_paid;
      });
      
      // Only show prompt if there are unpaid delivered items
      if (unpaidDeliveredReceipts.length > 0) {
        setTimeout(() => {
          setShowNotificationPrompt(true);
        }, 500);
      }
    }
  }, [order, items, receipts]);

  // -- MUTATIONS --

  const updateOrderMutation = useMutation({
    mutationFn: (data) => base44.entities.Order.update(orderId, data),
    onSuccess: () => {
      queryClient.removeQueries(['order', orderId]);
      queryClient.removeQueries(['orders']);
    }
  });

  // Helper: delete items in small batches to avoid rate limiting
  const deleteBatched = async (items, delayMs = 300, chunkSize = 3, onProgress = null) => {
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      await Promise.all(chunk.map(item => base44.entities.OrderItem.delete(item.id)));
      if (onProgress) onProgress(Math.min(i + chunkSize, items.length));
      if (i + chunkSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  };

  const deleteOrderMutation = useMutation({
    mutationFn: async () => {
      // Fetch everything first so we know the total count
      const allItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);
      const allReceipts = await base44.entities.Receipt.filter({ order_id: orderId });
      const total = allItems.length + allReceipts.length + 1; // +1 for the order itself
      let done = 0;

      setDeleteProgress({ current: 0, total, stage: `Deleting ${allItems.length} order items...` });

      // Delete items in batches
      await deleteBatched(allItems, 300, 3, (n) => {
        done = n;
        setDeleteProgress({ current: done, total, stage: `Deleting order items... (${n}/${allItems.length})` });
      });

      // Delete receipts
      setDeleteProgress({ current: done, total, stage: `Removing ${allReceipts.length} receipt${allReceipts.length !== 1 ? 's' : ''}...` });
      for (const r of allReceipts) {
        await base44.entities.Receipt.delete(r.id);
        done++;
        setDeleteProgress({ current: done, total, stage: `Removing receipts... (${done - allItems.length}/${allReceipts.length})` });
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Delete the order itself
      setDeleteProgress({ current: done, total, stage: 'Finalizing...' });
      await base44.entities.Order.delete(orderId);
      setDeleteProgress({ current: total, total, stage: 'Done!' });
    },
    onSuccess: () => {
      setDeleteProgress(null);
      // Clear all order-related cache before redirecting
      queryClient.removeQueries(['orders']);
      queryClient.removeQueries(['order', orderId]);
      queryClient.removeQueries(['order', orderId]);
      queryClient.removeQueries(['items', orderId]);
      window.location.href = createPageUrl('Dashboard');
    },
    onError: () => {
      setDeleteProgress(null);
    }
  });

  // Track receipts we've already created in this session to avoid duplicate API calls
  const createdReceiptsRef = useRef(new Set());

  const createItemMutation = useMutation({
    mutationFn: async (data) => {
      const itemData = { ...data, order_id: orderId };
      if (!itemData.status) itemData.status = 'order';
      if (itemData.receipt_number && !itemData.date_ordered) {
        const existing = items?.find(i => i.receipt_number === itemData.receipt_number && i.date_ordered);
        itemData.date_ordered = existing?.date_ordered || getLocalDateString();
      }
      if (itemData.receipt_number && !itemData.is_quote) {
        const receiptKey = `${orderId}:${itemData.receipt_number}`;
        if (!createdReceiptsRef.current.has(receiptKey)) {
          try {
            const freshReceipts = await base44.entities.Receipt.filter({ order_id: orderId });
            if (!freshReceipts?.find(r => r.receipt_number === itemData.receipt_number)) {
              await base44.entities.Receipt.create({ order_id: orderId, receipt_number: itemData.receipt_number, is_paid: false });
            }
            createdReceiptsRef.current.add(receiptKey);
            // Sync Order.receipt_numbers
            const allReceipts = await base44.entities.Receipt.filter({ order_id: orderId });
            const receiptNums = [...new Set(allReceipts.map(r => r.receipt_number))].sort().join(', ');
            await base44.entities.Order.update(orderId, { receipt_numbers: receiptNums });
          } catch (e) { console.warn('Could not create receipt:', e); }
        }
      }
      return base44.entities.OrderItem.create(itemData);
    },
    onSuccess: () => {
      queryClient.removeQueries(['items', orderId]);
      queryClient.removeQueries(['receipts', orderId]);
      queryClient.removeQueries(['allOrderItems']);
      queryClient.removeQueries(['allLoadItemsRaw', orderId]);
    }
  });

  const createItemsBulkMutation = useMutation({
    mutationFn: async (cartItems) => {
      const itemsWithData = cartItems.map(data => {
        const item = { ...data, order_id: orderId };
        if (!item.status) item.status = 'order';
        if (!item.date_ordered) {
          const existing = items?.find(i => i.receipt_number === item.receipt_number && i.date_ordered);
          item.date_ordered = existing?.date_ordered || getLocalDateString();
        }
        // Store weight_per_unit for custom items (weight is stored in kg from the catalog dialog)
        if (data.weight) item.weight_per_unit = data.weight;
        // Auto-apply keep_on_same_load only for Each and Layer units
        if (data.selected_unit === 'Each' || data.selected_unit === 'Layer') {
          item.keep_on_same_load = true;
        }
        return item;
      });
      const uniqueReceiptNums = [...new Set(itemsWithData.filter(i => i.receipt_number && !i.is_quote).map(i => i.receipt_number))];
      if (uniqueReceiptNums.length > 0) {
        const freshReceipts = await base44.entities.Receipt.filter({ order_id: orderId });
        const existingNums = new Set(freshReceipts.map(r => r.receipt_number));
        await Promise.all(uniqueReceiptNums.filter(num => !existingNums.has(num)).map(num =>
          base44.entities.Receipt.create({ order_id: orderId, receipt_number: num, is_paid: false })
        ));
        // Sync Order.receipt_numbers
        const allReceipts = await base44.entities.Receipt.filter({ order_id: orderId });
        const receiptNums = [...new Set(allReceipts.map(r => r.receipt_number))].sort().join(', ');
        await base44.entities.Order.update(orderId, { receipt_numbers: receiptNums });
      }
      return base44.entities.OrderItem.bulkCreate(itemsWithData);
    },
    onSuccess: () => {
      queryClient.removeQueries(['items', orderId]);
      queryClient.removeQueries(['receipts', orderId]);
      queryClient.removeQueries(['order', orderId]);
      queryClient.removeQueries(['orders']);
      queryClient.removeQueries(['allOrderItems']);
      queryClient.removeQueries(['allLoadItemsRaw', orderId]);
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.OrderItem.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries(['items', orderId]);
      
      // Snapshot the previous value
      const previousItems = queryClient.getQueryData(['items', orderId]);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['items', orderId], (old) => {
        if (!old) return old;
        return old.map(item => item.id === id ? { ...item, ...data } : item);
      });
      
      // Return context with the snapshotted value
      return { previousItems };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousItems) {
        queryClient.setQueryData(['items', orderId], context.previousItems);
      }
    },
    onSettled: () => {
      queryClient.removeQueries(['items', orderId]);
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id) => {
      // Just delete the item - no restoration logic here
      // Restoration only happens via onRemoveFromColumn
      return base44.entities.OrderItem.delete(id);
    },
    onSuccess: () => {
      queryClient.removeQueries(['items', orderId]);
      queryClient.removeQueries(['allOrderItems']);
      queryClient.removeQueries(['allLoadItemsRaw', orderId]);
    }
  });

  const createOrUpdateReceiptMutation = useMutation({
    mutationFn: async ({ receipt_number, is_paid }) => {
      const existing = receipts?.find(r => r.receipt_number === receipt_number);
      if (existing) {
        return base44.entities.Receipt.update(existing.id, { is_paid });
      } else {
        return base44.entities.Receipt.create({
          order_id: orderId,
          receipt_number,
          is_paid
        });
      }
    },
    onSuccess: () => {
      queryClient.removeQueries(['receipts', orderId]);
      queryClient.removeQueries(['orders']);
    }
  });

  const createReminderMutation = useMutation({
    mutationFn: (data) => base44.entities.DeliveryReminder.create(data),
    onSuccess: () => {
      queryClient.removeQueries(['deliveryReminders']);
      setShowReminderDialog(false);
      setReminderDate('');
      setReminderNotes('');
    }
  });

  const resolveReminderMutation = useMutation({
    mutationFn: (reminderId) => base44.entities.DeliveryReminder.update(reminderId, { is_resolved: true }),
    onSuccess: () => {
      queryClient.removeQueries(['deliveryReminders', orderId]);
      queryClient.removeQueries(['deliveryReminders']);
    }
  });

  const rescheduleReminderMutation = useMutation({
    mutationFn: ({ reminderId, newDate }) => base44.entities.DeliveryReminder.update(reminderId, { scheduled_date: newDate }),
    onSuccess: () => {
      queryClient.removeQueries(['deliveryReminders', orderId]);
      queryClient.removeQueries(['deliveryReminders']);
    }
  });

  const createCustomerMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.create(data),
    onSuccess: (newCustomer) => {
      queryClient.removeQueries(['customers']);
      if (isAddNewCustomerOpen) {
        handleLinkCustomer(newCustomer);
        setIsAddNewCustomerOpen(false);
        setNewCustomerData({ name: '', phone: '', company: '', notes: '' });
      }
    }
  });

  // -- HANDLERS --

  const onDragEnd = (result) => {
    // Prevent changes on archived orders
    if (order?.is_archived) {
      showArchivedError();
      return;
    }

    // Prevent concurrent drag operations - if a dialog is already open, ignore new drags
    if (moveDialogState.isOpen || deliveryMethodDialog.isOpen || returnDialog.isOpen || poDialog.isOpen) {
      return;
    }

    const { source, destination, draggableId } = result;


    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Identify the item - for master items, get from masterItems array (has calculated quantity)
    // For other items, get from items array
    const realId = draggableId.replace('_master', '');
    const isMasterDrag = draggableId.includes('_master');
    
    // If dragging from master order, use masterItems (which has correct remaining qty)
    // Otherwise use raw items
    const item = isMasterDrag 
      ? masterItems.find(i => i.id === realId)
      : items.find(i => i.id === realId);

    if (!item) return;

    let newStatus = destination.droppableId;
    let newLocation = null;

    if (newStatus.includes('::')) {
        const parts = newStatus.split('::');
        newStatus = parts[0];
        newLocation = parts[1];
    }

    // Drag-to-Delivered is not allowed; use the Move dialog instead
    if (newStatus === 'delivered' || newStatus === 'on_delivery') return;


    // For master items, the item.quantity already represents the remaining quantity
    // (calculated in masterItems mapping above)
    let maxQtyOverride = null;
    if (isMasterDrag) {
      maxQtyOverride = item.quantity;

      // If no remaining quantity, show error and don't open dialog
      if (maxQtyOverride <= 0) {
        alert('No remaining quantity available to move. All items have already been moved to other columns.');
        return;
      }
    }

    // For On Order column, show dialog to ask for quantity (PO will be asked after)
    if (newStatus === 'on_order') {
      setMoveDialogState({
          isOpen: true,
          itemId: realId,
          targetColumn: newStatus,
          targetLocation: null,
          sourceColumn: source.droppableId,
          maxQtyOverride: maxQtyOverride
      });
      return;
    }



    // For In Hold with a location already set, move immediately
    if (newStatus === 'in_hold' && newLocation) {
      const updates = { 
        status: 'in_hold', 
        hold_location: newLocation
      };
      executeMove(item, maxQtyOverride !== null ? maxQtyOverride : item.quantity, updates);
      return;
    }

    // Prevent moving quotes to fulfillment columns (but allow on_order)
    if (item.is_quote && (newStatus === 'delivered' || newStatus === 'in_hold')) {
      setMoveDialogState({
        isOpen: true,
        itemId: realId,
        targetColumn: 'quote_warning',
        realTargetColumn: newStatus,
        targetLocation: newLocation,
        sourceColumn: source.droppableId,
        maxQtyOverride: maxQtyOverride
      });
      return;
    }

    // For other cases (In Hold without location, Delivered), show dialog
    setMoveDialogState({
        isOpen: true,
        itemId: realId,
        targetColumn: newStatus,
        targetLocation: newLocation,
        sourceColumn: source.droppableId,
        maxQtyOverride: maxQtyOverride
    });
  };

  const handleMoveConfirm = async (quantityOrQuantities, locationFromDialog, moveDateFromDialog, fulfillmentMethod) => {
    const { itemId, targetColumn: rawTargetColumn, realTargetColumn, targetLocation: originalTargetLocation, batchMode, batchItems } = moveDialogState;
    // If this was a quote_warning override, use the real target column
    const targetColumn = rawTargetColumn === 'quote_warning' ? (realTargetColumn || 'in_hold') : rawTargetColumn;
    const targetLocation = locationFromDialog || originalTargetLocation;
    const moveDate = moveDateFromDialog || getLocalDateString();
    if (batchMode && batchItems && batchItems.length > 0) {
       const batchQuantities = quantityOrQuantities;
       if (targetColumn === 'on_order') {
         setMoveDialogState(prev => ({ ...prev, isOpen: false }));
         const firstItem = items?.find(i => i.id === batchItems[0].replace('_master', ''));
         setPoDialog({ isOpen: true, itemId: firstItem?.id, quantity: batchQuantities, updates: { status: targetColumn, date_on_order: moveDate }, item: firstItem, batchMode: true, batchItems, batchQuantities });
         return;
       }
            // Batch move from master order: use master/child pattern for each item.
        // Do NOT directly change the master item's status — create child items instead.
        setBatchProgressState({
          isOpen: true,
          items: batchItems.map(id => id.replace('_master', '')),
          currentIndex: 0,
          title: `Moving ${batchItems.length} Item${batchItems.length > 1 ? 's' : ''} to ${targetColumn === 'in_hold' ? 'In Hold' : targetColumn}`
        });

        try {
          const batchFreshItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);
          for (let i = 0; i < batchItems.length; i++) {
            const realId = (batchItems[i] || '').replace('_master', '');
            const masterItem = batchFreshItems.find(f => f.id === realId);
            if (!masterItem) continue;
            const movedItems2 = batchFreshItems.filter(f => f.master_item_id === realId && f.status !== 'order');
            const totalMoved2 = movedItems2.reduce((s, f) => s + (f.quantity || 0), 0);
            const qtyToMove2 = masterItem.quantity || 0;
            if (qtyToMove2 <= 0) continue;
            const origQty2 = masterItem.original_quantity || (qtyToMove2 + totalMoved2);
            const childUpdates2 = { status: targetColumn };
            if (targetColumn === 'in_hold') { childUpdates2.date_arrived = moveDate; if (targetLocation) childUpdates2.hold_location = targetLocation; }
            else if (targetColumn === 'on_order') { childUpdates2.date_on_order = moveDate; }
            const existingMatch2 = batchFreshItems.find(f =>
              f.master_item_id === realId && f.status === targetColumn &&
              f.product_name === masterItem.product_name && f.selected_color === masterItem.selected_color &&
              f.selected_unit === masterItem.selected_unit && f.receipt_number === masterItem.receipt_number &&
              (targetColumn !== 'in_hold' || f.hold_location === (targetLocation || masterItem.hold_location))
            );
            if (existingMatch2) {
              await base44.entities.OrderItem.update(existingMatch2.id, { quantity: (existingMatch2.quantity || 0) + qtyToMove2, ...childUpdates2 });
            } else {
              await base44.entities.OrderItem.create({
                product_name: masterItem.product_name, selected_color: masterItem.selected_color,
                selected_unit: masterItem.selected_unit, quantity: qtyToMove2,
                order_id: masterItem.order_id || orderId, receipt_number: masterItem.receipt_number,
                master_item_id: realId, is_quote: masterItem.is_quote,
                keep_on_same_load: (masterItem.selected_unit === 'Each' || masterItem.selected_unit === 'Layer') && (masterItem.keep_on_same_load || true),
                hold_location: targetColumn === 'in_hold' ? (targetLocation || masterItem.hold_location) : masterItem.hold_location,
                ...childUpdates2
              });
            }
            await base44.entities.OrderItem.update(realId, { quantity: 0, original_quantity: origQty2 });
            setBatchProgressState(prev => ({ ...prev, currentIndex: i + 1 }));
          }
        } finally {
          setBatchProgressState(prev => ({ ...prev, isOpen: false }));
        }

        queryClient.removeQueries(['items', orderId]);
        setSelectedMasterItems([]);
        return;
     }
    
    const quantity = quantityOrQuantities;
    const realId = (itemId || '').replace('_master', '');
    const item = items?.find(i => i.id === realId);
    if (!item) return;

    const updates = { status: targetColumn };
    if (targetLocation) {
        updates.hold_location = targetLocation;
    }

    // If moving to on_order, prompt for PO number
    if (targetColumn === 'on_order') {
        setMoveDialogState(prev => ({ ...prev, isOpen: false }));
        if (!updates.date_on_order) updates.date_on_order = moveDate;
        setPoDialog({ isOpen: true, itemId: item.id, quantity, updates, item: { ...item } });
        return;
    }

    // Use fulfillment method from move dialog (combined dialog flow)
    if (targetColumn === 'delivered') {
        setMoveDialogState(prev => ({ ...prev, isOpen: false }));
        const method = fulfillmentMethod || (moveDialogState.isDirectShip ? 'direct_ship' : null);
        if (method === 'delivery') {
          updates.delivery_method='delivery'; updates.status='on_delivery'; updates.date_completed=null;
          executeMove(item,quantity,updates);
          setIsCreateDeliveryDialogOpen(true);
          toast('Item moved to On Delivery.', { description: 'Build a load to assign it to a delivery.', action: { label: 'Build Load', onClick: () => setIsCreateDeliveryDialogOpen(true) }, duration: 10000 });
        } else if (method === 'pickup') {
          updates.delivery_method = 'pickup'; updates.status = 'delivered'; updates.date_completed = moveDate;
          const promptData = { isOpen: true, itemIds: [item.id], pendingMove: { item, quantity, updates } };
          console.log('printPromptDialog state set:', promptData);
          setPrintPromptDialog(promptData);
        } else if (method === 'direct_ship') { updates.delivery_method='direct_ship'; updates.status='delivered'; updates.date_completed=moveDate; executeMove(item,quantity,updates); }
        // If no method selected (shouldn't happen due to canSubmit guard), do nothing
        return;
    }

    // If moving to returned, prompt for return receipt number
    if (targetColumn === 'returned') {
        setMoveDialogState(prev => ({ ...prev, isOpen: false }));
        setReturnDialog({ isOpen: true, itemId: item.id, quantity, updates, item: { ...item } });
        return;
    }

    // For in_hold moves from master order, apply the selected date
    if (targetColumn === 'in_hold') updates.date_arrived = moveDate;

    executeMove(item, quantity, updates);
  };

  // Helper to retry API calls with exponential backoff
  const retryWithBackoff = async (fn, maxRetries = 5) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        // Check for rate limit in both err.status and err.message
        const isRateLimited = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('Rate limit');
        if (attempt < maxRetries - 1 && isRateLimited) {
          // Rate limited - wait with exponential backoff (much longer delays)
          const delayMs = Math.min(2000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        throw err;
      }
    }
  };

  const executeMove = async (item, quantity, updates, prefetchedItems = null, skipInvalidation = false) => {
    const qtyToMove = parseInt(quantity);
    
    // Get the real item ID (strip _master suffix if present)
    const realItemId = (item.id || '').replace('_master', '');

    // Use prefetched items if provided (batch moves), otherwise fetch fresh
    const freshItems = prefetchedItems || await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);
    const freshItem = freshItems.find(i => i.id === realItemId);
    
    if (!freshItem) {
        queryClient.removeQueries(['items', orderId]);
        return;
    }
    
    const currentQty = parseInt(freshItem.quantity);

    // CRITICAL: Clear all date fields when moving to a new status to prevent dates from sticking
    // This ensures items don't retain old dates when moved between columns
    const targetStatus = updates.status;
    if (targetStatus !== freshItem.status) {
      // Save any user-chosen dates (e.g. from the delivery date dialog) before clearing
      const savedDateCompleted = updates.date_completed;
      const savedDateArrived = updates.date_arrived;
      const savedDateReturned = updates.date_returned;
      const savedDateOnOrder = updates.date_on_order;

      // Clear all date fields
      updates.date_completed = null;
      updates.date_arrived = null;
      updates.date_returned = null;
      updates.date_on_order = null;

      // Restore the correct date for the target column, preferring the user-chosen value
      if (targetStatus === 'in_hold') { updates.date_arrived = savedDateArrived || getLocalDateString(); updates.ticket_printed = false; }
      if (targetStatus === 'on_delivery') updates.date_arrived = freshItem.date_arrived || savedDateArrived || null; // preserve date_arrived for restoration later
      if (targetStatus === 'delivered') updates.date_completed = savedDateCompleted || getLocalDateString();
      if (targetStatus === 'returned') updates.date_returned = savedDateReturned || getLocalDateString();
      if (targetStatus === 'on_order') updates.date_on_order = savedDateOnOrder || getLocalDateString();
    }

    // For master items (status='order'), we ALWAYS create a new item in the target column
    // and decrease the master item's quantity. The master item stays in 'order' status.
    // For non-master items, we update or split as before.

    if (freshItem.status === 'order') {
        // Moving FROM master order - always create new item, decrease master qty
        const masterItem = freshItems.find(i => i.id === realItemId);
        if (!masterItem) {
            queryClient.removeQueries(['items', orderId]);
            return;
        }

        // Calculate what the original total should be
        // If original_quantity exists, use it; otherwise current qty IS the original
        const movedItems = freshItems.filter(i => i.master_item_id === realItemId && i.status !== 'order');
        const totalAlreadyMoved = movedItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
        const origQty = masterItem?.original_quantity || (currentQty + totalAlreadyMoved);

        try {
          // ALWAYS update both quantity AND original_quantity to keep them in sync
          await retryWithBackoff(() => base44.entities.OrderItem.update(realItemId, { 
              quantity: currentQty - qtyToMove,
              original_quantity: origQty
          }));
        } catch (e) {
            console.warn('Could not update master item:', e);
            if (!skipInvalidation) await queryClient.removeQueries(['items', orderId]);
            return;
        }
        
        // Check if there's already a matching item in the target column to merge into
        const targetLocation = updates.hold_location || freshItem.hold_location;
        const targetDeliveryMethod = updates.delivery_method;
        const existingMatchForMaster = freshItems.find(i => 
            i.master_item_id === realItemId &&
            i.status === updates.status &&
            i.product_name === freshItem.product_name &&
            i.selected_color === freshItem.selected_color &&
            i.selected_unit === freshItem.selected_unit &&
            i.receipt_number === freshItem.receipt_number &&
            (updates.status !== 'in_hold' || i.hold_location === targetLocation) &&
            (updates.status !== 'delivered' || i.delivery_method === targetDeliveryMethod) &&
            (updates.status !== 'delivered' || i.date_completed === updates.date_completed)
        );

        if (existingMatchForMaster) {
            const mergeData = { quantity: (existingMatchForMaster.quantity || 0) + qtyToMove };
            // Update date fields so items land in the correct date group
            if (updates.date_completed) mergeData.date_completed = updates.date_completed;
            if (updates.date_arrived) mergeData.date_arrived = updates.date_arrived;
            if (updates.date_on_order) mergeData.date_on_order = updates.date_on_order;
            await retryWithBackoff(() => base44.entities.OrderItem.update(existingMatchForMaster.id, mergeData));
            if (!skipInvalidation) await queryClient.removeQueries(['items', orderId]);
            return;
        }

        // Create new item in target column, linked to master
        // Auto-apply keep_on_same_load only for Each and Layer units (not Pallet)
        const productForMaster = products?.find(p => p.name === freshItem.product_name);
        const autoKeepOnSameLoad = freshItem.keep_on_same_load || (freshItem.selected_unit === 'Each' || freshItem.selected_unit === 'Layer');
        await retryWithBackoff(() => base44.entities.OrderItem.create({
            product_name: freshItem.product_name,
            selected_color: freshItem.selected_color,
            selected_unit: freshItem.selected_unit,
            quantity: qtyToMove,
            status: updates.status,
            order_id: freshItem.order_id || orderId,
            receipt_number: freshItem.receipt_number,
            date_arrived: updates.date_arrived,
            date_completed: updates.date_completed,
            date_returned: updates.date_returned,
            return_receipt_number: updates.return_receipt_number,
            is_damaged: updates.is_damaged,
            date_on_order: updates.date_on_order,
            hold_location: updates.hold_location || freshItem.hold_location,
            delivery_method: updates.delivery_method,
            po_number: updates.po_number || freshItem.po_number,
            bol_number: freshItem.bol_number,
            master_item_id: realItemId,
            is_quote: freshItem.is_quote,
            keep_on_same_load: autoKeepOnSameLoad
        }));
        if (!skipInvalidation) await queryClient.removeQueries(['items', orderId]);
    } else {
        // Moving from a non-master column (on_order, in_hold, delivered)
        // Check if there's an existing item in the target column that matches (same product, color, receipt, location, delivery method)
        const targetLocation = updates.hold_location || freshItem.hold_location;
        const targetDeliveryMethod = updates.delivery_method || freshItem.delivery_method;
        const targetDateCompleted = updates.date_completed;
        const existingMatch = freshItems.find(i => 
            i.id !== realItemId &&
            i.status === updates.status &&
            i.product_name === freshItem.product_name &&
            i.selected_color === freshItem.selected_color &&
            i.selected_unit === freshItem.selected_unit &&
            i.receipt_number === freshItem.receipt_number &&
            (updates.status !== 'in_hold' || i.hold_location === targetLocation) &&
            (updates.status !== 'delivered' || i.delivery_method === targetDeliveryMethod) &&
            (updates.status !== 'delivered' || i.date_completed === targetDateCompleted)
        );

        if (existingMatch) {
            // Merge into existing item, also update dates so items land in the correct date group
            const newMatchQty = (existingMatch.quantity || 0) + qtyToMove;
            const mergeUpdateData = { quantity: newMatchQty };
            if (updates.date_completed) mergeUpdateData.date_completed = updates.date_completed;
            if (updates.date_arrived) mergeUpdateData.date_arrived = updates.date_arrived;
            if (updates.date_on_order) mergeUpdateData.date_on_order = updates.date_on_order;

            await retryWithBackoff(() => base44.entities.OrderItem.update(existingMatch.id, mergeUpdateData));
            await retryWithBackoff(() => base44.entities.OrderItem.delete(realItemId));
            if (!skipInvalidation) await queryClient.removeQueries(['items', orderId]);
        } else if (qtyToMove >= currentQty) {
            // Moving all, no match: just update the existing item's status
            // BUT preserve the original hold_location if moving OUT of hold
            const productForFull = products?.find(p => p.name === freshItem.product_name);
            if ((freshItem.selected_unit === 'Each' || freshItem.selected_unit === 'Layer') && !freshItem.keep_on_same_load) {
                updates.keep_on_same_load = true;
            }
            if (freshItem.status === 'in_hold' && updates.status !== 'in_hold') {
                // Keep the hold_location when moving out of hold
                const updateWithLocation = { ...updates };
                if (!updateWithLocation.hold_location) {
                    updateWithLocation.hold_location = freshItem.hold_location;
                }
                await retryWithBackoff(() => base44.entities.OrderItem.update(realItemId, updateWithLocation));
            } else {
                await retryWithBackoff(() => base44.entities.OrderItem.update(realItemId, updates));
            }
            if (!skipInvalidation) await queryClient.removeQueries(['items', orderId]);
        } else {
            // Partial move, no match: decrease source and create new in target
            // Preserve hold_location when moving FROM hold
            const productForPartial = products?.find(p => p.name === freshItem.product_name);
            const createData = {
                product_name: freshItem.product_name,
                selected_color: freshItem.selected_color,
                selected_unit: freshItem.selected_unit,
                quantity: qtyToMove,
                status: updates.status,
                order_id: freshItem.order_id || orderId,
                receipt_number: freshItem.receipt_number,
                date_arrived: updates.date_arrived,
                date_completed: updates.date_completed,
                date_returned: updates.date_returned,
                return_receipt_number: updates.return_receipt_number,
                is_damaged: updates.is_damaged,
                date_on_order: updates.date_on_order,
                hold_location: updates.hold_location || freshItem.hold_location,
                delivery_method: updates.delivery_method,
                po_number: updates.po_number || freshItem.po_number,
                bol_number: freshItem.bol_number,
                master_item_id: freshItem.master_item_id,
                is_quote: freshItem.is_quote,
                keep_on_same_load: (freshItem.selected_unit === 'Each' || freshItem.selected_unit === 'Layer') && (freshItem.keep_on_same_load || true)
            };
            
            await Promise.all([
                retryWithBackoff(() => base44.entities.OrderItem.update(realItemId, { quantity: currentQty - qtyToMove })),
                retryWithBackoff(() => base44.entities.OrderItem.create(createData))
            ]);
            if (!skipInvalidation) await queryClient.removeQueries(['items', orderId]);
        }
    }

    // If moving OUT of delivered/on_delivery, remove from any loads and reset is_completed flag
    if ((freshItem.status === 'delivered' || freshItem.status === 'on_delivery') && updates.status !== 'delivered' && updates.status !== 'on_delivery') {
      // Remove from any loads
      const allLoadItems = await base44.entities.LoadItem.list('-created_date', 1000);
      const loadItemsToRemove = allLoadItems.filter(li => li.order_item_id === realItemId);
      
      if (loadItemsToRemove.length > 0) {
        await Promise.all(loadItemsToRemove.map(li => retryWithBackoff(() => base44.entities.LoadItem.delete(li.id))));
        if (!skipInvalidation) {
          queryClient.removeQueries(['allLoadItemsRaw', orderId]);
          queryClient.removeQueries({ queryKey: ['loads'] });
          queryClient.removeQueries({ queryKey: ['loads', 'today-banner'] });
        }
      }
      
      if (order?.is_completed) {
        await base44.entities.Order.update(orderId, { is_completed: false });
        if (!skipInvalidation) queryClient.removeQueries(['order', orderId]);
      }
    }

    // Auto-archive a load when ALL its items are now delivered
    if (updates.status === 'delivered') {
      try {
        // Find which load this item is on
        const loadItemsForItem = await base44.entities.LoadItem.filter({ order_item_id: realItemId }).catch(() => []);
        for (const li of loadItemsForItem) {
          if (!li.load_id) continue;
          const theLoad = await base44.entities.Load.get(li.load_id).catch(() => null);
          if (!theLoad || theLoad.status === 'archived') continue;

          // Get all LoadItems on this load and check their OrderItem statuses
          const siblingLoadItems = await base44.entities.LoadItem.filter({ load_id: li.load_id }).catch(() => []);
          const siblingOrderItemIds = siblingLoadItems.map(s => s.order_item_id).filter(Boolean);
          if (siblingOrderItemIds.length === 0) continue;

          // Fetch each sibling OrderItem status (use current freshItems cache where possible)
          const latestFreshItems = queryClient.getQueryData(['items', orderId]) || freshItems || [];
          const allDelivered = siblingOrderItemIds.every(oid => {
            const found = latestFreshItems.find(i => i.id === oid);
            // If the item we just moved — use the new status directly
            if (oid === realItemId) return true;
            return found ? found.status === 'delivered' || found.status === 'returned' : false;
          });

          if (allDelivered) {
            await base44.entities.Load.update(li.load_id, { status: 'archived' }).catch(e =>
              console.warn('Auto-archive load failed:', e)
            );
            queryClient.removeQueries({ queryKey: ['loads'] });
          }
        }
      } catch (e) {
        console.warn('Auto-archive load check failed (non-critical):', e);
      }
    }

    // Check if order is complete after move to delivered or on_delivery
    if (updates.status === 'delivered' || updates.status === 'on_delivery') {
      // Update last_fulfillment_date on the order
      const deliveryDate = updates.date_completed || getLocalDateString();
      const currentLastDate = order?.last_fulfillment_date;
      
      // Only update if this delivery date is later than the current last date
      if (!currentLastDate || deliveryDate > currentLastDate) {
        await base44.entities.Order.update(orderId, { last_fulfillment_date: deliveryDate });
        queryClient.removeQueries(['order', orderId]);
        queryClient.removeQueries(['orders']);
      }
      
      // Debounce these checks to avoid rate limits from rapid sequential API calls (e.g. batch moves)
      if (checkNotificationTimeoutRef.current) clearTimeout(checkNotificationTimeoutRef.current);
      if (checkCompleteTimeoutRef.current) clearTimeout(checkCompleteTimeoutRef.current);
      checkNotificationTimeoutRef.current = setTimeout(() => { checkAndSendFirstDeliveryNotification(); }, 1500);
      checkCompleteTimeoutRef.current = setTimeout(() => { checkIfOrderComplete(); }, 2000);
    }
  };

  const checkAndSendFirstDeliveryNotification = async () => {
    if (!order || order.first_item_moved_notification_sent) return;
    if (isCheckingNotificationRef.current) return;
    isCheckingNotificationRef.current = true;
    try {
    
    // Use cached query data to avoid extra API calls
    const freshItems = queryClient.getQueryData(['items', orderId]);
    if (!freshItems) return;

    // Only check delivered/on_delivery items that are actually on a load
    const cachedLoadItems = allLoadItemsForOrder || queryClient.getQueryData(['allLoadItemsRaw', orderId]) || [];
    const deliveredItemsOnLoads = freshItems.filter(i => {
      if (i.status !== 'delivered' && i.status !== 'on_delivery') return false;
      
      // Pickup and direct_ship don't need to be on loads
      if (i.delivery_method === 'pickup' || i.delivery_method === 'direct_ship') return true;
      
      // For delivery method, must be on a load
      if (i.delivery_method === 'delivery') {
        return cachedLoadItems.some(li => li.order_item_id === i.id);
      }
      
      return false;
    });
    
    if (deliveredItemsOnLoads.length === 0) return; // No truly delivered items yet
    
    // Check if any delivered item is from an unpaid receipt using cached receipts
    const deliveredReceiptNumbers = new Set(deliveredItemsOnLoads.map(i => i.receipt_number));
    const cachedReceipts = queryClient.getQueryData(['receipts', orderId]) || receipts || [];
    
    // Check if any delivered receipt is unpaid or has no receipt entity
    const unpaidDeliveredReceipts = Array.from(deliveredReceiptNumbers).filter(receiptNum => {
      const receiptEntity = cachedReceipts.find(r => r.receipt_number === receiptNum);
      return !receiptEntity || !receiptEntity.is_paid;
    });
    
    if (unpaidDeliveredReceipts.length === 0) return;

    // Show prompt to user - don't auto-send
    setShowNotificationPrompt(true);
    } finally {
      isCheckingNotificationRef.current = false;
    }
  };

  const sendFirstDeliveryNotification = async () => {
    if (isSendingNotification) return;
    setShowNotificationPrompt(false);
    setIsSendingNotification(true);
    try {
      const { sendFirstDeliveryNotificationHelper } = await import('@/components/orders/sendFirstDeliveryNotificationHelper');
      const renderTemplate = (template, data) => {
        let result = template;
        Object.entries(data).forEach(([key, value]) => {
          result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
        });
        return result;
      };
      await sendFirstDeliveryNotificationHelper(base44, orderId, order, items, receipts, queryClient, renderTemplate, setEmailConfirmationDialog, toast);
    } catch (e) {
      toast.error("Failed to Send Notification", { description: e.message || "An unexpected error occurred." });
    } finally {
      setIsSendingNotification(false);
    }
  };

  const handleResetNotificationFlag = async () => {
    await base44.entities.Order.update(orderId, { first_item_moved_notification_sent: false });
    queryClient.removeQueries(['order', orderId]);
    queryClient.removeQueries(['orders']);
    toast.success("Notification Reset", {
      description: "Next delivery will trigger a new notification.",
    });
  };

  const [deliveryDateValue, setDeliveryDateValue] = useState('');

  // Initialize delivery date when dialog opens - use the moveDate from the move dialog if set
  useEffect(() => {
    if (deliveryMethodDialog.isOpen) {
      setDeliveryDateValue(deliveryMethodDialog.moveDate || getLocalDateString());
    }
  }, [deliveryMethodDialog.isOpen]);

  const handleDeliveryMethodConfirm = async (method, customDate = null) => {
    const { item, quantity, updates } = deliveryMethodDialog;
    updates.delivery_method = method;

    if (method === 'delivery') {
      // Goes to on_delivery (awaiting load assignment), no date_completed yet
      updates.status = 'on_delivery';
      updates.date_completed = null;
    } else {
      // pickup or direct_ship: goes straight to delivered
      updates.status = 'delivered';
      updates.date_completed = customDate || getLocalDateString();
    }

    setDeliveryMethodDialog({ isOpen: false, itemId: null, quantity: null, updates: null, item: null });
    setDeliveryDateValue('');

    // If picked up, prompt for printing ticket
    if (method === 'pickup') {
      const promptData = { isOpen: true, itemIds: [item.id], pendingMove: { item, quantity, updates } };
      console.log('printPromptDialog state set:', promptData);
      setPrintPromptDialog(promptData);
    } else {
      await executeMove(item, quantity, updates);
      if (method === 'delivery') {
        setIsCreateDeliveryDialogOpen(true);
      }
    }
  };

  const handleReturnConfirm = async (returnReceiptNumber, damaged) => {
    const { item, quantity, updates } = returnDialog;
    updates.return_receipt_number = damaged ? '' : returnReceiptNumber;
    updates.is_damaged = damaged;
    updates.date_returned = getLocalDateString();
    setReturnDialog({ isOpen: false, itemId: null, quantity: null, updates: null, item: null });
    setReturnReceiptValue('');
    setIsDamaged(false);
    await executeMove(item, quantity, updates);
  };

  const handlePoConfirm = async (poNumber) => {
    const { item, quantity, updates, batchMode, batchItems, batchQuantities } = poDialog;
    updates.po_number = poNumber || '';
    
    // If batch mode, move all selected items with the same PO number and their individual quantities
    if (batchMode && batchItems && batchItems.length > 0) {
      setPoDialog({ isOpen: false, itemId: null, quantity: null, updates: null, item: null, batchMode: false, batchItems: null, batchQuantities: null });
      setPoValue('');
      setNoPo(false);

      setBatchProgressState({
        isOpen: true,
        items: batchItems.map(id => id.replace('_master', '')),
        currentIndex: 0,
        title: `Putting ${batchItems.length} Item${batchItems.length > 1 ? 's' : ''} On Order`
      });

      try {
        for (let i = 0; i < batchItems.length; i++) {
          const realId = (batchItems[i] || '').replace('_master', '');
          const qty = parseInt(batchQuantities[realId]) || 0;
          if (qty <= 0) continue;
          await base44.entities.OrderItem.update(realId, {
            status: 'on_order',
            date_on_order: getLocalDateString(),
            po_number: poNumber || '',
            quantity: qty
          });
          setBatchProgressState(prev => ({ ...prev, currentIndex: i + 1 }));
        }
        toast.success(`Successfully put ${batchItems.length} item(s) on order`);
      } catch (err) {
        toast.error(`Failed to move items: ${err.message}`);
      } finally {
        setBatchProgressState(prev => ({ ...prev, isOpen: false }));
        queryClient.removeQueries(['items', orderId]);
        setSelectedMasterItems([]);
      }
      return;
    }
    
    // Single item mode
    setPoDialog({ isOpen: false, itemId: null, quantity: null, updates: null, item: null, batchMode: false, batchItems: null, batchQuantities: null });
    setPoValue('');
    setNoPo(false);
    setBatchProgressState({ isOpen: true, items: [`${item.product_name} (${quantity} qty)`], currentIndex: 0, title: 'Putting Item On Order' });
    try {
      await executeMove(item, quantity, updates);
      setBatchProgressState(prev => ({ ...prev, currentIndex: 1 }));
      toast.success(`Successfully put on order`);
    } catch (err) {
      toast.error(`Failed to move item: ${err.message}`);
      queryClient.removeQueries(['items', orderId]);
    } finally {
      setBatchProgressState(prev => ({ ...prev, isOpen: false }));
    }
  };

  const handleAddReceipt = () => {
      let receipt = prompt("Enter Receipt Number:");
      while (receipt !== null && receipt.trim() === '') {
          receipt = prompt("Receipt Number is required. Please enter a receipt number:");
      }
      if (receipt && receipt.trim()) {
          setEmptyReceipts(prev => [...prev, receipt.trim()]);
      }
  };

  const handleAddQuote = () => {
      let quote = prompt("Enter Quote Number:");
      while (quote !== null && quote.trim() === '') {
          quote = prompt("Quote Number is required. Please enter a quote number:");
      }
      if (quote && quote.trim()) {
          setEmptyQuotes(prev => [...prev, quote.trim()]);
      }
  };

  const handleLocationHeaderChange = (newLoc, itemsInGroup) => {
      let finalLoc = newLoc;

      if (newLoc === 'Other') {
          const customName = prompt("Enter location name:");
          if (!customName || !customName.trim()) return;
          finalLoc = customName.trim();
          setCustomLocations(prev => {
              if (!prev.includes(finalLoc)) return [...prev, finalLoc];
              return prev;
          });
      }

      if (!itemsInGroup || itemsInGroup.length === 0) return;

      // Move all items in this group to the new location
      itemsInGroup.forEach(item => {
          updateItemMutation.mutate({ 
              id: item.id, 
              data: { hold_location: finalLoc } 
          });
      });
  };

  const openCatalogForReceipt = (receipt, isQuote = false) => {
      setCatalogInitialReceipt(receipt);
      setCatalogInitialIsQuote(isQuote);
      setIsAddItemOpen(true);
  };

  const checkIfOrderComplete = async () => {
   // Never fire while the delivery load creation dialog is open
   if (isCreateDeliveryDialogOpen) return;
   if (!order || order.is_archived) return;

   const currentItems = queryClient.getQueryData(['items', orderId]);
   if (!currentItems) return;

   // An order is only complete if ALL non-zero-quantity items are either:
   //   - status 'delivered' or 'returned'
   //   - status 'order' with qty === 0 (fully allocated master items)
   // Items still in 'on_order', 'in_hold', or 'on_delivery' must block completion.
   const allDone = currentItems.every(item => {
     const qty = item.quantity || 0;
     if (qty === 0) return true; // zero-quantity items (fully allocated masters) are fine
     return item.status === 'delivered' || item.status === 'returned';
   });

   if (allDone && currentItems.some(i => i.status === 'delivered' && (i.quantity || 0) > 0)) {
     // All items fully delivered or returned — show completion dialog
     setIsCompleteDialogOpen(true);
   }
  };

  const handleCompleteDialogArchive = async () => {
    updateOrderMutation.mutate({ is_archived: true });
    setIsCompleteDialogOpen(false);
    try {
      const user = await base44.auth.me();
      if (user.notify_on_order_archived) {
        const emails = (user.notification_email || user.email).split(';').map(e => e.trim()).filter(e => e);
        for (const email of emails) {
          await base44.integrations.Core.SendEmail({ to: email, subject: `Order Archived - ${order.customer_name}`, body: ['ORDER ARCHIVED', '', 'Customer:', order.customer_name, '', 'Receipt Numbers:', order.receipt_numbers || 'N/A', '', 'Job Address:', order.job_address || 'N/A'].join('\r\n') });
        }
      }
    } catch (e) { console.error('Failed to send notification:', e); }
  };

  const handleCompleteDialogMarkComplete = async () => {
    await updateOrderMutation.mutateAsync({ is_completed: true });
    setIsCompleteDialogOpen(false);
    navigate(createPageUrl('CompletedOrders'));
  };

  const handleLinkCustomer = (customer) => {
    updateOrderMutation.mutate({
      customer_id: customer.id,
      customer_name: customer.company || customer.name,
      customer_phone: customer.phone || order.customer_phone
    });
    setIsLinkCustomerOpen(false);
  };

  const handleKeepOnSameLoadToggle = async (itemId) => {
    const item = items?.find(i => i.id === itemId);
    if (item) {
      await updateItemMutation.mutateAsync({ 
        id: itemId, 
        data: { keep_on_same_load: !item.keep_on_same_load } 
      });
    }
  };

  const mergeDuplicateHoldItems = async () => {
    const holdItems = items?.filter(i => i.status === 'in_hold') || [];
    const groups = {};
    holdItems.forEach(item => {
      const key = `${item.product_name}|${item.selected_color}|${item.receipt_number}|${item.hold_location}|${item.selected_unit}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    for (const group of Object.values(groups)) {
      if (group.length > 1) {
        group.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        const keepItem = group[0];
        const totalQty = group.reduce((sum, item) => sum + (item.quantity || 0), 0);
        await base44.entities.OrderItem.update(keepItem.id, { quantity: totalQty });
        await Promise.all(group.slice(1).map(item => base44.entities.OrderItem.delete(item.id)));
      }
    }
    queryClient.removeQueries(['items', orderId]);
    toast.success("Duplicate items merged successfully");
  };

  const [isCreatingDelivery, setIsCreatingDelivery] = useState(false);
  const [strandedItemsWarning, setStrandedItemsWarning] = useState([]);
  const checkNotificationTimeoutRef = useRef(null);
  const checkCompleteTimeoutRef = useRef(null);
  const isCheckingNotificationRef = useRef(false);

  const handleCreateDelivery = async () => {
    // Manual build flow - create empty load and navigate to LoadDetails
    if (packingStrategy === 'manual') {
      setIsCreateDeliveryDialogOpen(false);
      try {
        // Bug 3 fix: read date from React state, not DOM
        const pickedDate = deliveryDate || deliveryDateRef.current || getLocalDateString();
        // Bug 5 fix: use max delivery_order + 1 instead of .length to avoid collisions
        const allExistingLoads = await base44.entities.Load.list('delivery_order', 500);
        const loadsForDate = allExistingLoads.filter(l => l.delivery_date === pickedDate && l.status !== 'archived');
        const maxOrder = loadsForDate.reduce((max, l) => Math.max(max, l.delivery_order ?? -1), -1);
        const newDeliveryOrder = maxOrder + 1;
        // Bug 4 fix: include company_name so calendar/Jarvis display correctly
        const newLoad = await base44.entities.Load.create({
          name: `${order.company_name || order.customer_name} - ${pickedDate}`,
          order_id: orderId,
          company_name: order.company_name || null,
          customer_name: order.customer_name,
          delivery_date: pickedDate,
          truck_setting_id: selectedTruckSettingId || null,
          status: 'active',
          delivery_order: newDeliveryOrder
        });
        toast.success('Empty load created!', {
          action: { label: 'View Load', onClick: () => navigate(createPageUrl(`LoadDetails?id=${newLoad.id}`)) },
          duration: 8000,
        });
        navigate(createPageUrl(`LoadDetails?id=${newLoad.id}`));
        queryClient.removeQueries(['loads', orderId]);
        setDeliveryDate(getLocalDateString());
      } catch (error) {
        toast.error("Failed to create load: " + error.message);
        setIsCreateDeliveryDialogOpen(true);
      }
      return;
    }

    // Optimized delivery flow
    if (!selectedTruckSettingId) {
      toast.error("Please select a truck setting");
      return;
    }

    // Prevent double-clicks
    if (isCreatingDelivery) return;
    const pickedDate = document.getElementById('delivery-date-input')?.value || deliveryDateRef.current;
    setIsCreatingDelivery(true);
    setIsCreateDeliveryDialogOpen(false);

    try {
      // Call the backend optimization function
      const response = await base44.functions.invoke('createLoadsFromDeliveredItems', {
        orderId: orderId,
        deliveredOrderItemIds: itemsNeedingLoad.map(i => i.id),
        truckSettingId: selectedTruckSettingId,
        packingStrategy: packingStrategy,
        deliveryDate: pickedDate
      });

      const { loads, strandedItems } = response.data;

      // Invalidate queries
      queryClient.removeQueries(['items', orderId]);
      queryClient.removeQueries({ queryKey: ['loads'] });
      queryClient.removeQueries(['allLoadItemsRaw', orderId]);
      queryClient.removeQueries(['loads', orderId]);

      // Show warning if any items couldn't be placed on a load
      if (strandedItems && strandedItems.length > 0) {
        setStrandedItemsWarning(strandedItems);
      }

      // Navigate to the first created load, with a View Load toast as fallback
      if (loads.length > 0) {
        const firstLoadId = loads[0].id;
        toast.success(`Successfully created ${loads.length} delivery load${loads.length > 1 ? 's' : ''}!`, {
          action: { label: 'View Load', onClick: () => navigate(createPageUrl(`LoadDetails?id=${firstLoadId}`)) },
          duration: 8000,
        });
        navigate(createPageUrl(`LoadDetails?id=${firstLoadId}`));
      }
    } catch (error) {
      toast.error("Failed to create delivery: " + error.message);
      setIsCreateDeliveryDialogOpen(true);
    } finally {
      setIsCreatingDelivery(false);
    }
  };

  const handleVerifiedToggle = (item) => {
    updateItemMutation.mutate({ id: item.id, data: { is_verified: !item.is_verified } });
  };

  const handleQuantityUpdate = (item, newVal) => {
    // For items linked to a master, validate against remaining quantity
    if (item.master_item_id) {
      const masterItem = items?.find(i => i.id === item.master_item_id);
      if (masterItem) {
        // Calculate total moved from this master
        const allMovedItems = items.filter(i => i.master_item_id === item.master_item_id && i.status !== 'order');
        const totalMoved = allMovedItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
        
        // Original is either stored or remaining + moved
        const originalQty = masterItem.original_quantity || (masterItem.quantity + totalMoved);
        
        // Calculate total used by OTHER items (not this one)
        const otherItems = allMovedItems.filter(i => i.id !== item.id);
        const otherUsed = otherItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
        const maxAllowed = originalQty - otherUsed;

        if (newVal > maxAllowed) {
          alert(`Cannot set quantity to ${newVal}. Maximum available is ${maxAllowed} (total ordered: ${originalQty}, already allocated: ${otherUsed}).`);
          // Force refresh to reset input value
          queryClient.removeQueries(['items', orderId]);
          return;
        }
      }
    }
    updateItemMutation.mutate({ id: item.id, data: { quantity: newVal } });
  };

  const handleBatchMoveConfirm = async ({ moveDate, fulfillmentMethod }) => {
    setBatchMoveDialogOpen(false);
    setIsBatchProcessing(true);
    // selectedHoldItemIds is the array of checked item IDs
    const idsToProcess = [...selectedHoldItemIds];
    const count = idsToProcess.length;
    try {
      const newStatus = fulfillmentMethod === 'delivery' ? 'on_delivery' : 'delivered';
      for (const itemId of idsToProcess) {
        await base44.entities.OrderItem.update(itemId, {
          status: newStatus,
          delivery_method: fulfillmentMethod,
          date_completed: fulfillmentMethod !== 'delivery' ? moveDate : null,
        });
      }
    } finally {
      setIsBatchProcessing(false);
      setBatchSelectionMode(false);
      setSelectedHoldItemIds([]);
      queryClient.removeQueries(['items', orderId]);
    }
    if (fulfillmentMethod === 'delivery') {
      toast.success('Items moved to On Delivery.', { description: 'Build a load?', action: { label: 'Build Load', onClick: () => setIsCreateDeliveryDialogOpen(true) }, duration: 8000 });
    } else {
      toast.success(`${count} item(s) marked as ${fulfillmentMethod === 'pickup' ? 'Picked Up' : 'Direct Ship'}.`);
    }
  };

  // -- RENDERERS --

  if (isOrderLoading || isItemsLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  if (!order && !isOrderLoading) {
    // Use navigate so the URL/state is properly cleaned up — window.location.href
    // can land on /orderdetails with no ?id= param, causing a permanent spinner.
    navigate(createPageUrl('Dashboard'), { replace: true });
    return <div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  const masterItems = items?.filter(i => !i.master_item_id).map(masterItem => {
    const movedItems = items.filter(i => i.master_item_id === masterItem.id);
    const onOrderQty = movedItems.filter(i => i.status === 'on_order').reduce((sum, i) => sum + (i.quantity || 0), 0);
    const inHoldQty = movedItems.filter(i => i.status === 'in_hold').reduce((sum, i) => sum + (i.quantity || 0), 0);
    const deliveredItems = movedItems.filter(i => i.status === 'delivered');
    const onDeliveryItems = movedItems.filter(i => i.status === 'on_delivery');
    const pickedUpQty = deliveredItems.filter(i => i.delivery_method === 'pickup').reduce((sum, i) => sum + (i.quantity || 0), 0);
    const deliveredQty = deliveredItems.filter(i => i.delivery_method === 'delivery' || i.delivery_method === 'direct_ship').reduce((sum, i) => sum + (i.quantity || 0), 0);
    const onDeliveryQty = onDeliveryItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
    const returnedQty = movedItems.filter(i => i.status === 'returned').reduce((sum, i) => sum + (i.quantity || 0), 0);
    const totalMoved = onOrderQty + inHoldQty + pickedUpQty + deliveredQty + onDeliveryQty + returnedQty;
    const originalQty = masterItem.original_quantity || ((masterItem.quantity || 0) + totalMoved);
    const remaining = originalQty - totalMoved;
    return { ...masterItem, selected_unit: masterItem.selected_unit || masterItem.unit_type || '', draggableId: `${masterItem.id}_master`, originalQty, quantity: Math.max(0, remaining),
      breakdown: { remaining: Math.max(0, remaining), onOrder: onOrderQty, inHold: inHoldQty, pickedUp: pickedUpQty, delivered: deliveredQty, onDelivery: onDeliveryQty, returned: returnedQty }
    };
  }) || [];


  // Calculate receipts and quotes from actual items and manually added empty ones
  const itemReceipts = items ? items.filter(i => !i.is_quote).map(i => i.receipt_number).filter(r => r && r.trim() !== '') : [];
  const itemQuotes = items ? items.filter(i => i.is_quote).map(i => i.receipt_number).filter(r => r && r.trim() !== '') : [];
  const uniqueReceipts = [...new Set([...itemReceipts, ...emptyReceipts])].sort();
  const uniqueQuotes = [...new Set([...itemQuotes, ...emptyQuotes])].sort();
  
  // Helper to consolidate duplicate items
  // byDate=true: groups by product+color+unit+date_completed (for delivered column)
  // byDate=false: groups by master_item_id+product+color+unit+receipt+location (for in_hold column)
  const consolidateItems = (itemList, byDate = false) => {
    const groups = {};
    itemList.forEach(item => {
      const key = byDate
        ? `${item.product_name}|${item.selected_color || ''}|${item.selected_unit || ''}|${item.date_completed ? item.date_completed.substring(0, 10) : 'unknown'}`
        : `${item.master_item_id || item.id}|${item.product_name}|${item.selected_color}|${item.selected_unit}|${item.receipt_number}|${item.hold_location}`;
      if (!groups[key]) {
        groups[key] = { ...item };
      } else {
        groups[key].quantity = (groups[key].quantity || 0) + (item.quantity || 0);
      }
    });
    return Object.values(groups);
  };

  const columns = {
    order: masterItems,
    on_order: items?.filter(i => i.status === 'on_order') || [],
    in_hold: consolidateItems(items?.filter(i => i.status === 'in_hold') || []),
    delivered: consolidateItems(items?.filter(i => i.status === 'delivered' || i.status === 'on_delivery') || [], true),
    returned: items?.filter(i => i.status === 'returned') || []
  };

  // Items that are in_hold and ready to be loaded onto a truck
  // Include quote items — they are physically in stock and deliverable
  const itemsNeedingLoad = (items || []).filter(i => i.status === 'in_hold' && (i.quantity || 0) > 0);
  

  // Calculate pick up ticket count
  const pickUpTicketCount = items?.filter(i => 
    i.status === 'picked_up' && !i.ticket_printed
  ).length || 0;

  // Calculate dynamic grid columns based on content
  const hasOnOrder = columns.on_order.length > 0;
  // hasReturned intentionally removed — returned items are hidden from kanban

  return (
    <div className="flex flex-col -m-3 md:-m-6 px-3 md:px-6 pt-3 md:pt-4">

      {/* Header Section */}
      <div className="flex flex-col gap-1 mb-1 md:mb-1 mb-6">
        <DeliveryRemindersSection
          deliveryReminders={deliveryReminders}
          loads={loads}
          items={items}
          resolveReminderMutation={resolveReminderMutation}
          rescheduleReminderMutation={rescheduleReminderMutation}
        />
        
        {/* Action buttons row */}
         <div className="flex items-center gap-2 flex-wrap">
           {pickUpTicketCount > 0 && !order?.is_archived && (
             <div className="relative">
               <Button 
                 variant="outline" 
                 className="bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                 onClick={() => setIsPrintTicketOpen(true)}
               >
                 <FileText className="w-4 h-4 mr-2" />
                 Pick Up Ticket
               </Button>
               <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                 {pickUpTicketCount}
               </span>
             </div>
           )}

           {!order?.is_archived && (
             <Button
               variant="default"
               onClick={() => setShowBuildLoadDialog(true)}
               className="bg-indigo-600 hover:bg-indigo-700"
             >
               <Truck className="w-4 h-4 mr-2" />
               Build Load
             </Button>
           )}
           <OrderActionButtons
             items={items} order={order} receipts={receipts} allLoadItemsForOrder={allLoadItemsForOrder}
             onPrintTicket={() => setIsPrintTicketOpen(true)}
             onOrderHistory={() => { queryClient.removeQueries(['items', orderId]); setIsOrderHistoryOpen(true); }}
             onResetNotification={handleResetNotificationFlag}
             onSendNotification={sendFirstDeliveryNotification}
             isSendingNotification={isSendingNotification}
             onAddReminder={() => setShowReminderDialog(true)}
             onReturnItem={() => setIsManualReturnOpen(true)}
             onDeleteOrder={() => setIsDeleteDialogOpen(true)}
             queryClient={queryClient} orderId={orderId}
           />
         </div>

        <OrderInfoHeader
          order={order} orderId={orderId} customers={customers}
          uniqueReceipts={uniqueReceipts} uniqueQuotes={uniqueQuotes}
          onEditOrder={() => setIsEditOrderOpen(true)}
          onLinkCustomer={() => setIsLinkCustomerOpen(true)}
          onPrintMasterOrder={() => setIsPrintMasterOrderOpen(true)}
          items={items} receipts={receipts}
          className="mt-4"
        />
      </div>

      {/* Mobile Tab Bar */}
      <div className="flex md:hidden border-b border-gray-200 mb-2 overflow-x-auto shrink-0">
        {[
          { id: 'order', label: 'Master' },
          ...(hasOnOrder ? [{ id: 'on_order', label: 'On Order' }] : []),
          { id: 'in_hold', label: 'In Hold' },
          { id: 'delivered', label: 'Delivered' },
          // Returned items are hidden from the kanban (no returned column)
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stranded Items Warning */}
      {strandedItemsWarning.length > 0 && (
        <div className="bg-red-50 border-2 border-red-400 rounded-lg p-3 mb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-bold text-red-900">Items Not Placed on Any Load</h3>
                <p className="text-sm text-red-800 mt-0.5">The following items could not fit on any load and remain in In Hold. Please add them manually from the Load Details page:</p>
                <ul className="mt-1 space-y-0.5">
                  {strandedItemsWarning.map(i => (
                    <li key={i.id} className="text-sm font-semibold text-red-900">
                      • {i.quantity} {i.selected_unit} {i.product_name}{i.selected_color ? ` — ${i.selected_color}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setStrandedItemsWarning([])}><X className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      <div className="relative flex flex-col">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 items-start pb-2" style={{ minHeight: '80vh' }}>
          
          {/* Column 1: Master Order */}
          <div className={`${hasOnOrder ? 'w-1/4' : 'w-1/3'} flex flex-col self-stretch`}>
          <MasterOrderColumn
            items={items} columns={columns} order={order} receipts={receipts}
            emptyReceipts={emptyReceipts} emptyQuotes={emptyQuotes}
            selectedMasterItems={selectedMasterItems} setSelectedMasterItems={setSelectedMasterItems}
            collapsedReceipts={collapsedReceipts} setCollapsedReceipts={setCollapsedReceipts}
            openCalendars={openCalendars} setOpenCalendars={setOpenCalendars}
            handleAddReceipt={handleAddReceipt} handleAddQuote={handleAddQuote}
            openCatalogForReceipt={openCatalogForReceipt} handleVerifiedToggle={handleVerifiedToggle}
            updateItemMutation={updateItemMutation} deleteItemMutation={deleteItemMutation}
            setMoveDialogState={setMoveDialogState} createOrUpdateReceiptMutation={createOrUpdateReceiptMutation}
            orderId={orderId} queryClient={queryClient} showArchivedError={showArchivedError}
            onEditColor={handleEditColor} products={products}
            onPaidToggle={(receiptNumber) => {
              // Check if this receipt has skip_paid_notification set (e.g. paid at Lightspeed import)
              const receiptRecord = receipts?.find(r => r.receipt_number === receiptNumber);
              if (receiptRecord?.skip_paid_notification) {
                // No notification needed, just check completion
                checkIfOrderComplete();
                return;
              }
              // Show the paid notification dialog first; checkIfOrderComplete runs after user responds
              setPaidNotificationDialog({ isOpen: true, receiptNumber, isSending: false });
            }}
            onLightspeedImport={() => setIsLightspeedImportOpen(true)}
          />
          </div>

          {/* Column 2: On Order (conditional) */}
          {hasOnOrder && (
            <div className="w-1/4 flex flex-col self-stretch">
            <OnOrderColumn
              columns={columns} items={items} order={order}
              openCalendars={openCalendars} setOpenCalendars={setOpenCalendars}
              updateItemMutation={updateItemMutation}
              collapsedPOs={collapsedPOs} setCollapsedPOs={setCollapsedPOs}
              getLocalDateString={getLocalDateString}
              showArchivedError={showArchivedError}
              setSoDialog={setSoDialog} setSoValue={setSoValue}
            />
            </div>
          )}

          {/* Column 3: In Hold */}
          <div className={`${hasOnOrder ? 'w-1/4' : 'w-1/3'} flex flex-col self-stretch`}>
          <InHoldColumn
            columns={columns} items={items} order={order}
            customLocations={customLocations}
            openCalendars={openCalendars} setOpenCalendars={setOpenCalendars}
            updateItemMutation={updateItemMutation}
            handleVerifiedToggle={handleVerifiedToggle}
            handleQuantityUpdate={handleQuantityUpdate}
            handleLocationHeaderChange={handleLocationHeaderChange}
            handleKeepOnSameLoadToggle={handleKeepOnSameLoadToggle}
            setMoveDialogState={setMoveDialogState}
            mergeDuplicateHoldItems={mergeDuplicateHoldItems}
            showArchivedError={showArchivedError}
            queryClient={queryClient}
            onEditColor={handleEditColor}
            products={products}
            batchSelectionMode={batchSelectionMode}
            setBatchSelectionMode={setBatchSelectionMode}
            selectedHoldItemIds={selectedHoldItemIds}
            setSelectedHoldItemIds={setSelectedHoldItemIds}
            onBatchMoveSelected={() => setBatchMoveDialogOpen(true)}
            />
            </div>

            {/* Column 4: Delivered / Picked Up */}
            <div className={`${hasOnOrder ? 'w-1/4' : 'w-1/3'} flex flex-col gap-2 self-stretch`}>
            {(() => {
              const onDeliveryItems = columns.delivered.filter(i => i.status === 'on_delivery');
              const activeLoadItem = allLoadItemsForOrder?.find(li => onDeliveryItems.some(oi => oi.id === li.order_item_id));
              const activeLoadId = activeLoadItem?.load_id;
              const activeLoad = loads.find(l => l.id === activeLoadId);
              return (
                <OnDeliverySection
                  items={onDeliveryItems}
                  updateItemMutation={updateItemMutation}
                  getLocalDateString={getLocalDateString}
                  checkAndSendFirstDeliveryNotification={checkAndSendFirstDeliveryNotification}
                  checkIfOrderComplete={checkIfOrderComplete}
                  loadItems={loadItems}
                  orderId={orderId}
                  queryClient={queryClient}
                  loadId={activeLoadId}
                  loads={loads}
                  deliveryDate={activeLoad?.delivery_date}
                />
              );
            })()}
            <DeliveredColumn
              items={columns.delivered.filter(i => i.status !== 'on_delivery')}
              openCalendars={openCalendars}
              setOpenCalendars={setOpenCalendars}
              updateItemMutation={updateItemMutation}
              handleVerifiedToggle={handleVerifiedToggle}
              handleKeepOnSameLoadToggle={handleKeepOnSameLoadToggle}
              setMoveDialogState={setMoveDialogState}
              showArchivedError={showArchivedError}
              order={order}
              loadItems={allLoadItemsForOrder}
              navigate={navigate}
              allLoads={loads}
            />
            </div>
            </div>
            </DragDropContext>
            </div>

      <ProductCatalogDialog 
        isOpen={isAddItemOpen} 
        onOpenChange={setIsAddItemOpen}
        initialReceiptNumber={catalogInitialReceipt}
        initialIsQuote={catalogInitialIsQuote}
        existingReceipts={uniqueReceipts}
        existingQuotes={uniqueQuotes}
        onAddItems={async (cartItems) => { await createItemsBulkMutation.mutateAsync(cartItems); }}
        onAllItemsAdded={() => refetchItems()}
      />
      
      <MoveItemDialog 
              isOpen={moveDialogState.isOpen}
              onClose={() => setMoveDialogState(prev => ({ ...prev, isOpen: false }))}
              onConfirm={handleMoveConfirm}
              itemId={moveDialogState.itemId}
              targetColumn={moveDialogState.targetColumn}
              targetLocation={moveDialogState.targetLocation}
              customLocations={customLocations}
              allItems={items || []}
              maxQtyOverride={moveDialogState.maxQtyOverride}
              batchMode={moveDialogState.batchMode}
              batchItems={moveDialogState.batchItems}
              isDirectShip={moveDialogState.isDirectShip || false}
            />

      <EditOrderDialog 
        isOpen={isEditOrderOpen} 
        onClose={() => setIsEditOrderOpen(false)} 
        order={order} 
      />

      <PrintTicketDialog
        isOpen={isPrintTicketOpen}
        onClose={() => { setIsPrintTicketOpen(false); setPrintPromptDialog(prev => ({ ...prev, itemIds: [] })); }}
        orderId={order.id}
        items={items || []}
        order={order}
        initialSelectedIds={printPromptDialog.itemIds}
        onItemsUpdated={() => queryClient.removeQueries(['items', orderId])}
        onConfirmPrint={async (printedItems) => {
          // Items are already marked as delivered in handlePrint
          // Just mark ticket_printed and refresh
          for (const printItem of printedItems) {
            const freshItem = items?.find(i => i.id === printItem.id);
            if (!freshItem) continue;
            await base44.entities.OrderItem.update(printItem.id, { ticket_printed: true });
          }
          queryClient.removeQueries(['items', orderId]);
          setIsPrintTicketOpen(false);
        }}
      />

      {isOrderHistoryOpen && items && (
        <PrintableOrderHistory order={order} items={items} onClose={() => setIsOrderHistoryOpen(false)} />
      )}

      <LinkCustomerDialog 
        isOpen={isLinkCustomerOpen}
        onOpenChange={setIsLinkCustomerOpen}
        customers={customers}
        onLinkCustomer={handleLinkCustomer}
        onAddNewCustomer={() => setIsAddNewCustomerOpen(true)}
      />

      <AddNewCustomerDialog 
        isOpen={isAddNewCustomerOpen}
        onOpenChange={setIsAddNewCustomerOpen}
        customerData={newCustomerData}
        onDataChange={setNewCustomerData}
        onConfirm={() => createCustomerMutation.mutate(newCustomerData)}
        isLoading={createCustomerMutation.isPending}
      />

      <OrderDialogsWrapper
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
        addReturnDialog={addReturnDialog} setAddReturnDialog={setAddReturnDialog} createItemMutation={createItemMutation}
        printPromptDialog={printPromptDialog} setPrintPromptDialog={setPrintPromptDialog}
        executeMove={executeMove} setIsPrintTicketOpen={setIsPrintTicketOpen}
        soDialog={soDialog} setSoDialog={setSoDialog} soValue={soValue} setSoValue={setSoValue}
        updateItemMutation={updateItemMutation} setMoveDialogState={setMoveDialogState}
        isDeleteDialogOpen={isDeleteDialogOpen} setIsDeleteDialogOpen={setIsDeleteDialogOpen}
        deleteOrderMutation={deleteOrderMutation}
        deleteProgress={deleteProgress}
        onArchiveOrder={() => { updateOrderMutation.mutate({ is_archived: true }); navigate(createPageUrl('Dashboard')); }}
        isCompleteDialogOpen={isCompleteDialogOpen} setIsCompleteDialogOpen={setIsCompleteDialogOpen}
        handleCompleteDialogMarkComplete={handleCompleteDialogMarkComplete}
        handleCompleteDialogArchive={handleCompleteDialogArchive}
        emailConfirmationDialog={emailConfirmationDialog} setEmailConfirmationDialog={setEmailConfirmationDialog}
        isCreateDeliveryDialogOpen={isCreateDeliveryDialogOpen} setIsCreateDeliveryDialogOpen={setIsCreateDeliveryDialogOpen}
        selectedTruckSettingId={selectedTruckSettingId} setSelectedTruckSettingId={setSelectedTruckSettingId}
        packingStrategy={packingStrategy} setPackingStrategy={setPackingStrategy}
        handleCreateDelivery={handleCreateDelivery}
        deliveryDate={deliveryDate} setDeliveryDate={setDeliveryDate}
        showReminderDialog={showReminderDialog} setShowReminderDialog={setShowReminderDialog}
        reminderDate={reminderDate} setReminderDate={setReminderDate}
        reminderNotes={reminderNotes} setReminderNotes={setReminderNotes}
        createReminderMutation={createReminderMutation} orderId={orderId}
        showNotificationPrompt={showNotificationPrompt} setShowNotificationPrompt={setShowNotificationPrompt}
        sendFirstDeliveryNotification={sendFirstDeliveryNotification}
      />

      <BuildLoadDialog isOpen={showBuildLoadDialog} onClose={() => setShowBuildLoadDialog(false)} orderId={orderId} onBuildManually={(strategy) => { setPackingStrategy(strategy || 'manual'); setIsCreateDeliveryDialogOpen(true); }} />
      <ManualReturnDialog isOpen={isManualReturnOpen} onClose={() => setIsManualReturnOpen(false)} onConfirm={async (form) => { await handleManualReturnConfirm(form); setIsManualReturnOpen(false); }} existingReceipts={uniqueReceipts} />

      <BatchMoveToDeliveredDialog isOpen={batchMoveDialogOpen} onClose={() => setBatchMoveDialogOpen(false)} onConfirm={handleBatchMoveConfirm} selectedItems={selectedHoldItemIds} isProcessing={isBatchProcessing} />

      <BatchProgressDialog
        isOpen={batchProgressState.isOpen}
        items={batchProgressState.items}
        currentIndex={batchProgressState.currentIndex}
        title={batchProgressState.title}
      />
      <EditColorDialog
        isOpen={editColorDialog.isOpen}
        onClose={() => setEditColorDialog({ isOpen: false, item: null, availableColors: [] })}
        item={editColorDialog.item}
        availableColors={editColorDialog.availableColors}
        onSave={handleSaveColor}
        isSaving={isSavingColor}
      />

      <LightspeedImportDialog
        isOpen={isLightspeedImportOpen}
        onClose={() => setIsLightspeedImportOpen(false)}
        orderId={orderId}
        existingReceipts={uniqueReceipts}
        onItemsCreated={() => { queryClient.removeQueries(['items', orderId]); queryClient.removeQueries(['receipts', orderId]); }}
        getLocalDateString={getLocalDateString}
      />

      <PrintMasterOrderDialog
        isOpen={isPrintMasterOrderOpen}
        onClose={() => setIsPrintMasterOrderOpen(false)}
        order={order}
        items={items}
        receipts={receipts}
      />

      <PaidNotificationDialog
        isOpen={paidNotificationDialog.isOpen}
        receiptNumber={paidNotificationDialog.receiptNumber}
        isSending={paidNotificationDialog.isSending}
        onClose={() => {
          setPaidNotificationDialog({ isOpen: false, receiptNumber: null, isSending: false });
          checkIfOrderComplete();
        }}
        onSend={async () => {
          setPaidNotificationDialog(prev => ({ ...prev, isSending: true }));
          let wasAutoArchived = false;
          try {
            const result = await base44.functions.invoke('sendOrderPaidEmail', { orderId, receiptNumber: paidNotificationDialog.receiptNumber });
            toast.success(`Payment notification sent for receipt #${paidNotificationDialog.receiptNumber}`);
            if (result?.data?.autoArchived) {
              wasAutoArchived = true;
              toast.success('Order auto-archived (completed + all receipts paid)');
            }
          } catch (e) {
            toast.error('Failed to send paid email: ' + e.message);
          } finally {
            setPaidNotificationDialog({ isOpen: false, receiptNumber: null, isSending: false });
            if (wasAutoArchived) {
              // Navigate away immediately — don't let the invalidateQueries trigger
              // a refetch that lands on a null-order spinner
              queryClient.removeQueries(['order', orderId]);
              queryClient.removeQueries(['items', orderId]);
              queryClient.removeQueries(['receipts', orderId]);
              queryClient.removeQueries(['orders']);
              navigate(createPageUrl('CompletedOrders'));
            } else {
              checkIfOrderComplete();
            }
          }
        }}
      />
      </div>
    );
}