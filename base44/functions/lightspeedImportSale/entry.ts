// v2 — redeployed for Fix 2 (company name in LS link dialog + skip paid notification)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LS_TOKEN_URL = 'https://cloud.lightspeedapp.com/oauth/access_token.php';

async function getAccessToken() {
  const clientId = (Deno.env.get('LIGHTSPEED_CLIENT_ID') || '').trim();
  const clientSecret = (Deno.env.get('LIGHTSPEED_CLIENT_SECRET') || '').trim();
  const refreshToken = (Deno.env.get('LIGHTSPEED_REFRESH_TOKEN') || '').trim();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(LS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Failed to get Lightspeed access token: ${text}`);
  }

  const data = JSON.parse(text);
  return data.access_token;
}

function parseUnitFromName(name) {
  const lower = name.toLowerCase();
  if (lower.includes('per pallet')) return 'Pallet';
  if (lower.includes('per layer')) return 'Layer';
  if (lower.includes('per each')) return 'Each';
  return null;
}

function parseColorFromName(name) {
  // Strip unit descriptor first, then match " - Color" at the end
  const stripped = name.replace(/\s*per\s+(pallet|layer|each)\s*/gi, '').trim();
  const match = stripped.match(/[-–]\s*([A-Za-z][A-Za-z\s]+)$/);
  return match ? match[1].trim() : null;
}

async function fetchSale(accountId, accessToken, paramName, value) {
  const url = new URL(`https://api.lightspeedapp.com/API/V3/Account/${accountId}/Sale.json`);
  url.searchParams.set(paramName, value);
  url.searchParams.set('load_relations', '["SaleLines.Item","Customer","SalePayments","SalePayments.PaymentType"]');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Lightspeed API error (${paramName}=${value}): ${text}`);
  }

  const data = JSON.parse(text);
  if (!data.Sale) return null;
  return Array.isArray(data.Sale) ? data.Sale[0] : data.Sale;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { saleNumber } = body;
    if (!saleNumber) {
      return Response.json({ error: 'saleNumber is required' }, { status: 400 });
    }

    const normalizedSaleNumber = String(parseInt(String(saleNumber).trim(), 10));
    const accountId = Deno.env.get('LIGHTSPEED_ACCOUNT_ID');

    const accessToken = await getAccessToken();

    // Try by saleID first, then by displayableID
    let sale = await fetchSale(accountId, accessToken, 'saleID', normalizedSaleNumber);
    if (!sale) {
      sale = await fetchSale(accountId, accessToken, 'displayableID', normalizedSaleNumber);
    }

    if (!sale) {
      return Response.json({ error: `Sale #${normalizedSaleNumber} not found in Lightspeed` }, { status: 404 });
    }

    // Extract customer name and company name separately
    // Customer entity: name = contact person, company = business name
    // Order entity: customer_name = contact person, company_name = business name
    let customerName = 'Unknown Customer';
    let companyName = '';
    if (sale.Customer) {
      const fn = (sale.Customer.firstName || '').trim();
      const ln = (sale.Customer.lastName || '').trim();
      const fullName = (fn + ' ' + ln).trim();
      companyName = (sale.Customer.companyName || '').trim();
      // If there's a real person name, use it as customer_name; otherwise fall back to company name
      customerName = fullName || 'Unknown Customer';
    } else if (sale.customerName) {
      customerName = sale.customerName;
    }

    // Extract sale lines
    let saleLines = [];
    if (sale.SaleLines && sale.SaleLines.SaleLine) {
      const lines = sale.SaleLines.SaleLine;
      saleLines = Array.isArray(lines) ? lines : [lines];
    }

    // Filter valid product lines — use Item.description as the product name
    const IGNORED_ITEM_NAMES = ['High Format Pallet', 'Unilock Pallet', 'Fendt Pallet'];
    saleLines = saleLines.filter(l => {
      if (!l.Item || !l.Item.description || parseFloat(l.unitQuantity) <= 0) return false;
      if (IGNORED_ITEM_NAMES.includes(l.Item.description.trim())) return false;
      return true;
    });

    // Load all ProductMappings once
    const allMappings = await base44.entities.ProductMapping.list('-created_date', 500);

    // Match each line item
    const lineItems = saleLines.map(line => {
      const lsName = (line.Item?.description || '').trim();
      const qty = parseFloat(line.unitQuantity) || 1;
      const unitType = parseUnitFromName(lsName);
      const parsedColor = parseColorFromName(lsName);

      const matchingMappings = allMappings.filter(m =>
        Array.isArray(m.lightspeed_names) &&
        m.lightspeed_names.some(n => n.trim().toLowerCase() === lsName.trim().toLowerCase()) &&
        (!m.urkel_unit || m.urkel_unit === unitType)
      );

      // Part 4: Use parsedColor as tiebreaker for ambiguous color matches
      const colorOptions = [...new Set(matchingMappings.map(m => m.urkel_color || ''))];
      let colorAmbiguous = colorOptions.length > 1;
      let resolvedMapping = matchingMappings[0] || null;

      if (colorAmbiguous && parsedColor) {
        const colorMatch = matchingMappings.find(
          m => (m.urkel_color || '').toLowerCase() === parsedColor.toLowerCase()
        );
        if (colorMatch) {
          resolvedMapping = colorMatch;
          colorAmbiguous = false;
        }
      }

      // Part 2: Validate mapping color against parsed color — mismatch = treat as unmatched
      let colorMismatch = false;
      let mismatchedColor = null;
      if (resolvedMapping && parsedColor && resolvedMapping.urkel_color &&
          resolvedMapping.urkel_color.toLowerCase() !== parsedColor.toLowerCase()) {
        resolvedMapping = null;
        colorMismatch = true;
        mismatchedColor = parsedColor;
      }

      return {
        ls_name: lsName,
        quantity: qty,
        unit_type: (resolvedMapping && resolvedMapping.urkel_unit) ? resolvedMapping.urkel_unit : unitType,
        parsed_color: parsedColor,
        urkel_product_name: resolvedMapping ? resolvedMapping.urkel_product_name : null,
        urkel_color: resolvedMapping ? (resolvedMapping.urkel_color || '') : null,
        matched: !!resolvedMapping,
        color_ambiguous: colorAmbiguous,
        color_options: colorAmbiguous ? colorOptions : undefined,
        color_mismatch: colorMismatch || undefined,
        mapping_color: colorMismatch ? (matchingMappings[0]?.urkel_color || '') : undefined,
      };
    });

    // Determine payment status — three-tier approach:
    // 1) Resolve PaymentType name from the payment object
    // 2) Check sale.paymentStatus field
    // 3) Fetch PaymentType directly from Lightspeed API by ID
    // Fallback: if no SalePayments at all, use paymentStatus field directly
    let paidAtSale = false;
    if (!sale.SalePayments || !sale.SalePayments.SalePayment) {
      const ps = (sale.paymentStatus || sale.PaymentStatus || '').toLowerCase();
      paidAtSale = ps === 'paid';
    } else if (sale.SalePayments && sale.SalePayments.SalePayment) {
      const payments = Array.isArray(sale.SalePayments.SalePayment)
        ? sale.SalePayments.SalePayment
        : [sale.SalePayments.SalePayment];

      // Tier 1: Try to resolve name directly from payment objects
      const nameResolved = payments.some(p => {
        const raw =
          (typeof p.PaymentType === 'object' && p.PaymentType !== null ? p.PaymentType.name : null) ||
          (typeof p.paymentType === 'object' && p.paymentType !== null ? p.paymentType.name : null) ||
          (typeof p.PaymentType === 'string' ? p.PaymentType : null) ||
          (typeof p.paymentType === 'string' ? p.paymentType : null) ||
          p.PaymentTypeName || p.paymentTypeName || null;
        if (raw) {
          const t = String(raw).toLowerCase().replace(/[_\s-]/g, '');
          const typeField = String(
            (typeof p.PaymentType === 'object' ? p.PaymentType?.type : '') || ''
          ).toLowerCase().replace(/[_\s-]/g, '');

          const isAccountCharge =
            t === 'account' || t === 'onaccount' || t === 'creditaccount' ||
            typeField === 'creditaccount' || typeField === 'account' ||
            (typeof p.PaymentType === 'object' && p.PaymentType?.internalReserved === 'true' && p.PaymentType?.code === 'SCA');

          return !isAccountCharge && t !== '';
        }
        return false;
      });

      if (nameResolved) {
        paidAtSale = true;
      } else {
        // Tier 2: Check sale.paymentStatus field
        const ps = (sale.paymentStatus || sale.PaymentStatus || '').toLowerCase();
        if (ps === 'paid') {
          paidAtSale = true;
        } else if (ps === 'due' || ps === 'partial') {
          paidAtSale = false;
        } else {
          // Tier 3: Fetch the PaymentType record directly from Lightspeed by ID
          const firstPayment = payments[0];
          const typeId = firstPayment?.paymentTypeID || firstPayment?.PaymentTypeID;
          if (typeId) {
            const ptRes = await fetch(
              `https://api.lightspeedapp.com/API/V3/Account/${accountId}/PaymentType/${typeId}.json`,
              { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
            );
            if (ptRes.ok) {
              const ptData = await ptRes.json();
              const pt = ptData.PaymentType || {};
              const ptName = (pt.name || '').toLowerCase().replace(/[_\s-]/g, '');
              const ptType = (pt.type || '').toLowerCase().replace(/[_\s-]/g, '');
              const isAccountCharge =
                ptName === 'account' || ptName === 'onaccount' || ptName === 'creditaccount' ||
                ptType === 'creditaccount' || ptType === 'account' ||
                (pt.internalReserved === 'true' && pt.code === 'SCA');
              paidAtSale = !isAccountCharge && ptName !== '';
            }
          }
        }
      }
    }


    return Response.json({
      sale_number: normalizedSaleNumber,
      customer_name: customerName,
      company_name: companyName,
      line_items: lineItems,
      paid_at_sale: paidAtSale,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});