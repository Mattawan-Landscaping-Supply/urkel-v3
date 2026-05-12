import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const UNITS = ['Each', 'Pallet', 'Layer'];

export default function ManualReturnDialog({ isOpen, onClose, onConfirm, existingReceipts = [] }) {
  const [form, setForm] = useState({
    product_name: '',
    quantity: 1,
    selected_unit: 'Each',
    receipt_number: '',
    return_receipt_number: '',
    is_damaged: false,
  });

  useEffect(() => {
    if (isOpen) {
      setForm({ product_name: '', quantity: 1, selected_unit: 'Each', receipt_number: '', return_receipt_number: '', is_damaged: false });
    }
  }, [isOpen]);

  const canSubmit = form.product_name.trim() && form.quantity > 0 && (form.is_damaged || form.return_receipt_number.trim());

  const handleSubmit = () => {
    onConfirm(form);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Return Item</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="grid gap-2">
            <Label>Product Name *</Label>
            <Input
              placeholder="e.g. Empire 6x30 Steps"
              value={form.product_name}
              onChange={(e) => setForm(f => ({ ...f, product_name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Quantity *</Label>
              <Input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm(f => ({ ...f, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Unit</Label>
              <Select value={form.selected_unit} onValueChange={(val) => setForm(f => ({ ...f, selected_unit: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Original Receipt # (optional)</Label>
            <Select value={form.receipt_number} onValueChange={(val) => setForm(f => ({ ...f, receipt_number: val }))}>
              <SelectTrigger><SelectValue placeholder="Select receipt..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>None</SelectItem>
                {existingReceipts.map(r => <SelectItem key={r} value={r}>#{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="is_damaged"
              checked={form.is_damaged}
              onCheckedChange={(val) => setForm(f => ({ ...f, is_damaged: val }))}
            />
            <Label htmlFor="is_damaged" className="cursor-pointer">Damaged (no return receipt needed)</Label>
          </div>
          {!form.is_damaged && (
            <div className="grid gap-2">
              <Label>Return Receipt # *</Label>
              <Input
                placeholder="Enter return receipt number"
                value={form.return_receipt_number}
                onChange={(e) => setForm(f => ({ ...f, return_receipt_number: e.target.value }))}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="bg-red-600 hover:bg-red-700">
            Add Return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}