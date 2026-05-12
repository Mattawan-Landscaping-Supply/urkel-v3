import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Phone, Mail, Building2, MapPin, Edit2, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from 'date-fns';

export default function CustomerDetails() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const customerId = urlParams.get('id');

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState({});

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => base44.entities.Customer.list().then(customers => 
      customers.find(c => c.id === customerId)
    ),
    enabled: !!customerId
  });

  const { data: orders } = useQuery({
    queryKey: ['orders', 'customer', customerId],
    queryFn: async () => {
      const [allOrders, allItems] = await Promise.all([
        base44.entities.Order.list('-created_date', 500),
        base44.entities.OrderItem.list('-created_date', 2000)
      ]);
      
      const customerOrders = allOrders.filter(o => o.customer_id === customerId);
      
      return customerOrders.map(order => {
        const orderItems = allItems.filter(i => i.order_id === order.id);
        const itemReceipts = orderItems
          .filter(i => !i.is_quote)
          .map(i => i.receipt_number)
          .filter(r => r && r.trim() !== '');
        const itemQuotes = orderItems
          .filter(i => i.is_quote)
          .map(i => i.receipt_number)
          .filter(r => r && r.trim() !== '');
        const uniqueReceipts = [...new Set(itemReceipts)].sort();
        const uniqueQuotes = [...new Set(itemQuotes)].sort();
        return { ...order, derivedReceipts: uniqueReceipts, derivedQuotes: uniqueQuotes };
      });
    },
    enabled: !!customerId
  });

  const updateCustomerMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.update(customerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['customer', customerId]);
      setIsEditOpen(false);
    }
  });

  const handleEdit = () => {
    setEditData({
      name: customer.name,
      phone: customer.phone || '',
      company: customer.company || '',
      notes: customer.notes || ''
    });
    setIsEditOpen(true);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    updateCustomerMutation.mutate(editData);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Customer not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate(createPageUrl('Customers'))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Customers
        </Button>
        <Button onClick={handleEdit} variant="outline">
          <Edit2 className="w-4 h-4 mr-2" />
          Edit Customer
        </Button>
      </div>

      <div className="grid gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                <Building2 className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{customer.name}</h2>
                {customer.company && <p className="text-sm text-gray-500">{customer.company}</p>}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customer.phone && (
              <div className="flex items-center gap-2 text-gray-700">
                <Phone className="w-4 h-4 text-gray-400" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.notes && (
              <div className="mt-4 p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-700">{customer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Orders ({orders?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {orders && orders.length > 0 ? (
                <div className="space-y-2">
                  {orders.map(order => (
                    <Link 
                      key={order.id} 
                      to={createPageUrl(`OrderDetails?id=${order.id}`)}
                      className="block p-3 border rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-1">
                            {order.derivedReceipts && order.derivedReceipts.length > 0 ? (
                              order.derivedReceipts.map(receipt => (
                                <div key={receipt} className="flex items-center gap-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                  <FileText className="w-2.5 h-2.5" />
                                  {receipt}
                                </div>
                              ))
                            ) : (
                              <span className="text-[10px] text-gray-400 italic">No receipt #</span>
                            )}
                            {order.derivedQuotes && order.derivedQuotes.length > 0 && (
                              order.derivedQuotes.map(quote => (
                                <div key={quote} className="flex items-center gap-0.5 bg-red-50 text-red-700 border border-red-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                  <FileText className="w-2.5 h-2.5" />
                                  Quote #{quote}
                                </div>
                              ))
                            )}
                          </div>
                          {order.is_completed && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded shrink-0">Completed</span>
                          )}
                        </div>
                        {order.job_name && (
                          <p className="text-sm font-medium text-gray-900 truncate">{order.job_name}</p>
                        )}
                        {order.job_address && (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            <span className="truncate">{order.job_address}</span>
                          </div>
                        )}
                        {order.delivery_date && (
                          <p className="text-xs text-gray-500">
                            {format(new Date(order.delivery_date + 'T00:00:00'), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No orders yet</p>
              )}
            </CardContent>
          </Card>


        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit_name">Customer Name</Label>
              <Input 
                id="edit_name" 
                required
                value={editData.name || ''}
                onChange={(e) => setEditData({...editData, name: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit_phone">Phone</Label>
              <Input 
                id="edit_phone" 
                value={editData.phone || ''}
                onChange={(e) => setEditData({...editData, phone: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit_company">Company</Label>
              <Input 
                id="edit_company" 
                value={editData.company || ''}
                onChange={(e) => setEditData({...editData, company: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit_notes">Notes</Label>
              <Textarea 
                id="edit_notes" 
                value={editData.notes || ''}
                onChange={(e) => setEditData({...editData, notes: e.target.value})}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateCustomerMutation.isPending}>
                {updateCustomerMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


    </div>
  );
}