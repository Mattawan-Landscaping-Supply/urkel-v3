import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDraftFormData, loadDraftFormData, clearDraftFormData } from '@/hooks/useDraftFormData';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { 
  Accordion, AccordionContent, AccordionItem, AccordionTrigger 
} from "@/components/ui/accordion";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Package, Palette, ChevronRight, Loader2, X, ShoppingCart, Search, Trash2, Edit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import LightspeedNamesEditor from '@/components/lightspeed/LightspeedNamesEditor';

function ProductQuickAdd({ product, onAdd, onEdit, onDelete, disabled }) {
  const [selectedColor, setSelectedColor] = React.useState('');
  const [selectedUnit, setSelectedUnit] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);

  const colors = product.colors && product.colors.length > 0 ? product.colors : [];
  const units = product.units && product.units.length > 0 ? product.units : ['Each'];
  const hasColors = colors.length > 0;

  React.useEffect(() => {
    if (!selectedColor && colors.length > 0) {
      setSelectedColor(colors[0]);
    }
    if (!selectedUnit) {
      setSelectedUnit(units[0]);
    }
  }, [colors, units, selectedColor, selectedUnit]);

  const handleAdd = () => {
    if (!selectedUnit || disabled) return;
    onAdd(selectedColor || 'Default', selectedUnit, quantity);
    setSelectedColor(hasColors ? colors[0] : '');
    setSelectedUnit(units[0]);
    setQuantity(1);
  };

  return (
    <div className="border rounded-md p-1.5 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="font-medium text-sm">{product.name}</div>
        <div className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(product);
            }}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Edit product"
          >
            <Edit className="w-3.5 h-3.5 text-gray-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(product);
            }}
            className="p-1 hover:bg-red-100 rounded transition-colors"
            title="Delete product"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {hasColors && (
          <div className="flex flex-wrap gap-1.5">
            {colors.map(color => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`px-2 py-1 rounded text-xs border-2 transition-colors ${
                  selectedColor === color 
                    ? 'bg-indigo-600 border-indigo-600 text-white font-bold shadow-md' 
                    : 'bg-white border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'
                }`}
              >
                {color}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 items-center">
          <Select value={selectedUnit} onValueChange={setSelectedUnit}>
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map(unit => (
                <SelectItem key={unit} value={unit}>{unit}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-14 px-2 py-1 border rounded text-xs text-center"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!selectedUnit || disabled}
            className="h-7 px-3 bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add To Cart
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProductCatalogDialog({ isOpen, onOpenChange, onAddItem, onAddItems, onAllItemsAdded, initialReceiptNumber, initialIsQuote = false, existingReceipts = [], existingQuotes = [], hideQuotes = false }) {
  const [activeCategory, setActiveCategory] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [currentReceiptNumber, setCurrentReceiptNumber] = useState('');
  const [isQuote, setIsQuote] = useState(false);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customItem, setCustomItem] = useState({ name: '', color: '', unit: 'Each', quantity: 1, weight: '' });
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const queryClient = useQueryClient();

  // Auto-save draft data whenever dialog is open
  useDraftFormData(isOpen, cart, currentReceiptNumber, isQuote, customItem, searchTerm);

  React.useEffect(() => {
    if (isOpen) {
        // Try to load draft data first
        const draft = loadDraftFormData();
        
        // Use initial values if provided, otherwise use draft
        setCurrentReceiptNumber(initialReceiptNumber || draft.receipt);
        setIsQuote(initialIsQuote !== undefined ? initialIsQuote : draft.isQuote);
        setCart(draft.cart);
        setSelectedProduct(null);
        setOrderItem({ quantity: 1, color: '', unit: '' });
        setSearchTerm(draft.searchTerm);
        setIsAddingCustom(false);
        setCustomItem(draft.customItem);
        setEditingProduct(null);
        setIsCreating(false);
        }
        }, [isOpen, initialReceiptNumber, initialIsQuote]);

        // Form states
        const [newProduct, setNewProduct] = useState({ name: '', category: 'High Format', colors: '', units: 'Pallet, Each, Layer', weight_pallet: '', weight_each: '', weight_layer: '', pallet_width: '', pallet_depth: '', counts_as_single_pallet: false, counts_as_pallet: true, lightspeed_names: {}, lightspeed_color: '' });
  const [orderItem, setOrderItem] = useState({ quantity: 1, color: '', unit: '' });

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list()
  });

  const createProductMutation = useMutation({
    mutationFn: (data) => {
      // Convert comma separated colors string to array
      const colorsArray = data.colors.split(',').map(c => c.trim()).filter(c => c !== '');
      // Convert comma separated units string to array
      const unitsArray = data.units.split(',').map(u => u.trim()).filter(u => u !== '');
      return base44.entities.Product.create({
        name: data.name,
        category: data.category,
        colors: colorsArray,
        units: unitsArray.length > 0 ? unitsArray : ['Pallet', 'Each', 'Layer'],
        weight_pallet: data.weight_pallet ? parseFloat(data.weight_pallet) : undefined,
        weight_each: data.weight_each ? parseFloat(data.weight_each) : undefined,
        weight_layer: data.weight_layer ? parseFloat(data.weight_layer) : undefined,
        pallet_width: parseFloat(data.pallet_width),
        pallet_depth: parseFloat(data.pallet_depth),
        counts_as_single_pallet: data.counts_as_single_pallet || false,
        counts_as_pallet: data.counts_as_pallet !== false,
        lightspeed_names: data.lightspeed_names,
        lightspeed_color: data.lightspeed_color || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
      setIsCreating(false);
      // Only reset if not editing a product
      if (!editingProduct) {
        setNewProduct({ name: '', category: activeCategory, colors: '', units: 'Pallet, Each, Layer', weight_pallet: '', weight_each: '', weight_layer: '', pallet_width: 3.5, pallet_depth: 4, counts_as_single_pallet: false, counts_as_pallet: true, lightspeed_names: {}, lightspeed_color: '' });
      }
    }
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const colorsArray = data.colors.split(',').map(c => c.trim()).filter(c => c !== '');
      const unitsArray = data.units.split(',').map(u => u.trim()).filter(u => u !== '');
      return base44.entities.Product.update(id, {
        name: data.name,
        category: data.category,
        colors: colorsArray,
        units: unitsArray.length > 0 ? unitsArray : ['Pallet', 'Each', 'Layer'],
        weight_pallet: data.weight_pallet ? parseFloat(data.weight_pallet) : undefined,
        weight_each: data.weight_each ? parseFloat(data.weight_each) : undefined,
        weight_layer: data.weight_layer ? parseFloat(data.weight_layer) : undefined,
        pallet_width: parseFloat(data.pallet_width),
        pallet_depth: parseFloat(data.pallet_depth),
        counts_as_single_pallet: data.counts_as_single_pallet || false,
        counts_as_pallet: data.counts_as_pallet !== false,
        lightspeed_names: data.lightspeed_names,
        lightspeed_color: data.lightspeed_color || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
      // Do NOT close the edit panel — user may want to continue editing other products
    }
  });

  const deleteProductMutation = useMutation({
    mutationFn: (productId) => base44.entities.Product.delete(productId),
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
      setProductToDelete(null);
    }
  });

  const handleAddToCart = (e) => {
    e?.stopPropagation();
    if (!selectedProduct || !orderItem.color || !orderItem.unit || !currentReceiptNumber.trim()) return;
    setCart([...cart, {
      product_name: selectedProduct.name,
      quantity: parseInt(orderItem.quantity),
      selected_color: orderItem.color,
      selected_unit: orderItem.unit,
      receipt_number: currentReceiptNumber.trim(),
      is_quote: isQuote
    }]);
    setSelectedProduct(null);
    setOrderItem({ quantity: 1, color: '', unit: '' });
  };

  const handleRemoveFromCart = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const handleConfirmOrder = async () => {
    if (onAddItems) {
      // Bulk add all cart items in one call
      await onAddItems(cart);
    } else {
      // Fallback: sequential add (legacy)
      for (const item of cart) {
        await onAddItem(item);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    setCart([]);
    clearDraftFormData(); // Clear saved draft after successful submission
    onOpenChange(false);
    if (onAllItemsAdded) {
      setTimeout(() => onAllItemsAdded(), 500);
    }
  };

  const categories = ["High Format", "Unilock", "Fendt", "Other"];

  const filteredProducts = (category) => {
    let filtered = products?.filter(p => p.category === category) || [];
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        (p.name || '').toLowerCase().includes(search) ||
        p.colors?.some(c => c.toLowerCase().includes(search))
      );
    }
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className="w-full max-w-6xl h-[92vh] overflow-hidden flex flex-col p-3"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (selectedProduct || isCreating) {
            e.preventDefault();
            setSelectedProduct(null);
            setIsCreating(false);
          }
        }}
      >
      <DialogHeader className="px-0 py-0 mb-2">
        <DialogTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" /> Product Catalog
        </DialogTitle>
      </DialogHeader>

      {/* Two-column layout: Left (controls + categories) and Right (cart) */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row gap-3 min-h-0">
        {/* Left column: Receipt selector + search + buttons + product categories */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Receipt Number Selection */}
          <div className="mb-1.5 p-2 bg-indigo-50 border-2 border-indigo-300 rounded-lg shrink-0">
            {!hideQuotes && (
              <div className="flex gap-1 mb-1.5 w-fit">
                <Button
                  type="button"
                  size="sm"
                  className={`h-8 text-xs px-2 ${!isQuote ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'}`}
                  onClick={() => setIsQuote(false)}
                >
                  Receipt
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={`h-8 text-xs px-2 ${isQuote ? 'bg-red-600 border-red-600 text-white hover:bg-red-700' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'}`}
                  onClick={() => setIsQuote(true)}
                >
                  Quote
                </Button>
              </div>
            )}
            <Select 
              value={currentReceiptNumber} 
              onValueChange={(val) => {
                if (val === '__new__') {
                  const num = prompt(isQuote ? "Enter new Quote Number:" : "Enter new Receipt Number:");
                  if (num && num.trim()) {
                    setCurrentReceiptNumber(num.trim());
                  }
                } else {
                  setCurrentReceiptNumber(val);
                }
              }}
            >
              <SelectTrigger className="h-9 bg-white w-48">
                <SelectValue placeholder={`Select ${isQuote ? 'Quote' : 'Receipt'} # or Add New`}>
                  {currentReceiptNumber && `#${currentReceiptNumber}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__" className="font-medium text-indigo-600">+ Add New {isQuote ? 'Quote' : 'Receipt'}</SelectItem>
                {initialReceiptNumber && (
                  <SelectItem value={initialReceiptNumber}>#{initialReceiptNumber}</SelectItem>
                )}
                {(isQuote ? existingQuotes : existingReceipts)
                  .filter(num => num !== initialReceiptNumber)
                  .map(num => (
                    <SelectItem key={num} value={num}>#{num}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search Bar and Action Buttons */}
          <div className="flex flex-col gap-1.5 mb-1.5 shrink-0">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input 
                className="pl-9 bg-white shadow-sm border-gray-400 h-9 w-full"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-dashed border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 h-9 flex-1"
                onClick={() => {
                  setIsCreating(true);
                  setNewProduct({ name: '', category: 'High Format', colors: '', units: 'Pallet, Each, Layer', weight_pallet: '', weight_each: '', weight_layer: '', pallet_width: '', pallet_depth: '', counts_as_single_pallet: false, counts_as_pallet: true, lightspeed_names: {}, lightspeed_color: '' });
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Product
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-dashed border-2 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 h-9 flex-1"
                onClick={() => setIsAddingCustom(true)}
                disabled={!currentReceiptNumber.trim()}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Custom Item
              </Button>
            </div>
          </div>

          {/* Product Categories - scrollable */}
          <div className="flex-1 overflow-y-auto pr-1 min-h-0">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
          ) : (
            <Accordion type="single" collapsible value={activeCategory} onValueChange={setActiveCategory}>
              {categories.map(category => {
                const categoryProducts = filteredProducts(category);
                if (searchTerm.trim() && categoryProducts.length === 0) return null;

                return (
                <AccordionItem key={category} value={category} className="border-2 border-gray-400 rounded-lg px-2 mb-1.5">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <span className="font-semibold text-lg">{category}</span>
                      {searchTerm.trim() && <span className="text-sm text-gray-500">{categoryProducts.length} results</span>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-1 max-h-[400px] overflow-y-auto">
                    <div className="space-y-1.5 mb-1">
                      {filteredProducts(category).map(product => (
                        <ProductQuickAdd
                         key={product.id}
                         product={product}
                         onAdd={(color, unit, quantity) => {
                           if (!currentReceiptNumber.trim()) {
                             alert('Please select or enter a receipt number before adding products.');
                             return;
                           }
                           setCart(prev => [...prev, {
                             product_name: product.name,
                             quantity: parseInt(quantity),
                             selected_color: color,
                             selected_unit: unit,
                             category: product.category,
                             receipt_number: currentReceiptNumber.trim(),
                             is_quote: isQuote
                           }]);
                         }}
                         onEdit={(product) => {
                           setNewProduct({
                             name: product.name,
                             category: product.category,
                             colors: product.colors?.join(', ') || '',
                             units: product.units?.join(', ') || 'Pallet, Each, Layer',
                             weight_pallet: product.weight_pallet || '',
                             weight_each: product.weight_each || '',
                             weight_layer: product.weight_layer || '',
                             pallet_width: product.pallet_width || 3.5,
                             pallet_depth: product.pallet_depth || 4,
                             counts_as_single_pallet: product.counts_as_single_pallet || false,
                             counts_as_pallet: product.counts_as_pallet !== false,
                             lightspeed_names: product.lightspeed_names || {},
                             lightspeed_color: product.lightspeed_color || ''
                           });
                           setEditingProduct(product);
                         }}
                         onDelete={(product) => setProductToDelete(product)}
                         disabled={!currentReceiptNumber.trim()}
                        />
                      ))}
                      {filteredProducts(category).length === 0 && (
                        <div className="col-span-full text-center text-gray-400 py-4 italic text-sm">
                          No products in this category yet.
                        </div>
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full border-dashed"
                      onClick={() => {
                        setIsCreating(true);
                        setNewProduct({ name: '', category: category, colors: '', units: 'Pallet, Each, Layer', weight_pallet: '', weight_each: '', weight_layer: '', pallet_width: '', pallet_depth: '', counts_as_single_pallet: false, counts_as_pallet: true, lightspeed_names: {}, lightspeed_color: '' });
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" /> Add New {category} Product
                    </Button>
                  </AccordionContent>
                </AccordionItem>
                );
              })}
            </Accordion>
          )}
          </div>
        </div>{/* end left column */}

        {/* Right: Shopping Cart - full height */}
        <div className="w-full md:w-56 shrink-0 flex flex-col border-2 border-indigo-200 bg-indigo-50 rounded-lg p-2 min-h-0">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-indigo-900">Cart ({cart.length})</h3>
          </div>
          {cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-400 italic text-center px-2">
              Add products from the left to build your cart
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto space-y-1.5 mb-2">
                {cart.map((item, index) => (
                  <div key={index} className="flex items-start justify-between bg-white p-2 rounded text-xs gap-1">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.product_name}</div>
                      <div className="text-gray-500">{item.quantity}x {item.selected_color} · {item.selected_unit}</div>
                      <div className="text-gray-400">#{item.receipt_number}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-gray-400 hover:text-red-500 shrink-0"
                      onClick={() => handleRemoveFromCart(index)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button 
                onClick={handleConfirmOrder}
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                size="sm"
              >
                Add All to Order
              </Button>
            </>
          )}
        </div>
      </div>

        {/* Custom Item Dialog */}
        {isAddingCustom && (
          <div className="absolute inset-0 bg-white/95 z-50 flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4">Add Custom Item</h3>
            <div className="space-y-4 flex-1 overflow-y-auto">
            <div className="grid gap-2">
            <Label>Product Name</Label>
            <Input 
              value={customItem.name}
              onChange={(e) => setCustomItem({...customItem, name: e.target.value})}
              placeholder="e.g. Special Order Item"
            />
            </div>
            <div className="grid gap-2">
            <Label>Color</Label>
            <Input 
              value={customItem.color}
              onChange={(e) => setCustomItem({...customItem, color: e.target.value})}
              placeholder="e.g. Red"
            />
            </div>
            <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Unit</Label>
              <Select value={customItem.unit} onValueChange={(val) => setCustomItem({...customItem, unit: val})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pallet">Pallet</SelectItem>
                  <SelectItem value="Each">Each</SelectItem>
                  <SelectItem value="Layer">Layer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Quantity</Label>
              <Input 
                type="number"
                min="1"
                value={customItem.quantity}
                onChange={(e) => setCustomItem({...customItem, quantity: Math.max(1, parseInt(e.target.value) || 1)})}
              />
            </div>
            </div>
            <div className="grid gap-2">
              <Label>Weight per {customItem.unit} (lbs) <span className="text-gray-400 font-normal">— optional</span></Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={customItem.weight}
                onChange={(e) => setCustomItem({...customItem, weight: e.target.value})}
                placeholder="e.g. 2200"
              />
            </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => {
                setIsAddingCustom(false);
                setCustomItem({ name: '', color: '', unit: 'Each', quantity: 1 });
              }}>Cancel</Button>
              <Button 
                onClick={() => {
                  if (!currentReceiptNumber.trim()) {
                    alert('Please select or enter a receipt number before adding items.');
                    return;
                  }
                  setCart(prev => [...prev, {
                    product_name: customItem.name.trim() || 'Custom Item',
                    quantity: parseInt(customItem.quantity) || 1,
                    selected_color: customItem.color.trim() || 'N/A',
                    selected_unit: customItem.unit,
                    category: 'Other',
                    receipt_number: currentReceiptNumber.trim(),
                    is_quote: isQuote,
                    // Weight is in lbs — no conversion needed
                    ...(customItem.weight ? { weight: parseFloat(customItem.weight) } : {})
                  }]);
                  setIsAddingCustom(false);
                  setCustomItem({ name: '', color: '', unit: 'Each', quantity: 1, weight: '' });
                }}
              >
                Add to Cart
              </Button>
            </div>
          </div>
        )}

        {/* Creation/Edit Dialog (Nested or overlay) */}
        {(isCreating || editingProduct) && (
          <div className="fixed inset-0 bg-white/95 z-50 flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-4">{editingProduct ? `Edit ${newProduct.name}` : `Add New Product to ${newProduct.category}`}</h3>
            <div className="space-y-4 flex-1 overflow-y-auto">
              <div className="grid gap-2">
                <Label>Category *</Label>
                <Select value={newProduct.category} onValueChange={(val) => setNewProduct({...newProduct, category: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["High Format", "Unilock", "Fendt", "Other"].map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Product Name *</Label>
                <Input 
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                  placeholder="e.g. Paver Stone 6x9"
                />
              </div>
              <div className="grid gap-2">
                <Label>Available Colors (comma separated)</Label>
                <Input 
                  value={newProduct.colors}
                  onChange={(e) => setNewProduct({...newProduct, colors: e.target.value})}
                  placeholder="e.g. Red, Grey, Charcoal, Tan"
                />
              </div>
              <div className="grid gap-2">
                <Label>Available Units (comma separated)</Label>
                <Input 
                  value={newProduct.units}
                  onChange={(e) => setNewProduct({...newProduct, units: e.target.value})}
                  placeholder="e.g. Pallet, Each, Layer, Bundle"
                />
                <p className="text-xs text-gray-500">Standard: Pallet, Each, Layer. You can also type any custom unit (e.g. "Bundle", "Bag", "Roll").</p>
              </div>
              {(() => {
                const unitsArray = newProduct.units.split(',').map(u => u.trim()).filter(u => u !== '');
                const hasPallet = unitsArray.includes('Pallet');
                const hasEach = unitsArray.includes('Each');
                const hasLayer = unitsArray.includes('Layer');
                return (
                  <div className={`grid gap-4 ${unitsArray.length === 1 ? 'grid-cols-1' : unitsArray.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {hasPallet && (
                      <div className="grid gap-2">
                        <Label>Weight per Pallet (lbs)</Label>
                        <Input 
                          type="number"
                          step="1"
                          value={newProduct.weight_pallet || ''}
                          onChange={(e) => setNewProduct({...newProduct, weight_pallet: e.target.value})}
                          placeholder="e.g. 2200"
                        />
                      </div>
                    )}
                    {hasEach && (
                      <div className="grid gap-2">
                        <Label>Weight per Each (lbs)</Label>
                        <Input 
                          type="number"
                          step="1"
                          value={newProduct.weight_each || ''}
                          onChange={(e) => setNewProduct({...newProduct, weight_each: e.target.value})}
                          placeholder="e.g. 55"
                        />
                      </div>
                    )}
                    {hasLayer && (
                      <div className="grid gap-2">
                        <Label>Weight per Layer (lbs)</Label>
                        <Input 
                          type="number"
                          step="1"
                          value={newProduct.weight_layer || ''}
                          onChange={(e) => setNewProduct({...newProduct, weight_layer: e.target.value})}
                          placeholder="e.g. 330"
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Pallet Width (feet) *</Label>
                  <Input 
                    type="number"
                    step="0.1"
                    min="0"
                    value={newProduct.pallet_width}
                    onChange={(e) => setNewProduct({...newProduct, pallet_width: e.target.value})}
                    placeholder="e.g. 3.5 (enter 0 if no dimensions)"
                    className={newProduct.pallet_width === '' ? 'border-red-400' : ''}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Pallet Depth (feet) *</Label>
                  <Input 
                    type="number"
                    step="0.1"
                    min="0"
                    value={newProduct.pallet_depth}
                    onChange={(e) => setNewProduct({...newProduct, pallet_depth: e.target.value})}
                    placeholder="e.g. 4 (enter 0 if no dimensions)"
                    className={newProduct.pallet_depth === '' ? 'border-red-400' : ''}
                  />
                </div>
              </div>
              {(newProduct.pallet_width === '' || newProduct.pallet_depth === '') && (
                <p className="text-xs text-red-500 -mt-2">Dimensions are required. Enter 0 × 0 if this product has no pallet dimensions.</p>
              )}
              <div className="grid gap-2">
                <Label>Lightspeed Names Mapping</Label>
                <LightspeedNamesEditor 
                  value={newProduct.lightspeed_names}
                  onChange={(val) => setNewProduct({...newProduct, lightspeed_names: val})}
                />
              </div>
              <div className="grid gap-2">
                <Label>Lightspeed Color</Label>
                <Input 
                  value={newProduct.lightspeed_color || ''}
                  onChange={(e) => setNewProduct({...newProduct, lightspeed_color: e.target.value})}
                  placeholder="e.g. Lightspeed color field"
                  className="text-xs"
                />
                <p className="text-xs text-gray-500">Optional Lightspeed color mapping.</p>
              </div>
              <div className="space-y-2">
                {newProduct.units.toLowerCase().includes('each') || newProduct.units.toLowerCase().includes('layer') ? (
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="counts_as_single_pallet"
                      checked={newProduct.counts_as_single_pallet}
                      onCheckedChange={(val) => setNewProduct({...newProduct, counts_as_single_pallet: val})}
                    />
                    <Label htmlFor="counts_as_single_pallet" className="cursor-pointer">
                      Counts as single pallet (for Each/Layer - any quantity = 1 pallet)
                    </Label>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="counts_as_pallet"
                    checked={newProduct.counts_as_pallet}
                    onCheckedChange={(val) => setNewProduct({...newProduct, counts_as_pallet: val})}
                  />
                  <Label htmlFor="counts_as_pallet" className="cursor-pointer">Counts toward pallet totals</Label>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => {
                setIsCreating(false);
                setEditingProduct(null);
                setNewProduct({ name: '', category: activeCategory, colors: '', units: 'Pallet, Each, Layer', weight_pallet: '', weight_each: '', weight_layer: '', pallet_width: '', pallet_depth: '', counts_as_single_pallet: false, counts_as_pallet: true, lightspeed_names: {}, lightspeed_color: '' });
              }}>Cancel</Button>
              <Button 
               onClick={(e) => {
                 e.preventDefault();
                 e.stopPropagation();
                 if (editingProduct) {
                   updateProductMutation.mutate({ id: editingProduct.id, data: newProduct });
                 } else {
                   createProductMutation.mutate(newProduct);
                 }
               }}
               disabled={!newProduct.name || newProduct.pallet_width === '' || newProduct.pallet_depth === '' || createProductMutation.isPending || updateProductMutation.isPending}
              >
                {(createProductMutation.isPending || updateProductMutation.isPending) ? 'Saving...' : (editingProduct ? 'Update Product' : 'Save Product')}
              </Button>
            </div>
          </div>
        )}

        {/* Delete Product Confirmation Dialog */}
        <AlertDialog open={!!productToDelete} onOpenChange={() => setProductToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {productToDelete?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this product from the catalog. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => deleteProductMutation.mutate(productToDelete.id)}
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteProductMutation.isPending}
              >
                {deleteProductMutation.isPending ? 'Deleting...' : 'Delete Product'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </DialogContent>
    </Dialog>
  );
}