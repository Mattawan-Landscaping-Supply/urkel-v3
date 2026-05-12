import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Search, Plus, User, Phone, Mail, Building2, Loader2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function Customers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const queryClient = useQueryClient();

  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    company: '',
    notes: ''
  });

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const allCustomers = await base44.entities.Customer.list('-created_date', 500);
      return allCustomers;
    }
  });

  const { data: orders } = useQuery({
    queryKey: ['orders', 'all'],
    queryFn: () => base44.entities.Order.list('-created_date', 500),
    staleTime: 0
  });

  const createCustomerMutation = useMutation({
    mutationFn: (data) => base44.entities.Customer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['customers']);
      setIsCreateOpen(false);
      setNewCustomer({ name: '', phone: '', company: '', notes: '' });
    }
  });

  const [deleteCustomerId, setDeleteCustomerId] = useState(null);

  const deleteCustomerMutation = useMutation({
    mutationFn: (customerId) => base44.entities.Customer.delete(customerId),
    onSuccess: () => {
      queryClient.invalidateQueries(['customers']);
      setDeleteCustomerId(null);
    }
  });

  const handleCreateCustomer = (e) => {
    e.preventDefault();
    createCustomerMutation.mutate(newCustomer);
  };

  const getCustomerOrderCounts = (customerId) => {
    const customerOrders = orders?.filter(o => o.customer_id === customerId) || [];
    return {
      active: customerOrders.filter(o => !o.is_archived).length,
      archived: customerOrders.filter(o => o.is_archived).length
    };
  };

  const filteredCustomers = customers?.filter(customer => 
    (customer.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.company?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    if (sortBy === 'name') return (a.company || a.name).localeCompare(b.company || b.name);
    if (sortBy === 'recent') return new Date(b.created_date) - new Date(a.created_date);
    return 0;
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Customers</h1>
          <p className="text-gray-500 mt-1">Manage customer relationships and contacts</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="w-4 h-4 mr-2" />
          New Customer
        </Button>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCustomer} className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Customer Name *</Label>
              <Input 
                id="name" 
                required
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                placeholder="e.g. John Doe"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input 
                id="phone" 
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                placeholder="(555)-123-4567"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company">Company</Label>
              <Input 
                id="company" 
                value={newCustomer.company}
                onChange={(e) => setNewCustomer({...newCustomer, company: e.target.value})}
                placeholder="e.g. Doe Construction"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Input 
                id="notes" 
                value={newCustomer.notes}
                onChange={(e) => setNewCustomer({...newCustomer, notes: e.target.value})}
                placeholder="Additional information"
              />
            </div>
            <DialogFooter className="mt-6">
              <Button type="submit" disabled={createCustomerMutation.isPending}>
                {createCustomerMutation.isPending ? 'Creating...' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input 
            className="pl-10 bg-white shadow-sm border-gray-200"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="px-4 py-2 border border-gray-200 rounded-md bg-white shadow-sm"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="name">Sort by Name</option>
          <option value="recent">Sort by Recent</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedCustomers.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500">No customers found.</p>
            </div>
          ) : (
            sortedCustomers.map(customer => (
              <div key={customer.id} className="relative group">
                <Link to={createPageUrl(`CustomerDetails?id=${customer.id}`)}>
                  <Card className="hover:shadow-lg transition-shadow duration-200 border-gray-200 h-full">
                    <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {customer.company ? (
                            <>
                              <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                                {customer.company}
                              </h3>
                              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3" />
                                {customer.name}
                              </p>
                            </>
                          ) : (
                            <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                              {customer.name}
                            </h3>
                          )}
                        </div>
                      </div>

                      {customer.phone && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Phone className="w-3 h-3" />
                          <span className="truncate">{customer.phone}</span>
                        </div>
                      )}

                      <div className="pt-2 border-t border-gray-100 space-y-1">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-gray-500">Active orders:</span>
                          <span className="font-medium text-gray-700">{getCustomerOrderCounts(customer.id).active}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-gray-500">Archived orders:</span>
                          <span className="font-medium text-gray-700">{getCustomerOrderCounts(customer.id).archived}</span>
                        </div>
                      </div>
                    </div>
                    </CardContent>
                    </Card>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 text-red-600 hover:text-white hover:bg-red-600 bg-red-50"
                      onClick={(e) => {
                        e.preventDefault();
                        setDeleteCustomerId(customer.id);
                      }}
                      title="Delete customer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    </div>
                    ))
                    )}
                    </div>
                    )}

                    <Dialog open={deleteCustomerId !== null} onOpenChange={() => setDeleteCustomerId(null)}>
                    <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                    <DialogTitle>Delete Customer?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-gray-600 py-4">
                      Are you sure you want to permanently delete this customer?
                    </p>
                    <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteCustomerId(null)}>
                    Cancel
                    </Button>
                    <Button 
                    variant="destructive" 
                    onClick={() => deleteCustomerMutation.mutate(deleteCustomerId)}
                    disabled={deleteCustomerMutation.isPending}
                    >
                    {deleteCustomerMutation.isPending ? 'Deleting...' : 'Delete'}
                    </Button>
                    </DialogFooter>
                    </DialogContent>
                    </Dialog>
                    </div>
                    );
                    }