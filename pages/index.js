import { useEffect, useState, useRef } from 'react';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const msgsRef = useRef(null);
  const TOTAL_SECS = 134;

  const CAT_COLORS = [
    '#2471a3',
    '#1d8a6a',
    '#b07d2a',
    '#e05252',
    '#8e44ad',
    '#e67e22',
    '#3a7ca5',
  ];

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
      setMessages([{
        role: 'ai',
        text: `Total spend ฿${data.totalSpend.toLocaleString()} across ${data.totalReceipts} receipts. Top category is ${data.topCategory.name} at ฿${data.topCategory.amount.toLocaleString()} (${data.topCategory.pct}% of total). Want me to break anything down?`
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
      const date = (f.Date || '').split('T')[0];
      total += amt;
      cats[cat] = (cats[cat] || 0) + amt;
      if (date) { byDate[date] = (byDate[date] || 0) + amt; }
    });

    const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const maxCat = sortedCats[0] || ['Other', 0];
    const topCategory = {
      name: maxCat[0],
      amount: Math.round(maxCat[1]),
      pct: total > 0 ? Math.round((maxCat[1] / total) * 100) : 0
    };

    const voiceCount = records.filter(r => (r.fields?.Source || '').toLowerCase().includes('voice')).length;
    const recent = records.slice(0, 8).map(r => ({
      vendor: r.fields?.Vendor || 'Unknown',
      amount: parseFloat(r.fields?.Amount) || 0,
      category: r.fields?.Category || 'Other',
      date: (r.fields?.Date || '').split('T')[0],
    }));

    const sortedDates = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));
    const last14 = sortedDates.slice(-14);
    const thisWeek = last14.slice(-7);
    const lastWeek = last14.slice(0, 7);

    return {
      totalSpend: Math.round(total),
      totalReceipts: records.length,
      voiceCount,
      topCategory,
      categories: sortedCats.map(([name, amt]) => ({
        name, amount: Math.round(amt),
        pct: total > 0 ? Math.round((amt / total) * 100) : 0
      })),
      recent,
      thisWeek,
      lastWeek,
    };
  }

  function togglePlay() {
    if (playing) {
      clearInterval(timerRef.current);
      setPlaying(false);
    } else {
      setPlaying(true);
      timerRef.current = setInterval(() => {
        setElapsed(e => {
          if (e >= TOTAL_SECS - 1) {
            clearInterval(timerRef.current);
            setPlaying(false);
            return 0;
          }
          return e + 1;
        });
      }, 1000);
    }
  }

  function fmt(s) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  async function sendMessage(text) {
    if (!text.trim() || aiThinking) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text }]);
    setAiThinking(true);

    const context = data
      ? `Ola Thai Tapas Bar expenses: Total ฿${data.totalSpend.toLocaleString()}, ${data.totalReceipts} receipts, ${data.voiceCount} voice notes. Categories: ${data.categories.map(c => `${c.name} ฿${c.amount.toLocaleString()} (${c.pct}%)`).join(', ')}. Recent: ${data.recent.slice(0, 5).map(r => `${r.vendor} ฿${r.amount} ${r.category} ${r.date}`).join('; ')}`
      : '';

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a sharp CFO assistant for Ola Thai Tapas Bar Bangkok. Give direct, specific answers using real numbers from the data. Keep it under 3 sentences unless detail is needed. Data: ${context}`,
          messages: [{ role: 'user', content: text }]
        })
      });
      const json = await res.json();
      setMessages(m => [...m, { role: 'ai', text: json.content?.[0]?.text || 'Unable to respond.' }]);
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Connection error. Please try again.' }]);
    }
    setAiThinking(false);
  }

  const progressPct = Math.min((elapsed / TOTAL_SECS) * 100, 100);

  const weekRange = (() => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return `${mon.getDate()} – ${sun.getDate()} ${sun.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
  })();

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #0d1f33; min-height: 100vh; }
        body { font-family: 'Inter', sans-serif; color: #e2e8f0; -webkit-font-smoothing: antialiased; }

        .shell { max-width: 1000px; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; }

        .topbar { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 1.75rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.07); }
        .brand { font-size: 11px; letter-spacing: 0.1em; color: #4a90c4; text-transform: uppercase; margin-bottom: 3px; }
        .page-title { font-size: 22px; font-weight: 600; color: #eaf2fb; letter-spacing: -0.01em; }
        .week-pill { font-size: 11px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 5px 12px; color: #6a9cc0; }

        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 1.25rem; }
        @media(max-width:640px){ .metrics { grid-template-columns: 1fr 1fr; } }
        .mc { background: #112236; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px 18px; }
        .mc-label { font-size: 10px; letter-spacing: 0.08em; color: #4a90c4; text-transform: uppercase; margin-bottom: 10px; }
        .mc-val { font-size: 26px; font-weight: 600; color: #eaf2fb; line-height: 1; letter-spacing: -0.02em; }
        .mc-val.word { font-size: 18px; font-weight: 600; padding-top: 2px; }
        .mc-sub { font-size: 11px; margin-top: 7px; display: flex; align-items: center; gap: 4px; color: #4a6a88; }
        .mc-sub.green { color: #3db88a; }

        .risk-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 1.25rem; }
        @media(max-width:640px){ .risk-row { grid-template-columns: 1fr; } }
        .risk-card { background: #112236; border-radius: 10px; padding: 14px 16px; border-left: 3px solid; border-top: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); }
        .risk-card.warn { border-left-color: #b07d2a; }
        .risk-card.danger { border-left-color: #e05252; }
        .risk-card.ok { border-left-color: #3db88a; }
        .risk-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; font-weight: 500; }
        .risk-card.warn .risk-tag { color: #b07d2a; }
        .risk-card.danger .risk-tag { color: #e05252; }
        .risk-card.ok .risk-tag { color: #3db88a; }
        .risk-val { font-size: 15px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; }
        .risk-sub { font-size: 11px; color: #4a6a88; line-height: 1.5; }

        .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 1.25rem; }
        @media(max-width:640px){ .charts-row { grid-template-columns: 1fr; } }
        .panel { background: #112236; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px; }
        .panel-label { font-size: 10px; letter-spacing: 0.08em; color: #4a90c4; text-transform: uppercase; margin-bottom: 16px; font-weight: 500; }

        .cat-row { display: flex; align-items: center; gap: 10px; margin-bottom: 13px; }
        .cat-name { font-size: 12px; color: #8ab4d0; width: 80px; flex-shrink: 0; }
        .bar-track { flex: 1; height: 6px; background: rgba(255,255,255,0.07); border-radius: 3px; overflow: hidden; }
        .bar-fill { height: 6px; border-radius: 3px; transition: width 1s ease; }
        .cat-amt { font-size: 12px; color: #8ab4d0; width: 70px; text-align: right; flex-shrink: 0; }

        /* DAILY CHART */
        .chart-wrap { width: 100%; }
        .chart-legend { display: flex; gap: 14px; margin-bottom: 12px; }
        .legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #4a6a88; }
        .legend-dot { width: 10px; height: 3px; border-radius: 2px; display: inline-block; }
        .bars-grid { display: flex; align-items: flex-end; gap: 6px; height: 120px; }
        .bar-group { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1; }
        .bar-group-bars { display: flex; align-items: flex-end; gap: 2px; width: 100%; height: 100px; }
        .day-bar { flex: 1; border-radius: 3px 3px 0 0; min-height: 2px; transition: height 0.6s ease; }
        .day-label { font-size: 10px; color: #4a6a88; margin-top: 4px; }

        .table-panel { background: #112236; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px; margin-bottom: 1.25rem; }
        .trow { display: grid; grid-template-columns: 1fr 110px 90px 90px; gap: 8px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.04); align-items: center; }
        .trow:last-child { border-bottom: none; }
        .th { font-size: 10px; letter-spacing: 0.08em; color: #4a90c4; text-transform: uppercase; }
        .td { font-size: 12px; color: #8ab4d0; }
        .td.vendor { color: #c8dff0; font-weight: 500; }
        .td.amt { font-size: 12px; color: #c8dff0; font-weight: 500; }
        .cat-badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 4px; background: rgba(36,113,163,0.25); color: #5a9fc8; font-weight: 500; }

        .voice-panel { background: #0a1a2b; border: 1px solid #1e4060; border-radius: 10px; padding: 18px; margin-bottom: 1.25rem; }
        .voice-header { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
        .play-btn { width: 40px; height: 40px; border-radius: 50%; background: #1a5276; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #7fc8f0; font-size: 16px; transition: background 0.15s; }
        .play-btn:hover { background: #2471a3; }
        .voice-title { font-size: 13px; font-weight: 600; color: #b8d4e8; }
        .voice-meta { font-size: 11px; color: #4a6a88; margin-top: 2px; }
        .prog-wrap { width: 100%; height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; margin-bottom: 9px; cursor: pointer; }
        .prog-fill { height: 4px; background: #2471a3; border-radius: 2px; transition: width 0.3s linear; }
        .voice-footer { display: flex; justify-content: space-between; align-items: center; }
        .time-txt { font-size: 11px; color: #4a6a88; }
        .tx-btn { font-size: 11px; color: #4a6a88; background: none; border: none; cursor: pointer; text-decoration: underline; font-family: 'Inter', sans-serif; }
        .tx-body { font-size: 12px; color: #7a9bb5; line-height: 1.75; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px; margin-top: 12px; }

        .chat-panel { background: #0a1a2b; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px; }
        .chat-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .ai-dot { width: 8px; height: 8px; border-radius: 50%; background: #3db88a; flex-shrink: 0; }
        .chat-head-text { font-size: 13px; font-weight: 600; color: #b8d4e8; }
        .chat-head-sub { font-size: 11px; color: #4a6a88; }
        .msgs { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; max-height: 240px; overflow-y: auto; padding-right: 4px; }
        .msgs::-webkit-scrollbar { width: 3px; }
        .msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .msg { display: flex; gap: 8px; align-items: flex-start; }
        .msg.user { flex-direction: row-reverse; }
        .bubble { font-size: 12px; line-height: 1.65; padding: 9px 13px; border-radius: 10px; max-width: 82%; }
        .msg.ai .bubble { background: #112236; color: #b8d4e8; border-radius: 3px 10px 10px 10px; }
        .msg.user .bubble { background: #1a3a52; color: #d4e8f5; border-radius: 10px 3px 10px 10px; }
        .av { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; flex-shrink: 0; }
        .msg.ai .av { background: #1a3a52; color: #7fc8f0; }
        .msg.user .av { background: #112236; color: #4a6a88; }
        .qbtns { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .qbtn { font-size: 11px; padding: 5px 11px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: transparent; color: #6a9cc0; cursor: pointer; font-family: 'Inter', sans-serif; transition: all 0.15s; }
        .qbtn:hover { background: rgba(255,255,255,0.05); color: #b8d4e8; }
        .input-row { display: flex; gap: 8px; }
        .chat-in { flex: 1; background: #112236; border: 1px solid rgba(255,255,255,0.09); border-radius: 8px; padding: 9px 13px; font-size: 12px; color: #e2e8f0; outline: none; font-family: 'Inter', sans-serif; }
        .chat-in:focus { border-color: rgba(36,113,163,0.5); }
        .chat-in::placeholder { color: #2a4a62; }
        .send-btn { background: #1a5276; border: none; border-radius: 8px; padding: 0 16px; color: #7fc8f0; font-size: 12px; cursor: pointer; font-family: 'Inter', sans-serif; transition: background 0.15s; white-space: nowrap; }
        .send-btn:hover { background: #2471a3; }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .loading { display: flex; align-items: center; justify-content: center; min-height: 60vh; font-size: 13px; color: #4a90c4; letter-spacing: 0.05em; }
      `}</style>

      <div className="shell">
        <div className="topbar">
          <div>
            <div className="brand">Ola Thai Tapas Bar</div>
            <div className="page-title">CFO Expense Dashboard</div>
          </div>
          <span className="week-pill">{weekRange}</span>
        </div>

        {loading ? (
          <div className="loading">Loading expense data...</div>
        ) : !data ? (
          <div className="loading">Failed to load. Check Airtable credentials.</div>
        ) : (
          <>
            {/* METRICS */}
            <div className="metrics">
              <div className="mc">
                <div className="mc-label">Total Spend</div>
                <div className="mc-val">฿{data.totalSpend.toLocaleString()}</div>
                <div className="mc-sub">{data.totalReceipts} receipts logged</div>
              </div>
              <div className="mc">
                <div className="mc-label">Top Category</div>
                <div className="mc-val word">{data.topCategory.name}</div>
                <div className="mc-sub">฿{data.topCategory.amount.toLocaleString()} · {data.topCategory.pct}% of total</div>
              </div>
              <div className="mc">
                <div className="mc-label">Receipts Logged</div>
                <div className="mc-val">{data.totalReceipts}</div>
                <div className="mc-sub green">✓ {data.voiceCount} via voice note</div>
              </div>
              <div className="mc">
                <div className="mc-label">Categories</div>
                <div className="mc-val">{data.categories.length}</div>
                <div className="mc-sub">tracked this period</div>
              </div>
            </div>

            {/* RISK CARDS */}
            <div className="risk-row">
              <div className="risk-card danger">
                <div className="risk-tag">Top Spend</div>
                <div className="risk-val">{data.topCategory.name} · {data.topCategory.pct}%</div>
                <div className="risk-sub">฿{data.topCategory.amount.toLocaleString()} — largest category, review weekly</div>
              </div>
              <div className="risk-card warn">
                <div className="risk-tag">Uncategorised</div>
                <div className="risk-val">
                  {data.categories.find(c => c.name === 'Other')
                    ? `฿${data.categories.find(c => c.name === 'Other').amount.toLocaleString()}`
                    : '฿0'}
                </div>
                <div className="risk-sub">Other category — review and recategorise</div>
              </div>
              <div className="risk-card ok">
                <div className="risk-tag">Voice Logging</div>
                <div className="risk-val">{data.voiceCount} voice notes</div>
                <div className="risk-sub">{data.voiceCount > 0 ? 'Voice logging active via Telegram' : 'Try voice logging via Telegram bot'}</div>
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
                      <div
                        className="bar-fill"
                        style={{
                          width: `${cat.pct}%`,
                          background: CAT_COLORS[i % CAT_COLORS.length]
                        }}
                      />
                    </div>
                    <span className="cat-amt">฿{cat.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {/* DAILY SPEND CHART */}
              <div className="panel">
                <div className="panel-label">Daily Spend — This Week vs Last</div>
                <div className="chart-legend">
                  <span className="legend-item">
                    <span className="legend-dot" style={{background:'#2471a3'}}></span>This week
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot" style={{background:'#1a3a52'}}></span>Last week
                  </span>
                </div>
                {(() => {
                  const tw = data.thisWeek;
                  const lw = data.lastWeek;
                  const allAmts = [...tw.map(d => d[1]), ...lw.map(d => d[1])];
                  const max = Math.max(...allAmts, 1);
                  return (
                    <div className="bars-grid">
                      {days.map((day, i) => {
                        const twAmt = tw[i] ? tw[i][1] : 0;
                        const lwAmt = lw[i] ? lw[i][1] : 0;
                        return (
                          <div className="bar-group" key={i}>
                            <div className="bar-group-bars">
                              <div className="day-bar" style={{
                                height: `${Math.round((lwAmt / max) * 100)}%`,
                                background: '#1a3a52'
                              }} />
                              <div className="day-bar" style={{
                                height: `${Math.round((twAmt / max) * 100)}%`,
                                background: '#2471a3'
                              }} />
                            </div>
                            <span className="day-label">{day}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* RECENT TABLE */}
            <div className="table-panel">
              <div className="panel-label">Recent Expenses</div>
              <div style={{borderBottom:'1px solid rgba(255,255,255,0.07)',paddingBottom:'8px',marginBottom:'2px'}}>
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
                  <span className="td" style={{fontSize:'11px'}}>{r.date}</span>
                  <span className="td amt">฿{r.amount.toLocaleString()}</span>
                  <span className="td">
                    <span className="cat-badge" style={{
                      background: `${CAT_COLORS[data.categories.findIndex(c => c.name === r.category) % CAT_COLORS.length]}30`,
                      color: CAT_COLORS[data.categories.findIndex(c => c.name === r.category) % CAT_COLORS.length]
                    }}>{r.category}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* VOICE BRIEF */}
            <div className="voice-panel">
              <div className="voice-header">
                <button className="play-btn" onClick={togglePlay} aria-label="Play CFO briefing">
                  {playing ? '⏸' : '▶'}
                </button>
                <div>
                  <div className="voice-title">Monday CFO Briefing — voice summary</div>
                  <div className="voice-meta">AI generated · {today} · 2:14</div>
                </div>
              </div>
              <div className="prog-wrap">
                <div className="prog-fill" style={{width:`${progressPct}%`}} />
              </div>
              <div className="voice-footer">
                <span className="time-txt">{fmt(elapsed)} / {fmt(TOTAL_SECS)}</span>
                <button className="tx-btn" onClick={() => setTxOpen(o => !o)}>
                  {txOpen ? 'Hide transcript' : 'Read transcript'}
                </button>
              </div>
              {txOpen && (
                <div className="tx-body">
                  "Good morning. Your expense summary for Ola Thai Tapas Bar.
                  Total spend to date is ฿{data.totalSpend.toLocaleString()} across {data.totalReceipts} receipts
                  {data.voiceCount > 0 ? `, of which ${data.voiceCount} were logged via voice note` : ''}.
                  Your biggest spend category is {data.topCategory.name} at ฿{data.topCategory.amount.toLocaleString()} — {data.topCategory.pct}% of all spend.
                  {data.categories.length > 1 ? ` Other categories: ${data.categories.slice(1).map(c => `${c.name} ฿${c.amount.toLocaleString()}`).join(', ')}.` : ''}
                  Review the recent expenses table and use the CFO agent below to dig into anything specific."
                </div>
              )}
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
                    <div className="bubble" style={{color:'#4a6a88'}}>Thinking...</div>
                  </div>
                )}
              </div>
              <div className="qbtns">
                {['Where can I cut costs? ↗', 'Which vendor costs most? ↗', 'Compare categories ↗'].map((q, i) => (
                  <button key={i} className="qbtn" onClick={() => sendMessage(q.replace(' ↗', ''))}>{q}</button>
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
