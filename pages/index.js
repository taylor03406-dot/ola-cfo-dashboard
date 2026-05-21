import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/expenses')
      .then(res => res.json())
      .then(data => {
        setExpenses(data.records || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const totalSpend = expenses.reduce((sum, e) => sum + (parseFloat(e.fields.Amount) || 0), 0);
  const receiptsLogged = expenses.length;

  const categoryTotals = expenses.reduce((acc, e) => {
    const cat = e.fields.Category || 'Other';
    acc[cat] = (acc[cat] || 0) + (parseFloat(e.fields.Amount) || 0);
    return acc;
  }, {});

  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

  return (
    <div style={{ background: '#0d1f33', minHeight: '100vh', color: '#e2e8f0', fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>Ola Thai Tapas Bar</h1>
      <p style={{ color: '#4a7fa5', marginBottom: '2rem' }}>CFO Expense Dashboard</p>

      {loading ? <p>Loading...</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '2rem' }}>
            <div style={{ background: '#112236', borderRadius: '10px', padding: '1.5rem' }}>
              <p style={{ color: '#4a7fa5', fontSize: '12px', marginBottom: '8px' }}>TOTAL SPEND</p>
              <p style={{ fontSize: '28px', fontWeight: '500' }}>฿{totalSpend.toLocaleString()}</p>
            </div>
            <div style={{ background: '#112236', borderRadius: '10px', padding: '1.5rem' }}>
              <p style={{ color: '#4a7fa5', fontSize: '12px', marginBottom: '8px' }}>TOP CATEGORY</p>
              <p style={{ fontSize: '28px', fontWeight: '500' }}>{topCategory}</p>
            </div>
            <div style={{ background: '#112236', borderRadius: '10px', padding: '1.5rem' }}>
              <p style={{ color: '#4a7fa5', fontSize: '12px', marginBottom: '8px' }}>RECEIPTS LOGGED</p>
              <p style={{ fontSize: '28px', fontWeight: '500' }}>{receiptsLogged}</p>
            </div>
          </div>

          <div style={{ background: '#112236', borderRadius: '10px', padding: '1.5rem', marginBottom: '2rem' }}>
            <p style={{ color: '#4a7fa5', fontSize: '12px', marginBottom: '16px' }}>EXPENSES BY CATEGORY</p>
            {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <span style={{ width: '80px', fontSize: '13px', color: '#8fafc7' }}>{cat}</span>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.07)', borderRadius: '4px', height: '6px' }}>
                  <div style={{ width: `${(amount / totalSpend) * 100}%`, background: '#2471a3', height: '6px', borderRadius: '4px' }}></div>
                </div>
                <span style={{ fontSize: '12px', color: '#8fafc7', width: '80px', textAlign: 'right' }}>฿{amount.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div style={{ background: '#112236', borderRadius: '10px', padding: '1.5rem' }}>
            <p style={{ color: '#4a7fa5', fontSize: '12px', marginBottom: '16px' }}>RECENT EXPENSES</p>
            {expenses.slice(0, 10).map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: '13px' }}>{e.fields.Vendor || 'Unknown'}</span>
                <span style={{ fontSize: '13px', color: '#4a7fa5' }}>{e.fields.Date}</span>
                <span style={{ fontSize: '13px' }}>฿{parseFloat(e.fields.Amount || 0).toLocaleString()}</span>
                <span style={{ fontSize: '11px', color: '#3db88a' }}>{e.fields.Category}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
