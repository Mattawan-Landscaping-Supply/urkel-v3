import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RenameReceiptDialog({ isOpen, onClose, oldNumber, onSave, isSaving }) {
  const [newNumber, setNewNumber] = useState('');

  useEffect(() => {
    if (isOpen) setNewNumber(oldNumber || '');
  }, [isOpen, oldNumber]);

  const handleSave = () => {
    const trimmed = newNumber.trim();
    if (!trimmed || trimmed === oldNumber) { onClose(); return; }
    onSave(trimmed);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Rename Receipt #{oldNumber}</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-3">
          <div>
            <Label className="text-sm text-gray-600">New Receipt Number</Label>
            <Input
              autoFocus
              value={newNumber}
              onChange={e => setNewNumber(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
              placeholder="Enter new receipt number"
              className="mt-1"
            />
          </div>
          <p className="text-xs text-gray-500">
            This will update all OrderItems, Receipt records, and Load records linked to this receipt number.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !newNumber.trim() || newNumber.trim() === oldNumber}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}