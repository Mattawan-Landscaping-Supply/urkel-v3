import React, { useState } from 'react';
import { Pencil, CheckCircle2, AlertCircle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RemapItemRow({ li, idx, products, onRemap }) {
  const [editing, setEditing] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [saveMapping, setSaveMapping] = useState(false);
  const [showProductList, setShowProductList] = useState(false);

  const openEdit = () => {
    const pre = products.find(p => p.name === li.urkel_product_name) || null;
    setSelectedProduct(pre);
    setProductSearch(li.urkel_product_name || '');
    setSelectedColor(li.urkel_color || '');
    setSelectedUnit(li.unit_type || (pre?.units || ['Each'])[0] || 'Each');
    setSaveMapping(false);
    setShowProductList(false);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setShowProductList(false);
  };

  const handleConfirm = () => {
    if (!selectedProduct) return;
    const resolvedUnit = selectedUnit || (selectedProduct.units || ['Each'])[0] || 'Each';
    onRemap(idx, {
      urkel_product_name: selectedProduct.name,
      urkel_color: selectedColor,
      unit_type: resolvedUnit,
      matched: true,
      saveMapping,
    });
    setEditing(false);
    setShowProductList(false);
  };

  const filteredProducts = productSearch.length >= 1
    ? products.filter(p => (p.name || '').toLowerCase().includes(productSearch.toLowerCase())).slice(0, 8)
    : products.slice(0, 8);

  const colors = selectedProduct?.colors || [];
  const units = selectedProduct?.units || ['Pallet', 'Each', 'Layer'];

  // A matched item was manually overridden if its urkel_product_name differs from what parsing gave
  const wasOverridden = li.matched && li._overridden;

  return (
    <>
      <tr className={`border-b last:border-0 ${!li.matched ? 'bg-red-50' : wasOverridden ? 'bg-blue-50' : ''}`}>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {li.matched
              ? <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${wasOverridden ? 'text-blue-500' : 'text-green-500'}`} />
              : <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            }
            <div>
              <span className={!li.matched ? 'text-red-700 font-medium' : 'text-gray-800'}>
                {li.matched ? li.urkel_product_name : li.ls_name}
              </span>
              {/* Always show the raw LS name so user can verify what was parsed */}
              {li.matched && (
                <div className="text-xs text-gray-400 leading-tight">
                  LS: {li.ls_name}
                </div>
              )}
            </div>
            {li.color_ambiguous && (
              <span className="ml-1 text-xs text-amber-600 font-medium" title="Color ambiguous — please confirm">⚠ color?</span>
            )}
          </div>
          {!li.matched && (
            <div className="text-xs text-red-500 ml-5 mt-0.5">
              {li.color_mismatch
                ? <>Color mismatch: receipt says &ldquo;{li.parsed_color}&rdquo; but mapping has &ldquo;{li.mapping_color || '(none)'}&rdquo; — <button type="button" className="underline hover:text-red-700" onClick={openEdit}>Fix it</button></>
                : <>No mapping — <button type="button" className="underline hover:text-red-700" onClick={openEdit}>Link to product</button></>
              }
            </div>
          )}
          {li.matched && !editing && (
            <div className="text-xs text-gray-400 ml-5 mt-0.5">
              <button type="button" className="underline hover:text-indigo-600" onClick={openEdit}>
                Read wrong? Correct it
              </button>
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-gray-600">
          {li.matched && li.color_ambiguous && li.color_options ? (
            <select
              className="border border-amber-400 rounded px-1 py-0.5 text-xs bg-amber-50 text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-400"
              value={li.urkel_color || ''}
              onChange={e => onRemap(idx, { urkel_product_name: li.urkel_product_name, urkel_color: e.target.value, unit_type: li.unit_type, saveMapping: false })}
              title="Multiple colors match — please confirm"
            >
              {li.color_options.map(c => <option key={c} value={c}>{c || '(no color)'}</option>)}
            </select>
          ) : (
            li.matched ? (li.urkel_color || '—') : '—'
          )}
        </td>
        <td className="px-3 py-2 text-gray-600">{li.unit_type || '—'}</td>
        <td className="px-3 py-2 text-right font-semibold">{li.quantity}</td>
        <td className="px-2 py-2 text-right">
          <button
            type="button"
            onClick={openEdit}
            className="text-gray-400 hover:text-indigo-600 transition-colors"
            title={li.matched ? 'Correct this item' : 'Link to product'}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </td>
      </tr>

      {editing && (
        <tr className={`border-b ${li.matched ? 'bg-blue-50' : 'bg-indigo-50'}`}>
          <td colSpan={5} className="px-3 py-3">
            <div className="space-y-2">
              {/* Context: what LS said */}
              <div className="text-xs text-gray-500 bg-white rounded px-2 py-1 border border-gray-200">
                <span className="font-medium text-gray-600">Lightspeed read:</span> {li.ls_name}
                {li.parsed_color && <span className="ml-2 text-gray-400">(parsed color: <span className="font-medium text-gray-600">{li.parsed_color}</span>)</span>}
              </div>

              {/* Product search */}
              <div className="relative">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Correct Product</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  placeholder="Search product..."
                  value={productSearch}
                  onChange={e => {
                    setProductSearch(e.target.value);
                    setSelectedProduct(null);
                    setShowProductList(true);
                  }}
                  onFocus={() => setShowProductList(true)}
                  onBlur={() => setTimeout(() => setShowProductList(false), 150)}
                />
                {showProductList && filteredProducts.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 border-b last:border-0"
                        onMouseDown={() => {
                          setSelectedProduct(p);
                          setProductSearch(p.name);
                          setSelectedColor((p.colors || [])[0] || '');
                          setSelectedUnit((p.units || ['Each'])[0] || 'Each');
                          setShowProductList(false);
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedProduct && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Color</label>
                    <select
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      value={selectedColor}
                      onChange={e => setSelectedColor(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {colors.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Unit</label>
                    <select
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      value={selectedUnit}
                      onChange={e => setSelectedUnit(e.target.value)}
                    >
                      {units.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveMapping}
                  onChange={e => setSaveMapping(e.target.checked)}
                  className="rounded"
                />
                Save this as the correct mapping for future imports
              </label>

              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={handleCancel} className="flex items-center gap-1">
                  <X className="w-3 h-3" /> Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={!selectedProduct}
                  className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  <Check className="w-3 h-3" /> Apply Correction
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
