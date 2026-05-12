import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

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
 * Safe toLowerCase — never crashes on null/undefined
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
 * Load status constants — only these three are valid
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
