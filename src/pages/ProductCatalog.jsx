import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronRight, ChevronLeft, Edit, Trash2, Plus, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const CATEGORIES = ['High Format', 'Unilock', 'Fendt', 'Other'];

const ProductForm = forwardRef(function ProductForm({ initial, onSave, onCancel, isSaving, allMappings, showLightspeedFields = false }, ref) {
  const [form, setForm] = useState(() => initial || {
    name: '', category: 'High Format', colors: '', units: 'Pallet, Each, Layer',
    weight_pallet: '', weight_each: '', weight_layer: '',
    pallet_width: 3.5, pallet_depth: 4,
    counts_as_single_pallet: false, counts_as_pallet: true,
    lightspeed_names: '', lightspeed_color: '',
  });
  const [isDirty, setIsDirty] = useState(false);

  const isEditing = !!initial?.id;
  const [lsMappings, setLsMappings] = useState({});
  const [savedKeys, setSavedKeys] = useState({});
  const initialIdRef = React.useRef(null);

  useImperativeHandle(ref, () => ({
    isDirty: () => isDirty,
    getFormData: () => form,
  }));

  useEffect(() => {
    if (!initial?.name) return;
    initialIdRef.current = initial.id;
    const colorsArr = (initial.colors || '').split(',').map(c => c.trim()).filter(Boolean);
    const unitsArr = (initial.units || '').split(',').map(u => u.trim()).filter(Boolean);
    const state = {};
    if (colorsArr.length > 0) {
      colorsArr.forEach(color => {
        const m = allMappings?.find(r =>
          r.urkel_product_name === initial.name &&
          r.urkel_color === color
        ) || null;
        state[color] = {
          mapping: m,
          names: m ? (m.lightspeed_names || []).join('\n') : '',
          dirty: false,
          saving: false,
        };
      });
    } else {
      unitsArr.forEach(unit => {
        const key = `__nocolor_${unit}`;
        const m = allMappings?.find(r =>
          r.urkel_product_name === initial.name &&
          r.urkel_color === ''
        ) || null;
        state[key] = {
          mapping: m,
          names: m ? (m.lightspeed_names || []).join('\n') : '',
          dirty: false,
          saving: false,
        };
      });
    }
    setLsMappings(state);
  }, [allMappings, initial?.name, initial?.id, initial?.units]);

  const saveLsNames = async (key, color) => {
    setLsMappings(prev => {
      const current = prev[key];
      if (!current) return prev;
      const names = current.names.split('\n').map(s => s.trim()).filter(Boolean);
      (async () => {
        try {
          if (current.mapping) {
            await base44.entities.ProductMapping.update(current.mapping.id, { lightspeed_names: names });
          } else {
            const created = await base44.entities.ProductMapping.create({
              urkel_product_name: form.name,
              urkel_color: color || '',
              lightspeed_names: names,
            });
            setLsMappings(p => ({ ...p, [key]: { ...p[key], mapping: created, saving: false, dirty: false } }));
            setSavedKeys(p => ({ ...p, [key]: true }));
            setTimeout(() => setSavedKeys(p => ({ ...p, [key]: false })), 2000);
            toast.success('Saved: ' + (color || 'Lightspeed names'));
            return;
          }
          setLsMappings(p => ({ ...p, [key]: { ...p[key], saving: false, dirty: false } }));
          setSavedKeys(p => ({ ...p, [key]: true }));
          setTimeout(() => setSavedKeys(p => ({ ...p, [key]: false })), 2000);
          toast.success('Saved: ' + (color || 'Lightspeed names'));
        } catch (e) {
          toast.error('Failed to save: ' + e.message);
          setLsMappings(p => ({ ...p, [key]: { ...p[key], saving: false } }));
        }
      })();
      return { ...prev, [key]: { ...current, saving: true } };
    });
  };

  const updateForm = (updater) => { setForm(updater); setIsDirty(true); };

  const unitsArr = (form.units || '').split(',').map(u => u.trim()).filter(Boolean);
  const colorsArr = (form.colors || '').split(',').map(c => c.trim()).filter(Boolean);

  return (
    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={form.category} onValueChange={v => updateForm(f => ({ ...f, category: v }))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Name *</Label>
          <Input className="h-8 text-sm" value={form.name} onChange={e => updateForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Colors (comma separated)</Label>
        <Input className="h-8 text-sm" value={form.colors} onChange={e => updateForm(f => ({ ...f, colors: e.target.value }))} placeholder="Red, Grey, Charcoal" />
      </div>
      <div>
        <Label className="text-xs">Units (comma separated)</Label>
        <Input className="h-8 text-sm" value={form.units} onChange={e => updateForm(f => ({ ...f, units: e.target.value }))} placeholder="Pallet, Each, Layer" />
      </div>
      <div className={`grid gap-3 ${unitsArr.length >= 3 ? 'grid-cols-3' : unitsArr.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {unitsArr.map(u => u.toLowerCase()).includes('pallet') && (
          <div>
            <Label className="text-xs">Pallet Weight (lbs)</Label>
            <Input className="h-8 text-sm" type="number" value={form.weight_pallet || ''} onChange={e => updateForm(f => ({ ...f, weight_pallet: e.target.value }))} />
          </div>
        )}
        {unitsArr.map(u => u.toLowerCase()).includes('each') && (
          <div>
            <Label className="text-xs">Each Weight (lbs)</Label>
            <Input className="h-8 text-sm" type="number" value={form.weight_each || ''} onChange={e => updateForm(f => ({ ...f, weight_each: e.target.value }))} placeholder="55" />
          </div>
        )}
        {unitsArr.map(u => u.toLowerCase()).includes('layer') && (
          <div>
            <Label className="text-xs">Layer Weight (lbs)</Label>
            <Input className="h-8 text-sm" type="number" value={form.weight_layer || ''} onChange={e => updateForm(f => ({ ...f, weight_layer: e.target.value }))} placeholder="330" />
          </div>
        )}
      </div>
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <Checkbox id="csp" checked={form.counts_as_single_pallet} onCheckedChange={v => updateForm(f => ({ ...f, counts_as_single_pallet: v }))} />
          <Label htmlFor="csp" className="text-xs cursor-pointer">Counts as single pallet</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="cap" checked={form.counts_as_pallet !== false} onCheckedChange={v => updateForm(f => ({ ...f, counts_as_pallet: v }))} />
          <Label htmlFor="cap" className="text-xs cursor-pointer">Counts toward pallet totals</Label>
        </div>
      </div>

      {(colorsArr.length > 0 || unitsArr.length > 0) && (
        <div className="pt-3 border-t border-gray-200 space-y-3">
          <Label className="text-xs font-semibold">Lightspeed Names {colorsArr.length > 0 ? <span className="text-gray-400 font-normal">(one per line per color — one line per unit variant this product is sold in)</span> : <span className="text-gray-400 font-normal">(one per unit type)</span>}</Label>
          <div className="space-y-3">
            {colorsArr.length > 0 ? (
              colorsArr.map(color => {
                const key = color;
                const state = lsMappings[key] || { names: '', dirty: false, saving: false };
                return (
                  <div key={key}>
                    <Label className="text-xs font-semibold text-gray-600">{color}</Label>
                    <div className="flex gap-2 items-start mt-1">
                      <Textarea
                        value={state.names}
                        onChange={e => setLsMappings(prev => ({
                          ...prev,
                          [key]: { ...(prev[key] || { mapping: null }), names: e.target.value, dirty: true, saving: false }
                        }))}
                        placeholder={unitsArr.map(u => `Product ${u === 'Each' ? 'per Each' : u === 'Layer' ? 'per Layer' : 'per Pallet'} - ${color}`).join('\n')}
                        className="text-xs resize-none font-mono flex-1"
                        rows={Math.max(2, unitsArr.length + 1)}
                      />
                      {state.dirty && (
                        <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => saveLsNames(key, color)} disabled={state.saving}>
                          {state.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                        </Button>
                      )}
                      {savedKeys[key] && !state.dirty && (
                        <span className="text-green-600 text-xs font-semibold shrink-0 mt-1">✓ Saved</span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div>
                <Label className="text-xs font-semibold text-gray-600">No Color</Label>
                <div className="space-y-2 mt-1">
                  {unitsArr.map(unit => {
                    const key = `__nocolor_${unit}`;
                    const state = lsMappings[key] || { names: '', dirty: false, saving: false };
                    return (
                      <div key={key}>
                        <Label className="text-xs text-gray-500">{unit}</Label>
                        <div className="flex gap-2 items-start mt-0.5">
                          <Input
                            value={state.names}
                            onChange={e => setLsMappings(prev => ({
                              ...prev,
                              [key]: { ...(prev[key] || { mapping: null }), names: e.target.value, dirty: true, saving: false }
                            }))}
                            placeholder={`e.g. ${form.name} per ${unit}`}
                            className="text-xs font-mono flex-1 h-8"
                          />
                          {state.dirty && (
                            <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => saveLsNames(key, '')} disabled={state.saving}>
                              {state.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                            </Button>
                          )}
                          {savedKeys[key] && !state.dirty && (
                            <span className="text-green-600 text-xs font-semibold shrink-0 mt-1">✓</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={!form.name || isSaving} onClick={() => { setIsDirty(false); onSave(form); }}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Save
        </Button>
      </div>
    </div>
  );
});

function CategorySection({ category, children, onAdd, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 group">
          {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          <span className="text-lg font-semibold text-gray-800 group-hover:text-indigo-700">{category}</span>
        </button>
        <Button variant="outline" size="sm" onClick={onAdd} className="h-8 text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Product
        </Button>
      </div>
      {open && children}
    </div>
  );
}

function ProductRow({ product, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{product.name}</div>
          {product.colors?.length > 0 && (
            <div className="text-xs text-gray-400">{product.colors.join(', ')}</div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onEdit(product)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-indigo-600">
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(product)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-50">
          <div className="text-xs text-gray-500 mt-2 space-y-0.5">
            {product.units?.length > 0 && <div>Units: {product.units.join(', ')}</div>}
            {product.weight_pallet ? <div>Pallet: {product.weight_pallet} lbs</div> : null}
            {product.weight_each ? <div>Each: {product.weight_each} lbs</div> : null}
            {product.weight_layer ? <div>Layer: {product.weight_layer} lbs</div> : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductCatalog() {
  const queryClient = useQueryClient();
  const [addingToCategory, setAddingToCategory] = useState(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [search, setSearch] = useState('');
  const [dialogMappings, setDialogMappings] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const syncTimerRef = React.useRef(null);
  const [unsavedDialog, setUnsavedDialog] = useState(null);
  const editFormRef = useRef(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    staleTime: 300000,
  });

  const openEditDialog = async (product) => {
    const fresh = await base44.entities.ProductMapping.list('-created_date', 500);
    setDialogMappings(fresh);
    setEditingProduct(product);
    setEditDialogOpen(true);
  };

  const categoryProducts = editingProduct
    ? [...products].filter(p => p.category === editingProduct.category).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const doNavigate = async (direction) => {
    const idx = categoryProducts.findIndex(p => p.id === editingProduct?.id);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= categoryProducts.length) return;
    const nextProduct = categoryProducts[nextIdx];
    const fresh = await base44.entities.ProductMapping.list('-created_date', 500);
    setDialogMappings(fresh);
    setEditingProduct(nextProduct);
  };

  const navigateProduct = (direction) => {
    if (editFormRef.current?.isDirty()) {
      setUnsavedDialog({ direction });
    } else {
      doNavigate(direction);
    }
  };

  const editIdx = categoryProducts.findIndex(p => p.id === editingProduct?.id);

  const createMutation = useMutation({
    mutationFn: (data) => {
      const colorsArr = (data.colors || '').split(',').map(c => c.trim()).filter(Boolean);
      const unitsArr = (data.units || '').split(',').map(u => u.trim()).filter(Boolean);
      return base44.entities.Product.create({
        name: data.name, category: data.category,
        colors: colorsArr, units: unitsArr.length > 0 ? unitsArr : ['Pallet', 'Each', 'Layer'],
        weight_pallet: data.weight_pallet ? parseFloat(data.weight_pallet) : undefined,
        weight_each: data.weight_each ? parseFloat(data.weight_each) : undefined,
        weight_layer: data.weight_layer ? parseFloat(data.weight_layer) : undefined,
        pallet_width: parseFloat(data.pallet_width) || 3.5,
        pallet_depth: parseFloat(data.pallet_depth) || 4,
        counts_as_single_pallet: !!data.counts_as_single_pallet,
        counts_as_pallet: data.counts_as_pallet !== false,
      });
    },
    onSuccess: () => { queryClient.invalidateQueries(['products']); setAddingToCategory(null); setAddDialogOpen(false); toast.success('Product created'); },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const colorsArr = (data.colors || '').split(',').map(c => c.trim()).filter(Boolean);
      const unitsArr = (data.units || '').split(',').map(u => u.trim()).filter(Boolean);
      return base44.entities.Product.update(id, {
        name: data.name, category: data.category,
        colors: colorsArr, units: unitsArr.length > 0 ? unitsArr : ['Pallet', 'Each', 'Layer'],
        weight_pallet: data.weight_pallet ? parseFloat(data.weight_pallet) : undefined,
        weight_each: data.weight_each ? parseFloat(data.weight_each) : undefined,
        weight_layer: data.weight_layer ? parseFloat(data.weight_layer) : undefined,
        pallet_width: parseFloat(data.pallet_width) || 3.5,
        pallet_depth: parseFloat(data.pallet_depth) || 4,
        counts_as_single_pallet: !!data.counts_as_single_pallet,
        counts_as_pallet: data.counts_as_pallet !== false,
      });
    },
    onSuccess: (updatedProduct) => { queryClient.invalidateQueries(['products']); setEditingProduct(prev => prev ? { ...prev, ...updatedProduct } : prev); toast.success('Product updated'); },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['products']); setProductToDelete(null); toast.success('Product deleted'); },
  });

  const handleSyncLightspeed = async () => {
    setIsSyncing(true);
    setSyncProgress(0);

    const DURATION_MS = 85000;
    const INTERVAL_MS = 500;
    const steps = DURATION_MS / INTERVAL_MS;
    let step = 0;
    syncTimerRef.current = setInterval(() => {
      step++;
      const pct = 95 * (1 - Math.exp(-4 * step / steps));
      setSyncProgress(Math.min(pct, 95));
    }, INTERVAL_MS);

    try {
      const res = await base44.functions.invoke('syncLightspeedNames', {});
      clearInterval(syncTimerRef.current);
      setSyncProgress(100);
      const { total_ls_products, newly_mapped, mappings_updated, no_match_count } = res.data;
      queryClient.invalidateQueries(['productMappings']);
      toast.success(
        `Sync complete! ${total_ls_products} LS products scanned. ${newly_mapped} new names added across ${mappings_updated} mappings. ${no_match_count} unmatched.`,
        { duration: 8000 }
      );
    } catch (e) {
      clearInterval(syncTimerRef.current);
      setSyncProgress(0);
      toast.error('Sync failed: ' + e.message, { duration: 8000 });
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(0);
      }, 800);
    }
  };

  const productToFormValues = (p) => ({
    id: p.id,
    name: p.name, category: p.category,
    colors: (p.colors || []).join(', '),
    units: (p.units || ['Pallet', 'Each', 'Layer']).join(', '),
    weight_pallet: p.weight_pallet || '',
    weight_each: p.weight_each || '',
    weight_layer: p.weight_layer || '',
    pallet_width: p.pallet_width || 3.5,
    pallet_depth: p.pallet_depth || 4,
    counts_as_single_pallet: p.counts_as_single_pallet || false,
    counts_as_pallet: p.counts_as_pallet !== false,
  });

  const filteredProducts = (category) => {
    let list = products.filter(p => p.category === category);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(s) || p.colors?.some(c => (c || '').toLowerCase().includes(s)));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to={createPageUrl('Dashboard')}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex-1">Product Catalog</h1>
        <Button variant="outline" size="sm" onClick={handleSyncLightspeed} disabled={isSyncing}>
          {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Sync from Lightspeed
        </Button>
      </div>

      {isSyncing && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Syncing Lightspeed catalog…</span>
            <span>{Math.round(syncProgress)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${syncProgress}%` }}
            />
          </div>
        </div>
      )}

      <Input
        placeholder="Search products..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : (
        <div className="space-y-8">
          {CATEGORIES.map(category => (
            <CategorySection key={category} category={category} onAdd={() => { setAddingToCategory(category); setAddDialogOpen(true); }}>
              <div className="space-y-2">
                {filteredProducts(category).map(product => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    onEdit={(p) => { openEditDialog(p); setAddingToCategory(null); }}
                    onDelete={(p) => setProductToDelete(p)}
                  />
                ))}
                {filteredProducts(category).length === 0 && !addingToCategory && (
                  <div className="text-sm text-gray-400 italic py-2">No products in this category.</div>
                )}
              </div>
            </CategorySection>
          ))}
        </div>
      )}

      <AlertDialog open={!!productToDelete} onOpenChange={() => setProductToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {productToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(productToDelete.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) { setAddingToCategory(null); } setAddDialogOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Product — {addingToCategory}</DialogTitle>
          </DialogHeader>
          {addingToCategory && (
            <ProductForm
              key={`add-${addingToCategory}`}
              initial={{ name: '', category: addingToCategory, colors: '', units: 'Pallet, Each, Layer', weight_pallet: '', weight_each: '', weight_layer: '', pallet_width: 3.5, pallet_depth: 4, counts_as_single_pallet: false, counts_as_pallet: true }}
              onSave={(data) => createMutation.mutate(data)}
              onCancel={() => { setAddDialogOpen(false); setAddingToCategory(null); }}
              isSaving={createMutation.isPending}
              allMappings={[]}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) { setEditingProduct(null); setDialogMappings([]); } setEditDialogOpen(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle>Edit {editingProduct?.name}</DialogTitle>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => navigateProduct(-1)} disabled={editIdx <= 0}>
                  <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />Prev
                </Button>
                <span className="text-xs text-gray-400 px-1">{editIdx + 1}/{categoryProducts.length}</span>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => navigateProduct(1)} disabled={editIdx >= categoryProducts.length - 1}>
                  Next<ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          {editingProduct && (
            <ProductForm
              ref={editFormRef}
              key={editingProduct.id}
              initial={productToFormValues(editingProduct)}
              onSave={(data) => updateMutation.mutate({ id: editingProduct.id, data })}
              onCancel={() => setEditDialogOpen(false)}
              isSaving={updateMutation.isPending}
              allMappings={dialogMappings}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!unsavedDialog} onOpenChange={(open) => { if (!open) setUnsavedDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes. Do you want to save them before navigating?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { const dir = unsavedDialog?.direction; setUnsavedDialog(null); doNavigate(dir); }}>Discard</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const data = editFormRef.current?.getFormData();
              const dir = unsavedDialog?.direction;
              if (data && editingProduct) {
                updateMutation.mutate({ id: editingProduct.id, data }, {
                  onSuccess: () => { setUnsavedDialog(null); doNavigate(dir); }
                });
              }
            }}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}