import { useEffect, useState, useRef } from 'react';

const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&display=swap');`;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const msgsRef = useRef(null);

  useEffect(() => {
    fetch('/api/expenses')
      .then(r => r.json())
      .then(json => {
        const records = json.records || [];
        setData(processData(records));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (data && messages.length === 0) {
      const total = data.totalSpend;
      const top = data.topCategory;
      setMessages([{
        role: 'ai',
        text: `Good morning. Total spend to date is ฿${total.toLocaleString()} across ${data.totalReceipts} receipts. Top category is ${top.name} at ฿${top.amount.toLocaleString()} (${top.pct}% of total). What would you like to know?`
      }]);
    }
  }, [data]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  function processData(records) {
    const cats = {};
    let total = 0;
    const byDate = {};

    records.forEach(r => {
      const f = r.fields || {};
      const amt = parseFloat(f.Amount) || 0;
      const cat = f.Category || 'Other';
      const date = f.Date || '';
      const vendor = f.Vendor || 'Unknown';
      const notes = f.Notes || '';
      const source = f.Source || '';

      total += amt;
      cats[cat] = (cats[cat] || 0) + amt;

      if (date) {
        const d = date.split('T')[0];
        if (!byDate[d]) byDate[d] = 0;
        byDate[d] += amt;
      }
    });

    const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const maxCat = sortedCats[0] || ['Other', 0];
    const topCategory = {
      name: maxCat[0],
      amount: Math.round(maxCat[1]),
      pct: total > 0 ? Math.round((maxCat[1] / total) * 100) : 0
    };

    const recent = records.slice(0, 8).map(r => ({
      vendor: r.fields?.Vendor || 'Unknown',
      amount: parseFloat(r.fields?.Amount) || 0,
      category: r.fields?.Category || 'Other',
      date: r.fields?.Date ? r.fields.Date.split('T')[0] : '',
      notes: r.fields?.Notes || '',
    }));

    const voiceCount = records.filter(r => (r.fields?.Source || '').toLowerCase().includes('voice')).length;

    const sortedDates = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));
    const last7 = sortedDates.slice(-7);

    return {
      totalSpend: Math.round(total),
      totalReceipts: records.length,
      voiceCount,
      topCategory,
      categories: sortedCats.map(([name, amt]) => ({
        name,
        amount: Math.round(amt),
        pct: total > 0 ? Math.round((amt / total) * 100) : 0
      })),
      recent,
      dailyData: last7,
      rawRecords: records,
    };
  }

  async function sendMessage(text) {
    if (!text.trim() || aiThinking) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text }]);
    setAiThinking(true);

    const context = data ? `
Ola Thai Tapas Bar expense data:
- Total spend: ฿${data.totalSpend.toLocaleString()}
- Total receipts: ${data.totalReceipts}
- Voice notes: ${data.voiceCount}
- Categories: ${data.categories.map(c => `${c.name}: ฿${c.amount.toLocaleString()} (${c.pct}%)`).join(', ')}
- Recent expenses: ${data.recent.map(r => `${r.vendor} ฿${r.amount} (${r.category}) on ${r.date}`).join('; ')}
` : 'No data available yet.';

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a sharp, concise CFO assistant for Ola Thai Tapas Bar in Bangkok. You have access to their real expense data. Give direct, actionable answers. Use ฿ for Thai Baht. Keep responses under 3 sentences unless detail is needed. Never be vague — always give specific numbers from the data.\n\nData:\n${context}`,
          messages: [{ role: 'user', content: text }]
        })
      });
      const json = await res.json();
      const reply = json.content?.[0]?.text || 'Unable to get a response right now.';
      setMessages(m => [...m, { role: 'ai', text: reply }]);
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Connection error. Please try again.' }]);
    }
    setAiThinking(false);
  }

  const quickQuestions = [
    'What is my biggest expense category?',
    'Which vendor am I spending the most on?',
    'Where can I cut costs?',
  ];

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const CAT_COLORS = {
    Ingredients: '#2471a3',
    Staff: '#1d8a6a',
    Utilities: '#b07d2a',
    Supplies: '#3a6a8a',
    Other: '#2a4a5e',
  };

  return (
    <>
      <style>{FONT}</style>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #08131e; min-height: 100vh; }
        body { font-family: 'DM Sans', sans-serif; color: #e2e8f0; -webkit-font-smoothing: antialiased; }
        .mono { font-family: 'DM Mono', monospace; }

        .shell { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }

        /* TOPBAR */
        .topbar { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 2rem; padding-bottom: 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .brand-tag { font-size: 10px; letter-spacing: 0.12em; color: #2d7fc1; text-transform: uppercase; margin-bottom: 4px; }
        .page-title { font-size: 20px; font-weight: 500; color: #e8f0f8; }
        .date-pill { font-family: 'DM Mono', monospace; font-size: 11px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 5px 12px; color: #5a8aaa; }

        /* METRICS */
        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 1.25rem; }
        @media(max-width:640px){ .metrics { grid-template-columns: 1fr 1fr; } }
        .mc { background: #0e1e2e; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; }
        .mc-label { font-size: 10px; letter-spacing: 0.08em; color: #2d7fc1; text-transform: uppercase; margin-bottom: 10px; }
        .mc-val { font-family: 'DM Mono', monospace; font-size: 24px; font-weight: 400; color: #eaf2fb; line-height: 1; }
        .mc-val.sm { font-size: 16px; padding-top: 4px; font-family: 'DM Sans', sans-serif; font-weight: 500; }
        .mc-sub { font-size: 11px; margin-top: 8px; color: #3d6a88; }
        .mc-sub.up { color: #c0392b; }
        .mc-sub.ok { color: #1d8a6a; }

        /* RISK CARDS */
        .risk-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 1.25rem; }
        @media(max-width:640px){ .risk-row { grid-template-columns: 1fr; } }
        .risk-card { background: #0e1e2e; border-radius: 10px; padding: 14px; border-left: 2px solid; border-top: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); }
        .risk-card.warn { border-left-color: #b07d2a; }
        .risk-card.danger { border-left-color: #c0392b; }
        .risk-card.ok { border-left-color: #1d8a6a; }
        .risk-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px; }
        .risk-card.warn .risk-tag { color: #b07d2a; }
        .risk-card.danger .risk-tag { color: #c0392b; }
        .risk-card.ok .risk-tag { color: #1d8a6a; }
        .risk-val { font-size: 13px; font-weight: 500; color: #d4e8f5; margin-bottom: 3px; }
        .risk-sub { font-size: 11px; color: #3d6a88; }

        /* CHARTS ROW */
        .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 1.25rem; }
        @media(max-width:640px){ .charts-row { grid-template-columns: 1fr; } }
        .panel { background: #0e1e2e; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px; }
        .panel-label { font-size: 10px; letter-spacing: 0.08em; color: #2d7fc1; text-transform: uppercase; margin-bottom: 16px; }

        /* CATEGORY BARS */
        .cat-row { display: flex; align-items: center; gap: 10px; margin-bottom: 11px; }
        .cat-name { font-size: 12px; color: #7aaac8; width: 80px; flex-shrink: 0; }
        .bar-track { flex: 1; height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
        .bar-fill { height: 3px; border-radius: 2px; transition: width 1s ease; }
        .cat-amt { font-family: 'DM Mono', monospace; font-size: 11px; color: #7aaac8; width: 68px; text-align: right; flex-shrink: 0; }

        /* RECENT TABLE */
        .table-panel { background: #0e1e2e; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px; margin-bottom: 1.25rem; }
        .trow { display: grid; grid-template-columns: 1fr 100px 80px 80px; gap: 8px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.04); align-items: center; }
        .trow:last-child { border-bottom: none; }
        .thead .trow { padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.07); }
        .th { font-size: 10px; letter-spacing: 0.07em; color: #2d7fc1; text-transform: uppercase; }
        .td { font-size: 12px; color: #8fafc7; }
        .td.vendor { color: #c8dff0; font-weight: 500; }
        .td.amt { font-family: 'DM Mono', monospace; font-size: 12px; color: #c8dff0; }
        .cat-badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 4px; background: rgba(36,113,163,0.2); color: #5a9fc8; }

        /* MONDAY BRIEF */
        .brief-panel { background: #081525; border: 1px solid #1a3a58; border-radius: 10px; padding: 18px; margin-bottom: 1.25rem; }
        .brief-header { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
        .brief-icon { width: 38px; height: 38px; border-radius: 50%; background: rgba(36,113,163,0.2); border: 1px solid rgba(36,113,163,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .brief-title { font-size: 13px; font-weight: 500; color: #b8d4e8; }
        .brief-meta { font-size: 11px; color: #3d6a88; margin-top: 2px; }
        .brief-body { font-size: 13px; line-height: 1.8; color: #7aaac8; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 14px; display: none; }
        .brief-body.open { display: block; }
        .brief-toggle { font-size: 11px; color: #3d6a88; background: none; border: none; cursor: pointer; text-decoration: underline; font-family: 'DM Sans', sans-serif; }

        /* AI CHAT */
        .chat-panel { background: #081525; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px; }
        .chat-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .ai-dot { width: 7px; height: 7px; border-radius: 50%; background: #1d8a6a; }
        .chat-head-text { font-size: 13px; font-weight: 500; color: #b8d4e8; }
        .chat-head-sub { font-size: 11px; color: #3d6a88; }
        .msgs { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; max-height: 240px; overflow-y: auto; padding-right: 4px; }
        .msgs::-webkit-scrollbar { width: 3px; }
        .msgs::-webkit-scrollbar-track { background: transparent; }
        .msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .msg { display: flex; gap: 8px; align-items: flex-start; }
        .msg.user { flex-direction: row-reverse; }
        .bubble { font-size: 12px; line-height: 1.65; padding: 9px 13px; border-radius: 10px; max-width: 82%; }
        .msg.ai .bubble { background: #0e1e2e; color: #b8d4e8; border-radius: 3px 10px 10px 10px; }
        .msg.user .bubble { background: #122a40; color: #d4e8f5; border-radius: 10px 3px 10px 10px; }
        .av { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 500; flex-shrink: 0; }
        .msg.ai .av { background: #122a40; color: #5a9fc8; }
        .msg.user .av { background: #0e1e2e; color: #3d6a88; }
        .thinking { font-size: 12px; color: #3d6a88; padding: 9px 13px; }
        .qbtns { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .qbtn { font-size: 11px; padding: 5px 11px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: transparent; color: #5a8aaa; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .qbtn:hover { background: rgba(255,255,255,0.04); color: #b8d4e8; border-color: rgba(255,255,255,0.18); }
        .input-row { display: flex; gap: 8px; }
        .chat-in { flex: 1; background: #0e1e2e; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 9px 13px; font-size: 12px; color: #e2e8f0; outline: none; font-family: 'DM Sans', sans-serif; }
        .chat-in:focus { border-color: rgba(36,113,163,0.4); }
        .chat-in::placeholder { color: #2a4a62; }
        .send-btn { background: #163348; border: 1px solid rgba(36,113,163,0.3); border-radius: 8px; padding: 0 16px; color: #5a9fc8; font-size: 12px; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: background 0.15s; white-space: nowrap; }
        .send-btn:hover { background: #1e4a6a; }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* LOADING */
        .loading { display: flex; align-items: center; justify-content: center; min-height: 60vh; }
        .loading-text { font-family: 'DM Mono', monospace; font-size: 13px; color: #2d7fc1; letter-spacing: 0.05em; }
      `}</style>

      <div className="shell">
        {/* TOPBAR */}
        <div className="topbar">
          <div>
            <div className="brand-tag">Ola Thai Tapas Bar</div>
            <div className="page-title">CFO Expense Dashboard</div>
          </div>
          <span className="date-pill mono">{today}</span>
        </div>

        {loading ? (
          <div className="loading"><span className="loading-text">Loading expense data...</span></div>
        ) : !data ? (
          <div className="loading"><span className="loading-text">Failed to load data. Check Airtable credentials.</span></div>
        ) : (
          <>
            {/* METRICS */}
            <div className="metrics">
              <div className="mc">
                <div className="mc-label">Total Spend</div>
                <div className="mc-val mono">฿{data.totalSpend.toLocaleString()}</div>
                <div className="mc-sub">{data.totalReceipts} receipts logged</div>
              </div>
              <div className="mc">
                <div className="mc-label">Top Category</div>
                <div className="mc-val sm">{data.topCategory.name}</div>
                <div className="mc-sub">฿{data.topCategory.amount.toLocaleString()} · {data.topCategory.pct}% of total</div>
              </div>
              <div className="mc">
                <div className="mc-label">Receipts Logged</div>
                <div className="mc-val mono">{data.totalReceipts}</div>
                <div className="mc-sub ok">{data.voiceCount} via voice note</div>
              </div>
              <div className="mc">
                <div className="mc-label">Categories</div>
                <div className="mc-val mono">{data.categories.length}</div>
                <div className="mc-sub">tracked this period</div>
              </div>
            </div>

            {/* CHARTS ROW */}
            <div className="charts-row">
              {/* CATEGORY BARS */}
              <div className="panel">
                <div className="panel-label">Spend by Category</div>
                {data.categories.map((cat, i) => (
                  <div className="cat-row" key={i}>
                    <span className="cat-name">{cat.name}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{
                        width: `${cat.pct}%`,
                        background: CAT_COLORS[cat.name] || '#2a4a5e'
                      }} />
                    </div>
                    <span className="cat-amt">฿{cat.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {/* DAILY SPEND */}
              <div className="panel">
                <div className="panel-label">Daily Spend — Recent</div>
                {data.dailyData.length === 0 ? (
                  <div style={{color:'#3d6a88', fontSize:'12px'}}>No daily data available yet.</div>
                ) : (
                  <>
                    {(() => {
                      const max = Math.max(...data.dailyData.map(d => d[1]));
                      return data.dailyData.map(([date, amt], i) => {
                        const label = new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                        return (
                          <div className="cat-row" key={i}>
                            <span className="cat-name" style={{width:'90px', fontSize:'11px'}}>{label}</span>
                            <div className="bar-track">
                              <div className="bar-fill" style={{ width: `${Math.round((amt / max) * 100)}%`, background: '#2471a3' }} />
                            </div>
                            <span className="cat-amt">฿{Math.round(amt).toLocaleString()}</span>
                          </div>
                        );
                      });
                    })()}
                  </>
                )}
              </div>
            </div>

            {/* RECENT EXPENSES TABLE */}
            <div className="table-panel">
              <div className="panel-label">Recent Expenses</div>
              <div className="thead">
                <div className="trow">
                  <span className="th">Vendor</span>
                  <span className="th">Date</span>
                  <span className="th">Amount</span>
                  <span className="th">Category</span>
                </div>
              </div>
              {data.recent.map((r, i) => (
                <div className="trow" key={i}>
                  <span className="td vendor">{r.vendor}</span>
                  <span className="td mono" style={{fontSize:'11px'}}>{r.date}</span>
                  <span className="td amt">฿{r.amount.toLocaleString()}</span>
                  <span className="td"><span className="cat-badge">{r.category}</span></span>
                </div>
              ))}
            </div>

            {/* MONDAY CFO BRIEF */}
            <div className="brief-panel">
              <div className="brief-header">
                <div className="brief-icon">📋</div>
                <div>
                  <div className="brief-title">Monday CFO Briefing</div>
                  <div className="brief-meta">AI-generated weekly summary · {today}</div>
                </div>
                <button className="brief-toggle" style={{marginLeft:'auto'}} onClick={() => setTxOpen(o => !o)}>
                  {txOpen ? 'Hide brief' : 'Read brief'}
                </button>
              </div>
              <div className={`brief-body ${txOpen ? 'open' : ''}`}>
                Good morning. Here is your weekly expense overview for Ola Thai Tapas Bar.
                <br /><br />
                Total spend to date sits at <strong style={{color:'#b8d4e8'}}>฿{data.totalSpend.toLocaleString()}</strong> across <strong style={{color:'#b8d4e8'}}>{data.totalReceipts} receipts</strong>
                {data.voiceCount > 0 && `, of which ${data.voiceCount} were logged via voice note`}. Your biggest spend category is <strong style={{color:'#b8d4e8'}}>{data.topCategory.name}</strong> at ฿{data.topCategory.amount.toLocaleString()} ({data.topCategory.pct}% of total).
                <br /><br />
                {data.categories.length > 1 && (
                  <>
                    Full category breakdown: {data.categories.map(c => `${c.name} ฿${c.amount.toLocaleString()}`).join(' · ')}.
                    <br /><br />
                  </>
                )}
                Review your top vendors in the recent expenses table above. Use the CFO agent below to ask specific questions about your spending.
              </div>
            </div>

            {/* AI CHAT */}
            <div className="chat-panel">
              <div className="chat-header">
                <div className="ai-dot" />
                <div>
                  <div className="chat-head-text">CFO Agent</div>
                  <div className="chat-head-sub">Ask anything about your expenses</div>
                </div>
              </div>
              <div className="msgs" ref={msgsRef}>
                {messages.map((m, i) => (
                  <div className={`msg ${m.role}`} key={i}>
                    <div className="av">{m.role === 'ai' ? 'AI' : 'You'}</div>
                    <div className="bubble">{m.text}</div>
                  </div>
                ))}
                {aiThinking && (
                  <div className="msg ai">
                    <div className="av">AI</div>
                    <div className="thinking">Thinking...</div>
                  </div>
                )}
              </div>
              <div className="qbtns">
                {quickQuestions.map((q, i) => (
                  <button key={i} className="qbtn" onClick={() => sendMessage(q)}>{q} ↗</button>
                ))}
              </div>
              <div className="input-row">
                <input
                  className="chat-in"
                  placeholder="Ask about your expenses..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
                />
                <button className="send-btn" onClick={() => sendMessage(input)} disabled={aiThinking}>
                  Send ↗
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
