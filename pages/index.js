import { useEffect, useState, useRef } from 'react';

const CAT_COLORS = [
  '#2471a3',
  '#1d8a6a',
  '#b07d2a',
  '#e05252',
  '#8e44ad',
  '#e67e22',
  '#3a7ca5',
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);
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
      setMessages([{
        role: 'ai',
        text: `Total spend ฿${data.totalSpend.toLocaleString()} across ${data.totalReceipts} receipts. Top category is ${data.topCategory.name} at ฿${data.topCategory.amount.toLocaleString()} (${data.topCategory.pct}% of total). Want me to break anything down?`
      }]);
    }
  }, [data]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setElapsed(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    const onEnded = () => { setPlaying(false); setElapsed(0); };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

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

  function buildBriefText(d) {
    return `Good morning. Your expense summary for Ola Thai Tapas Bar. Total spend to date is ${d.totalSpend.toLocaleString()} Thai Baht across ${d.totalReceipts} receipts${d.voiceCount > 0 ? `, of which ${d.voiceCount} were logged via voice note` : ''}. Your biggest spend category is ${d.topCategory.name} at ${d.topCategory.amount.toLocaleString()} Baht — ${d.topCategory.pct} percent of all spend.${d.categories.length > 1 ? ` Other categories include: ${d.categories.slice(1).map(c => `${c.name} ${c.amount.toLocaleString()} Baht`).join(', ')}.` : ''} Review your recent expenses and use the CFO agent below to dig into anything specific. Have a great week.`;
  }

  async function togglePlay() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }

    if (audioUrl) {
      audioRef.current?.play();
      setPlaying(true);
      return;
    }

    // Generate audio
    setAudioLoading(true);
    try {
      const text = buildBriefText(data);
      const res = await fetch('/api/voice-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error('Failed to generate audio');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play();
          setPlaying(true);
        }
      }, 100);
    } catch (e) {
      console.error('Audio error:', e);
    }
    setAudioLoading(false);
  }

  function fmt(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

  async function sendMessage(text) {
    if (!text.trim() || aiThinking) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text }]);
    setAiThinking(true);
    const context = data ? `Ola Thai Tapas Bar expenses: Total ฿${data.totalSpend.toLocaleString()}, ${data.totalReceipts} receipts, ${data.voiceCount} voice notes. Categories: ${data.categories.map(c => `${c.name} ฿${c.amount.toLocaleString()} (${c.pct}%)`).join(', ')}. Recent: ${data.recent.slice(0, 5).map(r => `${r.vendor} ฿${r.amount} ${r.category} ${r.date}`).join('; ')}` : '';
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a sharp CFO assistant for Ola Thai Tapas Bar Bangkok. Give direct, specific answers using real numbers. Keep under 3 sentences unless detail needed. Data: ${context}`,
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

  const progressPct = duration > 0 ? Math.min((elapsed / duration) * 100, 100) : 0;
  const weekRange = (() => {
    const now = new Date();
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return `${mon.getDate()} – ${sun.getDate()} ${sun.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
  })();
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const s = {
    shell: { maxWidth: 1000, margin: '0 auto', padding: '1.5rem 1.5rem 4rem', fontFamily: "'Inter', sans-serif", color: '#e2e8f0' },
    topbar: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.75rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.07)' },
    brand: { fontSize: 11, letterSpacing: '0.1em', color: '#4a90c4', textTransform: 'uppercase', marginBottom: 3 },
    pageTitle: { fontSize: 22, fontWeight: 600, color: '#eaf2fb', letterSpacing: '-0.01em' },
    weekPill: { fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 12px', color: '#6a9cc0' },
    metrics: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: '1.25rem' },
    mc: { background: '#112236', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px 18px' },
    mcLabel: { fontSize: 10, letterSpacing: '0.08em', color: '#4a90c4', textTransform: 'uppercase', marginBottom: 10 },
    mcVal: { fontSize: 26, fontWeight: 600, color: '#eaf2fb', lineHeight: 1, letterSpacing: '-0.02em' },
    mcValWord: { fontSize: 18, fontWeight: 600, color: '#eaf2fb', paddingTop: 2 },
    mcSub: { fontSize: 11, marginTop: 7, color: '#4a6a88' },
    mcSubGreen: { fontSize: 11, marginTop: 7, color: '#3db88a' },
    riskRow: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: '1.25rem' },
    riskDanger: { background: '#112236', borderRadius: 10, padding: '14px 16px', borderLeft: '3px solid #e05252', borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' },
    riskWarn: { background: '#112236', borderRadius: 10, padding: '14px 16px', borderLeft: '3px solid #b07d2a', borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' },
    riskOk: { background: '#112236', borderRadius: 10, padding: '14px 16px', borderLeft: '3px solid #3db88a', borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' },
    riskTagDanger: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500, color: '#e05252' },
    riskTagWarn: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500, color: '#b07d2a' },
    riskTagOk: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500, color: '#3db88a' },
    riskVal: { fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 },
    riskSub: { fontSize: 11, color: '#4a6a88', lineHeight: 1.5 },
    chartsRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.25rem' },
    panel: { background: '#112236', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 18 },
    panelLabel: { fontSize: 10, letterSpacing: '0.08em', color: '#4a90c4', textTransform: 'uppercase', marginBottom: 16, fontWeight: 500 },
    catRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 },
    catName: { fontSize: 12, width: 80, flexShrink: 0 },
    barTrack: { flex: 1, height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' },
    catAmt: { fontSize: 12, color: '#8ab4d0', width: 70, textAlign: 'right', flexShrink: 0 },
    tablePanel: { background: '#112236', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 18, marginBottom: '1.25rem' },
    trow: { display: 'grid', gridTemplateColumns: '1fr 110px 90px 90px', gap: 8, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' },
    th: { fontSize: 10, letterSpacing: '0.08em', color: '#4a90c4', textTransform: 'uppercase' },
    tdVendor: { fontSize: 12, color: '#c8dff0', fontWeight: 500 },
    tdDate: { fontSize: 11, color: '#8ab4d0' },
    tdAmt: { fontSize: 12, color: '#c8dff0', fontWeight: 500 },
    voicePanel: { background: '#0a1a2b', border: '1px solid #1e4060', borderRadius: 10, padding: 18, marginBottom: '1.25rem' },
    voiceHeader: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 },
    playBtn: { width: 40, height: 40, borderRadius: '50%', background: '#1a5276', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#7fc8f0', fontSize: 16 },
    voiceTitle: { fontSize: 13, fontWeight: 600, color: '#b8d4e8' },
    voiceMeta: { fontSize: 11, color: '#4a6a88', marginTop: 2 },
    progWrap: { width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginBottom: 9, cursor: 'pointer' },
    voiceFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    timeTxt: { fontSize: 11, color: '#4a6a88' },
    txBtn: { fontSize: 11, color: '#4a6a88', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Inter, sans-serif' },
    txBody: { fontSize: 12, color: '#7a9bb5', lineHeight: 1.75, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, marginTop: 12 },
    chatPanel: { background: '#0a1a2b', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 18 },
    chatHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
    aiDot: { width: 8, height: 8, borderRadius: '50%', background: '#3db88a', flexShrink: 0 },
    chatHeadText: { fontSize: 13, fontWeight: 600, color: '#b8d4e8' },
    chatHeadSub: { fontSize: 11, color: '#4a6a88' },
    msgs: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, maxHeight: 240, overflowY: 'auto', paddingRight: 4 },
    msgAi: { display: 'flex', gap: 8, alignItems: 'flex-start' },
    msgUser: { display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: 'row-reverse' },
    bubbleAi: { fontSize: 12, lineHeight: 1.65, padding: '9px 13px', borderRadius: '3px 10px 10px 10px', maxWidth: '82%', background: '#112236', color: '#b8d4e8' },
    bubbleUser: { fontSize: 12, lineHeight: 1.65, padding: '9px 13px', borderRadius: '10px 3px 10px 10px', maxWidth: '82%', background: '#1a3a52', color: '#d4e8f5' },
    avAi: { width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0, background: '#1a3a52', color: '#7fc8f0' },
    avUser: { width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0, background: '#112236', color: '#4a6a88' },
    qbtns: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
    qbtn: { fontSize: 11, padding: '5px 11px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', color: '#6a9cc0', cursor: 'pointer', fontFamily: 'Inter, sans-serif' },
    inputRow: { display: 'flex', gap: 8 },
    chatIn: { flex: 1, background: '#112236', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '9px 13px', fontSize: 12, color: '#e2e8f0', outline: 'none', fontFamily: 'Inter, sans-serif' },
    sendBtn: { background: '#1a5276', border: 'none', borderRadius: 8, padding: '0 16px', color: '#7fc8f0', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' },
    loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontSize: 13, color: '#4a90c4' },
    legend: { display: 'flex', gap: 14, marginBottom: 12 },
    legendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4a6a88' },
    barsGrid: { display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 },
    barGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 },
    barGroupBars: { display: 'flex', alignItems: 'flex-end', gap: 2, width: '100%', height: 100 },
    dayLabel: { fontSize: 10, color: '#4a6a88', marginTop: 4 },
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #0d1f33; min-height: 100vh; }
        body { font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
      `}</style>

      <audio ref={audioRef} style={{display:'none'}} />

      <div style={s.shell}>
        <div style={s.topbar}>
          <div>
            <div style={s.brand}>Ola Thai Tapas Bar</div>
            <div style={s.pageTitle}>CFO Expense Dashboard</div>
          </div>
          <span style={s.weekPill}>{weekRange}</span>
        </div>

        {loading ? (
          <div style={s.loading}>Loading expense data...</div>
        ) : !data ? (
          <div style={s.loading}>Failed to load. Check Airtable credentials.</div>
        ) : (
          <>
            <div style={s.metrics}>
              <div style={s.mc}>
                <div style={s.mcLabel}>Total Spend</div>
                <div style={s.mcVal}>฿{data.totalSpend.toLocaleString()}</div>
                <div style={s.mcSub}>{data.totalReceipts} receipts logged</div>
              </div>
              <div style={s.mc}>
                <div style={s.mcLabel}>Top Category</div>
                <div style={s.mcValWord}>{data.topCategory.name}</div>
                <div style={s.mcSub}>฿{data.topCategory.amount.toLocaleString()} · {data.topCategory.pct}% of total</div>
              </div>
              <div style={s.mc}>
                <div style={s.mcLabel}>Receipts Logged</div>
                <div style={s.mcVal}>{data.totalReceipts}</div>
                <div style={s.mcSubGreen}>✓ {data.voiceCount} via voice note</div>
              </div>
              <div style={s.mc}>
                <div style={s.mcLabel}>Categories</div>
                <div style={s.mcVal}>{data.categories.length}</div>
                <div style={s.mcSub}>tracked this period</div>
              </div>
            </div>

            <div style={s.riskRow}>
              <div style={s.riskDanger}>
                <div style={s.riskTagDanger}>Top Spend</div>
                <div style={s.riskVal}>{data.topCategory.name} · {data.topCategory.pct}%</div>
                <div style={s.riskSub}>฿{data.topCategory.amount.toLocaleString()} — largest category, review weekly</div>
              </div>
              <div style={s.riskWarn}>
                <div style={s.riskTagWarn}>Uncategorised</div>
                <div style={s.riskVal}>{data.categories.find(c => c.name === 'Other') ? `฿${data.categories.find(c => c.name === 'Other').amount.toLocaleString()}` : '฿0'}</div>
                <div style={s.riskSub}>Other category — review and recategorise</div>
              </div>
              <div style={s.riskOk}>
                <div style={s.riskTagOk}>Voice Logging</div>
                <div style={s.riskVal}>{data.voiceCount} voice notes</div>
                <div style={s.riskSub}>{data.voiceCount > 0 ? 'Voice logging active via Telegram' : 'Try voice logging via Telegram bot'}</div>
              </div>
            </div>

            <div style={s.chartsRow}>
              <div style={s.panel}>
                <div style={s.panelLabel}>Spend by Category</div>
                {data.categories.map((cat, i) => {
                  const color = CAT_COLORS[i % CAT_COLORS.length];
                  return (
                    <div style={s.catRow} key={i}>
                      <span style={{...s.catName, color}}>{cat.name}</span>
                      <div style={s.barTrack}>
                        <div style={{ height: 8, borderRadius: 4, width: `${cat.pct}%`, backgroundColor: color }} />
                      </div>
                      <span style={s.catAmt}>฿{cat.amount.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>

              <div style={s.panel}>
                <div style={s.panelLabel}>Daily Spend — This Week vs Last</div>
                <div style={s.legend}>
                  <span style={s.legendItem}><span style={{width:10,height:3,borderRadius:2,background:'#2471a3',display:'inline-block'}}></span>This week</span>
                  <span style={s.legendItem}><span style={{width:10,height:3,borderRadius:2,background:'#1a3a52',display:'inline-block'}}></span>Last week</span>
                </div>
                {(() => {
                  const tw = data.thisWeek;
                  const lw = data.lastWeek;
                  const max = Math.max(...[...tw.map(d=>d[1]),...lw.map(d=>d[1])], 1);
                  return (
                    <div style={s.barsGrid}>
                      {days.map((day, i) => {
                        const twAmt = tw[i] ? tw[i][1] : 0;
                        const lwAmt = lw[i] ? lw[i][1] : 0;
                        return (
                          <div style={s.barGroup} key={i}>
                            <div style={s.barGroupBars}>
                              <div style={{flex:1,borderRadius:'3px 3px 0 0',minHeight:2,height:`${Math.round((lwAmt/max)*100)}%`,backgroundColor:'#1a3a52'}} />
                              <div style={{flex:1,borderRadius:'3px 3px 0 0',minHeight:2,height:`${Math.round((twAmt/max)*100)}%`,backgroundColor:'#2471a3'}} />
                            </div>
                            <span style={s.dayLabel}>{day}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div style={s.tablePanel}>
              <div style={s.panelLabel}>Recent Expenses</div>
              <div style={{borderBottom:'1px solid rgba(255,255,255,0.07)',paddingBottom:8,marginBottom:2}}>
                <div style={s.trow}>
                  <span style={s.th}>Vendor</span>
                  <span style={s.th}>Date</span>
                  <span style={s.th}>Amount</span>
                  <span style={s.th}>Category</span>
                </div>
              </div>
              {data.recent.map((r, i) => {
                const catIdx = data.categories.findIndex(c => c.name === r.category);
                const color = CAT_COLORS[catIdx >= 0 ? catIdx % CAT_COLORS.length : 0];
                return (
                  <div style={{...s.trow, borderBottom: i < data.recent.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none'}} key={i}>
                    <span style={s.tdVendor}>{r.vendor}</span>
                    <span style={s.tdDate}>{r.date}</span>
                    <span style={s.tdAmt}>฿{r.amount.toLocaleString()}</span>
                    <span><span style={{display:'inline-block',fontSize:10,padding:'2px 8px',borderRadius:4,backgroundColor:`${color}30`,color}}>{r.category}</span></span>
                  </div>
                );
              })}
            </div>

            {/* VOICE BRIEF */}
            <div style={s.voicePanel}>
              <div style={s.voiceHeader}>
                <button
                  style={{...s.playBtn, opacity: audioLoading ? 0.6 : 1}}
                  onClick={togglePlay}
                  disabled={audioLoading}
                >
                  {audioLoading ? '⏳' : playing ? '⏸' : '▶'}
                </button>
                <div>
                  <div style={s.voiceTitle}>Monday CFO Briefing — voice summary</div>
                  <div style={s.voiceMeta}>
                    {audioLoading ? 'Generating audio...' : audioUrl ? 'Ready to play' : 'Click play to generate'} · {today}
                  </div>
                </div>
              </div>
              <div style={s.progWrap}>
                <div style={{height:4,borderRadius:2,backgroundColor:'#2471a3',width:`${progressPct}%`,transition:'width 0.3s linear'}} />
              </div>
              <div style={s.voiceFooter}>
                <span style={s.timeTxt}>{fmt(elapsed)} / {duration > 0 ? fmt(duration) : '–:––'}</span>
                <button style={s.txBtn} onClick={() => setTxOpen(o => !o)}>{txOpen ? 'Hide transcript' : 'Read transcript'}</button>
              </div>
              {txOpen && (
                <div style={s.txBody}>
                  "{buildBriefText(data)}"
                </div>
              )}
            </div>

            {/* CHAT */}
            <div style={s.chatPanel}>
              <div style={s.chatHeader}>
                <div style={s.aiDot} />
                <div>
                  <div style={s.chatHeadText}>CFO Agent</div>
                  <div style={s.chatHeadSub}>Ask anything about your expenses</div>
                </div>
              </div>
              <div style={s.msgs} ref={msgsRef}>
                {messages.map((m, i) => (
                  <div style={m.role === 'ai' ? s.msgAi : s.msgUser} key={i}>
                    <div style={m.role === 'ai' ? s.avAi : s.avUser}>{m.role === 'ai' ? 'AI' : 'You'}</div>
                    <div style={m.role === 'ai' ? s.bubbleAi : s.bubbleUser}>{m.text}</div>
                  </div>
                ))}
                {aiThinking && (
                  <div style={s.msgAi}>
                    <div style={s.avAi}>AI</div>
                    <div style={{...s.bubbleAi, color:'#4a6a88'}}>Thinking...</div>
                  </div>
                )}
              </div>
              <div style={s.qbtns}>
                {['Where can I cut costs? ↗','Which vendor costs most? ↗','Compare categories ↗'].map((q,i) => (
                  <button key={i} style={s.qbtn} onClick={() => sendMessage(q.replace(' ↗',''))}>{q}</button>
                ))}
              </div>
              <div style={s.inputRow}>
                <input style={s.chatIn} placeholder="Ask about your expenses..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==='Enter' && sendMessage(input)} />
                <button style={s.sendBtn} onClick={() => sendMessage(input)} disabled={aiThinking}>Send ↗</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
