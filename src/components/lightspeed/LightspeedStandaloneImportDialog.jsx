import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertCircle, CheckCircle2, PlusCircle, Link2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const CATEGORIES = ['High Format', 'Unilock', 'Fendt', 'Other'];

function guessCategory(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('high format')) return 'High Format';
  if (n.includes('unilock')) return 'Unilock';
  if (n.includes('fendt')) return 'Fendt';
  return 'Other';
}

function guessProductName(lsName) {
  return (lsName || '')
    .replace(/\s*per\s+(pallet|layer|each)\s*/gi, '')
    .replace(/\s*-\s*(pallet|layer|each)\s*/gi, '')
    .trim();
}

// ─── Inline Add Product Dialog ───────────────────────────────────────────────
function AddProductDialog({ lineItem, onClose, onSaved }) {
  const guessedName = guessProductName(lineItem.ls_name);
  const [form, setForm] = useState({
    name: guessedName,
    category: guessCategory(lineItem.ls_name),
    weight_pallet: '',
    weight_each: '',
    weight_layer: '',
    units: lineItem.unit_type ? [lineItem.unit_type] : ['Each'],
    lightspeed_names: lineItem.ls_name,
  });
  const [saving, setSaving] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const toggleUnit = (unit) => {
    setForm(f => ({
      ...f,
      units: f.units.includes(unit)
        ? f.units.filter(u => u !== unit)
        : [...f.units, unit],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Product name is required'); return; }
    setSaving(true);
    try {
      const product = await base44.entities.Product.create({
        name: form.name.trim(),
        category: form.category,
        weight_pallet: form.weight_pallet ? Number(form.weight_pallet) : undefined,
        weight_each: form.weight_each ? Number(form.weight_each) : undefined,
        weight_layer: form.weight_layer ? Number(form.weight_layer) : undefined,
        units: form.units.length ? form.units : ['Each'],
        counts_as_pallet: true,
      });

      await base44.entities.ProductMapping.create({
        urkel_product_name: form.name.trim(),
        category: form.category,
        urkel_color: '',
        urkel_unit: form.units[0] || 'Each',
        lightspeed_names: [lineItem.ls_name],
      });

      toast.success(`Product "${form.name}" added to catalog`);
      onSaved({
        urkel_product_name: form.name.trim(),
        urkel_color: '',
        urkel_unit: form.units[0] || 'Each',
        ls_name: lineItem.ls_name,
      });
    } catch (err) {
      toast.error('Failed to save product: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Product to Catalog</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="bg-gray-50 border rounded p-2 text-xs text-gray-500">
            <span className="font-semibold">Lightspeed name:</span> {lineItem.ls_name}
          </div>

          <div className="space-y-1">
            <Label>Product Name *</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Weight/Pallet (lbs)</Label>
              <Input type="number" value={form.weight_pallet} onChange={e => set('weight_pallet', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Weight/Each (lbs)</Label>
              <Input type="number" value={form.weight_each} onChange={e => set('weight_each', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Weight/Layer (lbs)</Label>
              <Input type="number" value={form.weight_layer} onChange={e => set('weight_layer', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Available Units</Label>
            <div className="flex gap-2">
              {['Pallet', 'Each', 'Layer'].map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => toggleUnit(u)}
                  className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${form.units.includes(u) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Back to Import</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save Product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Link to Existing Product Picker ────────────────────────────────────────
function LinkToExistingPicker({ lineItem, products, onConfirm, onCancel }) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const availableColors = selectedProduct?.colors || [];
  const availableUnits = selectedProduct?.units || ['Pallet', 'Each', 'Layer'];

  const handleConfirm = async () => {
    if (!selectedProduct) { return; }
    setSaving(true);
    try {
      const resolvedColor = (selectedColor || '').trim();
      const resolvedUnit = selectedUnit || availableUnits[0] || 'Each';
      const lsName = lineItem.ls_name;
      await base44.entities.ProductMapping.create({
        urkel_product_name: selectedProduct.name,
        category: selectedProduct.category || 'Other',
        urkel_color: resolvedColor,
        urkel_unit: resolvedUnit,
        lightspeed_names: [lsName],
      });
      // Also update Product.lightspeed_names for catalog UI
      try {
        const allProducts = await base44.entities.Product.list('name', 500);
        const product = allProducts.find(p => p.name === selectedProduct.name);
        if (product) {
          const currentLsNames = (typeof product.lightspeed_names === 'object' && product.lightspeed_names !== null)
            ? { ...product.lightspeed_names }
            : {};
          if (resolvedColor) {
            const colorSection = (typeof currentLsNames[resolvedColor] === 'object' && currentLsNames[resolvedColor] !== null)
              ? { ...currentLsNames[resolvedColor] }
              : {};
            colorSection[resolvedUnit] = lsName;
            currentLsNames[resolvedColor] = colorSection;
          } else {
            currentLsNames[resolvedUnit] = lsName;
          }
          await base44.entities.Product.update(product.id, { lightspeed_names: currentLsNames });
        }
      } catch (err) {
        console.warn('Failed to update Product.lightspeed_names:', err.message);
      }
      onConfirm({
        urkel_product_name: selectedProduct.name,
        urkel_color: resolvedColor,
        urkel_unit: resolvedUnit,
      });
      } catch (err) {
      import('sonner').then(({ toast }) => toast.error('Failed to create mapping: ' + err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ml-5 mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2">
      <p className="text-xs font-semibold text-indigo-700">Link to Urkel Product</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-xs text-gray-500 mb-1">Product</p>
          <Select value={selectedProductId} onValueChange={v => { setSelectedProductId(v); setSelectedColor(''); setSelectedUnit(''); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {products.map(p => (
                <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Color</p>
          <Select value={selectedColor} onValueChange={setSelectedColor} disabled={!selectedProduct}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={availableColors.length ? 'Select...' : '—'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" " className="text-xs">— None —</SelectItem>
              {availableColors.map(c => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Unit</p>
          <Select value={selectedUnit} onValueChange={setSelectedUnit} disabled={!selectedProduct}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {availableUnits.map(u => (
                <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving} className="h-7 text-xs">Cancel</Button>
        <Button size="sm" onClick={handleConfirm} disabled={!selectedProduct || saving} className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700">
          {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
          Confirm Link
        </Button>
      </div>
    </div>
  );
}

// ─── Matched / Unmatched Row ─────────────────────────────────────────────────
function MatchedRow({ li, idx, products, loadingProducts, linkingItem, setLinkingItem, setAddingProduct, onLinkConfirmed, onRemap, onColorChange }) {
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [showList, setShowList] = useState(false);

  const openEdit = () => {
    const pre = products.find(p => p.name === li.urkel_product_name) || null;
    setSelectedProduct(pre);
    setSearch(li.urkel_product_name || '');
    setSelectedColor(li.urkel_color || '');
    setSelectedUnit(li.unit_type || '');
    setShowList(false);
    setEditing(true);
  };

  const handleConfirm = () => {
    if (!selectedProduct) return;
    const resolvedUnit = selectedUnit || (selectedProduct.units || ['Each'])[0] || 'Each';
    onRemap(idx, { urkel_product_name: selectedProduct.name, urkel_color: selectedColor, unit_type: resolvedUnit, saveMapping: true });
    setEditing(false);
  };

  const filtered = search.length >= 1
    ? products.filter(p => (p.name || '').toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : products.slice(0, 8);

  return (
    <>
      <tr className={`border-b last:border-0 ${!li.matched ? 'bg-red-50' : ''}`}>
        <td className="px-3 py-2" colSpan={li.matched ? 1 : 4}>
          <div className="flex items-center gap-1.5">
            {li.matched
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
              : <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
            <div>
              <span className={!li.matched ? 'text-red-700 font-medium' : 'text-gray-800'}>
                {li.matched ? li.urkel_product_name : li.ls_name}
              </span>
              {li.matched && (
                <div className="text-xs text-gray-400 leading-tight">LS: {li.ls_name}</div>
              )}
            </div>
          </div>
          {li.matched && !editing && (
            <div className="text-xs text-gray-400 ml-5 mt-0.5">
              <button type="button" className="underline hover:text-indigo-600" onClick={openEdit}>
                Read wrong? Correct it
              </button>
            </div>
          )}
          {!li.matched && (
            <>
              <div className="flex items-center gap-2 ml-5 mt-1 flex-wrap">
                {li.color_mismatch
                  ? <span className="text-xs text-red-500">Color mismatch: receipt says &ldquo;{li.parsed_color}&rdquo; but mapping has &ldquo;{li.mapping_color || '(none)'}&rdquo;</span>
                  : <span className="text-xs text-red-500">No mapping found</span>
                }
                <button
                  onClick={() => setAddingProduct(li)}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  <PlusCircle className="w-3 h-3" />
                  Add as New Product
                </button>
                <button
                  onClick={() => setLinkingItem(li.ls_name)}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                >
                  {loadingProducts && linkingItem === li.ls_name
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Link2 className="w-3 h-3" />}
                  Link to Existing Product
                </button>
              </div>
              {linkingItem === li.ls_name && (
                <LinkToExistingPicker
                  lineItem={li}
                  products={products}
                  onConfirm={(linkData) => onLinkConfirmed(li.ls_name, linkData)}
                  onCancel={() => setLinkingItem(null)}
                />
              )}
            </>
          )}
        </td>
        {li.matched && (
          <>
            <td className="px-3 py-2 text-gray-600">
              {li.color_ambiguous && li.color_options ? (
                <select
                  className="border border-amber-400 rounded px-1 py-0.5 text-xs bg-amber-50 text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  value={li.urkel_color || ''}
                  onChange={e => onColorChange(li.ls_name, e.target.value, li.urkel_product_name, li.unit_type)}
                  title="Multiple colors match — please confirm"
                >
                  {li.color_options.map(c => <option key={c} value={c}>{c || '(no color)'}</option>)}
                </select>
              ) : (
                li.urkel_color || '—'
              )}
            </td>
            <td className="px-3 py-2 text-gray-600">{li.unit_type || '—'}</td>
            <td className="px-3 py-2 text-right font-semibold">{li.quantity}</td>
            <td className="px-2 py-2 text-right">
              <button type="button" onClick={openEdit} className="text-gray-400 hover:text-indigo-600 transition-colors" title="Edit mapping">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </td>
          </>
        )}
      </tr>
      {editing && (
        <tr className="bg-indigo-50 border-b">
          <td colSpan={5} className="px-3 py-3">
            <div className="space-y-2">
              <div className="relative">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Product</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Search product..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setSelectedProduct(null); setShowList(true); }}
                  onFocus={() => setShowList(true)}
                  onBlur={() => setTimeout(() => setShowList(false), 150)}
                />
                {showList && filtered.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
                    {filtered.map(p => (
                      <button key={p.id} type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 border-b last:border-0"
                        onMouseDown={() => { setSelectedProduct(p); setSearch(p.name); setSelectedColor((p.colors||[])[0]||''); setSelectedUnit((p.units||['Each'])[0]||'Each'); setShowList(false); }}
                      >{p.name}</button>
                    ))}
                  </div>
                )}
              </div>
              {selectedProduct && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Color</label>
                    <select className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white" value={selectedColor} onChange={e => setSelectedColor(e.target.value)}>
                      <option value="">— None —</option>
                      {(selectedProduct.colors||[]).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Unit</label>
                    <select className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white" value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)}>
                      {(selectedProduct.units||['Pallet','Each','Layer']).map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="flex items-center gap-1"><X className="w-3 h-3" /> Cancel</Button>
                <Button size="sm" onClick={handleConfirm} disabled={!selectedProduct} className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700"><Check className="w-3 h-3" /> Save</Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Dialog ─────────────────────────────────────────────────────────────
const getLocalDateString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export default function LightspeedStandaloneImportDialog({ isOpen, onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saleNumber, setSaleNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [addingProduct, setAddingProduct] = useState(null);
  const [linkingItem, setLinkingItem] = useState(null);
  const [sessionLinks, setSessionLinks] = useState({});
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Fetch products whenever the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setLoadingProducts(true);
    base44.entities.Product.list('name', 500)
      .then(prods => setProducts(prods.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, [isOpen]);

  const fetchProductsIfNeeded = async () => {
    // Products are already loaded on open; this is now a no-op
  };

  const handleFetch = async (overrideSaleNumber) => {
    const num = overrideSaleNumber || saleNumber.trim();
    if (!num) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke('lightspeedImportSale', { saleNumber: num });
      setPreview(res.data);
    } catch (err) {
      toast.error('Failed to fetch sale: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setConfirming(true);
    try {
      const receiptNumber = preview.sale_number;
      // Use contact name if available, otherwise fall back to company name
      const customerName = (preview.customer_name && preview.customer_name !== 'Unknown Customer')
        ? preview.customer_name
        : (preview.company_name || 'Unknown Customer');
      const today = getLocalDateString();

      // Try to auto-link to existing Customer catalog entry
      let autoLinkedCustomerId = null;
      try {
        const allCustomers = await base44.entities.Customer.list('-created_date', 500);
        const lsPersonName = (preview.customer_name || '').toLowerCase().trim();
        const lsCompanyName = (preview.company_name || '').toLowerCase().trim();
        const matchedCustomer = allCustomers.find(c => {
          const cName = (c.name || '').toLowerCase().trim();
          const cCompany = (c.company || '').toLowerCase().trim();
          if (lsCompanyName && (cCompany === lsCompanyName || cName === lsCompanyName)) return true;
          if (cName === lsPersonName || cCompany === lsPersonName) return true;
          if (lsCompanyName && (cCompany.includes(lsCompanyName) || lsCompanyName.includes(cCompany))) return true;
          return false;
        });
        if (matchedCustomer) {
          autoLinkedCustomerId = matchedCustomer.id;
          // Override display name with the catalog company name
          if (matchedCustomer.company) {
            customerName = matchedCustomer.company;
          }
        }
      } catch (e) { /* non-critical */ }

      const newOrder = await base44.entities.Order.create({
        customer_name: customerName,
        company_name: preview.company_name || '',
        receipt_numbers: receiptNumber,
        ...(autoLinkedCustomerId ? { customer_id: autoLinkedCustomerId } : {}),
      });

      const paidAtSale = !!preview.paid_at_sale;
      await base44.entities.Receipt.create({
        order_id: newOrder.id,
        receipt_number: receiptNumber,
        is_paid: paidAtSale,
        skip_paid_notification: paidAtSale,
      });

      const itemsToCreate = effectiveLineItems
        .filter(li => li.matched)
        .map(li => ({
          order_id: newOrder.id,
          product_name: li.urkel_product_name,
          selected_color: li.urkel_color || '',
          selected_unit: li.unit_type || 'Each',
          quantity: li.quantity,
          status: 'order',
          receipt_number: receiptNumber,
          date_ordered: today,
        }));

      if (itemsToCreate.length === 0) {
        toast.error('No matched items to import. Please set up ProductMappings first.');
        setConfirming(false);
        return;
      }

      await base44.entities.OrderItem.bulkCreate(itemsToCreate);
      toast.success(`Imported ${itemsToCreate.length} item(s) — new order created for ${customerName}`);
      queryClient.removeQueries({ queryKey: ['orders', 'active', 'dashboard'] });
      handleClose();
      navigate(createPageUrl(`OrderDetails?id=${newOrder.id}`));
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = () => {
    setSaleNumber('');
    setPreview(null);
    setLoading(false);
    setConfirming(false);
    setAddingProduct(null);
    setLinkingItem(null);
    setSessionLinks({});
    onClose();
  };

  const handleProductSaved = (mappingData) => {
    setAddingProduct(null);
    if (mappingData?.ls_name) {
      setSessionLinks(prev => ({
        ...prev,
        [mappingData.ls_name]: {
          urkel_product_name: mappingData.urkel_product_name,
          urkel_color: mappingData.urkel_color || '',
          urkel_unit: mappingData.urkel_unit,
        }
      }));
    }
  };

  const handleLinkConfirmed = (lsName, linkData) => {
    setSessionLinks(prev => ({ ...prev, [lsName]: linkData }));
    setLinkingItem(null);
  };

  const effectiveLineItems = preview?.line_items?.map(li => {
    const link = sessionLinks[li.ls_name];
    if (link) {
      return { ...li, matched: true, urkel_product_name: link.urkel_product_name, urkel_color: link.urkel_color, unit_type: link.urkel_unit };
    }
    return li;
  }) || [];

  const matchedCount = effectiveLineItems.filter(li => li.matched).length;
  const unmatchedCount = effectiveLineItems.filter(li => !li.matched).length;

  return (
    <>
      {addingProduct && (
        <AddProductDialog
          lineItem={addingProduct}
          onClose={() => setAddingProduct(null)}
          onSaved={handleProductSaved}
        />
      )}

      <Dialog open={isOpen && !addingProduct} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
          <div className="px-6 pt-6 pb-4 shrink-0">
            <DialogTitle className="text-lg font-semibold">Import from Lightspeed</DialogTitle>
          </div>

          <div className="px-6 pb-4 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="flex gap-2">
              <Input
                placeholder="Enter sale number..."
                value={saleNumber}
                onChange={e => setSaleNumber(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleFetch()}
                disabled={loading || confirming}
              />
            </div>

            {preview && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="font-semibold">Sale #{preview.sale_number}</span>
                  {preview.customer_name && preview.customer_name !== 'Unknown Customer' && (
                    <span className="text-gray-500">— {preview.customer_name}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${preview.paid_at_sale ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {preview.paid_at_sale ? 'Paid' : 'Unpaid'}
                  </span>
                </div>

                {preview.line_items.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No line items found on this sale.</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Product</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Color</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">Unit</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">Qty</th>
                          <th className="w-6" />
                          </tr>
                          </thead>
                      <tbody>
                        {effectiveLineItems.map((li, idx) => (
                          <MatchedRow
                            key={idx}
                            li={li}
                            idx={idx}
                            products={products}
                            loadingProducts={loadingProducts}
                            linkingItem={linkingItem}
                            setLinkingItem={setLinkingItem}
                            setAddingProduct={setAddingProduct}
                            onLinkConfirmed={handleLinkConfirmed}
                            onColorChange={(lsName, color, productName, unitType) => {
                              setSessionLinks(prev => ({ ...prev, [lsName]: { urkel_product_name: productName, urkel_color: color, urkel_unit: unitType } }));
                            }}
                            onRemap={async (idx, data) => {
                              const lsName = effectiveLineItems[idx].ls_name;
                              // Update session state immediately
                              setSessionLinks(prev => ({ ...prev, [lsName]: { urkel_product_name: data.urkel_product_name, urkel_color: data.urkel_color, urkel_unit: data.unit_type } }));
                              // Persist to ProductMapping if checkbox was checked
                              if (data.saveMapping) {
                                console.log('SAVING MAPPING:', lsName, data);
                                try {
                                  const all = await base44.entities.ProductMapping.list('urkel_product_name', 500);
                                  // Match on all three fields — each unique product+color+unit combo is its own record
                                  const resolvedUnitType = data.unit_type || data.urkel_unit;
                                  const existing = all.find(m =>
                                   m.urkel_product_name === data.urkel_product_name &&
                                   m.urkel_color === data.urkel_color &&
                                   m.urkel_unit === resolvedUnitType
                                  );
                                  if (existing) {
                                    // Add this LS name to the existing record's lightspeed_names if not already there
                                    const names = Array.isArray(existing.lightspeed_names) ? existing.lightspeed_names : [];
                                    if (!names.some(n => n.toLowerCase() === lsName.toLowerCase())) {
                                      await base44.entities.ProductMapping.update(existing.id, {
                                        lightspeed_names: [...names, lsName],
                                        urkel_unit: resolvedUnitType,
                                      });
                                    }
                                  } else {
                                    await base44.entities.ProductMapping.create({
                                     lightspeed_names: [lsName],
                                     urkel_product_name: data.urkel_product_name,
                                     urkel_color: data.urkel_color,
                                     urkel_unit: resolvedUnitType,
                                     confirmed: true,
                                    });
                                  }
                                  toast.success('Mapping saved for future imports');
                                  // Also update Product.lightspeed_names so the catalog UI reflects this mapping
                                  try {
                                   const allProducts = await base44.entities.Product.list('name', 500);
                                   const product = allProducts.find(p => p.name === data.urkel_product_name);
                                   if (product) {
                                     const currentLsNames = (typeof product.lightspeed_names === 'object' && product.lightspeed_names !== null)
                                       ? { ...product.lightspeed_names }
                                       : {};
                                     if (data.urkel_color) {
                                        const colorSection = typeof currentLsNames[data.urkel_color] === 'object' && currentLsNames[data.urkel_color] !== null
                                          ? { ...currentLsNames[data.urkel_color] }
                                          : {};
                                        colorSection[resolvedUnitType] = lsName;
                                        currentLsNames[data.urkel_color] = colorSection;
                                      } else {
                                        currentLsNames[resolvedUnitType] = lsName;
                                      }
                                     await base44.entities.Product.update(product.id, { lightspeed_names: currentLsNames });
                                   }
                                  } catch (err) {
                                   // Non-fatal — ProductMapping is the source of truth for imports
                                   console.warn('Failed to update Product.lightspeed_names:', err.message);
                                  }
                                  } catch (err) {
                                  toast.error('Failed to save mapping: ' + err.message);
                                  }
                              }
                            }}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {unmatchedCount > 0 && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>{unmatchedCount} item{unmatchedCount > 1 ? 's' : ''}</strong> have no ProductMapping and will be skipped.
                      Use <strong>Add to Catalog</strong> on each row to map them.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            {preview && matchedCount > 0 && (
              <Button onClick={handleConfirm} disabled={confirming} className="bg-indigo-600 hover:bg-indigo-700">
                {confirming && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Create Order & Import {matchedCount} Item{matchedCount > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}