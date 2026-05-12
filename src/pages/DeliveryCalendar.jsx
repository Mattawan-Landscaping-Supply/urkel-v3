import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, AlertTriangle, X, Zap, Eye, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, parseISO, isPast, startOfDay } from 'date-fns';

export default function DeliveryCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDateForView, setSelectedDateForView] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderDate, setReminderDate] = useState(null);
  const [selectedOrderForReminder, setSelectedOrderForReminder] = useState('');
  const [reminderNotes, setReminderNotes] = useState('');

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: loads = [] } = useQuery({
    queryKey: ['loads', 'calendar'],
    queryFn: () => base44.entities.Load.list('-delivery_date', 500),
    staleTime: 60000,
  });

  const { data: allLoadItems = [] } = useQuery({
    queryKey: ['loadItems', 'calendar'],
    queryFn: () => base44.entities.LoadItem.list('-created_date', 500),
    staleTime: 60000,
  });

  const { data: allOrderItems = [] } = useQuery({
    queryKey: ['orderItems', 'calendar'],
    queryFn: () => base44.entities.OrderItem.list('-created_date', 500),
    staleTime: 60000,
  });

  const { data: allOrders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: () => base44.entities.Order.list('-created_date', 500),
    staleTime: 60000,
  });

  const { data: allCustomers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list(),
    staleTime: 60000,
  });

  const { data: loadCustomerStops = [] } = useQuery({
    queryKey: ['loadCustomerStops'],
    queryFn: () => base44.entities.LoadCustomerStop.list(),
    staleTime: 60000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['deliveryAlerts'],
    queryFn: async () => {
      const all = await base44.entities.DeliveryAlert.list('-created_date', 100);
      return all.filter(a => !a.is_dismissed);
    },
    staleTime: 60000,
  });

  const { data: deliveryReminders = [] } = useQuery({
    queryKey: ['deliveryReminders'],
    queryFn: async () => {
      const all = await base44.entities.DeliveryReminder.list('-created_date', 500);
      return all.filter(r => !r.is_resolved);
    },
    staleTime: 60000,
  });

  useEffect(() => {
    const unsubscribe = base44.entities.DeliveryReminder.subscribe(() => {
      queryClient.invalidateQueries(['deliveryReminders']);
    });
    return unsubscribe;
  }, [queryClient]);

  const dismissAlertMutation = useMutation({
    mutationFn: ({ alertId, action }) =>
      base44.entities.DeliveryAlert.update(alertId, { is_dismissed: true, resolved_action: action }),
    onSuccess: () => {
      queryClient.invalidateQueries(['deliveryAlerts']);
      setSelectedAlert(null);
    },
  });

  const createReminderMutation = useMutation({
    mutationFn: (data) => base44.entities.DeliveryReminder.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['deliveryReminders']);
      setShowReminderDialog(false);
      setSelectedOrderForReminder('');
      setReminderNotes('');
      setReminderDate(null);
    },
  });

  const resolveReminderMutation = useMutation({
    mutationFn: (reminderId) => base44.entities.DeliveryReminder.update(reminderId, { is_resolved: true }),
    onSuccess: () => queryClient.invalidateQueries(['deliveryReminders']),
  });

  const getDisplayName = (order) => {
    if (!order) return '';
    if (order.company_name) return order.company_name;
    const customer = order.customer_id ? allCustomers.find(c => c.id === order.customer_id) : null;
    return customer?.company || order.customer_name || '';
  };

  const getReminderDisplayName = (reminder) => {
    const order = allOrders.find(o => o.id === reminder.order_id);
    return getDisplayName(order) || reminder.customer_name || '';
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const paddingDays = Array(monthStart.getDay()).fill(null);

  const getLoadsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return [...(loads.filter(l => l.delivery_date === dateStr))].sort(
      (a, b) => (a.delivery_order || 0) - (b.delivery_order || 0)
    );
  };

  const getRemindersForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const today = format(new Date(), 'yyyy-MM-dd');
    return deliveryReminders.filter(r => {
      if (r.scheduled_date !== dateStr) return false;
      if (!allOrders.find(o => o.id === r.order_id)) return false;
      // For past dates: hide if a load already exists for this order (it was handled)
      if (dateStr <= today) {
        const hasLoad = loads.some(l => l.order_id === r.order_id && l.status !== 'archived');
        if (hasLoad) return false;
      }
      return true;
    });
  };

  const handleAlertAction = (alert, action) => {
    dismissAlertMutation.mutate({ alertId: alert.id, action });
    if (action === 'created_manually') navigate(createPageUrl(`OrderDetails?id=${alert.order_id}`));
    if (action === 'auto_optimized') navigate(createPageUrl(`OptimizeDelivery?orderId=${alert.order_id}`));
  };

  return (
    <TooltipProvider>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <CalendarIcon className="w-6 h-6 md:w-8 md:h-8" />
                Delivery Calendar
              </h1>
              <p className="text-gray-500 mt-0.5 text-sm">View scheduled deliveries and manage reminders</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-white" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <span className="text-base md:text-lg font-semibold min-w-[120px] md:min-w-[150px] text-center px-1">
                  {format(currentMonth, 'MMMM yyyy')}
                </span>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-white" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
                Today
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => {
                  setReminderDate(null);
                  setSelectedOrderForReminder('');
                  setReminderNotes('');
                  setShowReminderDialog(true);
                }}
              >
                <Bell className="w-4 h-4 mr-1 md:mr-2" />
                <span className="hidden sm:inline">Add Reminder</span>
                <span className="sm:hidden">Reminder</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Active Delivery Alerts */}
        {alerts.length > 0 && (
          <div className="mb-6 space-y-3">
            {alerts.filter(alert => allOrders.find(o => o.id === alert.order_id)).map(alert => (
              <div key={alert.id} className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <h3 className="font-bold text-amber-900">Missing Delivery Load</h3>
                      <p className="text-sm text-amber-800 mt-1">
                        <span className="font-semibold">{alert.customer_name}</span> needs a delivery load created for{' '}
                        <span className="font-semibold">{format(parseISO(alert.scheduled_date), 'MMMM d, yyyy')}</span>.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedAlert(alert)}
                      className="border-amber-600 text-amber-700 hover:bg-amber-100"
                    >
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismissAlertMutation.mutate({ alertId: alert.id, action: null })}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Calendar Grid */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {[['Sun','Su'],['Mon','Mo'],['Tue','Tu'],['Wed','We'],['Thu','Th'],['Fri','Fr'],['Sat','Sa']].map(([full, short]) => (
              <div key={full} className="py-2 text-center text-xs md:text-sm font-semibold text-gray-700">
                <span className="hidden md:inline">{full}</span>
                <span className="md:hidden">{short}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {paddingDays.map((_, idx) => (
              <div key={`pad-${idx}`} className="min-h-[60px] md:min-h-[120px] border-r border-b border-gray-200 bg-gray-50" />
            ))}
            {daysInMonth.map(day => {
              const isToday = isSameDay(day, new Date());
              const loadsForDay = getLoadsForDate(day);
              const remindersForDay = getRemindersForDate(day);
              const dayDateStr = format(day, 'yyyy-MM-dd');

              const hasLoadDeliveries = loadsForDay.some(load =>
                allLoadItems.some(item => item.load_id === load.id)
              );
              const hasDirectShips = allOrderItems.some(
                item => item.status === 'delivered' && item.date_completed === dayDateStr && item.delivery_method !== 'pickup'
              );
              const hasDeliveries = hasLoadDeliveries || hasDirectShips;

              // Count stops
              let totalStopsForDay = 0;
              loadsForDay.forEach(load => {
                const items = allLoadItems.filter(i => i.load_id === load.id);
                if (items.length === 0) return;
                const uniqueOrderIds = new Set();
                let hasOrderItems = false;
                items.forEach(item => {
                  const oi = item.order_item_id ? allOrderItems.find(o => o.id === item.order_item_id) : null;
                  if (oi?.order_id) { uniqueOrderIds.add(oi.order_id); hasOrderItems = true; }
                });
                totalStopsForDay += hasOrderItems ? uniqueOrderIds.size : (load.customer_name ? 1 : 0);
              });

              // Collect customer names for display
              const customerNamesForDay = [];
              const orderIdsShown = new Set();
              loadsForDay.forEach(load => {
                const items = allLoadItems.filter(i => i.load_id === load.id);
                if (items.length === 0) return;
                const uniqueOrderIds = new Set();
                let hasOrderItems = false;
                items.forEach(item => {
                  const oi = item.order_item_id ? allOrderItems.find(o => o.id === item.order_item_id) : null;
                  if (oi?.order_id) { uniqueOrderIds.add(oi.order_id); hasOrderItems = true; }
                });
                if (!hasOrderItems) {
                  const linkedOrder = load.order_id ? allOrders.find(o => o.id === load.order_id) : null;
                  const name = linkedOrder ? getDisplayName(linkedOrder) : load.customer_name;
                  if (name && !customerNamesForDay.includes(name)) customerNamesForDay.push(name);
                } else {
                  uniqueOrderIds.forEach(orderId => {
                    orderIdsShown.add(orderId);
                    const order = allOrders.find(o => o.id === orderId);
                    if (order) {
                      const name = getDisplayName(order);
                      if (!customerNamesForDay.includes(name)) customerNamesForDay.push(name);
                    }
                  });
                }
              });
              allOrderItems.forEach(item => {
                if (item.status === 'delivered' && item.date_completed === dayDateStr && item.order_id && !orderIdsShown.has(item.order_id) && item.delivery_method !== 'pickup') {
                  const order = allOrders.find(o => o.id === item.order_id);
                  if (order) {
                    const name = getDisplayName(order);
                    if (!customerNamesForDay.includes(name)) { customerNamesForDay.push(name); orderIdsShown.add(item.order_id); }
                  }
                }
              });

              const isClickable = hasDeliveries || remindersForDay.length > 0;

              return (
                <button
                  key={day.toString()}
                  onClick={() => { if (isClickable) setSelectedDateForView(day); }}
                  className={`min-h-[60px] md:min-h-[120px] border-r border-b border-gray-200 p-1 md:p-2 transition-colors text-left flex flex-col ${
                    isToday ? 'bg-blue-50' :
                    isPast(startOfDay(day)) && !isSameDay(day, new Date()) && !hasDeliveries ? 'bg-gray-50 cursor-default opacity-60' :
                    isClickable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className={`text-xs md:text-sm font-semibold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                      {format(day, 'd')}
                    </span>
                    <div className="flex flex-col gap-0.5 items-end">
                      {hasDeliveries && totalStopsForDay > 0 && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge className="bg-gray-500 text-white h-5 md:h-6 px-1.5 md:px-2 text-xs font-bold pointer-events-none cursor-help">
                              {totalStopsForDay}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delivery stops scheduled for this date</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {remindersForDay.length > 0 && (
                        <Badge className="bg-amber-500 text-white h-5 md:h-6 px-1.5 md:px-2 text-xs font-bold flex items-center gap-0.5">
                          <Bell className="w-2.5 h-2.5 md:w-3 md:h-3" />
                          {remindersForDay.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {customerNamesForDay.length > 0 && (
                    <div className="mb-1 space-y-0.5 hidden md:block">
                      {customerNamesForDay.map((name, i) => (
                        <div key={i} className="text-xs leading-tight text-green-800 font-medium truncate">{name}</div>
                      ))}
                    </div>
                  )}
                  {remindersForDay.length > 0 && (
                    <div className="space-y-1 hidden md:block">
                      {remindersForDay.map(reminder => (
                        <div key={reminder.id} className="bg-amber-100 border border-amber-300 rounded p-1.5 text-xs">
                          <div className="font-semibold text-amber-900 flex items-center gap-1">
                            <Bell className="w-3 h-3" />
                            {getReminderDisplayName(reminder)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day Details Dialog */}
        <Dialog open={!!selectedDateForView} onOpenChange={(open) => { if (!open) setSelectedDateForView(null); }}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {selectedDateForView && format(selectedDateForView, 'MMMM d, yyyy')}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-3 py-4">

              {/* Reminders for this day */}
              {selectedDateForView && getRemindersForDate(selectedDateForView).map(reminder => {
                const order = allOrders.find(o => o.id === reminder.order_id);
                const orderItems = order ? allOrderItems.filter(i => i.order_id === order.id) : [];
                const hasQuoteItems = orderItems.some(i => i.is_quote);
                const hasReceiptItems = orderItems.some(i => !i.is_quote);
                const reminderLoad = loads.find(load =>
                  load.order_id === reminder.order_id &&
                  load.delivery_date === format(selectedDateForView, 'yyyy-MM-dd')
                );
                return (
                  <div
                    key={reminder.id}
                    className={`bg-amber-50 border-2 border-amber-400 rounded-lg p-3 ${reminderLoad ? 'cursor-pointer hover:bg-amber-100' : ''}`}
                    onClick={() => { if (reminderLoad) navigate(createPageUrl(`LoadDetails?id=${reminderLoad.id}`)); }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2 flex-1">
                        <Bell className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="font-bold text-amber-900">Delivery Reminder</h3>
                          <p className="text-sm text-amber-800 font-semibold">{getReminderDisplayName(reminder)}</p>
                          {hasQuoteItems && !hasReceiptItems && (
                            <p className="text-xs text-amber-700 font-semibold mt-0.5">Must be converted to sale before ship</p>
                          )}
                          {reminder.notes && <p className="text-xs text-amber-700 mt-1">{reminder.notes}</p>}
                          {reminderLoad && <p className="text-xs text-green-700 font-semibold mt-1">Load created — click to view</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        {order && (
                          <Button size="sm" variant="outline" onClick={() => navigate(createPageUrl(`OrderDetails?id=${order.id}`))}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => resolveReminderMutation.mutate(reminder.id)} title="Remove reminder">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Loads for this day */}
              {selectedDateForView && getLoadsForDate(selectedDateForView)
                .map((load, idx, arr) => {
                  const loadItems = allLoadItems.filter(i => i.load_id === load.id);
                  if (loadItems.length === 0) return null;
                  const uniqueOrders = {};
                  let hasOrderBasedItems = false;
                  loadItems.forEach(item => {
                    const oi = item.order_item_id ? allOrderItems.find(o => o.id === item.order_item_id) : null;
                    if (oi?.order_id) {
                      hasOrderBasedItems = true;
                      const order = allOrders.find(o => o.id === oi.order_id);
                      if (order && !uniqueOrders[order.id]) {
                        const stop = loadCustomerStops.find(s => s.order_id === order.id && s.load_id === load.id);
                        uniqueOrders[order.id] = {
                          customer_name: getDisplayName(order),
                          receipt_numbers: new Set(),
                          stop_order: stop?.stop_order ?? 999,
                        };
                      }
                      if (order && oi.receipt_number) uniqueOrders[order.id].receipt_numbers.add(oi.receipt_number);
                    }
                  });

                  let ordersArray;
                  let stopsInLoad;
                  if (!hasOrderBasedItems) {
                    const linkedOrder = load.order_id ? allOrders.find(o => o.id === load.order_id) : null;
                    ordersArray = [{
                      orderId: load.order_id || null,
                      customer_name: linkedOrder ? getDisplayName(linkedOrder) : (load.customer_name || '(No Customer)'),
                      receipt_numbers: load.receipt_numbers || [],
                      stop_order: 0,
                    }];
                    stopsInLoad = 1;
                  } else {
                    ordersArray = Object.entries(uniqueOrders).map(([orderId, data]) => ({
                      orderId,
                      ...data,
                      receipt_numbers: Array.from(data.receipt_numbers),
                    }));
                    ordersArray.sort((a, b) => (a.stop_order ?? 999) - (b.stop_order ?? 999));
                    stopsInLoad = ordersArray.length;
                  }

                  const sameCustomerLoads = arr.filter(l => l.customer_name === load.customer_name);
                  const deliveryLabel = sameCustomerLoads.length > 1
                    ? `Load ${sameCustomerLoads.findIndex(l => l.id === load.id) + 1} of ${sameCustomerLoads.length} — ${load.customer_name}`
                    : `Delivery ${idx + 1}`;

                  return (
                    <div key={load.id} className={`border rounded-lg p-3 ${load.status === 'archived' ? 'border-gray-300 bg-gray-50' : 'border-green-200 bg-green-50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className="font-bold text-gray-900 cursor-pointer hover:text-blue-600 flex-1 flex items-center gap-2"
                          onClick={() => navigate(createPageUrl(`LoadDetails?id=${load.id}`))}
                        >
                          {deliveryLabel}
                          {load.status === 'archived' && <Badge className="bg-gray-400 text-white">Archived</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          {stopsInLoad > 1 && hasOrderBasedItems && (
                            <Badge className="bg-indigo-600">{stopsInLoad} stops</Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(createPageUrl(`LoadDetails?id=${load.id}`))}
                          >
                            <Eye className="w-4 h-4 mr-1" /> View Load
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1 text-sm">
                        {ordersArray.map((order, orderIdx) => (
                          <div key={order.orderId} className="text-gray-700">
                            <span className="font-medium">Stop {orderIdx + 1}: </span>
                            <span>{order.customer_name}</span>
                            {order.receipt_numbers.length > 0 && (
                              <span className="ml-2">
                                {order.receipt_numbers.map((num, i) => (
                                  <span key={i} className="text-indigo-600 font-semibold">{i > 0 && ', '}#{num}</span>
                                ))}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              }

              {/* Direct ship fulfillments */}
              {selectedDateForView && (() => {
                const selDateStr = format(selectedDateForView, 'yyyy-MM-dd');
                const coveredOrderIds = new Set();
                getLoadsForDate(selectedDateForView).forEach(load => {
                  if (load.order_id) coveredOrderIds.add(load.order_id);
                  allLoadItems.filter(li => li.load_id === load.id).forEach(li => {
                    const oi = allOrderItems.find(o => o.id === li.order_item_id);
                    if (oi?.order_id) coveredOrderIds.add(oi.order_id);
                  });
                });
                const directShipOrders = {};
                allOrderItems.forEach(item => {
                  if (item.status === 'delivered' && item.date_completed === selDateStr && item.order_id && !coveredOrderIds.has(item.order_id) && item.delivery_method !== 'pickup') {
                    if (!directShipOrders[item.order_id]) directShipOrders[item.order_id] = [];
                    directShipOrders[item.order_id].push(item);
                  }
                });
                return Object.entries(directShipOrders).map(([orderId, items]) => {
                  const order = allOrders.find(o => o.id === orderId);
                  const receiptNums = [...new Set(items.map(i => i.receipt_number).filter(Boolean))];
                  return (
                    <div
                      key={orderId}
                      className="border border-blue-200 bg-blue-50 rounded-lg p-3 cursor-pointer hover:bg-blue-100"
                      onClick={() => order && navigate(createPageUrl(`OrderDetails?id=${orderId}`))}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-blue-900">{order ? getDisplayName(order) : 'Unknown'}</div>
                          <div className="text-xs text-blue-700 mt-0.5">Direct Ship / Fulfilled</div>
                          {receiptNums.length > 0 && (
                            <div className="text-xs text-blue-700">
                              {receiptNums.map((n, i) => <span key={i}>{i > 0 && ', '}#{n}</span>)}
                            </div>
                          )}
                        </div>
                        <Eye className="w-4 h-4 text-blue-600" />
                      </div>
                    </div>
                  );
                });
              })()}

              {selectedDateForView &&
                !getLoadsForDate(selectedDateForView).some(load => allLoadItems.some(i => i.load_id === load.id)) &&
                !allOrderItems.some(item => item.status === 'delivered' && item.date_completed === format(selectedDateForView, 'yyyy-MM-dd') && item.delivery_method !== 'pickup') &&
                getRemindersForDate(selectedDateForView).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p>No deliveries or reminders for this date.</p>
                  </div>
                )
              }
            </div>
          </DialogContent>
        </Dialog>

        {/* Alert Resolution Dialog */}
        <Dialog open={!!selectedAlert} onOpenChange={(open) => { if (!open) setSelectedAlert(null); }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Resolve Missing Delivery Load
              </DialogTitle>
              <DialogDescription>
                {selectedAlert && (
                  <>
                    <span className="font-semibold">{selectedAlert.customer_name}</span> is scheduled for{' '}
                    <span className="font-semibold">{format(parseISO(selectedAlert.scheduled_date), 'MMMM d, yyyy')}</span>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Button
                className="w-full justify-start h-auto py-4 px-4"
                variant="outline"
                onClick={() => selectedAlert && handleAlertAction(selectedAlert, 'created_manually')}
              >
                <div className="text-left">
                  <div className="font-semibold">Create Delivery Manually</div>
                  <div className="text-xs text-gray-600 mt-1">Go to order details and create a delivery load</div>
                </div>
              </Button>
              <Button
                className="w-full justify-start h-auto py-4 px-4 bg-purple-50 border-purple-300 text-purple-900 hover:bg-purple-100"
                variant="outline"
                onClick={() => selectedAlert && handleAlertAction(selectedAlert, 'auto_optimized')}
              >
                <div className="text-left">
                  <Zap className="w-4 h-4 inline mr-2" />
                  <span className="font-semibold">Auto-Optimize Delivery</span>
                  <div className="text-xs text-purple-700 mt-1">Let the app build an optimized delivery schedule</div>
                </div>
              </Button>
              <Button
                className="w-full justify-start h-auto py-4 px-4"
                variant="outline"
                onClick={() => selectedAlert && handleAlertAction(selectedAlert, 'rescheduled')}
              >
                <div className="text-left">
                  <div className="font-semibold">Dismiss Alert</div>
                  <div className="text-xs text-gray-600 mt-1">I'll handle this later</div>
                </div>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSelectedAlert(null)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Delivery Reminder Dialog */}
        <Dialog open={showReminderDialog} onOpenChange={setShowReminderDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Delivery Reminder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label>Delivery Date</Label>
                <Input
                  type="date"
                  min={format(new Date(), 'yyyy-MM-dd')}
                  value={reminderDate ? format(reminderDate, 'yyyy-MM-dd') : ''}
                  onChange={(e) => {
                    if (!e.target.value) { setReminderDate(null); return; }
                    const chosen = parseISO(e.target.value);
                    if (isPast(startOfDay(chosen))) return;
                    setReminderDate(chosen);
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label>Order</Label>
                <Select value={selectedOrderForReminder} onValueChange={setSelectedOrderForReminder}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select order..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allOrders
                      .filter(o => {
                        if (o.is_archived || o.is_completed) return false;
                        return allOrderItems.some(i =>
                          i.order_id === o.id &&
                          i.status !== 'delivered' &&
                          i.status !== 'returned' &&
                          i.status !== 'order' &&
                          (i.quantity || 0) > 0
                        );
                      })
                      .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)))
                      .map(order => {
                        const receiptNums = [...new Set(
                          allOrderItems.filter(i => i.order_id === order.id && i.receipt_number).map(i => i.receipt_number)
                        )];
                        const label = getDisplayName(order) + (receiptNums.length > 0 ? ` — ${receiptNums.map(n => `#${n}`).join(', ')}` : '');
                        return (
                          <SelectItem key={order.id} value={order.id}>{label}</SelectItem>
                        );
                      })
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={reminderNotes}
                  onChange={(e) => setReminderNotes(e.target.value)}
                  placeholder="Add notes about this delivery..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowReminderDialog(false);
                setReminderDate(null);
                setSelectedOrderForReminder('');
                setReminderNotes('');
              }}>
                Cancel
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                disabled={!reminderDate || !selectedOrderForReminder || isPast(startOfDay(reminderDate))}
                onClick={() => {
                  const order = allOrders.find(o => o.id === selectedOrderForReminder);
                  createReminderMutation.mutate({
                    order_id: selectedOrderForReminder,
                    customer_name: order?.customer_name,
                    scheduled_date: format(reminderDate, 'yyyy-MM-dd'),
                    notes: reminderNotes,
                    is_resolved: false,
                  });
                }}
              >
                Create Reminder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}