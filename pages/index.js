import { useEffect, useState, useRef, useCallback } from 'react';

const CAT_COLORS = [
  '#2471a3', '#1d8a6a', '#b07d2a', '#e05252', '#8e44ad', '#e67e22', '#3a7ca5',
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

  // Voice mode state
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState('idle'); // idle | listening | thinking | speaking
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceConvo, setVoiceConvo] = useState([]);

  const audioRef = useRef(null);
  const voiceAudioRef = useRef(null);
  const recognitionRef = useRef(null);
  const msgsRef = useRef(null);
  const voiceConvoRef = useRef(null);
  const voiceTranscriptRef = useRef('');
  const voiceModeRef = useRef(false);
  const voiceStateRef = useRef('idle');

  useEffect(() => {
    fetch('/api/expenses')
      .then(r => r.json())
      .then(json => { setData(processData(json.records || [])); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (data && messages.length === 0) {
      setMessages([{ role: 'ai', text: `Total spend ฿${data.totalSpend.toLocaleString()} across ${data.totalReceipts} receipts. Top category is ${data.topCategory.name} at ฿${data.topCategory.amount.toLocaleString()} (${data.topCategory.pct}% of total). Want me to break anything down?` }]);
    }
  }, [data]);

  useEffect(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight; }, [messages]);
  useEffect(() => { if (voiceConvoRef.current) voiceConvoRef.current.scrollTop = voiceConvoRef.current.scrollHeight; }, [voiceConvo]);

  useEffect(() => {
    const audio = audioRef.current; if (!audio) return;
    const onTime = () => setElapsed(audio.currentTime);
    const onDur = () => setDuration(audio.duration);
    const onEnd = () => { setPlaying(false); setElapsed(0); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDur);
    audio.addEventListener('ended', onEnd);
    return () => { audio.removeEventListener('timeupdate', onTime); audio.removeEventListener('durationchange', onDur); audio.removeEventListener('ended', onEnd); };
  }, [audioUrl]);

  function processData(records) {
    const cats = {}; let total = 0; const byDate = {};
    records.forEach(r => {
      const f = r.fields || {}; const amt = parseFloat(f.Amount) || 0; const cat = f.Category || 'Other'; const date = (f.Date || '').split('T')[0];
      total += amt; cats[cat] = (cats[cat] || 0) + amt; if (date) byDate[date] = (byDate[date] || 0) + amt;
    });
    const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const maxCat = sortedCats[0] || ['Other', 0];
    const topCategory = { name: maxCat[0], amount: Math.round(maxCat[1]), pct: total > 0 ? Math.round((maxCat[1] / total) * 100) : 0 };
    const voiceCount = records.filter(r => (r.fields?.Source || '').toLowerCase().includes('voice')).length;
    const recent = records.slice(0, 8).map(r => ({ vendor: r.fields?.Vendor || 'Unknown', amount: parseFloat(r.fields?.Amount) || 0, category: r.fields?.Category || 'Other', date: (r.fields?.Date || '').split('T')[0] }));
    const sortedDates = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])); const last14 = sortedDates.slice(-14);
    return { totalSpend: Math.round(total), totalReceipts: records.length, voiceCount, topCategory, categories: sortedCats.map(([name, amt]) => ({ name, amount: Math.round(amt), pct: total > 0 ? Math.round((amt / total) * 100) : 0 })), recent, thisWeek: last14.slice(-7), lastWeek: last14.slice(0, 7) };
  }

  function buildBriefText(d) {
    return `Good morning. Your expense summary for Ola Thai Tapas Bar. Total spend to date is ${d.totalSpend.toLocaleString()} Thai Baht across ${d.totalReceipts} receipts${d.voiceCount > 0 ? `, of which ${d.voiceCount} were logged via voice note` : ''}. Your biggest spend category is ${d.topCategory.name} at ${d.topCategory.amount.toLocaleString()} Baht — ${d.topCategory.pct} percent of all spend.${d.categories.length > 1 ? ` Other categories: ${d.categories.slice(1).map(c => `${c.name} ${c.amount.toLocaleString()} Baht`).join(', ')}.` : ''} Have a great week.`;
  }

  function getContext() {
    if (!data) return '';
    return `Ola Thai Tapas Bar expenses: Total ฿${data.totalSpend.toLocaleString()}, ${data.totalReceipts} receipts, ${data.voiceCount} voice notes. Categories: ${data.categories.map(c => `${c.name} ฿${c.amount.toLocaleString()} (${c.pct}%)`).join(', ')}. Recent: ${data.recent.slice(0, 5).map(r => `${r.vendor} ฿${r.amount} ${r.category} ${r.date}`).join('; ')}`;
  }

  async function generateSpeech(text) {
    const res = await fetch('/api/voice-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!res.ok) throw new Error('TTS failed');
    return URL.createObjectURL(await res.blob());
  }

  async function callClaude(system, userMessage, maxTokens = 1000) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, messages: [{ role: 'user', content: userMessage }], max_tokens: maxTokens })
    });
    const json = await res.json();
    return json.content?.[0]?.text || 'Unable to respond.';
  }

  async function toggleBriefPlay() {
    if (playing) { audioRef.current?.pause(); setPlaying(false); return; }
    if (audioUrl) { audioRef.current?.play(); setPlaying(true); return; }
    setAudioLoading(true);
    try {
      const url = await generateSpeech(buildBriefText(data));
      setAudioUrl(url);
      setTimeout(() => { if (audioRef.current) { audioRef.current.src = url; audioRef.current.play(); setPlaying(true); } }, 100);
    } catch (e) { console.error(e); }
    setAudioLoading(false);
  }

  // CONTINUOUS VOICE MODE
  const setVoiceStateSynced = (state) => {
    voiceStateRef.current = state;
    setVoiceState(state);
  };

  const startListening = useCallback(() => {
    if (!voiceModeRef.current) return;
    if (voiceStateRef.current !== 'idle') return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    voiceTranscriptRef.current = '';

    recognition.onstart = () => {
      setVoiceStateSynced('listening');
      setVoiceTranscript('');
    };

    recognition.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('');
      setVoiceTranscript(t);
      voiceTranscriptRef.current = t;
    };

    recognition.onend = () => {
      const transcript = voiceTranscriptRef.current.trim();
      if (transcript && voiceModeRef.current) {
        handleVoiceQuery(transcript);
      } else if (voiceModeRef.current) {
        // Nothing heard, restart listening after short pause
        setVoiceStateSynced('idle');
        setTimeout(() => { if (voiceModeRef.current) startListening(); }, 500);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') {
        setVoiceStateSynced('idle');
        setTimeout(() => { if (voiceModeRef.current) startListening(); }, 500);
      }
    };

    try { recognition.start(); } catch (e) { console.error(e); }
  }, []);

  async function handleVoiceQuery(transcript) {
    setVoiceStateSynced('thinking');
    setVoiceTranscript('');
    setVoiceConvo(c => [...c, { role: 'user', text: transcript }]);

    try {
      const reply = await callClaude(
        `You are a sharp, friendly CFO assistant for Ola Thai Tapas Bar Bangkok. This is a voice conversation — answer in 1-2 short sentences max. Use real numbers. Always use the Thai Baht symbol ฿ before amounts. No markdown or asterisks. Data: ${getContext()}`,
        transcript, 200
      );
      setVoiceConvo(c => [...c, { role: 'ai', text: reply }]);
      setVoiceStateSynced('speaking');

      const url = await generateSpeech(reply);
      if (voiceAudioRef.current) {
        voiceAudioRef.current.src = url;
        voiceAudioRef.current.play();
        voiceAudioRef.current.onended = () => {
          setVoiceStateSynced('idle');
          // Auto restart listening after speaking
          setTimeout(() => { if (voiceModeRef.current) startListening(); }, 300);
        };
      }
    } catch {
      setVoiceStateSynced('idle');
      setVoiceConvo(c => [...c, { role: 'ai', text: 'Connection error.' }]);
      setTimeout(() => { if (voiceModeRef.current) startListening(); }, 1000);
    }
  }

  function toggleVoiceMode() {
    if (voiceModeRef.current) {
      // Turn off
      voiceModeRef.current = false;
      setVoiceMode(false);
      recognitionRef.current?.abort();
      voiceAudioRef.current?.pause();
      setVoiceStateSynced('idle');
      setVoiceTranscript('');
    } else {
      // Turn on
      voiceModeRef.current = true;
      setVoiceMode(true);
      setVoiceConvo([]);
      setVoiceStateSynced('idle');
      setTimeout(() => startListening(), 500);
    }
  }

  async function sendMessage(text) {
    if (!text.trim() || aiThinking) return;
    setInput(''); setMessages(m => [...m, { role: 'user', text }]); setAiThinking(true);
    try {
      const reply = await callClaude(
        `You are a sharp CFO assistant for Ola Thai Tapas Bar Bangkok. Give direct answers with real numbers. Keep under 3 sentences. Always use ฿ for Thai Baht. No markdown. Data: ${getContext()}`,
        text
      );
      setMessages(m => [...m, { role: 'ai', text: reply }]);
    } catch { setMessages(m => [...m, { role: 'ai', text: 'Connection error.' }]); }
    setAiThinking(false);
  }

  function fmt(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
  const progressPct = duration > 0 ? Math.min((elapsed / duration) * 100, 100) : 0;
  const weekRange = (() => { const now = new Date(); const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return `${mon.getDate()} – ${sun.getDate()} ${sun.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`; })();
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const voiceStatusText = {
    idle: voiceMode ? 'Listening...' : '',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking...',
  }[voiceState] || '';

  const voiceOrb = {
    idle: { bg: '#1a5276', shadow: 'none', emoji: '🎤' },
    listening: { bg: '#1d8a6a', shadow: '0 0 30px rgba(29,138,106,0.6)', emoji: '🎤' },
    thinking: { bg: '#b07d2a', shadow: '0 0 30px rgba(176,125,42,0.6)', emoji: '⏳' },
    speaking: { bg: '#2471a3', shadow: '0 0 30px rgba(36,113,163,0.6)', emoji: '🔊' },
  }[voiceState];

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
    riskCard: (c) => ({ background: '#112236', borderRadius: 10, padding: '14px 16px', borderLeft: `3px solid ${c}`, borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }),
    riskTag: (c) => ({ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500, color: c }),
    riskVal: { fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 },
    riskSub: { fontSize: 11, color: '#4a6a88', lineHeight: 1.5 },
    chartsRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.25rem' },
    panel: { background: '#112236', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 18 },
    panelLabel: { fontSize: 10, letterSpacing: '0.08em', color: '#4a90c4', textTransform: 'uppercase', marginBottom: 16, fontWeight: 500 },
    catRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 },
    barTrack: { flex: 1, height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' },
    catAmt: { fontSize: 12, color: '#8ab4d0', width: 70, textAlign: 'right', flexShrink: 0 },
    tablePanel: { background: '#112236', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 18, marginBottom: '1.25rem' },
    trow: { display: 'grid', gridTemplateColumns: '1fr 110px 90px 90px', gap: 8, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' },
    th: { fontSize: 10, letterSpacing: '0.08em', color: '#4a90c4', textTransform: 'uppercase' },
    tdVendor: { fontSize: 12, color: '#c8dff0', fontWeight: 500 },
    tdDate: { fontSize: 11, color: '#8ab4d0' },
    tdAmt: { fontSize: 12, color: '#c8dff0', fontWeight: 500 },
    voicePanel: { background: '#0a1a2b', border: '1px solid #1e4060', borderRadius: 10, padding: 18, marginBottom: '1.25rem' },
    playBtn: { width: 40, height: 40, borderRadius: '50%', background: '#1a5276', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#7fc8f0', fontSize: 16 },
    chatPanel: { background: '#0a1a2b', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 18, marginBottom: '1.25rem' },
    aiDot: { width: 8, height: 8, borderRadius: '50%', background: '#3db88a', flexShrink: 0 },
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
        @keyframes orbPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        @keyframes ripple { 0%{transform:scale(1);opacity:0.5} 100%{transform:scale(2);opacity:0} }
        .orb-pulse { animation: orbPulse 1.5s ease-in-out infinite; }
        .orb-ring { position:absolute;border-radius:50%;animation:ripple 1.5s ease-out infinite; }
      `}</style>
      <audio ref={audioRef} style={{display:'none'}} />
      <audio ref={voiceAudioRef} style={{display:'none'}} />

      <div style={s.shell}>
        <div style={s.topbar}>
          <div><div style={s.brand}>Ola Thai Tapas Bar</div><div style={s.pageTitle}>CFO Expense Dashboard</div></div>
          <span style={s.weekPill}>{weekRange}</span>
        </div>

        {loading ? <div style={s.loading}>Loading expense data...</div> : !data ? <div style={s.loading}>Failed to load.</div> : (
          <>
            <div style={s.metrics}>
              <div style={s.mc}><div style={s.mcLabel}>Total Spend</div><div style={s.mcVal}>฿{data.totalSpend.toLocaleString()}</div><div style={s.mcSub}>{data.totalReceipts} receipts</div></div>
              <div style={s.mc}><div style={s.mcLabel}>Top Category</div><div style={s.mcValWord}>{data.topCategory.name}</div><div style={s.mcSub}>฿{data.topCategory.amount.toLocaleString()} · {data.topCategory.pct}%</div></div>
              <div style={s.mc}><div style={s.mcLabel}>Receipts Logged</div><div style={s.mcVal}>{data.totalReceipts}</div><div style={s.mcSubGreen}>✓ {data.voiceCount} voice notes</div></div>
              <div style={s.mc}><div style={s.mcLabel}>Categories</div><div style={s.mcVal}>{data.categories.length}</div><div style={s.mcSub}>tracked</div></div>
            </div>

            <div style={s.riskRow}>
              <div style={s.riskCard('#e05252')}><div style={s.riskTag('#e05252')}>Top Spend</div><div style={s.riskVal}>{data.topCategory.name} · {data.topCategory.pct}%</div><div style={s.riskSub}>฿{data.topCategory.amount.toLocaleString()} — review weekly</div></div>
              <div style={s.riskCard('#b07d2a')}><div style={s.riskTag('#b07d2a')}>Uncategorised</div><div style={s.riskVal}>{data.categories.find(c=>c.name==='Other')?`฿${data.categories.find(c=>c.name==='Other').amount.toLocaleString()}`:'฿0'}</div><div style={s.riskSub}>Review and recategorise Other</div></div>
              <div style={s.riskCard('#3db88a')}><div style={s.riskTag('#3db88a')}>Voice Logging</div><div style={s.riskVal}>{data.voiceCount} voice notes</div><div style={s.riskSub}>{data.voiceCount>0?'Active via Telegram':'Try Telegram voice bot'}</div></div>
            </div>

            <div style={s.chartsRow}>
              <div style={s.panel}>
                <div style={s.panelLabel}>Spend by Category</div>
                {data.categories.map((cat,i) => { const color=CAT_COLORS[i%CAT_COLORS.length]; return (
                  <div style={s.catRow} key={i}>
                    <span style={{fontSize:12,width:80,flexShrink:0,color}}>{cat.name}</span>
                    <div style={s.barTrack}><div style={{height:8,borderRadius:4,width:`${cat.pct}%`,backgroundColor:color}} /></div>
                    <span style={s.catAmt}>฿{cat.amount.toLocaleString()}</span>
                  </div>
                ); })}
              </div>
              <div style={s.panel}>
                <div style={s.panelLabel}>Daily Spend — This Week vs Last</div>
                <div style={{display:'flex',gap:14,marginBottom:12}}>
                  <span style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#4a6a88'}}><span style={{width:10,height:3,borderRadius:2,background:'#2471a3',display:'inline-block'}}></span>This week</span>
                  <span style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#4a6a88'}}><span style={{width:10,height:3,borderRadius:2,background:'#1a3a52',display:'inline-block'}}></span>Last week</span>
                </div>
                {(() => { const tw=data.thisWeek,lw=data.lastWeek,max=Math.max(...[...tw.map(d=>d[1]),...lw.map(d=>d[1])],1); return (
                  <div style={s.barsGrid}>{days.map((day,i) => { const twA=tw[i]?tw[i][1]:0,lwA=lw[i]?lw[i][1]:0; return (
                    <div style={s.barGroup} key={i}>
                      <div style={s.barGroupBars}>
                        <div style={{flex:1,borderRadius:'3px 3px 0 0',minHeight:2,height:`${Math.round((lwA/max)*100)}%`,backgroundColor:'#1a3a52'}} />
                        <div style={{flex:1,borderRadius:'3px 3px 0 0',minHeight:2,height:`${Math.round((twA/max)*100)}%`,backgroundColor:'#2471a3'}} />
                      </div>
                      <span style={s.dayLabel}>{day}</span>
                    </div>
                  ); })}</div>
                ); })()}
              </div>
            </div>

            <div style={s.tablePanel}>
              <div style={s.panelLabel}>Recent Expenses</div>
              <div style={{borderBottom:'1px solid rgba(255,255,255,0.07)',paddingBottom:8,marginBottom:2}}>
                <div style={s.trow}><span style={s.th}>Vendor</span><span style={s.th}>Date</span><span style={s.th}>Amount</span><span style={s.th}>Category</span></div>
              </div>
              {data.recent.map((r,i) => { const ci=data.categories.findIndex(c=>c.name===r.category); const color=CAT_COLORS[ci>=0?ci%CAT_COLORS.length:0]; return (
                <div style={{...s.trow,borderBottom:i<data.recent.length-1?'1px solid rgba(255,255,255,0.04)':'none'}} key={i}>
                  <span style={s.tdVendor}>{r.vendor}</span><span style={s.tdDate}>{r.date}</span><span style={s.tdAmt}>฿{r.amount.toLocaleString()}</span>
                  <span><span style={{display:'inline-block',fontSize:10,padding:'2px 8px',borderRadius:4,backgroundColor:`${color}30`,color}}>{r.category}</span></span>
                </div>
              ); })}
            </div>

            <div style={s.voicePanel}>
              <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14}}>
                <button style={{...s.playBtn,opacity:audioLoading?0.6:1}} onClick={toggleBriefPlay} disabled={audioLoading}>{audioLoading?'⏳':playing?'⏸':'▶'}</button>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'#b8d4e8'}}>Monday CFO Briefing — voice summary</div>
                  <div style={{fontSize:11,color:'#4a6a88',marginTop:2}}>{audioLoading?'Generating...':audioUrl?'Ready':'Click play to generate'} · {today}</div>
                </div>
              </div>
              <div style={{width:'100%',height:4,background:'rgba(255,255,255,0.08)',borderRadius:2,marginBottom:9}}>
                <div style={{height:4,borderRadius:2,backgroundColor:'#2471a3',width:`${progressPct}%`,transition:'width 0.3s linear'}} />
              </div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:11,color:'#4a6a88'}}>{fmt(elapsed)} / {duration>0?fmt(duration):'–:––'}</span>
                <button style={{fontSize:11,color:'#4a6a88',background:'none',border:'none',cursor:'pointer',textDecoration:'underline',fontFamily:'Inter,sans-serif'}} onClick={()=>setTxOpen(o=>!o)}>{txOpen?'Hide transcript':'Read transcript'}</button>
              </div>
              {txOpen && <div style={{fontSize:12,color:'#7a9bb5',lineHeight:1.75,borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:12,marginTop:12}}>"{buildBriefText(data)}"</div>}
            </div>

            <div style={s.chatPanel}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                <div style={s.aiDot}/><div><div style={{fontSize:13,fontWeight:600,color:'#b8d4e8'}}>CFO Agent</div><div style={{fontSize:11,color:'#4a6a88'}}>Ask anything about your expenses</div></div>
              </div>
              <div style={s.msgs} ref={msgsRef}>
                {messages.map((m,i)=>(<div style={m.role==='ai'?s.msgAi:s.msgUser} key={i}><div style={m.role==='ai'?s.avAi:s.avUser}>{m.role==='ai'?'AI':'You'}</div><div style={m.role==='ai'?s.bubbleAi:s.bubbleUser}>{m.text}</div></div>))}
                {aiThinking&&<div style={s.msgAi}><div style={s.avAi}>AI</div><div style={{...s.bubbleAi,color:'#4a6a88'}}>Thinking...</div></div>}
              </div>
              <div style={s.qbtns}>{['Where can I cut costs? ↗','Which vendor costs most? ↗','Compare categories ↗'].map((q,i)=>(<button key={i} style={s.qbtn} onClick={()=>sendMessage(q.replace(' ↗',''))}>{q}</button>))}</div>
              <div style={s.inputRow}>
                <input style={s.chatIn} placeholder="Ask about your expenses..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage(input)}/>
                <button style={s.sendBtn} onClick={()=>sendMessage(input)} disabled={aiThinking}>Send ↗</button>
              </div>
            </div>

            {/* LIVE VOICE — CONTINUOUS MODE */}
            <div style={{background:'#07111e',border:`1px solid ${voiceMode?'#2471a3':'rgba(255,255,255,0.06)'}`,borderRadius:10,padding:18,transition:'border-color 0.3s'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:voiceMode?20:0}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:voiceMode?'#3db88a':'#4a6a88',boxShadow:voiceMode?'0 0 8px #3db88a':'none',transition:'all 0.3s'}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'#b8d4e8'}}>Live Voice CFO</div>
                    <div style={{fontSize:11,color:'#4a6a88'}}>{voiceMode ? voiceStatusText || 'Listening for your question...' : 'Tap to start — just speak naturally'}</div>
                  </div>
                </div>
                <button onClick={toggleVoiceMode} style={{fontSize:11,padding:'6px 16px',borderRadius:6,border:'none',background:voiceMode?'#e05252':'#1a5276',color:'white',cursor:'pointer',fontFamily:'Inter,sans-serif',fontWeight:500,transition:'background 0.2s'}}>
                  {voiceMode ? 'Stop' : 'Start'}
                </button>
              </div>

              {voiceMode && (
                <div>
                  {/* Conversation */}
                  {voiceConvo.length > 0 && (
                    <div ref={voiceConvoRef} style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16,maxHeight:180,overflowY:'auto'}}>
                      {voiceConvo.map((m,i)=>(<div style={m.role==='ai'?s.msgAi:s.msgUser} key={i}><div style={m.role==='ai'?s.avAi:s.avUser}>{m.role==='ai'?'AI':'You'}</div><div style={m.role==='ai'?s.bubbleAi:s.bubbleUser}>{m.text}</div></div>))}
                    </div>
                  )}

                  {/* Live transcript */}
                  {voiceTranscript && (
                    <div style={{background:'#112236',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:12,color:'#7fc8f0',fontStyle:'italic'}}>
                      {voiceTranscript}
                    </div>
                  )}

                  {/* Orb */}
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
                    <div style={{position:'relative',display:'flex',alignItems:'center',justifyContent:'center',width:80,height:80}}>
                      {voiceState === 'listening' && <>
                        <div className="orb-ring" style={{width:80,height:80,border:'2px solid #1d8a6a'}} />
                        <div className="orb-ring" style={{width:80,height:80,border:'2px solid #1d8a6a',animationDelay:'0.5s'}} />
                      </>}
                      {voiceState === 'speaking' && <>
                        <div className="orb-ring" style={{width:80,height:80,border:'2px solid #2471a3'}} />
                        <div className="orb-ring" style={{width:80,height:80,border:'2px solid #2471a3',animationDelay:'0.4s'}} />
                      </>}
                      <div
                        className={voiceState === 'listening' || voiceState === 'speaking' ? 'orb-pulse' : ''}
                        style={{width:64,height:64,borderRadius:'50%',background:voiceOrb.bg,boxShadow:voiceOrb.shadow,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,position:'relative',zIndex:1,transition:'background 0.3s, box-shadow 0.3s'}}
                      >
                        {voiceOrb.emoji}
                      </div>
                    </div>
                    <div style={{fontSize:12,color:'#4a6a88',textAlign:'center'}}>
                      {voiceState === 'listening' && 'Listening — speak your question'}
                      {voiceState === 'thinking' && 'Processing your question...'}
                      {voiceState === 'speaking' && 'CFO is responding...'}
                      {voiceState === 'idle' && 'Ready — speak anytime'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
