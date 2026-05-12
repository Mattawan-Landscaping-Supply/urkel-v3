import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all products
    const products = await base44.asServiceRole.entities.Product.list('', 500);
    
    // Prepare updates
    const updates = [];
    products.forEach(product => {
      const updateData = {};
      let hasChanges = false;

      if (product.weight_pallet && product.weight_pallet > 0) {
        updateData.weight_pallet = Math.round(product.weight_pallet * 2.20462);
        hasChanges = true;
      }

      if (product.weight_each && product.weight_each > 0) {
        updateData.weight_each = Math.round(product.weight_each * 2.20462);
        hasChanges = true;
      }

      if (product.weight_layer && product.weight_layer > 0) {
        updateData.weight_layer = Math.round(product.weight_layer * 2.20462);
        hasChanges = true;
      }

      if (hasChanges) {
        updates.push({ id: product.id, data: updateData });
      }
    });

    // Batch update all products
    for (const { id, data } of updates) {
      await base44.asServiceRole.entities.Product.update(id, data);
    }

    return Response.json({
      success: true,
      message: `Converted ${updates.length} products from kg to lbs`,
      totalProducts: products.length,
      updatedCount: updates.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});