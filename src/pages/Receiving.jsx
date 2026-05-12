import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

const HOLD_LOCATIONS = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Warehouse', 'Other'];

const getLocalDateString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function ArrivalForm({ item, onConfirm, onCancel, isPending }) {
  const [location, setLocation] = useState('Bay 1');
  const [customLocation, setCustomLocation] = useState('');

  const handleSubmit = () => {
    const finalLocation = location === 'Other' ? customLocation.trim() : location;
    if (!finalLocation) return;
    onConfirm(item, finalLocation);
  };

  return (
    <div className="mt-3 p-3 bg-indigo-50 rounded-lg border border-indigo-200 space-y-3">
      <p className="text-sm font-semibold text-indigo-800">Where is this being placed?</p>
      <div className="grid grid-cols-3 gap-2">
        {HOLD_LOCATIONS.map(loc => (
          <button
            key={loc}
            onClick={() => setLocation(loc)}
            className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
              location === loc
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
            }`}
          >
            {loc}
          </button>
        ))}
      </div>
      {location === 'Other' && (
        <input
          type="text"
          placeholder="Type location name..."
          value={customLocation}
          onChange={e => setCustomLocation(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          autoFocus
        />
      )}
      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={isPending || (location === 'Other' && !customLocation.trim())}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Arrival'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isPending}>Cancel</Button>
      </div>
    </div>
  );
}

export default function Receiving() {
  const queryClient = useQueryClient();
  const [expandedItem, setExpandedItem] = useState(null);
  const [justArrived, setJustArrived] = useState(new Set());

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['receiving-orders'],
    queryFn: () => base44.entities.Order.filter({ is_archived: false, is_completed: false }, '-created_date', 500),
    staleTime: 60000,
  });

  const { data: allItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['receiving-items'],
    queryFn: () => base44.entities.OrderItem.filter({ status: 'order' }, '-created_date', 500),
    staleTime: 60000,
  });

  const markArrivedMutation = useMutation({
    mutationFn: ({ item, location }) =>
      base44.entities.OrderItem.update(item.id, {
        status: 'in_hold',
        hold_location: location,
        date_arrived: getLocalDateString(),
      }),
    onSuccess: (_, { item }) => {
      setJustArrived(prev => new Set([...prev, item.id]));
      setExpandedItem(null);
      queryClient.invalidateQueries(['receiving-items']);
      queryClient.invalidateQueries(['items', item.order_id]);
      // Remove from "just arrived" display after 1.5s
      setTimeout(() => {
        setJustArrived(prev => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 1500);
    },
  });

  const isLoading = ordersLoading || itemsLoading;

  // Build a set of valid active order IDs
  const activeOrderIds = new Set(orders.map(o => o.id));

  // Filter: only items from active orders, with quantity > 0
  const pendingItems = allItems.filter(
    item => activeOrderIds.has(item.order_id) && (item.quantity || 0) > 0 && !justArrived.has(item.id)
  );

  // Group by customer name
  const grouped = {};
  pendingItems.forEach(item => {
    const order = orders.find(o => o.id === item.order_id);
    const customerName = order?.customer_name || 'Unknown Customer';
    if (!grouped[customerName]) grouped[customerName] = [];
    grouped[customerName].push(item);
  });

  const customerNames = Object.keys(grouped).sort();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <PackageOpen className="w-6 h-6 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900">Receiving</h1>
      </div>
      <p className="text-sm text-gray-500 -mt-2">Items on order waiting to arrive at the yard.</p>

      {customerNames.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle2 className="w-14 h-14 text-green-500 mb-3" />
          <p className="text-lg font-semibold text-gray-700">All items have arrived — nothing pending ✅</p>
        </div>
      ) : (
        customerNames.map(customerName => (
          <div key={customerName} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h2 className="font-bold text-gray-900 text-base">{customerName}</h2>
              <p className="text-xs text-gray-500">{grouped[customerName].length} item{grouped[customerName].length !== 1 ? 's' : ''} pending</p>
            </div>
            <div className="divide-y divide-gray-100">
              {grouped[customerName].map(item => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm leading-snug">{item.product_name}</p>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {item.quantity} {item.selected_unit}
                        {item.selected_color && item.selected_color !== 'Default' && (
                          <span className="text-gray-400"> · {item.selected_color}</span>
                        )}
                      </p>
                      {item.po_number && (
                        <p className="text-xs text-indigo-600 font-medium mt-0.5">PO: {item.po_number}</p>
                      )}
                    </div>
                    {expandedItem !== item.id && (
                      <Button
                        size="sm"
                        onClick={() => setExpandedItem(item.id)}
                        className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs px-3 h-8"
                      >
                        Mark Arrived
                      </Button>
                    )}
                  </div>

                  {expandedItem === item.id && (
                    <ArrivalForm
                      item={item}
                      onConfirm={(item, location) => markArrivedMutation.mutate({ item, location })}
                      onCancel={() => setExpandedItem(null)}
                      isPending={markArrivedMutation.isPending}
                    />
                  )}

                  {justArrived.has(item.id) && (
                    <div className="mt-2 flex items-center gap-2 text-green-600 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" /> Marked as arrived!
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}