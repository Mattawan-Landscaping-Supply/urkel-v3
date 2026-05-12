import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';


Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { orderId, deliveredOrderItemIds, truckSettingId, packingStrategy, orderedTruckSettings, existingLoadIds, isReoptimize, deliveryDate: payloadDeliveryDate } = payload;

    // Fetch all necessary data
    const [order, orderItems, products, allTruckSettings] = await Promise.all([
      base44.entities.Order.get(orderId),
      base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500),
      base44.entities.Product.list('-created_date', 500),
      base44.entities.TruckSettings.list()
    ]);

    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Default truck setting (fallback)
    const defaultTruckSetting = allTruckSettings.find(t => t.id === truckSettingId) || allTruckSettings[0];
    if (!defaultTruckSetting) {
      return Response.json({ error: 'No truck settings found' }, { status: 404 });
    }

    // Always hard-delete ALL existing non-archived loads for this order before creating new ones.
    // This guarantees a clean slate and prevents orphaned loads from accumulating.
    {
      const idsToDelete = existingLoadIds && existingLoadIds.length > 0
        ? existingLoadIds
        : (await base44.asServiceRole.entities.Load.filter({ order_id: orderId }))
            .filter(l => l.status !== 'archived')
            .map(l => l.id);

      if (idsToDelete.length > 0) {
        const allLoadItems = await base44.asServiceRole.entities.LoadItem.list('-created_date', 500);
        const itemsToDelete = allLoadItems.filter(item => idsToDelete.includes(item.load_id));

        await Promise.all([
          ...itemsToDelete.map(item => base44.asServiceRole.entities.LoadItem.delete(item.id).catch(e => console.warn('LoadItem already deleted:', item.id, e?.message))),
          ...idsToDelete.map(loadId => base44.asServiceRole.entities.Load.delete(loadId).catch(e => console.warn('Load already deleted:', loadId, e?.message)))
        ]);

        console.log(`Clean slate: deleted ${idsToDelete.length} load(s) and ${itemsToDelete.length} load item(s)`);

        // Restore any on_delivery items back to in_hold so they can be re-packed
        const onDeliveryItems = orderItems.filter(i => i.status === 'on_delivery'); // include quote items
        await Promise.all(
          onDeliveryItems.map(i =>
            base44.asServiceRole.entities.OrderItem.update(i.id, { status: 'in_hold' })
          )
        );
        console.log(`Clean slate: restored ${onDeliveryItems.length} item(s) to in_hold`);
      }
    }

    // Always re-fetch order items after the clean slate block so we have fresh statuses
    // (the clean slate may have restored on_delivery items back to in_hold)
    const freshOrderItems = await base44.entities.OrderItem.filter({ order_id: orderId }, '-created_date', 500);

    // Only pack items that are currently in_hold AND were passed in the request.
    // NEVER modify OrderItem quantities.
    // Safety fallback: if deliveredOrderItemIds is empty, use all eligible in_hold items
    const eligibleItemIds = (deliveredOrderItemIds && deliveredOrderItemIds.length > 0)
      ? deliveredOrderItemIds
      : freshOrderItems
          .filter(i => i.status === 'in_hold' && (i.quantity || 0) > 0) // include quote items
          .map(i => i.id);

    // Include quote items — they are physically in stock and deliverable
    const itemsToLoad = freshOrderItems.filter(i =>
      eligibleItemIds.includes(i.id) &&
      i.status === 'in_hold' &&
      (i.quantity || 0) > 0
    );

    console.log('Items to load:', itemsToLoad.length, itemsToLoad.map(i => ({ id: i.id, name: i.product_name, status: i.status, qty: i.quantity })));

    if (itemsToLoad.length === 0) {
      return Response.json({ error: 'No in_hold items found to load. Make sure items have a quantity > 0 and are in In Hold status.' }, { status: 400 });
    }

    // Separate items into groups: those with keep_on_same_load and those without
    const keepTogetherItems = itemsToLoad.filter(i => i.keep_on_same_load);
    const regularItems = itemsToLoad.filter(i => !i.keep_on_same_load);

    // Group items by product_name and receipt_number for keep_on_same_load items
    const keepTogetherGroups = new Map();
    keepTogetherItems.forEach(item => {
      const key = `${item.product_name}::${item.receipt_number || ''}`;
      if (!keepTogetherGroups.has(key)) {
        keepTogetherGroups.set(key, []);
      }
      keepTogetherGroups.get(key).push(item);
    });

    // Build truck capacity list
    let truckCapacities = [];

    if (truckSettingId && !orderedTruckSettings) {
      const selectedTruck = allTruckSettings.find(t => t.id === truckSettingId);
      if (selectedTruck) {
        // Always push the selected truck as load 1
        truckCapacities.push({
          maxWeightLbs: selectedTruck.max_weight_capacity || 48000,
          truckAreaFt2: (selectedTruck.length || 24) * (selectedTruck.width || 8),
          settingId: selectedTruck.id,
          name: selectedTruck.name
        });
        // If the selected truck is "With Moffett", subsequent loads use "No Moffett"
        // (moffett is left at jobsite after first drop — standard operating procedure)
        // Pre-populate enough No Moffett slots to cover a reasonable overflow
        const isWithMoffett = selectedTruck.name === 'With Moffett';
        const followUpTruckName = isWithMoffett ? 'No Moffett' : selectedTruck.name;
        const followUpTruck = allTruckSettings.find(t => t.name === followUpTruckName) || selectedTruck;
        // Add 4 follow-up truck slots (algorithm will only use what it needs)
        for (let i = 0; i < 4; i++) {
          truckCapacities.push({
            maxWeightLbs: followUpTruck.max_weight_capacity || 48000,
            truckAreaFt2: (followUpTruck.length || 24) * (followUpTruck.width || 8),
            settingId: followUpTruck.id,
            name: followUpTruck.name
          });
        }
      }
    } else if (orderedTruckSettings && orderedTruckSettings.length > 0) {
      const rawCapacities = [];
      for (const settingId of orderedTruckSettings) {
        const truck = allTruckSettings.find(t => t.id === settingId);
        if (truck) {
          const last = rawCapacities[rawCapacities.length - 1];
          if (last && last.settingId === truck.id) {
            last.count++;
          } else {
            rawCapacities.push({
              maxWeightLbs: truck.max_weight_capacity || 48000,
              truckAreaFt2: (truck.length || 24) * (truck.width || 8),
              settingId: truck.id,
              name: truck.name,
              count: 1
            });
          }
        }
      }
      for (const cap of rawCapacities) {
        // Expand by count so each truck gets its own capacity slot
        for (let i = 0; i < cap.count; i++) {
          truckCapacities.push({ maxWeightLbs: cap.maxWeightLbs, truckAreaFt2: cap.truckAreaFt2, settingId: cap.settingId, name: cap.name });
        }
      }
    } else {
      for (const truckSetting of allTruckSettings) {
        truckCapacities.push({
          maxWeightLbs: truckSetting.max_weight_capacity || 48000,
          truckAreaFt2: (truckSetting.length || 24) * (truckSetting.width || 8),
          settingId: truckSetting.id,
          name: truckSetting.name
        });
      }
    }

    console.log('Truck capacities:', truckCapacities.map(t => ({ name: t.name, maxWeightLbs: t.maxWeightLbs, id: t.settingId })));

    const packs = packingStrategy === 'evenly'
      ? packEvenlyDistributed(keepTogetherGroups, regularItems, products, truckCapacities)
      : packMaxOut(keepTogetherGroups, regularItems, products, truckCapacities);

    const scheduleBatchId = `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Create Load records — wrapped in try/catch so any failure rolls back all created loads
    const loads = [];
    const allAssignedOrderItemIds = new Set();

    // Find the highest delivery_order already used on this date across ALL other orders,
    // so new loads for this order are sequenced after them and don't interleave.
    const allLoadsOnDate = await base44.asServiceRole.entities.Load.filter({ delivery_date: payloadDeliveryDate || new Date().toISOString().split('T')[0] });
    const otherOrderLoads = allLoadsOnDate.filter(l => l.order_id !== orderId && l.status !== 'archived');
    const maxExistingOrder = otherOrderLoads.reduce((max, l) => Math.max(max, l.delivery_order || 0), 0);
    const activeLoadCount = otherOrderLoads.length > 0 ? maxExistingOrder + 1 : 0;

    try {
      for (let i = 0; i < packs.length; i++) {
        const pack = packs[i];
        
        // Group exploded pallet entries by originalId and sum quantities
        const groupedItems = new Map();
        for (const rawItem of pack.items) {
          const oid = rawItem._originalId || rawItem.id;
          if (!groupedItems.has(oid)) {
            groupedItems.set(oid, { originalId: oid, originalItem: rawItem, quantity: 0 });
          }
          groupedItems.get(oid).quantity += (rawItem.quantity || 1);
        }

        const deliveryNumber = activeLoadCount + loads.length + 1;
        const loadName = `${order.company_name || order.customer_name} - Delivery ${deliveryNumber}`;

        const truckSettingForLoad = allTruckSettings.find(t => t.id === pack.truckSettingId) || defaultTruckSetting;
        const today = payloadDeliveryDate || new Date().toISOString().split('T')[0];
        const firstGroupedEntry = Array.from(groupedItems.values())[0];
        const receiptNumber = firstGroupedEntry?.originalItem?.receipt_number || null;

        const load = await base44.entities.Load.create({
          name: loadName,
          order_id: orderId,
          receipt_number: receiptNumber,
          customer_name: order.company_name || order.customer_name,
          customer_address: order.job_address,
          customer_phone: order.customer_phone,
          delivery_date: today,
          truck_setting_id: truckSettingForLoad.id,
          status: 'active',
          delivery_order: activeLoadCount + loads.length,
          schedule_batch_id: scheduleBatchId,
          packing_strategy: packingStrategy
        });

        // Track this load immediately so rollback can delete it if a later step fails
        loads.push(load);

        for (const { originalId, quantity } of groupedItems.values()) {
          const originalItem = itemsToLoad.find(oi => oi.id === originalId);
          const product = products.find(p => p.name === originalItem.product_name);

          let weightLbsPerUnit = null;
          if (product) {
            if (originalItem.selected_unit === 'Pallet') weightLbsPerUnit = product.weight_pallet || null;
            else if (originalItem.selected_unit === 'Each') weightLbsPerUnit = product.weight_each || null;
            else if (originalItem.selected_unit === 'Layer') weightLbsPerUnit = product.weight_layer || null;
            else weightLbsPerUnit = product.weight_each || null;
          } else if (originalItem.weight_per_unit) {
            weightLbsPerUnit = originalItem.weight_per_unit;
          }

          await base44.entities.LoadItem.create({
            load_id: load.id,
            order_item_id: originalId,
            name: originalItem.product_name,
            quantity: quantity,
            selected_color: originalItem.selected_color,
            selected_unit: originalItem.selected_unit,
            category: product?.category || 'Other',
            original_status: originalItem.status,
            original_hold_location: originalItem.hold_location,
            counts_as_pallet: product?.counts_as_pallet !== false,
            counts_as_single_pallet: originalItem.keep_on_same_load || product?.counts_as_single_pallet || false,
            ...(weightLbsPerUnit !== null ? { weight: weightLbsPerUnit } : {})
          });

          allAssignedOrderItemIds.add(originalId);
        }
      }
      // Single-pass: update all assigned OrderItems to on_delivery after all loads are created
      if (allAssignedOrderItemIds.size > 0) {
        await Promise.all(
          Array.from(allAssignedOrderItemIds).map(oid =>
            base44.asServiceRole.entities.OrderItem.update(oid, {
              status: 'on_delivery',
              delivery_method: 'delivery',
              date_completed: null
            })
          )
        );
        console.log(`Updated ${allAssignedOrderItemIds.size} OrderItem(s) to on_delivery`);
      }
      console.log('TOTAL LOADS CREATED:', loads.length, 'assignedIds:', [...allAssignedOrderItemIds]);
    } catch (creationError) {
      // Rollback: delete all loads created in this run to prevent orphans
      console.error('Load creation failed, rolling back', loads.length, 'load(s):', creationError.message);
      if (loads.length > 0) {
        const rollbackLoadIds = loads.map(l => l.id);
        const allLoadItemsForRollback = await base44.asServiceRole.entities.LoadItem.list('-created_date', 500);
        const rollbackItems = allLoadItemsForRollback.filter(li => rollbackLoadIds.includes(li.load_id));

        // Revert any OrderItems that were set to on_delivery back to in_hold before deleting
        const rollbackOrderItemIds = [...new Set(rollbackItems.map(li => li.order_item_id).filter(Boolean))];
        await Promise.all([
          ...rollbackItems.map(li => base44.asServiceRole.entities.LoadItem.delete(li.id).catch(() => {})),
          ...rollbackLoadIds.map(id => base44.asServiceRole.entities.Load.delete(id).catch(() => {})),
          ...rollbackOrderItemIds.map(oid =>
            base44.asServiceRole.entities.OrderItem.update(oid, { status: 'in_hold', date_completed: null }).catch(() => {})
          )
        ]);
        console.log(`Rollback complete: deleted ${rollbackLoadIds.length} load(s) and ${rollbackItems.length} load item(s), reverted ${rollbackOrderItemIds.length} order item(s) to in_hold`);
      }
      throw creationError;
    }

    const strandedItems = itemsToLoad
      .filter(i => !allAssignedOrderItemIds.has(i.id))
      .map(i => ({ id: i.id, product_name: i.product_name, quantity: i.quantity, selected_unit: i.selected_unit, selected_color: i.selected_color }));

    return Response.json({ loads, packs, strandedItems });
  } catch (error) {
    console.error('Error in createLoadsFromDeliveredItems:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Max out trucks: fill each truck as much as possible WITHOUT exceeding capacity
function packMaxOut(keepTogetherGroups, regularItems, products, truckCapacities) {
  const packs = [];
  let currentPackIndex = 0;
  let currentPack = [];
  let currentWeightLbs = 0;
  let currentAreaFt2 = 0;

  const getCurrentCapacity = () => {
    if (currentPackIndex < truckCapacities.length) {
      return truckCapacities[currentPackIndex];
    }
    return truckCapacities[truckCapacities.length - 1] || truckCapacities[0];
  };

  const allItemsWithMeta = [];

  for (const [key, items] of keepTogetherGroups) {
    allItemsWithMeta.push({
      items,
      weight: calculateGroupWeight(items, products),
      area: calculateGroupArea(items, products),
      isGroup: true
    });
  }

  for (const item of regularItems) {
    const quantity = item.quantity || 1;
    const unit = (item.selected_unit || '').toLowerCase();
    const totalWeight = calculateItemWeight(item, products);
    const totalArea = calculateItemArea(item, products);

    if (unit === 'pallet') {
      // Always explode pallets — each pallet is a separate splittable unit
      const product = products.find(p => p.name === item.product_name);
      const singleWeight = product?.weight_pallet || (totalWeight / quantity);
      const singleArea = totalArea / quantity;
      for (let i = 0; i < quantity; i++) {
        allItemsWithMeta.push({
          items: [{ ...item, quantity: 1, _originalId: item.id, _splitIndex: i }],
          weight: singleWeight,
          area: singleArea,
          isGroup: false
        });
      }
    } else {
      // Each/Layer: keep as one block unless keep_on_same_load is explicitly false
      if (item.keep_on_same_load === false && quantity > 1) {
        const singleWeight = totalWeight / quantity;
        const singleArea = totalArea / quantity;
        for (let i = 0; i < quantity; i++) {
          allItemsWithMeta.push({
            items: [{ ...item, quantity: 1, _originalId: item.id, _splitIndex: i }],
            weight: singleWeight,
            area: singleArea,
            isGroup: false
          });
        }
      } else {
        allItemsWithMeta.push({
          items: [item],
          weight: totalWeight,
          area: totalArea,
          isGroup: false
        });
      }
    }
  }

  allItemsWithMeta.sort((a, b) => b.weight - a.weight);

  const packedItemsMeta = new Set();

  for (const itemMeta of allItemsWithMeta) {
    const hasNoData = itemMeta.weight <= 0 || itemMeta.area <= 0;
    let capacity = getCurrentCapacity();
    const fitsWeight = hasNoData || currentWeightLbs + itemMeta.weight <= capacity.maxWeightLbs;
    const fitsArea = hasNoData || currentAreaFt2 + itemMeta.area <= capacity.truckAreaFt2;

    if (fitsWeight && fitsArea) {
      currentPack.push(...itemMeta.items);
      currentWeightLbs += itemMeta.weight;
      currentAreaFt2 += itemMeta.area;
      packedItemsMeta.add(itemMeta);
    } else if (currentPack.length > 0 && (!fitsWeight || !fitsArea)) {
      // Try to backfill into an existing pack before closing current
      const hasNoData = itemMeta.weight <= 0 || itemMeta.area <= 0;
      let backfillPackIdx = -1;

      for (let i = 0; i < packs.length; i++) {
        const packWeight = packs[i].weight || 0;
        const packArea = packs[i].area || 0;
        const packCapacity = truckCapacities.find(t => t.settingId === packs[i].truckSettingId) || truckCapacities[truckCapacities.length - 1];
        
        const fitsInPack = (hasNoData || packWeight + itemMeta.weight <= packCapacity.maxWeightLbs) && 
                          (packArea + itemMeta.area <= packCapacity.truckAreaFt2);
        if (fitsInPack) {
          backfillPackIdx = i;
          break;
        }
      }

      if (backfillPackIdx >= 0) {
        // Item fits in an existing pack, add it there
        packs[backfillPackIdx].items.push(...itemMeta.items);
        packs[backfillPackIdx].weight = (packs[backfillPackIdx].weight || 0) + itemMeta.weight;
        packs[backfillPackIdx].area = (packs[backfillPackIdx].area || 0) + itemMeta.area;
        packedItemsMeta.add(itemMeta);
      } else {
        // Item doesn't fit anywhere, close current pack and start new one
        packs.push({ items: [...currentPack], truckSettingId: capacity.settingId, weight: currentWeightLbs, area: currentAreaFt2 });
        currentPackIndex++;
        capacity = getCurrentCapacity();
        currentPack = [];
        currentWeightLbs = 0;
        currentAreaFt2 = 0;

        const itemFitsInNewTruck = itemMeta.weight <= capacity.maxWeightLbs && itemMeta.area <= capacity.truckAreaFt2;
        if (itemFitsInNewTruck) {
          currentPack.push(...itemMeta.items);
          currentWeightLbs = itemMeta.weight;
          currentAreaFt2 = itemMeta.area;
          packedItemsMeta.add(itemMeta);
        } else {
          // Item doesn't fit on the next truck either — put it in its own overflow pack
          packs.push({ items: [...itemMeta.items], truckSettingId: capacity.settingId, weight: itemMeta.weight, area: itemMeta.area });
          packedItemsMeta.add(itemMeta);
          console.log(`Item ${itemMeta.items[0]?.product_name}: placed in dedicated overflow pack (weight ${itemMeta.weight} lbs)`);
        }
      }
    } else {
      // currentPack is empty but item still doesn't fit — start a new overflow pack for it anyway
      // so nothing gets silently lost. The stranded items warning handles truly unsplittable items.
      currentPackIndex++;
      capacity = getCurrentCapacity();
      currentPack = [...itemMeta.items];
      currentWeightLbs = itemMeta.weight;
      currentAreaFt2 = itemMeta.area;
      packedItemsMeta.add(itemMeta);
      console.log(`Item ${itemMeta.items[0]?.product_name}: placed in overflow pack (weight ${itemMeta.weight} lbs, area ${itemMeta.area} ft2)`);
    }
  }

  if (currentPack.length > 0) {
    const capacity = getCurrentCapacity();
    packs.push({ items: currentPack, truckSettingId: capacity.settingId, weight: currentWeightLbs, area: currentAreaFt2 });
  }

  // Second pass: try to fit unpacked items into existing packs
  const unpackedItems = allItemsWithMeta.filter(meta => !packedItemsMeta.has(meta));
  for (const itemMeta of unpackedItems) {
    const hasNoData = itemMeta.weight <= 0 || itemMeta.area <= 0;
    let bestPackIdx = -1;
    let maxRemainingCapacity = -1;

    // Find the pack with the MOST remaining capacity
    for (let i = 0; i < packs.length; i++) {
      const packWeight = packs[i].weight || 0;
      const packArea = packs[i].area || 0;
      const capacity = truckCapacities.find(t => t.settingId === packs[i].truckSettingId) || truckCapacities[truckCapacities.length - 1];

      const fitsWeight = hasNoData || (packWeight + itemMeta.weight <= capacity.maxWeightLbs);
      const fitsArea = packArea + itemMeta.area <= capacity.truckAreaFt2;

      if (fitsWeight && fitsArea) {
        const remainingCapacity = (capacity.maxWeightLbs - packWeight) + (capacity.truckAreaFt2 - packArea);
        if (remainingCapacity > maxRemainingCapacity) {
          maxRemainingCapacity = remainingCapacity;
          bestPackIdx = i;
        }
      }
    }

    if (bestPackIdx >= 0) {
      packs[bestPackIdx].items.push(...itemMeta.items);
      packs[bestPackIdx].weight = (packs[bestPackIdx].weight || 0) + itemMeta.weight;
      packs[bestPackIdx].area = (packs[bestPackIdx].area || 0) + itemMeta.area;
      packedItemsMeta.add(itemMeta);
    }
  }

  console.log('MAXOUT SECOND PASS: unpacked count:', allItemsWithMeta.filter(m => !packedItemsMeta.has(m)).length, 'packs:', packs.map(p => ({ weight: p.weight, area: p.area, items: p.items.length })));

  return packs;
}

// Evenly distribute: spread weight evenly across trucks
function packEvenlyDistributed(keepTogetherGroups, regularItems, products, truckCapacities) {
  const allItemsWithMeta = [];

  for (const [key, items] of keepTogetherGroups) {
    allItemsWithMeta.push({
      items,
      weight: calculateGroupWeight(items, products),
      area: calculateGroupArea(items, products),
      isGroup: true
    });
  }

  for (const item of regularItems) {
    const quantity = item.quantity || 1;
    const unit = (item.selected_unit || '').toLowerCase();
    const totalWeight = calculateItemWeight(item, products);
    const totalArea = calculateItemArea(item, products);

    if (unit === 'pallet') {
      // Always explode pallets — each pallet is a separate splittable unit
      const product = products.find(p => p.name === item.product_name);
      const singleWeight = product?.weight_pallet || (totalWeight / quantity);
      const singleArea = totalArea / quantity;
      for (let i = 0; i < quantity; i++) {
        allItemsWithMeta.push({
          items: [{ ...item, quantity: 1, _originalId: item.id, _splitIndex: i }],
          weight: singleWeight,
          area: singleArea,
          isGroup: false
        });
      }
    } else {
      // Each/Layer: keep as one block unless keep_on_same_load is explicitly false
      if (item.keep_on_same_load === false && quantity > 1) {
        const singleWeight = totalWeight / quantity;
        const singleArea = totalArea / quantity;
        for (let i = 0; i < quantity; i++) {
          allItemsWithMeta.push({
            items: [{ ...item, quantity: 1, _originalId: item.id, _splitIndex: i }],
            weight: singleWeight,
            area: singleArea,
            isGroup: false
          });
        }
      } else {
        allItemsWithMeta.push({
          items: [item],
          weight: totalWeight,
          area: totalArea,
          isGroup: false
        });
      }
    }
  }

  const totalWeightLbs = allItemsWithMeta.reduce((sum, meta) => sum + meta.weight, 0);
  const totalAreaFt2 = allItemsWithMeta.reduce((sum, meta) => sum + meta.area, 0);

  let trucksNeededForWeight = 0;
  let remainingWeight = totalWeightLbs;
  for (let i = 0; i < truckCapacities.length; i++) {
    if (remainingWeight <= 0) break;
    trucksNeededForWeight++;
    remainingWeight -= truckCapacities[i].maxWeightLbs;
  }
  if (remainingWeight > 0) {
    trucksNeededForWeight += Math.ceil(remainingWeight / truckCapacities[truckCapacities.length - 1].maxWeightLbs);
  }

  // Only use area as a truck count driver if every item has product dimension data.
  // If any item has area=0 (no product data), area is unreliable — use weight only.
  const anyItemLacksAreaData = allItemsWithMeta.some(m => m.area <= 0);
  let trucksNeededForArea = 0;
  if (!anyItemLacksAreaData && totalAreaFt2 > 0) {
    let remainingArea = totalAreaFt2;
    for (let i = 0; i < truckCapacities.length; i++) {
      if (remainingArea <= 0) break;
      trucksNeededForArea++;
      remainingArea -= truckCapacities[i].truckAreaFt2;
    }
    if (remainingArea > 0) {
      trucksNeededForArea += Math.ceil(remainingArea / truckCapacities[truckCapacities.length - 1].truckAreaFt2);
    }
  }

  const trucksNeeded = Math.max(trucksNeededForWeight, trucksNeededForArea);
  const finalTrucksNeeded = Math.max(1, trucksNeeded);
  console.log(`Evenly: totalWeight=${totalWeightLbs} totalArea=${totalAreaFt2} trucksForWeight=${trucksNeededForWeight} trucksForArea=${trucksNeededForArea} final=${finalTrucksNeeded} anyLacksArea=${anyItemLacksAreaData}`);

  allItemsWithMeta.sort((a, b) => b.weight - a.weight);

  const packs = Array.from({ length: finalTrucksNeeded }, (_, idx) => {
    const capacity = truckCapacities[idx] || truckCapacities[truckCapacities.length - 1];
    return {
      items: [],
      weight: 0,
      area: 0,
      maxWeightLbs: capacity.maxWeightLbs,
      maxAreaFt2: capacity.truckAreaFt2,
      truckSettingId: capacity.settingId,
      originalIndex: idx
    };
  });

  const maxTruckCapacity = Math.max(...truckCapacities.map(t => t.maxWeightLbs));

  for (const itemMeta of allItemsWithMeta) {
    const hasNoWeight = itemMeta.weight <= 0;

    // If item exceeds the largest truck's weight capacity, give it its own overflow pack
    if (!hasNoWeight && itemMeta.weight > maxTruckCapacity) {
      const lastCapacity = truckCapacities[truckCapacities.length - 1];
      console.log(`Item ${itemMeta.items[0]?.product_name}: weight ${itemMeta.weight} exceeds max truck capacity ${maxTruckCapacity}, placing on dedicated overflow pack`);
      packs.push({
        items: [...itemMeta.items],
        weight: itemMeta.weight,
        area: itemMeta.area,
        maxWeightLbs: lastCapacity.maxWeightLbs,
        maxAreaFt2: lastCapacity.truckAreaFt2,
        truckSettingId: lastCapacity.settingId,
        originalIndex: packs.length
      });
      continue;
    }

    // Find the least-loaded pack that has room for this item
    let bestTruckIdx = -1;
    let lowestWeight = Infinity;

    for (let i = 0; i < packs.length; i++) {
      const fitsWeight = hasNoWeight || (packs[i].weight + itemMeta.weight <= packs[i].maxWeightLbs);
      // Skip area constraint if this item has no area data (product dimensions unknown)
      const fitsArea = itemMeta.area <= 0 || (packs[i].area + itemMeta.area <= packs[i].maxAreaFt2);
      if (fitsWeight && fitsArea && packs[i].weight < lowestWeight) {
        bestTruckIdx = i;
        lowestWeight = packs[i].weight;
      }
    }

    if (bestTruckIdx >= 0) {
      packs[bestTruckIdx].items.push(...itemMeta.items);
      packs[bestTruckIdx].weight += itemMeta.weight;
      packs[bestTruckIdx].area += itemMeta.area;
    } else if (itemMeta.weight <= 0 && itemMeta.area <= 0) {
      // Zero-data item — put it in the least-loaded pack instead of overflowing
      const leastLoadedIdx = packs.reduce((best, p, i) => p.items.length < packs[best].items.length ? i : best, 0);
      packs[leastLoadedIdx].items.push(...itemMeta.items);
      packs[leastLoadedIdx].weight += itemMeta.weight;
      packs[leastLoadedIdx].area += itemMeta.area;
    } else {
      // Real item that genuinely doesn't fit — add overflow pack
      const lastCapacity = truckCapacities[truckCapacities.length - 1];
      packs.push({
        items: [...itemMeta.items],
        weight: itemMeta.weight,
        area: itemMeta.area,
        maxWeightLbs: lastCapacity.maxWeightLbs,
        maxAreaFt2: lastCapacity.truckAreaFt2,
        truckSettingId: lastCapacity.settingId,
        originalIndex: packs.length
      });
    }
  }

  packs.sort((a, b) => a.originalIndex - b.originalIndex);

  console.log('PACKS AFTER BIN-PACK:', JSON.stringify(packs.map(p => ({ itemCount: p.items.length, weight: p.weight, area: p.area, items: p.items.map(i => ({ id: i._originalId || i.id, qty: i.quantity, splitIndex: i._splitIndex })) }))));

  return packs
    .filter(p => p.items.length > 0)
    .map(p => ({ items: p.items, truckSettingId: p.truckSettingId }));
}

function calculateItemWeight(item, products) {
  const product = products.find(p => p.name === item.product_name);
  const qty = item.quantity || 1;
  const unit = (item.selected_unit || '').toLowerCase();

  if (unit === 'pallet') {
    const w = product?.weight_pallet || item.weight_per_unit || 0;
    return w * qty;
  }
  if (unit === 'each') {
    const w = product?.weight_each || item.weight_per_unit || 0;
    return w * qty;
  }
  if (unit === 'layer') {
    const w = product?.weight_layer || item.weight_per_unit || 0;
    return w * qty;
  }
  // Any other unit (Box, Roll, etc.) — use weight_per_unit if available, else 0
  return (item.weight_per_unit || 0) * qty;
}

function calculateGroupWeight(items, products) {
  return items.reduce((sum, item) => sum + calculateItemWeight(item, products), 0);
}

function calculateItemArea(item, products) {
  // Only Pallet-unit items occupy truck bed area as pallet footprints.
  // Each, Layer, Box, Roll, or any other unit type contribute 0 area.
  const unit = (item.selected_unit || '').toLowerCase();
  if (unit !== 'pallet') return 0;
  const product = products.find(p => p.name === item.product_name);
  const width = product?.pallet_width || 3.5;
  const depth = product?.pallet_depth || 4;
  const effectiveQuantity = (item.counts_as_single_pallet === true || product?.counts_as_single_pallet === true) ? 1 : (item.quantity || 1);
  return width * depth * effectiveQuantity;
}

function calculateGroupArea(items, products) {
  return items.reduce((sum, item) => sum + calculateItemArea(item, products), 0);
}