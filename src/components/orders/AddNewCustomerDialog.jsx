import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function AddNewCustomerDialog({ 
  isOpen, 
  onOpenChange, 
  customerData, 
  onDataChange, 
  onConfirm,
  isLoading
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="new_customer_name">Customer Name</Label>
            <Input 
              id="new_customer_name"
              value={customerData.name}
              onChange={(e) => onDataChange({...customerData, name: e.target.value})}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new_customer_phone">Phone</Label>
            <Input 
              id="new_customer_phone"
              value={customerData.phone}
              onChange={(e) => onDataChange({...customerData, phone: e.target.value})}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new_customer_company">Company</Label>
            <Input 
              id="new_customer_company"
              value={customerData.company}
              onChange={(e) => onDataChange({...customerData, company: e.target.value})}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new_customer_notes">Notes</Label>
            <textarea 
              id="new_customer_notes"
              className="w-full text-sm text-gray-700 bg-white border border-gray-300 rounded-lg p-2 outline-none resize-none min-h-[100px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
              value={customerData.notes}
              onChange={(e) => onDataChange({...customerData, notes: e.target.value})}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            onOpenChange(false);
            onDataChange({ name: '', phone: '', company: '', notes: '' });
          }}>
            Cancel
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={isLoading || !customerData.name.trim()}
          >
            {isLoading ? 'Creating...' : 'Add Customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}