import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function EditColorDialog({ isOpen, onClose, item, availableColors, onSave, isSaving }) {
  const [selected, setSelected] = useState(item?.selected_color || '');

  // Reset when item changes
  useEffect(() => {
    setSelected(item?.selected_color || '');
  }, [item?.id]);

  const colors = availableColors?.length > 0 ? availableColors : [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Color</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-gray-500 mb-3">{item?.product_name}</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {colors.map(color => (
            <button
              key={color}
              onClick={() => setSelected(color)}
              className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                selected === color
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
              }`}
            >
              {color}
            </button>
          ))}
          {colors.length === 0 && (
            <p className="text-sm text-gray-400">No colors defined for this product.</p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button
            onClick={() => onSave(selected)}
            disabled={isSaving || !selected || selected === item?.selected_color}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}