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
    
    let updateCount = 0;

    // Update each product with converted weights
    for (const product of products) {
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
        await base44.asServiceRole.entities.Product.update(product.id, updateData);
        updateCount++;
      }
    }

    return Response.json({
      success: true,
      message: `Conversion complete: ${updateCount} products updated from kg to lbs`,
      totalProducts: products.length,
      updatedCount: updateCount
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});