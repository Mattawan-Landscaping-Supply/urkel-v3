import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Circle, Search, RefreshCw, Loader2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const unitPattern = /\bper\s+(Pallet|Each|Layer|EACH|PALLET|LAYER)\b/i;
function extractUnitFromName(name) {
  const m = name.match(unitPattern);
  if (!m) return null;
  const u = m[1].toLowerCase();
  return u.charAt(0).toUpperCase() + u.slice(1);
}

function extractColorFromName(name) {
  const m = name.match(/[-–]\s*([A-Za-z][A-Za-z\s]+)$/);
  return m ? m[1].trim() : null;
}

function getMappingWarnings(mapping) {
  const warnings = [];
  const names = mapping.lightspeed_names || [];
  if (names.length <= 1) return warnings;

  // Check for mixed units in one record
  const units = new Set(names.map(n => extractUnitFromName(n)).filter(Boolean));
  if (units.size > 1) {
    warnings.push(`Mixed units: ${[...units].join(' + ')} in one record`);
  }

  // Check for mixed colors in one record
  const colors = new Set(names.map(n => extractColorFromName(n)).filter(Boolean));
  if (colors.size > 1) {
    warnings.push(`Mixed colors: ${[...colors].join(', ')}`);
  }

  return warnings;
}

function getUnitMismatchWarning(lsName, mapping) {
  if (!mapping || !mapping.urkel_unit) return null;
  const nameUnit = extractUnitFromName(lsName);
  if (!nameUnit) return null;
  if (nameUnit.toLowerCase() !== mapping.urkel_unit.toLowerCase()) {
    return `LS name says "${nameUnit}" but mapped unit is "${mapping.urkel_unit}"`;
  }
  return null;
}

export default function LightspeedMapping() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [pendingMappings, setPendingMappings] = useState({});
  const [savingRows, setSavingRows] = useState({});
  const [editingRows, setEditingRows] = useState({});
  const [skippingRows, setSkippingRows] = useState({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ls-catalog'],
    queryFn: () => base44.functions.invoke('getLightspeedCatalog', {}),
    staleTime: 0,
  });

  const catalog = data?.data || data || {};
  const items = catalog.items || [];
  const mappings = catalog.mappings || [];
  const urkelProducts = catalog.urkel_products || [];
  const categories = catalog.categories || [];

  const mappingLookup = useMemo(() => {
    const lookup = {};
    for (const m of mappings) {
      for (const name of (m.lightspeed_names || [])) {
        lookup[name.trim().toLowerCase()] = m;
      }
    }
    return lookup;
  }, [mappings]);

  const isSkipped = (desc) => mappingLookup[desc.toLowerCase()]?.urkel_product_name === '__SKIPPED__';

  const uniqueItems = useMemo(() => {
    const seen = new Set();
    return items.filter(item => {
      const key = item.description.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.description.localeCompare(b.description));
  }, [items]);

  const totalMapped = useMemo(() =>
    uniqueItems.filter(i => {
      const m = mappingLookup[i.description.toLowerCase()];
      return m && m.urkel_product_name !== '__SKIPPED__';
    }).length,
  [uniqueItems, mappingLookup]);

  const totalSkipped = useMemo(() =>
    uniqueItems.filter(i => isSkipped(i.description)).length,
  [uniqueItems, mappingLookup]);

  const totalWarnings = useMemo(() => {
    let count = 0;
    for (const item of uniqueItems) {
      const m = mappingLookup[item.description.toLowerCase()];
      if (!m || m.urkel_product_name === '__SKIPPED__') continue;
      if (getMappingWarnings(m).length > 0) count++;
      if (getUnitMismatchWarning(item.description, m)) count++;
    }
    return count;
  }, [uniqueItems, mappingLookup]);

  const filteredItems = useMemo(() => {
    return uniqueItems.filter(item => {
      const desc = item.description.toLowerCase();
      const mapping = mappingLookup[desc];
      const skipped = mapping?.urkel_product_name === '__SKIPPED__';
      const isMapped = !!mapping && !skipped;
      if (filterStatus === 'mapped' && !isMapped) return false;
      if (filterStatus === 'unmapped' && (isMapped || skipped)) return false;
      if (filterStatus === 'skipped' && !skipped) return false;
      if (filterStatus === 'warnings') {
        const hasWarning = isMapped && (
          getMappingWarnings(mapping).length > 0 ||
          getUnitMismatchWarning(item.description, mapping)
        );
        if (!hasWarning) return false;
      }
      if (filterCategory !== 'all' && item.categoryName !== filterCategory) return false;
      if (search && !desc.includes(search.toLowerCase())) return false;
      return true;
    });
  }, [uniqueItems, mappingLookup, filterStatus, filterCategory, search]);

  const groupedByCategory = useMemo(() => {
    const groups = {};
    for (const item of filteredItems) {
      if (!groups[item.categoryName]) groups[item.categoryName] = [];
      groups[item.categoryName].push(item);
    }
    return groups;
  }, [filteredItems]);

  const getAvailableColors = (productName) => urkelProducts.find(p => p.name === productName)?.colors || [];
  const getAvailableUnits = (productName) => urkelProducts.find(p => p.name === productName)?.units || [];

  const updatePending = (desc, field, value) => {
    setPendingMappings(prev => ({ ...prev, [desc]: { ...(prev[desc] || {}), [field]: value } }));
  };

  const clearRow = (desc) => {
    setPendingMappings(prev => { const n = { ...prev }; delete n[desc]; return n; });
    setEditingRows(prev => { const n = { ...prev }; delete n[desc]; return n; });
    setSavingRows(prev => { const n = { ...prev }; delete n[desc]; return n; });
  };

  const handleEditRow = (desc, existingMapping) => {
    setPendingMappings(prev => ({
      ...prev,
      [desc]: {
        urkel_product_name: existingMapping.urkel_product_name || '',
        urkel_color: existingMapping.urkel_color || '',
        urkel_unit: existingMapping.urkel_unit ?? '',
      }
    }));
    setEditingRows(prev => ({ ...prev, [desc]: true }));
  };

  const saveMutation = useMutation({
    mutationFn: async ({ lsDescription, urkel_product_name, urkel_color, urkel_unit, existingId }) => {
      const normalizedUnit = urkel_unit || null;

      if (existingId) {
        // Editing an existing record — check if we need to create a new one or update in place
        const existing = mappings.find(m => m.id === existingId);
        const existingNames = existing?.lightspeed_names || [];
        const otherNames = existingNames.filter(n => n.trim().toLowerCase() !== lsDescription.trim().toLowerCase());

        if (otherNames.length > 0) {
          // This LS name was one of several in a merged record — remove it from the old record
          // and create a brand new unit-specific record for this LS name
          await base44.entities.ProductMapping.update(existingId, {
            lightspeed_names: otherNames,
          });
          await base44.entities.ProductMapping.create({
            urkel_product_name,
            urkel_color: urkel_color || '',
            urkel_unit: normalizedUnit,
            lightspeed_names: [lsDescription],
            confirmed: true,
          });
        } else {
          // Only this LS name in the record — just update in place
          await base44.entities.ProductMapping.update(existingId, {
            urkel_product_name,
            urkel_color: urkel_color || '',
            urkel_unit: normalizedUnit,
            lightspeed_names: [lsDescription],
            confirmed: true,
          });
        }
      } else {
        // New mapping — always create a fresh unit-specific record
        await base44.entities.ProductMapping.create({
          urkel_product_name,
          urkel_color: urkel_color || '',
          urkel_unit: normalizedUnit,
          lightspeed_names: [lsDescription],
          confirmed: true,
        });
      }

      // Also update Product.lightspeed_names for catalog UI consistency
      const product = urkelProducts.find(p => p.name === urkel_product_name);
      if (product) {
        const colorKey = urkel_color || 'No Color';
        const unitKey = normalizedUnit || 'Any';
        const existingLsNames = product.lightspeed_names || {};
        const colorGroup = existingLsNames[colorKey] || {};
        await base44.entities.Product.update(product.id, {
          lightspeed_names: {
            ...existingLsNames,
            [colorKey]: { ...colorGroup, [unitKey]: lsDescription },
          },
        });
      }
    },
    onSuccess: async (_, vars) => {
      await queryClient.invalidateQueries(['ls-catalog']);
      await queryClient.refetchQueries(['ls-catalog']);
      clearRow(vars.lsDescription);
      toast.success(`Saved: ${vars.lsDescription}`);
    },
    onError: (err, vars) => {
      toast.error(`Failed: ${err.message}`);
      setSavingRows(prev => { const n = { ...prev }; delete n[vars.lsDescription]; return n; });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async ({ lsDescription }) => {
      const existing = mappingLookup[lsDescription.toLowerCase()];
      if (existing) {
        await base44.entities.ProductMapping.update(existing.id, {
          urkel_product_name: '__SKIPPED__',
          urkel_color: '',
          urkel_unit: null,
          lightspeed_names: [lsDescription],
        });
      } else {
        await base44.entities.ProductMapping.create({
          urkel_product_name: '__SKIPPED__',
          urkel_color: '',
          urkel_unit: null,
          lightspeed_names: [lsDescription],
          confirmed: true,
        });
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries(['ls-catalog']);
      clearRow(vars.lsDescription);
      toast.success(`Skipped: ${vars.lsDescription}`);
    },
    onError: (err) => toast.error(`Skip failed: ${err.message}`),
    onSettled: (_, __, vars) => setSkippingRows(prev => { const n = { ...prev }; delete n[vars.lsDescription]; return n; }),
  });

  const unskipMutation = useMutation({
    mutationFn: async ({ lsDescription }) => {
      const existing = mappingLookup[lsDescription.toLowerCase()];
      if (existing) await base44.entities.ProductMapping.delete(existing.id);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries(['ls-catalog']);
      toast.success(`Restored: ${vars.lsDescription}`);
    },
    onError: (err) => toast.error(`Restore failed: ${err.message}`),
  });

  const handleSaveRow = async (desc) => {
    const pending = pendingMappings[desc];
    if (!pending?.urkel_product_name) return toast.error('Please select an Urkel product first');
    const existing = mappingLookup[desc.toLowerCase()];
    setSavingRows(prev => ({ ...prev, [desc]: true }));
    saveMutation.mutate({
      lsDescription: desc,
      existingId: existing?.id || null,
      ...pending,
    });
  };

  const handleSkip = (desc) => {
    setSkippingRows(prev => ({ ...prev, [desc]: true }));
    skipMutation.mutate({ lsDescription: desc });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">Loading Lightspeed catalog...</p>
        <p className="text-gray-400 text-sm mt-1">Fetching High Format, Unilock & Fendt products</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="max-w-2xl mx-auto p-8 text-center">
      <p className="text-red-600 font-semibold">Failed to load catalog: {error.message}</p>
      <Button className="mt-4" onClick={() => refetch()}>Retry</Button>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 md:p-6 mb-6 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to={createPageUrl('Settings')}>
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lightspeed Product Mapping</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {totalMapped} of {uniqueItems.length} products mapped · {totalSkipped} skipped
                {totalWarnings > 0 && (
                  <span className="ml-2 text-amber-600 font-medium">· ⚠️ {totalWarnings} warnings</span>
                )}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input className="pl-9" placeholder="Search LS products..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="unmapped">Unmapped only</SelectItem>
              <SelectItem value="mapped">Mapped only</SelectItem>
              <SelectItem value="skipped">Skipped only</SelectItem>
              <SelectItem value="warnings">⚠️ Warnings only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-4 md:mx-6 mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Mapping progress</span>
          <span>{Math.round((totalMapped / Math.max(uniqueItems.length - totalSkipped, 1)) * 100)}%</span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${(totalMapped / Math.max(uniqueItems.length - totalSkipped, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Table by category */}
      <div className="px-4 md:px-6 space-y-4">
        {Object.entries(groupedByCategory).map(([categoryName, categoryItems]) => {
          const isCollapsed = collapsedCategories[categoryName];
          const mappedCount = categoryItems.filter(i => {
            const m = mappingLookup[i.description.toLowerCase()];
            return m && m.urkel_product_name !== '__SKIPPED__';
          }).length;
          const skippedCount = categoryItems.filter(i => isSkipped(i.description)).length;
          const warningCount = categoryItems.filter(i => {
            const m = mappingLookup[i.description.toLowerCase()];
            if (!m || m.urkel_product_name === '__SKIPPED__') return false;
            return getMappingWarnings(m).length > 0 || getUnitMismatchWarning(i.description, m);
          }).length;
          const activeCount = categoryItems.length - skippedCount;

          return (
            <div key={categoryName} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <button
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                onClick={() => setCollapsedCategories(prev => ({ ...prev, [categoryName]: !prev[categoryName] }))}
              >
                <div className="flex items-center gap-3">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  <span className="font-bold text-gray-900 text-lg">{categoryName}</span>
                  <Badge className={mappedCount === activeCount ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                    {mappedCount}/{activeCount} mapped
                  </Badge>
                  {skippedCount > 0 && (
                    <Badge className="bg-gray-100 text-gray-500">{skippedCount} skipped</Badge>
                  )}
                  {warningCount > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {warningCount} warnings
                    </Badge>
                  )}
                </div>
              </button>

              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-8"></th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Lightspeed Product Name</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600 min-w-[200px]">Urkel Product</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600 min-w-[140px]">Color</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600 min-w-[120px]">Unit</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-28"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryItems.map((item, idx) => {
                        const desc = item.description;
                        const existingMapping = mappingLookup[desc.toLowerCase()];
                        const skipped = existingMapping?.urkel_product_name === '__SKIPPED__';
                        const isEditing = !!editingRows[desc];
                        const pending = pendingMappings[desc];
                        const isSaving = !!savingRows[desc];
                        const isSkipping = !!skippingRows[desc];
                        const isMapped = !!existingMapping && !skipped;
                        const showDropdowns = (!isMapped && !skipped) || isEditing;

                        // Warnings
                        const mappingWarnings = isMapped ? getMappingWarnings(existingMapping) : [];
                        const unitMismatch = isMapped ? getUnitMismatchWarning(desc, existingMapping) : null;
                        const allWarnings = [...mappingWarnings, ...(unitMismatch ? [unitMismatch] : [])];
                        const hasWarning = allWarnings.length > 0;

                        const selectedProduct = pending?.urkel_product_name
                          || (isEditing ? existingMapping?.urkel_product_name : '')
                          || '';
                        const availableColors = getAvailableColors(selectedProduct);
                        const availableUnits = getAvailableUnits(selectedProduct);

                        return (
                          <React.Fragment key={desc}>
                            <tr
                              className={`border-b border-gray-50 transition-colors
                                ${skipped ? 'opacity-50 bg-gray-50' : ''}
                                ${hasWarning ? 'bg-amber-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}
                                hover:bg-indigo-50/20`}
                            >
                              {/* Status icon */}
                              <td className="px-4 py-3 text-center">
                                {skipped ? (
                                  <span className="text-gray-400 text-base font-bold">—</span>
                                ) : hasWarning && !isEditing ? (
                                  <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" />
                                ) : isMapped && !isEditing ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
                                ) : pending?.urkel_product_name ? (
                                  <Circle className="w-5 h-5 text-indigo-400 mx-auto" />
                                ) : (
                                  <Circle className="w-5 h-5 text-gray-200 mx-auto" />
                                )}
                              </td>

                              {/* LS Name */}
                              <td className="px-4 py-3">
                                <span className={`font-medium ${skipped ? 'line-through text-gray-400' : isMapped && !isEditing ? 'text-gray-700' : 'text-gray-900'}`}>
                                  {desc}
                                </span>
                                {skipped && <span className="ml-2 text-xs text-gray-400 italic">skipped</span>}
                              </td>

                              {/* Urkel Product */}
                              <td className="px-4 py-3">
                                {showDropdowns ? (
                                  <Select
                                    value={pending?.urkel_product_name ?? (isEditing ? existingMapping?.urkel_product_name ?? '' : '')}
                                    onValueChange={(val) => {
                                      updatePending(desc, 'urkel_product_name', val);
                                      updatePending(desc, 'urkel_color', '');
                                      updatePending(desc, 'urkel_unit', '');
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select product..." /></SelectTrigger>
                                    <SelectContent>
                                      {urkelProducts.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-gray-600">{skipped ? '' : existingMapping?.urkel_product_name}</span>
                                )}
                              </td>

                              {/* Color */}
                              <td className="px-4 py-3">
                                {showDropdowns ? (
                                  <Select
                                    value={(pending !== undefined ? (pending.urkel_color || '__none__') : (isEditing ? existingMapping?.urkel_color || '__none__' : '__none__'))}
                                    onValueChange={(val) => updatePending(desc, 'urkel_color', val === '__none__' ? '' : val)}
                                    disabled={!selectedProduct}
                                  >
                                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={selectedProduct ? 'Color...' : '—'} /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">No color</SelectItem>
                                      {availableColors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-gray-600">{skipped ? '' : existingMapping?.urkel_color || '—'}</span>
                                )}
                              </td>

                              {/* Unit */}
                              <td className="px-4 py-3">
                                {showDropdowns ? (
                                  <Select
                                    value={(pending !== undefined ? (pending.urkel_unit || '__none__') : (isEditing ? existingMapping?.urkel_unit || '__none__' : '__none__'))}
                                    onValueChange={(val) => updatePending(desc, 'urkel_unit', val === '__none__' ? '' : val)}
                                    disabled={!selectedProduct}
                                  >
                                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={selectedProduct ? 'Unit...' : '—'} /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Any unit</SelectItem>
                                      {availableUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className={`text-gray-600 ${unitMismatch && !isEditing ? 'text-amber-600 font-semibold' : ''}`}>
                                    {skipped ? '' : existingMapping?.urkel_unit || '—'}
                                  </span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {skipped ? (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:text-indigo-600"
                                      onClick={() => unskipMutation.mutate({ lsDescription: desc })}>
                                      Restore
                                    </Button>
                                  ) : isEditing ? (
                                    <>
                                      <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700"
                                        onClick={() => handleSaveRow(desc)} disabled={isSaving}>
                                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400"
                                        onClick={() => clearRow(desc)}>
                                        Cancel
                                      </Button>
                                    </>
                                  ) : isMapped ? (
                                    <>
                                      <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:text-indigo-600"
                                        onClick={() => handleEditRow(desc, existingMapping)}>
                                        Edit
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:text-red-500"
                                        onClick={() => handleSkip(desc)} disabled={isSkipping}>
                                        {isSkipping ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Skip'}
                                      </Button>
                                    </>
                                  ) : pending?.urkel_product_name ? (
                                    <>
                                      <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700"
                                        onClick={() => handleSaveRow(desc)} disabled={isSaving}>
                                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:text-red-500"
                                        onClick={() => handleSkip(desc)} disabled={isSkipping}>
                                        Skip
                                      </Button>
                                    </>
                                  ) : (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:text-red-500"
                                      onClick={() => handleSkip(desc)} disabled={isSkipping}>
                                      {isSkipping ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Skip'}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Warning row */}
                            {hasWarning && !isEditing && (
                              <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} border-b border-amber-100`}>
                                <td></td>
                                <td colSpan={5} className="px-4 pb-2">
                                  <div className="flex flex-wrap gap-2">
                                    {allWarnings.map((w, i) => (
                                      <span key={i} className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                                        <AlertTriangle className="w-3 h-3" /> {w}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(groupedByCategory).length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No products match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
