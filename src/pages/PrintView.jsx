import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function PrintView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = localStorage.getItem('printViewData');
        if (!stored) {
          setError('No print data found');
          return;
        }

        const printData = JSON.parse(stored);
        const order = await base44.entities.Order.get(printData.orderId);
        const items = await base44.entities.OrderItem.filter({ order_id: printData.orderId });
        
        setData({
          order,
          items: items || [],
          type: printData.type,
          selectedItemIds: printData.selectedItemIds || []
        });
      } catch (e) {
        setError('Failed to load: ' + e.message);
      }
    };
    load();
  }, []);

  if (error) return <div style={{ padding: 40 }}>{error}</div>;
  if (!data) return <div style={{ padding: 40 }}>Loading...</div>;

  const { order, items, type, selectedItemIds } = data;
  const today = new Date().toLocaleDateString();

  // Pickup ticket
  if (type === 'pickup') {
    const pickupItems = selectedItemIds.length > 0 
      ? items.filter(i => selectedItemIds.includes(i.id))
      : items.filter(i => i.quantity > 0);

    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 32, background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid black', paddingBottom: 24, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 'bold', margin: 0 }}>PICK UP TICKET</h1>
            <p style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>{order.customer_name}</p>
            {order.customer_phone && <p style={{ color: '#666' }}>{order.customer_phone}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 24, fontWeight: 'bold' }}>{today}</p>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 48 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', borderTop: '1px solid black', borderBottom: '1px solid black' }}>
              <th style={{ padding: 12, textAlign: 'left', width: 80 }}>Qty</th>
              <th style={{ padding: 12, textAlign: 'left' }}>Product</th>
              <th style={{ padding: 12, textAlign: 'center', width: 80 }}>✓</th>
            </tr>
          </thead>
          <tbody>
            {pickupItems.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #ccc' }}>
                <td style={{ padding: 16, fontWeight: 'bold', fontSize: 18 }}>{item.quantity}</td>
                <td style={{ padding: 16, fontSize: 18 }}>{item.product_name}{item.selected_color ? ` - ${item.selected_color}` : ''}</td>
                <td style={{ padding: 16, textAlign: 'center' }}>
                  <div style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid black' }}></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 64 }}>
          <div style={{ borderTop: '2px solid black', paddingTop: 12, width: '60%' }}>
            <p style={{ fontWeight: 'bold' }}>Customer Signature</p>
          </div>
        </div>
        <div style={{ marginTop: 32 }}>
          <div style={{ borderTop: '1px solid black', paddingTop: 12, width: '30%' }}>
            <p style={{ fontWeight: 'bold' }}>Date</p>
          </div>
        </div>
      </div>
    );
  }

  // Coversheet
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', border: '1px solid black', padding: 32, background: 'white' }}>
      <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 'bold', margin: 0 }}>ORDER COVERSHEET</h1>
        <p>{today}</p>
      </div>

      <div style={{ marginBottom: 32 }}>
        <p><strong>Customer:</strong> {order.customer_name}</p>
        <p><strong>Phone:</strong> {order.customer_phone || 'N/A'}</p>
        <p><strong>Address:</strong> {order.job_address || 'N/A'}</p>
        <p><strong>Delivery Date:</strong> {order.delivery_date || 'TBD'}</p>
      </div>

      <h3 style={{ borderBottom: '1px solid black', paddingBottom: 4 }}>Order Contents</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid black' }}>
            <th style={{ padding: 8, textAlign: 'left' }}>Product</th>
            <th style={{ padding: 8, textAlign: 'center' }}>Qty</th>
            <th style={{ padding: 8, textAlign: 'right' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid #ccc' }}>
              <td style={{ padding: 12 }}>{item.product_name}</td>
              <td style={{ padding: 12, textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ padding: 12, textAlign: 'right' }}>{item.status?.replace('_', ' ') || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 48, border: '1px solid #999', padding: 16, minHeight: 120 }}>
        <p style={{ color: '#999' }}>Notes:</p>
      </div>
    </div>
  );
}