import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, AlertCircle, CheckCircle2, User } from 'lucide-react';
import { toast } from 'sonner';
import RemapItemRow from './RemapItemRow';

export default function LightspeedImportDialog({ isOpen, onClose, orderId, existingReceipts, onItemsCreated, getLocalDateString }) {
  const [saleNumber, setSaleNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null); // { receiptNumber, customerName }

  // Customer link step
  const [showLinkCustomer, setShowLinkCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [allCustomers, setAllCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [linkedCustomerId, setLinkedCustomerId] = useState(null);
  const searchRef = useRef(null);

  // Products for remap + pending mapping saves: { ls_name, urkel_product_name, urkel_color, urkel_unit }
  const [products, setProducts] = useState([]);
  const [pendingMappings, setPendingMappings] = useState([]);

  const handleFetch = async () => {
    if (!saleNumber.trim()) return;
    setLoading(true);
    setPreview(null);
    setDuplicateWarning(null);

    // Check for existing receipt across all orders
    try {
      const existingReceipts = await base44.entities.Receipt.filter({ receipt_number: saleNumber.trim() });
      if (existingReceipts.length > 0) {
        const match = existingReceipts[0];
        let customerName = 'another order';
        try {
          const orders = await base44.entities.Order.filter({ id: match.order_id });
          if (orders.length > 0 && orders[0].customer_name) {
            customerName = orders[0].customer_name;
          }
        } catch {}
        setDuplicateWarning({ receiptNumber: saleNumber.trim(), customerName });
        setLoading(false);
        return;
      }
    } catch {}

    try {
      const res = await base44.functions.invoke('lightspeedImportSale', { saleNumber: saleNumber.trim() });
      setPreview(res.data);

      // Load customers + products for remapping
      const [customers, prods] = await Promise.all([
        base44.entities.Customer.list('-created_date', 500),
        base44.entities.Product.list('name', 500),
      ]);
      setProducts(prods);
      setAllCustomers(customers);
      setSelectedCustomer(null);
      setLinkedCustomerId(null);

      // Auto-match against Lightspeed customer name
      const lsPersonName = (res.data?.customer_name || '').toLowerCase().trim();
      const lsCompanyName = (res.data?.company_name || '').toLowerCase().trim();
      if (lsPersonName && lsPersonName !== 'unknown customer') {
        // Try to match against both the contact name AND the company name from Lightspeed
        const match = customers.find(c => {
          const cName = (c.name || '').toLowerCase().trim();
          const cCompany = (c.company || '').toLowerCase().trim();
          // Exact company match first (most reliable)
          if (lsCompanyName && (cCompany === lsCompanyName || cName === lsCompanyName)) return true;
          // Then try person name
          if (cName === lsPersonName || cCompany === lsPersonName) return true;
          // Partial match fallback
          if (lsCompanyName && (cCompany.includes(lsCompanyName) || lsCompanyName.includes(cCompany))) return true;
          if (cName.includes(lsPersonName) || lsPersonName.includes(cName)) return true;
          return false;
        });
        if (match) {
          setCustomerSearch(match.company || match.name);
          setSelectedCustomer(match);
          setLinkedCustomerId(match.id);
          // Auto-matched — skip the link step, show inline confirmation instead
          setShowLinkCustomer(false);
        } else {
          setCustomerSearch(res.data.company_name || res.data.customer_name || '');
          // No auto-match — only show link step if this is NOT being added to an existing order
          if (!orderId) setShowLinkCustomer(true);
        }
      }
    } catch (err) {
      toast.error('Failed to fetch sale: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemap = (idx, remapData) => {
    const originalItem = preview?.line_items?.[idx];
    const wasAlreadyMatched = originalItem?.matched;
    const isCorrection = wasAlreadyMatched &&
      (originalItem?.urkel_product_name !== remapData.urkel_product_name ||
       originalItem?.urkel_color !== remapData.urkel_color ||
       originalItem?.unit_type !== remapData.unit_type);

    setPreview(prev => {
      const updated = [...prev.line_items];
      updated[idx] = {
        ...updated[idx],
        urkel_product_name: remapData.urkel_product_name,
        urkel_color: remapData.urkel_color,
        unit_type: remapData.unit_type,
        matched: true,
        _overridden: isCorrection || !!updated[idx]._overridden,
      };
      return { ...prev, line_items: updated };
    });
    if (remapData.saveMapping) {
      const lsName = preview.line_items[idx]?.ls_name || '';
      setPendingMappings(prev => {
        const existing = prev.findIndex(m => m.ls_name === lsName);
        const entry = {
          ls_name: lsName,
          urkel_product_name: remapData.urkel_product_name,
          urkel_color: remapData.urkel_color,
          urkel_unit: remapData.unit_type,
        };
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = entry;
          return next;
        }
        return [...prev, entry];
      });
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setConfirming(true);
    try {
      const receiptNumber = preview.sale_number;
      const today = getLocalDateString();

      // Create receipt if it doesn't already exist
      const paidAtSale = !!preview.paid_at_sale;
      const freshReceipts = await base44.entities.Receipt.filter({ order_id: orderId });
      const receiptExists = freshReceipts.some(r => r.receipt_number === receiptNumber);
      if (!receiptExists) {
        await base44.entities.Receipt.create({
          order_id: orderId,
          receipt_number: receiptNumber,
          is_paid: paidAtSale,
          skip_paid_notification: paidAtSale,
        });
      }

      // Build order items
      const itemsToCreate = preview.line_items
        .filter(li => li.matched)
        .map(li => ({
          order_id: orderId,
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

      // Save pending mappings
      for (const pm of pendingMappings) {
        const existing = await base44.entities.ProductMapping.filter({ urkel_product_name: pm.urkel_product_name });
        const match = existing.find(m => (m.lightspeed_names || []).includes(pm.ls_name));
        if (match) {
          await base44.entities.ProductMapping.update(match.id, {
            urkel_product_name: pm.urkel_product_name,
            urkel_color: pm.urkel_color,
            urkel_unit: pm.urkel_unit,
          });
        } else {
          await base44.entities.ProductMapping.create({
            urkel_product_name: pm.urkel_product_name,
            urkel_color: pm.urkel_color,
            urkel_unit: pm.urkel_unit,
            lightspeed_names: [pm.ls_name],
          });
        }
      }

      // Link customer to order if selected — also update customer_name/company_name display fields
      if (linkedCustomerId && orderId && selectedCustomer) {
        const displayName = selectedCustomer.company || selectedCustomer.name || '';
        const personName = selectedCustomer.name || '';
        await base44.entities.Order.update(orderId, {
          customer_id: linkedCustomerId,
          // company_name drives the header display; customer_name is the contact person
          company_name: selectedCustomer.company || '',
          customer_name: displayName,
          ...(selectedCustomer.phone ? { customer_phone: selectedCustomer.phone } : {}),
          ...(selectedCustomer.address ? { job_address: selectedCustomer.address } : {}),
        });
      } else if (linkedCustomerId && orderId) {
        await base44.entities.Order.update(orderId, { customer_id: linkedCustomerId });
      }

      toast.success(`Imported ${itemsToCreate.length} item(s) from sale #${receiptNumber}`);
      onItemsCreated();
      handleClose();
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
    setDuplicateWarning(null);
    setShowLinkCustomer(false);
    setCustomerSearch('');
    setAllCustomers([]);
    setSelectedCustomer(null);
    setLinkedCustomerId(null);
    setShowDropdown(false);
    setPendingMappings([]);
    onClose();
  };

  const filteredCustomers = customerSearch.length >= 2
    ? allCustomers.filter(c =>
        (c.name || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.company || '').toLowerCase().includes(customerSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  const unmatchedCount = preview?.line_items?.filter(li => !li.matched).length || 0;
  const matchedCount = preview?.line_items?.filter(li => li.matched).length || 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from Lightspeed</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Duplicate Warning */}
          {duplicateWarning && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>
                  <strong>Receipt #{duplicateWarning.receiptNumber}</strong> has already been imported on order <strong>{duplicateWarning.customerName}</strong>.
                </span>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleClose}>OK</Button>
              </div>
            </div>
          )}

          {/* Sale Number Input */}
          {!duplicateWarning && (
          <div className="flex gap-2">
            <Input
              placeholder="Enter sale number..."
              value={saleNumber}
              onChange={e => setSaleNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && handleFetch()}
              disabled={loading || confirming}
            />
            <Button onClick={handleFetch} disabled={!saleNumber.trim() || loading || confirming}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fetch'}
            </Button>
          </div>
          )}

          {/* Link Customer Step */}
          {!duplicateWarning && showLinkCustomer && preview && (
            <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-600" />
                <h3 className="font-semibold text-gray-900 text-sm">Link to Existing Customer?</h3>
              </div>
              {preview.customer_name && preview.customer_name !== 'Unknown Customer' && (
                <p className="text-xs text-gray-500">Lightspeed customer: <span className="font-semibold text-gray-700">{selectedCustomer ? (selectedCustomer.company || selectedCustomer.name) : preview.customer_name}</span></p>
              )}
              <div className="relative">
                <Input
                  ref={searchRef}
                  placeholder="Search customers..."
                  value={customerSearch}
                  onChange={e => {
                    setCustomerSearch(e.target.value);
                    setSelectedCustomer(null);
                    setLinkedCustomerId(null);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="bg-white"
                />
                {showDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm border-b last:border-0"
                        onMouseDown={() => {
                          setSelectedCustomer(c);
                          setLinkedCustomerId(c.id);
                          setCustomerSearch(c.company || c.name);
                          setShowDropdown(false);
                        }}
                      >
                        <div className="font-medium text-gray-900">{c.company || c.name}</div>
                        {c.company && c.name && c.company !== c.name && (
                          <div className="text-xs text-gray-500">Contact: {c.name}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedCustomer && (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Linked to: <span className="font-semibold">{selectedCustomer.company || selectedCustomer.name}</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setLinkedCustomerId(null); setSelectedCustomer(null); setShowLinkCustomer(false); }}
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => setShowLinkCustomer(false)}
                >
                  {selectedCustomer ? 'Link & Continue' : 'Continue'}
                </Button>
              </div>
            </div>
          )}

          {/* Preview */}
          {!duplicateWarning && !showLinkCustomer && preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-1 text-sm text-gray-600">
                <div>
                  <span className="font-semibold">Sale #{preview.sale_number}</span>
                  {preview.customer_name && preview.customer_name !== 'Unknown Customer' && (
                    <span className="ml-2 text-gray-500">— {preview.customer_name}</span>
                  )}
                  {preview.paid_at_sale === false && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Unpaid</span>
                  )}
                </div>
                {/* Inline customer link indicator */}
                {selectedCustomer ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-green-700 font-medium">{selectedCustomer.company || selectedCustomer.name}</span>
                    <button type="button" className="text-gray-400 underline hover:text-indigo-600 ml-1" onClick={() => setShowLinkCustomer(true)}>change</button>
                  </div>
                ) : (
                  <button type="button" className="text-xs text-indigo-600 underline hover:text-indigo-800" onClick={() => setShowLinkCustomer(true)}>
                    Link customer
                  </button>
                )}
              </div>

              {preview.line_items.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No line items found on this sale.</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
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
                      {preview.line_items.map((li, idx) => (
                        <RemapItemRow
                          key={idx}
                          li={li}
                          idx={idx}
                          products={products}
                          onRemap={handleRemap}
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
                    Add mappings on the Product Catalog page.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!duplicateWarning && <Button variant="outline" onClick={handleClose}>Cancel</Button>}
          {preview && matchedCount > 0 && !showLinkCustomer && (
            <Button onClick={handleConfirm} disabled={confirming} className="bg-indigo-600 hover:bg-indigo-700">
              {confirming ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Import {matchedCount} Item{matchedCount > 1 ? 's' : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}