import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Edits lightspeed_names for a product, grouped by color then unit type.
 * Saves as: {"Color": {"Pallet": "...", "Each": "..."}} or {"Pallet": "...", "Each": "..."} for no-color products.
 */
export default function LightspeedNamesEditor({ product }) {
  const queryClient = useQueryClient();
  const [editState, setEditState] = useState({}); // { "color:unit": "value" }
  const [dirty, setDirty] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Load all mappings for this product
  const { data: mappings = [], isLoading } = useQuery({
    queryKey: ['productMappings', product?.name],
    queryFn: () => base44.entities.ProductMapping.filter({ urkel_product_name: product.name }),
    staleTime: 60000,
    enabled: !!product,
  });

  // When mappings load, initialize edit state from structured object
  useEffect(() => {
    if (!product) return;
    const newState = {};
    const colors = product.colors && product.colors.length > 0 ? product.colors : [null];
    const units = product.units && product.units.length > 0 ? product.units : ['Pallet', 'Each', 'Layer'];

    colors.forEach(color => {
      units.forEach(unit => {
        const mapping = mappings.find(m => (m.urkel_color || null) === color);
        const structuredData = mapping?.lightspeed_names || {};
        const key = color ? `${color}:${unit}` : unit;
        
        if (color) {
          newState[key] = structuredData[color]?.[unit] || '';
        } else {
          newState[key] = structuredData[unit] || '';
        }
      });
    });
    
    setEditState(newState);
    setDirty({});
  }, [mappings, product.colors, product.units]);

  const saveMutation = useMutation({
    mutationFn: async ({ mappingData, color }) => {
      const existing = mappings.find(m => (m.urkel_color || null) === color);
      if (existing) {
        return base44.entities.ProductMapping.update(existing.id, { lightspeed_names: mappingData });
      } else {
        return base44.entities.ProductMapping.create({
          urkel_product_name: product.name,
          urkel_color: color || '',
          lightspeed_names: mappingData,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['productMappings', product.name]);
      queryClient.invalidateQueries(['productMappings']);
      setDirty({});
      setIsSaving(false);
      toast.success('Lightspeed names saved');
    },
    onError: (err) => {
      setIsSaving(false);
      toast.error('Failed to save: ' + err.message);
    },
  });

  const handleChange = (key, value) => {
    setEditState(prev => ({ ...prev, [key]: value }));
    setDirty(prev => ({ ...prev, [key]: true }));
  };

  const handleSaveColor = (color) => {
    const units = product.units && product.units.length > 0 ? product.units : ['Pallet', 'Each', 'Layer'];
    const mappingData = {};

    if (color) {
      mappingData[color] = {};
      units.forEach(unit => {
        const key = `${color}:${unit}`;
        const value = (editState[key] || '').trim();
        if (value) {
          mappingData[color][unit] = value;
        }
      });
    } else {
      units.forEach(unit => {
        const value = (editState[unit] || '').trim();
        if (value) {
          mappingData[unit] = value;
        }
      });
    }

    setIsSaving(true);
    saveMutation.mutate({ mappingData, color: color || null });
  };

  if (!product) return null;

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-gray-400 py-2"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>;
  }

  const colors = product.colors && product.colors.length > 0 ? product.colors : [null];
  const units = product.units && product.units.length > 0 ? product.units : ['Pallet', 'Each', 'Layer'];

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lightspeed Names by Unit</div>
      {colors.map(color => {
        const colorLabel = color || '(No Color)';
        const colorHasChanges = units.some(unit => {
          const key = color ? `${color}:${unit}` : unit;
          return dirty[key];
        });

        return (
          <div key={color || '__no-color'} className="border rounded-lg p-3 bg-slate-50 space-y-2">
            {color && (
              <div className="text-sm font-semibold text-gray-700">{color}</div>
            )}
            <div className="space-y-2">
              {units.map(unit => {
                const key = color ? `${color}:${unit}` : unit;
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs text-gray-600 font-medium">{unit}</label>
                    <Input
                      value={editState[key] || ''}
                      onChange={e => handleChange(key, e.target.value)}
                      placeholder={`e.g. Belvedere ${color || 'Basalt'} per ${unit}`}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                );
              })}
            </div>
            {colorHasChanges && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs w-full"
                onClick={() => handleSaveColor(color)}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Save {colorLabel}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}