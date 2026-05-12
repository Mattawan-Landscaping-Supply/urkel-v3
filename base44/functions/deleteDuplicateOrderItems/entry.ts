import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin access
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all OrderItems
    const allItems = await base44.asServiceRole.entities.OrderItem.list('-created_date', 5000);
    
    // Group items by duplicate criteria: product_name + order_id + selected_color + quantity
    const groups = {};
    
    for (const item of allItems) {
      // Create a unique key for this combination
      const key = JSON.stringify({
        product_name: item.product_name || '',
        order_id: item.order_id || '',
        selected_color: item.selected_color || '',
        quantity: item.quantity || 0
      });
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    }
    
    // Find duplicates and determine which to delete
    const toDelete = [];
    const duplicateGroups = [];
    
    for (const [key, items] of Object.entries(groups)) {
      if (items.length > 1) {
        // This is a duplicate group
        const parsedKey = JSON.parse(key);
        duplicateGroups.push({ key: parsedKey, count: items.length });
        
        // Sort items: prioritize those with order_id, then by oldest created_date
        items.sort((a, b) => {
          // Items with order_id come first
          if (a.order_id && !b.order_id) return -1;
          if (!a.order_id && b.order_id) return 1;
          // If both have or both don't have order_id, sort by created_date (oldest first)
          return new Date(a.created_date) - new Date(b.created_date);
        });
        
        // Keep the first item (has order_id or is oldest), delete the rest
        const toKeep = items[0];
        const toDeleteFromGroup = items.slice(1);
        
        toDelete.push(...toDeleteFromGroup.map(item => ({
          id: item.id,
          product_name: item.product_name,
          order_id: item.order_id,
          selected_color: item.selected_color,
          quantity: item.quantity,
          created_date: item.created_date,
          keeping_id: toKeep.id
        })));
      }
    }
    
    // Delete the duplicate items
    let deletedCount = 0;
    for (const item of toDelete) {
      await base44.asServiceRole.entities.OrderItem.delete(item.id);
      deletedCount++;
    }
    
    return Response.json({
      success: true,
      total_items: allItems.length,
      duplicate_groups_found: duplicateGroups.length,
      items_deleted: deletedCount,
      items_kept: duplicateGroups.length,
      duplicate_groups: duplicateGroups,
      deleted_items: toDelete
    });
    
  } catch (error) {
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});