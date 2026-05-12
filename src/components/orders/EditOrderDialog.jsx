import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';

export default function EditOrderDialog({ isOpen, onClose, order }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    job_address: '',
    job_name: '',
    company_name: ''
  });

  // Fetch linked customer if order has a customer_id
  const { data: linkedCustomer } = useQuery({
    queryKey: ['customer', order?.customer_id],
    queryFn: () => base44.entities.Customer.filter({ id: order.customer_id }),
    enabled: !!order?.customer_id && isOpen,
    staleTime: 60000,
    select: (data) => data?.[0] || null,
  });

  useEffect(() => {
    if (order && isOpen) {
      // If linked customer data is available, prefer it for name/company/phone
      const customer = linkedCustomer;
      setFormData({
        customer_name: customer ? (customer.name || '') : (order.customer_name || ''),
        customer_phone: customer ? (customer.phone || order.customer_phone || '') : (order.customer_phone || ''),
        job_address: order.job_address || '',
        job_name: order.job_name || '',
        company_name: customer ? (customer.company || '') : (order.company_name || '')
      });
    }
  }, [order, isOpen, linkedCustomer]);

  const updateOrderMutation = useMutation({
    mutationFn: (data) => base44.entities.Order.update(order.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['order', order.id]);
      queryClient.invalidateQueries({ queryKey: ['orders'], exact: false }); // Update dashboard too
      onClose();
    }
  });

  const formatPhoneNumber = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length === 10) {
      return `(${numbers.slice(0, 3)})-${numbers.slice(3, 6)}-${numbers.slice(6)}`;
    } else if (numbers.length === 7) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    }
    return value;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData({...formData, customer_phone: formatted});
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateOrderMutation.mutate(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Order Details</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit_company_name">Company Name</Label>
            <Input 
              id="edit_company_name" 
              value={formData.company_name}
              onChange={(e) => setFormData({...formData, company_name: e.target.value})}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit_customer_name">Customer Name</Label>
            <Input 
              id="edit_customer_name" 
              required
              value={formData.customer_name}
              onChange={(e) => setFormData({...formData, customer_name: e.target.value})}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit_job_name">Job Name</Label>
            <Input 
              id="edit_job_name" 
              value={formData.job_name}
              onChange={(e) => setFormData({...formData, job_name: e.target.value})}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit_phone">Phone Number</Label>
            <Input 
              id="edit_phone" 
              value={formData.customer_phone}
              onChange={handlePhoneChange}
              onBlur={(e) => {
                const formatted = formatPhoneNumber(e.target.value);
                setFormData({...formData, customer_phone: formatted});
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit_address">Job Address</Label>
            <Input 
              id="edit_address" 
              value={formData.job_address}
              onChange={(e) => setFormData({...formData, job_address: e.target.value})}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updateOrderMutation.isPending}>
              {updateOrderMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}