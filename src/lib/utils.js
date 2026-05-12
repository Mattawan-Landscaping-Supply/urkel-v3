import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export const isIframe = window.self !== window.top;

/**
 * Returns today's date as YYYY-MM-DD in local (Eastern) time.
 * Never use toISOString() for date comparisons — it shifts to UTC.
 */
export function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Safe toLowerCase — never crashes on null/undefined.
 * All string-based filters MUST use this to prevent render crashes.
 */
export function safeLower(val) {
  return (val || '').toLowerCase();
}

/**
 * Display name for an order/load: prefers company_name over customer_name
 */
export function displayName(obj) {
  return obj?.company_name || obj?.customer_name || '';
}

/**
 * Load status constants — ONLY these three are valid.
 * Never use the string 'scheduled' — it is not a valid Load status.
 */
export const LOAD_STATUS = {
  ACTIVE: 'active',
  DELIVERED: 'delivered',
  ARCHIVED: 'archived',
};

/**
 * OrderItem status constants
 */
export const ITEM_STATUS = {
  ORDER: 'order',
  IN_HOLD: 'in_hold',
  ON_DELIVERY: 'on_delivery',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
};
