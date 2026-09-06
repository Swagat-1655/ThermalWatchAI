// ============================================================
// ThermalWatch AI — Geospatial RAG Assistant
// Groq gpt-oss-20b + PostGIS-style filtering + retrieval context
// ============================================================
const Assistant = (() => {
  const history = [];
  let llmOk = null;

  const SYSTEM_PROMPT = `You are Therma, the geospatial AI intelligence agent of ThermalWatch AI — a satellite-based industrial fire and thermal-source monitoring platform for India.
You answer questions about hotspots detected from NASA FIRMS (MODIS/VIIRS) data, industrial thermal signatures, refineries, steel plants, power plants, gas flares, mines, forest fires, agricultural burning, risk scores and recommendations.
Rules:
- Answer concisely in crisp bullet points (max ~110 words).
- Ground every claim in the CONTEXT DATA provided in the user message when present.
- Use Indian geography terms (states, districts). Be precise, mission-control tone.
- When asked for recommendations, give 2-3 concrete actions (who, what, when).
- Numbers: cite them exactly as given in context (temperatures in K, FRP in MW, risk in %).`;

  function esc(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function stripReasoning(text) {
    // gpt-oss may return content in reasoning-only mode; if content empty use last reasoning chunk
    if (text && text.trim()) return text.trim();
    return '';
  }

  // ---------- Mini RAG: extract context from the dataset ----------
  function ragContext(q) {
    const lines = [];
    const lower = q.toLowerCase();
    const states = [...new Set(DATA.hotspots.map(h => h.state))];
    const hitState = states.find(s => lower.includes(s.toLowerCase()) || lower.includes(s.split(' ')[0].toLowerCase()));

    if (hitState) {
      const hs = DATA.hotspots.filter(h => h.state === hitState);
      lines.push(`STATE: ${hitState} — ${hs.length} active hotspots.`);
      hs.slice(0, 6).forEach(h => lines.push(`- ${h.id} | ${h.name} | ${h.category} | temp ${h.temperature}K | FRP ${h.frp}MW | conf ${h.confidence}% | severity ${h.severity} | risk ${h.riskScore}`));
      const districts = {};
      hs.forEach(h => districts[h.district] = (districts[h.district] || 0) + 1);
      lines.push(`District hotspot counts: ${Object.entries(districts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, c]) => `${d}:${c}`).join(', ')}`);
    }

    if (/refiner|flare/.test(lower)) {
      const refs = DATA.hotspots.filter(h => h.kind.includes('Refinery') || h.category === 'flare').sort((a, b) => b.frp - a.frp);
      lines.push(`TOP REFINERIES/FLARES BY FRP:`);
      refs.slice(0, 6).forEach(h => lines.push(`- ${h.name} (${h.state}) FRP ${h.frp}MW temp ${h.temperature}K pattern ${h.pattern} age ${h.ageDays}d`));
    }
    if (/paradip|paradeep/.test(lower)) {
      const ps = DATA.hotspots.filter(h => h.district === 'Jagatsinghpur' || /paradip|paradeep/i.test(h.name));
      lines.push(`PARADIP CLUSTER (${ps.length}):`);
      ps.forEach(h => lines.push(`- ${h.name} | ${h.category} | FRP ${h.frp}MW | risk ${h.riskScore} | ${h.severity}`));
    }
    if (/risk|danger|critical/.test(lower)) {
      const top = [...DATA.hotspots].sort((a, b) => b.riskScore - a.riskScore).slice(0, 6);
      lines.push(`HIGHEST RISK HOTSPOTS:`);
      top.forEach(h => lines.push(`- ${h.name} (${h.district}, ${h.state}) risk ${h.riskScore}/100 ${h.severity}`));
    }
    if (/month|trend|timeline|season/.test(lower)) {
      lines.push(`MONTHLY TOTALS (12m): ${DATA.analytics.months.map(m => `${m.month}:${m.total}`).join(', ')}`);
    }
    if (/forest/.test(lower)) {
      const fs = DATA.hotspots.filter(h => h.category === 'forest');
      lines.push(`FOREST FIRES (${fs.length}): ${fs.map(h => `${h.district}(${h.state})`).join(', ')}`);
    }
    return lines.length ? 'CONTEXT DATA:\n' + lines.join('\n') : '';
  }

  // ---------- Intent -> visualization card ----------
  function vizFor(q) {
    const lower = q.toLowerCase();
    if (/odisha|state/.test(lower)) {
      const st = DATA.hotspots.map(h => h.state).find(s => lower.includes(s.toLowerCase())) || 'Odisha';
      const hs = DATA.hotspots.filter(h => h.state === st);
      return { type: 'list', title: `${st} — ${hs.length} active hotspots`, rows: hs.slice(0, 6).map(h => ({ id: h.id, name: h.name, cat: T(CAT[h.category].label), frp: h.frp + ' MW', sev: h.severity })) };
    }
    if (/refiner|flare/.test(lower)) {
      const hs = DATA.hotspots.filter(h => h.kind.includes('Refinery') || h.category === 'flare').sort((a, b) => b.frp - a.frp).slice(0, 6);
      return { type: 'list', title: 'Refineries / flares by thermal output', rows: hs.map(h => ({ id: h.id, name: h.name, cat: h.frp + ' MW', frp: h.temperature + ' K', sev: h.pattern })) };
    }
    if (/risk|district/.test(lower)) {
      const hs = [...DATA.hotspots].sort((a, b) => b.riskScore - a.riskScore).slice(0, 6);
      return { type: 'list', title: 'Highest risk hotspots today', rows: hs.map(h => ({ id: h.id, name: `${h.name} — ${h.district}`, cat: 'Risk ' + h.riskScore, frp: h.severity.toUpperCase(), sev: h.riskScore })) };
    }
    if (/month|trend/.test(lower)) {
      return { type: 'chart', title: 'Hotspots by month (12 months)', kind: 'months' };
    }
    return null;
  }

  function vizHtml(v) {
    if (!v) return '';
    if (v.type === 'list') {
      const rows = v.rows.map(r => {
        const sev = SEV[r.sev] ? SEV[r.sev].color : 'var(--muted)';
        return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:0.76rem;padding:4px 0;border-bottom:1px dashed var(--glass-brd)">
          <span><b style="color:var(--cyan)">${esc(r.id)}</b> ${esc(r.name)}</span>
          <span style="color:${sev};white-space:nowrap">${esc(r.cat)} • ${esc(r.frp)}</span></div>`;
      }).join('');
      return `<div class="vis"><b>📊 ${esc(v.title)}</b><div style="margin-top:4px">${rows}</div></div>`;
    }
    if (v.type === 'chart') {
      const uid = 'chat-chart-' + Date.now();
      setTimeout(() => {
        const labels = DATA.analytics.months.map(m => m.month);
        barChart(uid, labels, [{
          label: 'Hotspots', data: DATA.analytics.months.map(m => m.total),
          backgroundColor: labels.map((_, i) => i % 2 ? 'rgba(34,211,238,0.75)' : 'rgba(59,130,246,0.75)'),
          borderRadius: 4,
        }], { plugins: { legend: { display: false } } });
      }, 60);
      return `<div class="vis"><b>📈 ${esc(v.title)}</b><div style="height:150px;margin-top:6px"><canvas id="${uid}"></canvas></div></div>`;
    }
    return '';
  }

  // ---------- LLM call ----------
  async function callLLM(userText) {
    const ctx = ragContext(userText);
    const userMsg = ctx ? userText + '\n\n' + ctx : userText;
    history.push({ role: 'user', content: userMsg });
    const body = {
      model: TW_CONFIG.GROQ_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history.slice(-8)],
      temperature: TW_CONFIG.GROQ_TEMPERATURE,
      max_tokens: TW_CONFIG.GROQ_MAX_TOKENS,
    };
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), TW_CONFIG.LLM_TIMEOUT_MS);
    let reply = null;
    try {
      // Calls go through the server proxy /api/ai/chat — the Groq key never
      // reaches the browser (it lives in GROQ_API_KEY on the server / .env).
      const res = await fetch(TW_CONFIG.LLM_PROXY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const e = await res.json(); if (e && e.error) msg = e.error; } catch (_) { /* non-JSON */ }
        throw new Error(msg);
      }
      const j = await res.json();
      reply = stripReasoning(j.choices?.[0]?.message?.content || '');
      if (!reply) throw new Error('Empty reply');
      llmOk = true;
    } catch (err) {
      clearTimeout(to);
      llmOk = false;
      reply = fallbackReply(userText);
    }
    history.push({ role: 'assistant', content: reply });
    setStatus(llmOk);
    return { text: reply, viz: vizFor(userText) };
  }

  function fallbackReply(q) {
    // Rule-based fallback keeps the demo alive without network
    const lower = q.toLowerCase();
    const st = DATA.hotspots.map(h => h.state).find(s => lower.includes(s.toLowerCase()));
    if (st) {
      const hs = DATA.hotspots.filter(h => h.state === st);
      return `🔍 Retrieved ${hs.length} active hotspots for **${st}**:\n` +
        hs.slice(0, 5).map(h => `• ${h.name} — ${T(CAT[h.category].label)}, temp ${h.temperature} K, FRP ${h.frp} MW, risk ${h.riskScore}/100`).join('\n') +
        `\n\n⚠️ LLM unavailable — showing rule-based retrieval (gpt-oss-20b offline).`;
    }
    if (/refiner|flare/.test(lower)) {
      const refs = DATA.hotspots.filter(h => h.kind.includes('Refinery')).sort((a, b) => b.frp - a.frp).slice(0, 4);
      return `Top thermal emitters among refineries:\n` + refs.map(h => `• ${h.name} (${h.state}) — FRP ${h.frp} MW, ${h.pattern} pattern`).join('\n');
    }
    return `I'm standing by on the live intelligence graph.\n\nTry: “Show industrial fires in Odisha”, “Which refinery generated the highest thermal events?”, “List abnormal flares near Paradip”, or “What is the highest risk district today?”\n\n⚠️ LLM unavailable — showing fallback mode.`;
  }

  // ---------- UI ----------
  function addMsg(role, text, viz) {
    const box = document.getElementById('chatMessages');
    const el = document.createElement('div');
    el.className = 'msg ' + role;
    if (role === 'ai') {
      const meta = llmOk === false
        ? `<div class="msg-meta"><span>🧠 gpt-oss-20b</span><span class="chip chip-orange">FALLBACK</span></div>`
        : `<div class="msg-meta"><span>🧠 gpt-oss-20b • RAG + PostGIS</span><span class="chip chip-green">${T('as_online')}</span></div>`;
      el.innerHTML = meta + md(text) + (viz || '');
    } else {
      el.textContent = text;
    }
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  function md(text) {
    // minimal markdown: **bold**, - bullets, \n
    return text.split('\n').map(line => {
      const t = esc(line);
      const bolded = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^[-•] /.test(bolded)) return `<div style="padding-left:4px">${bolded.replace(/^[-•] /, '• ')}</div>`;
      return `<div>${bolded || '&nbsp;'}</div>`;
    }).join('');
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text) return;
    document.getElementById('chatInput').value = '';
    addMsg('user', text);
    const box = document.getElementById('chatMessages');
    const typing = document.createElement('div');
    typing.className = 'msg ai typing';
    typing.innerHTML = '<i></i><i></i><i></i>';
    box.appendChild(typing); box.scrollTop = box.scrollHeight;
    const res = await callLLM(text);
    typing.remove();
    addMsg('ai', res.text, vizHtml(res.viz));
  }

  function setStatus(ok) {
    const el = document.getElementById('llmStatus');
    if (!el) return;
    el.className = 'live-badge ' + (ok === false ? 'status-down' : '');
    el.innerHTML = ok === false
      ? '<span class="live-dot" style="background:var(--orange)"></span><span>' + (CURRENT_LANG === 'hi' ? 'LLM ऑफ़लाइन' : 'LLM OFFLINE — FALLBACK') + '</span>'
      : '<span class="live-dot"></span><span>' + T('as_online') + '</span>';
  }

  const TRY_QUESTIONS = [
    'Show industrial fires in Odisha during last 30 days',
    'Which refinery generated the highest thermal events?',
    'List abnormal flares near Paradip',
    'What is the highest risk district today?',
  ];

  function init() {
    document.getElementById('chatSend').onclick = () => send(document.getElementById('chatInput').value);
    document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') send(e.target.value); });
    const tryBox = document.getElementById('tryList');
    tryBox.innerHTML = TRY_QUESTIONS.map(q => `<button class="try-item">${q}</button>`).join('');
    tryBox.querySelectorAll('.try-item').forEach(b => b.onclick = () => send(b.textContent));
    document.getElementById('chatChips').innerHTML = TRY_QUESTIONS.slice(0, 3).map(q => `<button class="chip-q">${q}</button>`).join('');
    document.querySelectorAll('.chip-q').forEach(b => b.onclick = () => send(b.textContent));
    addMsg('ai', `👋 ${CURRENT_LANG === 'hi' ? 'नमस्ते! मैं थर्मा हूँ' : 'Namaste! I\'m Therma'} — your geospatial intelligence agent.\nAsk me about industrial fires, refineries, flares, forests and risk — I'll answer with maps, charts and recommendations.\n\n**Live model:** gpt-oss-20b via Groq • PostGIS spatial filters • RAG over the FIRMS graph`);
    // warm-up status check
    setStatus(null);
  }

  return { init, send };
})();