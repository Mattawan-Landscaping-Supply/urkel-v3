import { useEffect } from 'react';

const STORAGE_KEYS = {
  cart: 'product_catalog_draft_cart',
  receipt: 'product_catalog_draft_receipt',
  isQuote: 'product_catalog_draft_isquote',
  customItem: 'product_catalog_draft_custom',
  searchTerm: 'product_catalog_draft_search'
};

export function useDraftFormData(isOpen, cart, currentReceiptNumber, isQuote, customItem, searchTerm) {
  // Auto-save when dialog is open and data changes
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
      localStorage.setItem(STORAGE_KEYS.receipt, currentReceiptNumber);
      localStorage.setItem(STORAGE_KEYS.isQuote, JSON.stringify(isQuote));
      localStorage.setItem(STORAGE_KEYS.customItem, JSON.stringify(customItem));
      localStorage.setItem(STORAGE_KEYS.searchTerm, searchTerm);
    }, 500); // Debounce saves by 500ms

    return () => clearTimeout(timer);
  }, [isOpen, cart, currentReceiptNumber, isQuote, customItem, searchTerm]);
}

export function loadDraftFormData() {
  try {
    return {
      cart: JSON.parse(localStorage.getItem(STORAGE_KEYS.cart)) || [],
      receipt: localStorage.getItem(STORAGE_KEYS.receipt) || '',
      isQuote: JSON.parse(localStorage.getItem(STORAGE_KEYS.isQuote)) || false,
      customItem: JSON.parse(localStorage.getItem(STORAGE_KEYS.customItem)) || { name: '', color: '', unit: 'Each', quantity: 1, weight: '' },
      searchTerm: localStorage.getItem(STORAGE_KEYS.searchTerm) || ''
    };
  } catch {
    return {
      cart: [],
      receipt: '',
      isQuote: false,
      customItem: { name: '', color: '', unit: 'Each', quantity: 1, weight: '' },
      searchTerm: ''
    };
  }
}

export function clearDraftFormData() {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
}