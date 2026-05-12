import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Central fulfillment function: adds an OrderItem to a Load.
 * 
 * Payload:
 *   - loadId: string (required)
 *   - orderItemId: string (required)
 *   - quantity: number (required)
 */
Deno.serve(async (req) => {
  try {
    const rawBody = await req.clone().json();
    console.log('fulfillOrderItem received:', JSON.stringify(rawBody));

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { loadId, orderItemId, quantity } = await req.json();

    console.log('fulfillOrderItem called with loadId:', loadId, 'orderItemId:', orderItemId, 'quantity:', quantity);

    if (!loadId || !orderItemId || quantity == null) {
      return Response.json({ error: 'loadId, orderItemId, and quantity are required' }, { status: 400 });
    }

    const qty = Number(quantity);
    if (qty <= 0) {
      return Response.json({ error: 'quantity must be greater than 0' }, { status: 400 });
    }

    // Fetch load separately so we can return a clean 404 if it's gone (stale ID)
    let currentLoad;
    try {
      currentLoad = await base44.entities.Load.get(loadId);
    } catch (e) {
      console.error('fulfillOrderItem: Load not found for ID:', loadId, e.message);
      return Response.json({ error: 'Load not found — please refresh the page', loadNotFound: true }, { status: 404 });
    }
    if (!currentLoad) {
      return Response.json({ error: 'Load not found — please refresh the page', loadNotFound: true }, { status: 404 });
    }

    // Fetch sequentially to avoid hitting the 429 rate limit from too many concurrent SDK calls
    const orderItem = await base44.entities.OrderItem.get(orderItemId);

    if (!orderItem) {
      return Response.json({ error: 'OrderItem not found' }, { status: 404 });
    }

    // Block quote items
    if (orderItem.is_quote) {
      return Response.json({ error: 'Cannot add quote items to delivery loads. Convert quote to receipt first.' }, { status: 400 });
    }

    const allProducts = await base44.entities.Product.list();

    // Fetch all order items for over-allocation check
    // Use asServiceRole to bypass any RLS restrictions that could hide the master item
    const allItems = await base44.asServiceRole.entities.OrderItem.filter({ order_id: orderItem.order_id }, '-created_date', 500);

    // Find the master item — fall back to direct .get() if not in the filtered list
    let masterItem = orderItem;
    if (orderItem.master_item_id) {
      masterItem = allItems.find(i => i.id === orderItem.master_item_id);
      if (!masterItem) {
        // Fallback: fetch master directly (handles RLS edge cases)
        masterItem = await base44.asServiceRole.entities.OrderItem.get(orderItem.master_item_id).catch(() => null);
      }
    }

    if (!masterItem) {
      console.error('fulfillOrderItem: Master item not found. master_item_id:', orderItem.master_item_id, 'allItems count:', allItems?.length);
      return Response.json({ error: 'Master item not found — please refresh the page and try again' }, { status: 422 });
    }

    // Over-allocation check
    const allMemberItems = allItems.filter(i => i.master_item_id === masterItem.id || i.id === masterItem.id);
    const totalAllocated = allMemberItems
      .filter(i => i.id !== orderItemId)
      .reduce((sum, i) => sum + (i.quantity || 0), 0) + qty;

    const masterOriginalQty = masterItem.original_quantity || masterItem.quantity || 0;

    if (totalAllocated > masterOriginalQty) {
      const overBy = totalAllocated - masterOriginalQty;
      return Response.json({
        error: `Cannot add ${qty} units — would exceed master order quantity. Master: ${masterOriginalQty}, Would be: ${totalAllocated} (over by ${overBy}).`,
        masterOriginalQty,
        totalWouldBe: totalAllocated,
        overBy
      }, { status: 400 });
    }

    const product = allProducts.find(p => p.name === orderItem.product_name);

    // Determine counts_as_single_pallet
    let countsAsSinglePallet = false;
    if (orderItem.selected_unit !== 'Pallet') {
      countsAsSinglePallet = orderItem.keep_on_same_load || product?.counts_as_single_pallet || false;
    }

    // Delivery date for completion
    const deliveryDateToUse = currentLoad.delivery_date || (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();

    const isPartialDelivery = qty < orderItem.quantity;
    let createdLoadItemId;

    // Resolve weight_per_unit: prefer from orderItem, then walk up to masterItem
    const resolvedWeightPerUnit = orderItem.weight_per_unit || masterItem?.weight_per_unit || null;

    // If still no weight_per_unit, derive from product catalog
    let catalogWeightPerUnit = null;
    if (!resolvedWeightPerUnit && product) {
      if (orderItem.selected_unit === 'Pallet') catalogWeightPerUnit = product.weight_pallet || null;
      else if (orderItem.selected_unit === 'Each') catalogWeightPerUnit = product.weight_each || null;
      else if (orderItem.selected_unit === 'Layer') catalogWeightPerUnit = product.weight_layer || null;
    }

    const finalWeightPerUnit = resolvedWeightPerUnit || catalogWeightPerUnit;

    // Always include weight — default to 0 if we genuinely can't resolve it
    const resolvedWeight = finalWeightPerUnit || 0;
    console.log('fulfillOrderItem weight resolution:', {
      product_name: orderItem.product_name,
      selected_unit: orderItem.selected_unit,
      weight_per_unit_on_item: orderItem.weight_per_unit,
      weight_per_unit_on_master: masterItem?.weight_per_unit,
      catalog_weight: catalogWeightPerUnit,
      final_weight: resolvedWeight,
      product_found: !!product
    });

    const loadItemBase = {
      load_id: loadId,
      name: orderItem.product_name,
      quantity: qty,
      selected_color: orderItem.selected_color,
      selected_unit: orderItem.selected_unit,
      original_status: orderItem.status,
      original_hold_location: orderItem.hold_location,
      counts_as_pallet: product?.counts_as_pallet !== false,
      counts_as_single_pallet: countsAsSinglePallet,
      weight: resolvedWeight
    };

    if (isPartialDelivery) {
      // Create split on_delivery item + reduce source qty in parallel
      const masterOrigQty = masterItem.original_quantity || masterItem.quantity || 0;
      const [newOnDeliveryItem] = await Promise.all([
        base44.entities.OrderItem.create({
          order_id: orderItem.order_id,
          product_name: orderItem.product_name,
          quantity: qty,
          original_quantity: masterOrigQty,
          selected_color: orderItem.selected_color,
          selected_unit: orderItem.selected_unit,
          status: 'on_delivery',
          delivery_method: 'delivery',
          date_completed: deliveryDateToUse,
          date_arrived: orderItem.date_arrived || null,
          receipt_number: orderItem.receipt_number,
          is_quote: false,
          hold_location: orderItem.hold_location,
          keep_on_same_load: orderItem.keep_on_same_load,
          master_item_id: orderItem.master_item_id || orderItem.id,
          weight_per_unit: resolvedWeight
        }),
        base44.entities.OrderItem.update(orderItemId, {
          quantity: Math.max(0, orderItem.quantity - qty),
          original_quantity: masterOrigQty
        })
      ]);

      const loadItem = await base44.entities.LoadItem.create({
        ...loadItemBase,
        order_item_id: newOnDeliveryItem.id
      });
      createdLoadItemId = loadItem.id;
    } else {
      // Full delivery — create LoadItem and update OrderItem in parallel
      const [loadItem] = await Promise.all([
        base44.entities.LoadItem.create({
          ...loadItemBase,
          order_item_id: orderItemId
        }),
        base44.entities.OrderItem.update(orderItemId, {
          status: 'on_delivery',
          delivery_method: 'delivery',
          date_completed: deliveryDateToUse
        })
      ]);
      createdLoadItemId = loadItem.id;
    }

    // Update load receipt numbers + order fulfillment date in parallel
    const sideEffects = [];

    if (orderItem.receipt_number) {
      const existingNumbers = Array.isArray(currentLoad.receipt_numbers) ? currentLoad.receipt_numbers : [];
      if (!existingNumbers.includes(orderItem.receipt_number)) {
        sideEffects.push(
          base44.entities.Load.update(loadId, {
            receipt_numbers: [...existingNumbers, orderItem.receipt_number]
          })
        );
      }
    }

    // Update order last_fulfillment_date if needed
    sideEffects.push(
      base44.entities.Order.get(orderItem.order_id).then(order => {
        const currentLastDate = order?.last_fulfillment_date;
        if (!currentLastDate || deliveryDateToUse > currentLastDate) {
          return base44.entities.Order.update(orderItem.order_id, {
            last_fulfillment_date: deliveryDateToUse
          });
        }
      })
    );

    await Promise.all(sideEffects);

    // Fetch the created LoadItem and the relevant OrderItem in parallel for cache updates
    // For partial delivery: the on_delivery order item is the newly-created split item (stored in loadItem.order_item_id)
    // For full delivery: it's the original orderItemId (now marked on_delivery)
    const createdLoadItem = await base44.entities.LoadItem.get(createdLoadItemId);
    const onDeliveryOrderItemId = isPartialDelivery
      ? (createdLoadItem?.order_item_id || orderItemId)
      : orderItemId;
    const finalOrderItem = await base44.entities.OrderItem.get(onDeliveryOrderItemId).catch(() => null);

    return Response.json({
      success: true,
      loadItem: createdLoadItem,
      orderItem: finalOrderItem,
      orderId: orderItem.order_id,
      isPartialDelivery,
      emailSent: false
    });

  } catch (error) {
    console.error('fulfillOrderItem error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});