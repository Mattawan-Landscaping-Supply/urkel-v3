import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus } from 'lucide-react';

export default function LinkCustomerDialog({ 
  isOpen, 
  onOpenChange, 
  customers, 
  onLinkCustomer,
  onAddNewCustomer
}) {
  const [searchCustomer, setSearchCustomer] = useState('');

  const handleClose = (open) => {
    onOpenChange(open);
    if (!open) setSearchCustomer('');
  };

  const filteredCustomers = customers?.filter(c => 
    !searchCustomer || 
    c.name?.toLowerCase().includes(searchCustomer.toLowerCase()) || 
    c.company?.toLowerCase().includes(searchCustomer.toLowerCase())
  ).sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name)) || [];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Link Order to Customer</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Input 
            placeholder="Search customers..." 
            value={searchCustomer} 
            onChange={(e) => setSearchCustomer(e.target.value)} 
            className="mb-4" 
          />
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            <button 
              onClick={() => {
                handleClose(false);
                onAddNewCustomer();
              }} 
              className="w-full p-3 text-left border-2 border-dashed border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors bg-indigo-50/50"
            >
              <div className="font-medium text-indigo-700 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Customer
              </div>
            </button>
            {filteredCustomers.map(customer => (
              <button 
                key={customer.id} 
                onClick={() => onLinkCustomer(customer)} 
                className="w-full p-3 text-left border rounded-md hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium text-gray-900">{customer.company || customer.name}</div>
                {customer.company && customer.name && <div className="text-sm text-gray-500">{customer.name}</div>}
                {customer.phone && <div className="text-xs text-gray-400">{customer.phone}</div>}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}