import React, { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * DriverNotesEditor
 * Allows adding/editing/removing driver notes at specific positions in the delivery sequence.
 * after_stop: 0 = before all stops, 1 = after stop 1, etc.
 * totalStops: how many stops are on this load (for consolidated loads this is customerStops.length, else 1)
 */
export default function DriverNotesEditor({ notes = [], totalStops = 1, onChange }) {
  const [newNoteText, setNewNoteText] = useState('');
  const [newNotePosition, setNewNotePosition] = useState(0);

  const handleAdd = () => {
    if (!newNoteText.trim()) return;
    const updated = [...notes, { text: newNoteText.trim(), after_stop: newNotePosition }];
    // Sort by position
    updated.sort((a, b) => a.after_stop - b.after_stop);
    onChange(updated);
    setNewNoteText('');
    setNewNotePosition(0);
  };

  const handleDelete = (idx) => {
    const updated = notes.filter((_, i) => i !== idx);
    onChange(updated);
  };

  const handleEditText = (idx, text) => {
    const updated = notes.map((n, i) => i === idx ? { ...n, text } : n);
    onChange(updated);
  };

  const positionLabel = (after_stop) => {
    if (after_stop === 0) return 'Before Stop 1';
    if (after_stop >= totalStops) return `After Stop ${totalStops} (End)`;
    return `After Stop ${after_stop}`;
  };

  const positionOptions = Array.from({ length: totalStops + 1 }, (_, i) => ({
    value: i,
    label: i === 0 ? 'Before Stop 1' : i >= totalStops ? `After Stop ${totalStops} (End)` : `After Stop ${i}`
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">📋 Driver Notes</span>
      </div>

      {/* Existing notes */}
      {notes.length > 0 && (
        <div className="space-y-1.5">
          {notes.map((note, idx) => (
            <div key={idx} className="flex items-start gap-1.5 bg-orange-50 border border-orange-200 rounded-md p-1.5">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-orange-600 mb-0.5">{positionLabel(note.after_stop)}</div>
                <textarea
                  className="w-full text-xs text-gray-800 bg-white border border-orange-200 rounded p-1 resize-none focus:outline-none focus:border-orange-400"
                  rows={2}
                  value={note.text}
                  onChange={(e) => handleEditText(idx, e.target.value)}
                />
              </div>
              <button
                onClick={() => handleDelete(idx)}
                className="mt-1 text-red-400 hover:text-red-600 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new note */}
      <div className="flex gap-1.5 items-end bg-orange-50 border border-dashed border-orange-300 rounded-md p-1.5">
        <div className="flex-1 space-y-1">
          <select
            className="w-full text-xs border border-orange-200 rounded p-1 bg-white focus:outline-none"
            value={newNotePosition}
            onChange={(e) => setNewNotePosition(Number(e.target.value))}
          >
            {positionOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <textarea
            className="w-full text-xs border border-orange-200 rounded p-1 bg-white resize-none focus:outline-none focus:border-orange-400"
            rows={2}
            placeholder="Add a driver note..."
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleAdd(); }}
          />
        </div>
        <Button
          size="sm"
          className="bg-orange-500 hover:bg-orange-600 text-white h-7 px-2 shrink-0 self-end"
          onClick={handleAdd}
          disabled={!newNoteText.trim()}
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}