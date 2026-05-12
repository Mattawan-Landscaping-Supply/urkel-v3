import React from 'react';
import { Truck, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function BuildLoadDialog({ isOpen, onClose, orderId, onBuildManually }) {
  const navigate = useNavigate();
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-900">Build Load</h2>
        <p className="text-sm text-gray-500">Choose how you want to build this delivery load.</p>
        <button className="w-full flex items-center gap-4 p-4 rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-left transition-colors" onClick={() => { onClose(); onBuildManually('manual'); }}>
          <Truck className="w-8 h-8 text-indigo-600 shrink-0" />
          <div><div className="font-semibold text-gray-900">Build Manually</div><div className="text-xs text-gray-600 mt-0.5">Create an empty load and add items yourself</div></div>
        </button>
        <button className="w-full flex items-center gap-4 p-4 rounded-lg border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 text-left transition-colors" onClick={() => { onClose(); navigate(createPageUrl(`OptimizeDelivery?orderId=${orderId}`)); }}>
          <Plus className="w-8 h-8 text-purple-600 shrink-0" />
          <div><div className="font-semibold text-gray-900">Build Optimized Load</div><div className="text-xs text-gray-600 mt-0.5">Auto-generate optimized loads based on truck capacity</div></div>
        </button>
        <button className="w-full text-sm text-gray-500 hover:text-gray-700 pt-1" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}