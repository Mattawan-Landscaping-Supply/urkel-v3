import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { orderId, quoteNumber, newReceiptNumber } = await req.json();

        if (!orderId || !quoteNumber || !newReceiptNumber) {
            return Response.json({ error: 'Missing required parameters: orderId, quoteNumber, newReceiptNumber' }, { status: 400 });
        }

        // Find ALL OrderItems for this order that have this quote number OR original_quote_number
        const allOrderItems = await base44.asServiceRole.entities.OrderItem.filter({ order_id: orderId });
        
        const itemsToConvert = allOrderItems.filter(item => 
            (item.receipt_number === quoteNumber || item.original_quote_number === quoteNumber) && 
            item.is_quote === true
        );

        console.log('Converting quote items:', { 
            quoteNumber, 
            newReceiptNumber, 
            itemCount: itemsToConvert.length,
            itemIds: itemsToConvert.map(i => i.id)
        });

        // Update ALL items with this quote number to convert to receipt
        // Keep the existing status so items remain in Master Order column (status: 'order')
        const updatePromises = itemsToConvert.map(item =>
            base44.asServiceRole.entities.OrderItem.update(item.id, {
                is_quote: false,
                receipt_number: newReceiptNumber.trim(),
                original_quote_number: quoteNumber,
            })
        );
        
        await Promise.all(updatePromises);

        // Create Receipt entity if it doesn't exist
        const existingReceipts = await base44.asServiceRole.entities.Receipt.filter({
            order_id: orderId,
            receipt_number: newReceiptNumber.trim()
        });

        if (existingReceipts.length === 0) {
            await base44.asServiceRole.entities.Receipt.create({
                order_id: orderId,
                receipt_number: newReceiptNumber.trim(),
                is_paid: false
            });
        }

        return Response.json({ 
            success: true, 
            itemsConverted: itemsToConvert.length,
            message: `Converted ${itemsToConvert.length} items from quote ${quoteNumber} to receipt ${newReceiptNumber}` 
        });

    } catch (error) {
        console.error('Error converting quote to receipt:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});