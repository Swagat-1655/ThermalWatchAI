// ============================================================
// ThermalWatch AI — Application core
// ============================================================
const App = (() => {
  // ---------- state ----------
  const simState = {
    kpis: { hotspots: 0, industrial: 0, forest: 0, flares: 0, power: 0, mining: 0, severe: 0, predrisk: 0 },
    feed: [],
  };
  let alertFilter = 'all';
  let channelPrefs = JSON.parse(localStorage.getItem('tw_channels') || '{"dashboard":true,"email":true,"sms":true}');
  let highlightedState = null;
  let dataPage = 1, dataSort = { key: 'acq_date', dir: -1 };
  const PAGE_SIZE = 20;

  // ---------- toasts ----------
  function toast(msg, cls = '', title = '') {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.innerHTML = `<span class="t-ico">${cls === 'danger' ? '🚨' : cls === 'warn' ? '⚠️' : cls === 'ok' ? '✅' : 'ℹ️'}</span><div class="t-body"><b>${title || 'ThermalWatch AI'}</b><span>${msg}</span></div>`;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 420); }, 5200);
  }

  // ---------- data-source badge ----------
  function renderDataBadge() {
    const b = document.getElementById('dataBadge');
    if (!b) return;
    const live = !!DATA_META.live;
    const demo = !!DATA_META.demo;
    b.classList.toggle('demo', !live);
    b.classList.toggle('live', live);
    const dot = document.getElementById('dataBadgeDot');
    if (dot) dot.className = 'live-dot' + (live ? '' : ' amber');
    const txt = document.getElementById('dataBadgeText');
    if (txt) txt.textContent = live
      ? `${DATA_META.count} LIVE FIRMS`
      : demo ? `${DATA_META.count.toLocaleString('en-IN')} FIRMS DEMO` : 'DEMO SAMPLE DATA';
    b.title = live
      ? `NASA FIRMS (MODIS + VIIRS) — ${DATA_META.count} detections, last ${DATA_META.days} days. Click to change data source.`
      : demo
        ? `Demo mode — bundled NASA FIRMS CSV archive (MODIS + VIIRS, 12 months): ${DATA_META.count.toLocaleString('en-IN')} detections. Click to switch to live mode.`
        : `Data feed unavailable (${DATA_META.reason || 'syncing…'}) — click to choose demo or live mode`;
  }

  // ---------- router ----------
  const VIEWS = ['home', 'dashboard', 'map', 'risk', 'analytics', 'assistant', 'alerts', 'reports', 'data'];
  const INIT = { map: false, risk: false, analytics: false, assistant: false, reports: false, alerts: false, data: false };

  function showView(id) {
    if (!VIEWS.includes(id)) id = 'home';
    VIEWS.forEach(v => document.getElementById('view-' + v).classList.toggle('active', v === id));
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.toggle('active', a.dataset.nav === id));
    document.getElementById('navLinks').classList.remove('open');
    document.getElementById('hamburger').classList.remove('open');
    window.scrollTo(0, 0);
    // ensure map containers have real dimensions right after unhiding
    LiveMap.invalidateAll();

    if (id === 'map') { renderLegend(); if (!INIT.map) { LiveMap.initMap(); INIT.map = true; } }
    if (id === 'risk' && !INIT.risk) { LiveMap.initRiskMap(); renderRiskChrome(); INIT.risk = true; }
    if (id === 'analytics' && !INIT.analytics) { renderAnalytics(); LiveMap.initHeatMini(); INIT.analytics = true; }
    if (id === 'assistant' && !INIT.assistant) { Assistant.init(); INIT.assistant = true; }
    if (id === 'reports' && !INIT.reports) { Reports.init(); INIT.reports = true; }
    if (id === 'dashboard') refreshDashboard();
    if (id === 'alerts') { renderAlerts(); INIT.alerts = true; }
    if (id === 'data') { renderDataTable(); INIT.data = true; }
    if (id === 'home') startHero();
    if (INIT.map || id === 'map') setTimeout(() => LiveMap.invalidateAll(), 120);
  }

  function onLangChange() {
    renderHeroStats();
    renderKpis(true);
    renderStrip();
    renderLegend();
    renderAlerts();
    renderRiskChrome(true);
    const sel = document.getElementById('rpHotspot');
    if (sel && sel.value) { Reports.setHotspot(sel.value); }
    if (document.getElementById('spotDrawer').classList.contains('open')) {
      const tab = document.querySelector('#drawerTabs .tab.active');
      if (tab) tab.click();
    }
    if (INIT.map) LiveMap.populateFilter();
  }

  function renderLegend() {
    const box = document.getElementById('mapLegend');
    box.innerHTML = Object.entries(CAT).map(([k, c]) =>
      `<div class="lg-row"><span class="lg-dot" style="background:${c.color}"></span>${T(c.label)}</div>`
    ).join('');
  }

  // ---------- hero canvas ----------
  let heroRaf = null, heroCtx = null, stars = [], earth = null;
  function startHero() {
    const canvas = document.getElementById('heroScene');
    if (!canvas || heroCtx) return;
    heroCtx = canvas.getContext('2d');
    const r = mulberry32(777);
    for (let i = 0; i < 130; i++) {
      stars.push({ x: r(), y: r(), s: r() * 1.4 + 0.3, p: r() * 6.28, sp: r() * 0.6 + 0.2 });
    }
    let t = 0;
    const draw = () => {
      const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
      const h = canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
      const ctx = heroCtx;
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      ctx.clearRect(0, 0, cw, ch);
      t += 0.008;

      // stars
      stars.forEach(s => {
        const tw = Math.sin(t * 3 + s.p) * 0.5 + 0.5;
        ctx.globalAlpha = dark ? 0.25 + tw * 0.6 : 0.15 + tw * 0.3;
        ctx.fillStyle = '#bae6fd';
        ctx.fillRect(s.x * cw, s.y * ch * 0.9, s.s, s.s);
      });
      ctx.globalAlpha = 1;

      // earth
      const ex = cw * 0.76, ey = ch * 0.52, R = Math.min(cw, ch) * 0.24;
      earth = { x: ex, y: ey, R };
      const grad = ctx.createRadialGradient(ex - R * 0.35, ey - R * 0.4, R * 0.1, ex, ey, R);
      grad.addColorStop(0, '#1e3a8a');
      grad.addColorStop(0.55, '#0c2a63');
      grad.addColorStop(1, '#04112e');
      ctx.beginPath(); ctx.arc(ex, ey, R, 0, 7);
      ctx.fillStyle = grad; ctx.fill();
      // atmosphere
      ctx.beginPath(); ctx.arc(ex, ey, R * 1.045, 0, 7);
      ctx.strokeStyle = dark ? 'rgba(34,211,238,0.35)' : 'rgba(8,145,178,0.25)';
      ctx.lineWidth = 1.5; ctx.stroke();
      // thermal glow sweep on earth
      const sweep = ctx.createLinearGradient(ex - R, ey - R, ex + R, ey + R);
      sweep.addColorStop(0, 'rgba(239,68,68,0)');
      sweep.addColorStop(0.45, 'rgba(249,115,22,0.0)');
      sweep.addColorStop(0.5 + Math.sin(t) * 0.08, 'rgba(249,115,22,0.5)');
      sweep.addColorStop(0.62, 'rgba(239,68,68,0)');
      sweep.addColorStop(1, 'rgba(34,211,238,0.35)');
      ctx.beginPath(); ctx.arc(ex, ey, R, 0, 7);
      ctx.fillStyle = sweep; ctx.fill();

      // hotspot pulses on the globe (India-ish positions)
      const hot = [[0.52, 0.55], [0.47, 0.5], [0.58, 0.47], [0.44, 0.62], [0.62, 0.53]];
      hot.forEach(([fx, fy], i) => {
        const px = ex + (fx - 0.5) * 2 * R, py = ey + (fy - 0.5) * 2 * R;
        const ph = (t * 0.7 + i * 0.35) % 1;
        ctx.beginPath(); ctx.arc(px, py, 1.5 + ph * 6, 0, 7);
        ctx.strokeStyle = `rgba(239,68,68,${1 - ph})`;
        ctx.lineWidth = 1.2; ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, 1.6, 0, 7);
        ctx.fillStyle = '#f87171'; ctx.fill();
      });

      // orbit
      ctx.beginPath(); ctx.ellipse(ex, ey, R * 1.75, R * 0.72, -0.42, 0, 7);
      ctx.strokeStyle = dark ? 'rgba(96,165,250,0.28)' : 'rgba(37,99,235,0.2)';
      ctx.lineWidth = 1; ctx.setLineDash([3, 6]); ctx.stroke(); ctx.setLineDash([]);

      // satellite on orbit
      const oa = t * 0.9;
      const sx = ex + Math.cos(oa) * R * 1.75, sy = ey + Math.sin(oa) * R * 0.72;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(oa + 0.6);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-7, -2, 14, 4);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(4, -5, 5, 10);
      ctx.restore();
      const trail = ctx.createLinearGradient(sx - 26, sy, sx, sy);
      trail.addColorStop(0, 'rgba(34,211,238,0)');
      trail.addColorStop(1, 'rgba(34,211,238,0.7)');
      ctx.strokeStyle = trail; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 26, sy); ctx.lineTo(sx, sy); ctx.stroke();

      // data arcs from earth to top
      for (let i = 0; i < 3; i++) {
        const a = t * 0.4 + i * 2.1;
        const px = ex + Math.cos(a) * R * 0.7, py = ey + Math.sin(a) * R * 0.7;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(ex + (px - ex) * 2.2, py - R * 1.4, ex + (px - ex) * 2.6, -10);
        ctx.strokeStyle = `rgba(34,211,238,${0.25 + Math.sin(t * 2 + i) * 0.15})`;
        ctx.lineWidth = 1; ctx.stroke();
      }

      heroRaf = requestAnimationFrame(draw);
    };
    draw();
  }

  // ---------- hero stats + strip ----------
  function statCard(s) {
    const trend = s.trend >= 0 ? `<span class="stat-trend up">▲ ${s.trend}%</span>` : `<span class="stat-trend down">▼ ${Math.abs(s.trend)}%</span>`;
    return `<div class="stat-card">
      <div class="stat-top"><span class="stat-ico">${s.icon}</span>${trend}</div>
      <div class="stat-val" data-count="${s.value}">0</div>
      <div class="stat-lbl">${T(s.label)}</div>
    </div>`;
  }
  function renderHeroStats() {
    const box = document.getElementById('heroStats');
    const s = DATA.stats;
    const items = [
      { icon: '🛰️', value: s.active, trend: 8, label: 'stat_active' },
      { icon: '🔴', value: s.industrial, trend: 12, label: 'stat_indfires' },
      { icon: '🟡', value: s.flares, trend: 4, label: 'stat_flares' },
      { icon: '🔥', value: s.forest, trend: -6, label: 'stat_forest' },
      { icon: '🟢', value: s.power, trend: 2, label: 'stat_power' },
      { icon: '🚨', value: s.highrisk, trend: 9, label: 'stat_highrisk' },
    ];
    box.innerHTML = items.map(statCard).join('');
    countUps(box);
  }
  function renderStrip() {
    const track = document.getElementById('stripTrack');
    const items = DATA.hotspots.slice(0, 12).map(h => {
      const c = CAT[h.category];
      return `<span class="strip-item"><span class="dot" style="background:${c.color}"></span><b>${h.id}</b> ${h.name} — <b>${T(c.label)}</b> • ${h.frp} MW • ${h.district}, ${h.state}</span>`;
    }).join('');
    track.innerHTML = items + items;
  }

  // ---------- count-up ----------
  function countUps(root) {
    root.querySelectorAll('[data-count]').forEach(el => {
      const target = +el.dataset.count;
      const t0 = performance.now(), dur = 900;
      const step = now => {
        const p = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // ---------- dashboard ----------
  const KPI_DEFS = [
    { key: 'hotspots', label: 'kpi_hotspots', icon: '🛰️', color: '#22d3ee' },
    { key: 'industrial', label: 'kpi_indfires', icon: '🔴', color: '#ef4444' },
    { key: 'forest', label: 'kpi_forest', icon: '🔥', color: '#f97316' },
    { key: 'flares', label: 'kpi_flares', icon: '🟡', color: '#f59e0b' },
    { key: 'power', label: 'kpi_power', icon: '🟢', color: '#22c55e' },
    { key: 'mining', label: 'kpi_mining', icon: '⛏️', color: '#8b5cf6' },
    { key: 'severe', label: 'kpi_severe', icon: '🚨', color: '#ef4444' },
    { key: 'predrisk', label: 'kpi_predrisk', icon: '🎯', color: '#f97316' },
  ];

  function kpiSpark(key) {
    // derive a small series from analytics months
    const m = DATA.analytics.months;
    const map = { hotspots: 'total', industrial: 'industrial', forest: 'forest', flares: 'flare', power: 'power', mining: 'mining' };
    const k = map[key];
    if (k) return m.map(x => x[k] || 1);
    return m.map((_, i) => 20 + Math.sin(i) * 8 + i * 2);
  }

  function renderKpis(noAnim) {
    const grid = document.getElementById('kpiGrid');
    const spark = id => {
      const s = kpiSpark(id);
      const max = Math.max(...s), min = Math.min(...s);
      const pts = s.map((v, i) => `${(i / (s.length - 1)) * 70 + 2},${28 - ((v - min) / (max - min || 1)) * 24}`);
      return `<svg class="kpi-spark" width="74" height="30" viewBox="0 0 74 30"><polyline points="${pts.join(' ')}" fill="none" stroke="${KPI_DEFS.find(d => d.key === id).color}" stroke-width="1.6" opacity="0.8"/></svg>`;
    };
    grid.innerHTML = KPI_DEFS.map((d, i) => {
      const v = simState.kpis[d.key];
      const delta = [12, 9, -4, 6, 3, 5, 14, 11][i];
      const dCls = delta >= 0 ? 'up' : 'down';
      return `<div class="kpi" style="--kpi-c:${d.color}">
        <div class="kpi-top"><span class="kpi-ico">${d.icon}</span><span class="kpi-delta ${dCls}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%</span></div>
        <div class="kpi-val" data-count="${v}">${noAnim ? v : 0}</div>
        <div class="kpi-lbl">${T(d.label)}</div>
        ${spark(d.key)}
      </div>`;
    }).join('');
    if (!noAnim) countUps(grid);
  }

  function refreshDashboard() {
    // KPI values derived from data — no fake offsets when the feed is live
    const hs = DATA.hotspots;
    const real = !!DATA_META.live || !!DATA_META.demo;
    const count = (f, off) => (real ? f() : f() + off);
    simState.kpis = {
      hotspots: count(() => hs.length, 18),
      industrial: hs.filter(h => h.category === 'industrial').length,
      forest: count(() => hs.filter(h => h.category === 'forest').length, 7),
      flares: count(() => hs.filter(h => h.category === 'flare').length, 2),
      power: hs.filter(h => h.category === 'power').length,
      mining: count(() => hs.filter(h => h.category === 'mining').length, 1),
      severe: hs.filter(h => h.severity === 'critical' || h.severity === 'high').length,
      predrisk: hs.reduce((s, h) => s + (h.pred.h24 > 70 ? 1 : 0), 0),
    };
    renderKpis();
    renderFeed();
    renderZones();
    // National risk gauge from the actual state scores
    const scores = Object.entries(DATA.stateRisk).filter(([k]) => !k.startsWith('_')).map(([, v]) => v.score);
    const nat = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const cat = nat >= 82 ? 'critical' : nat >= 62 ? 'high' : nat >= 40 ? 'moderate' : 'low';
    gaugeChart('gaugeRisk', nat, RISK_CAT[cat].color);
    document.getElementById('gaugeRiskVal').textContent = nat;
    const chip = document.querySelector('#view-dashboard .chip-red');
    if (chip) {
      chip.textContent = T(RISK_CAT[cat].label);
      chip.className = 'chip chip-' + (cat === 'critical' ? 'red' : cat === 'high' ? 'orange' : cat === 'moderate' ? 'amber' : 'green');
    }
  }

  function renderFeed() {
    const box = document.getElementById('activityFeed');
    const items = simState.feed.length ? simState.feed : DATA.hotspots.slice(0, 9).map(h => ({
      h, t: new Date(), msg: null,
    }));
    box.innerHTML = items.slice(0, 9).map(f => {
      const h = f.h, c = CAT[h.category];
      const title = f.msg || (h.severity === 'critical' ? `${T(c.label)} detected — ${h.name}` : `${h.name} re-scanned`);
      const time = f.t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      return `<div class="feed-item" onclick="App.goHotspot('${h.id}')">
        <span class="feed-dot" style="background:${c.color}"></span>
        <div class="feed-main"><div class="feed-title">${title}</div><div class="feed-sub">${h.district}, ${h.state} • ${T(c.label)}</div></div>
        <div class="feed-right"><div class="feed-frp">${h.frp} MW</div><div class="feed-time">${time}</div></div>
      </div>`;
    }).join('');
    document.getElementById('feedCount').textContent = simState.feed.length ? `${simState.feed.length} live` : 'STREAMING';
  }

  function renderZones() {
    const zones = [...DATA.hotspots]
      .filter(h => h.category !== 'forest' && h.category !== 'agri')
      .sort((a, b) => b.frp - a.frp).slice(0, 5);
    const max = zones[0].frp;
    document.getElementById('zoneList').innerHTML = zones.map((z, i) => `
      <div class="zone-row"><span class="zone-rank">0${i + 1}</span>
        <span class="zone-name">${z.name}</span>
        <span class="zone-bar"><i style="width:${(z.frp / max) * 100}%"></i></span>
        <span class="zone-val">${z.frp} MW</span></div>`).join('');
  }

  // live simulation loop
  let simTimer = null, alertTimer = null;
  function startLiveSim() {
    if (simTimer) return;
    simTimer = setInterval(() => {
      const h = DATA.hotspots[Math.floor(Math.random() * DATA.hotspots.length)];
      // Only jitter values in seeded-sample mode; live + CSV demo readings stay untouched.
      if (!DATA_META.live && !DATA_META.demo) {
        const jitter = (Math.random() * 2 - 1) * 1.5;
        h.temperature = +(h.temperature + jitter).toFixed(1);
        h.frp = +(Math.max(1, h.frp + (Math.random() * 2 - 1))).toFixed(1);
      }
      simState.feed.unshift({ h: { ...h }, t: new Date() });
      if (simState.feed.length > 30) simState.feed.pop();
      const view = document.getElementById('view-dashboard');
      if (view.classList.contains('active')) { renderFeed(); }
    }, TW_CONFIG.SIM_INTERVAL_MS);

    // Random fabricated alerts only in seeded-sample mode; live + CSV demo alerts come from real detections.
    if (!DATA_META.live && !DATA_META.demo) {
      alertTimer = setInterval(() => {
        if (Math.random() < 0.6) return;
        const types = [
          { type: 'new', icon: '🔥', sev: 'critical', color: '#ef4444' },
          { type: 'anomaly', icon: '🌡️', sev: 'high', color: '#f97316' },
          { type: 'spread', icon: '🌀', sev: 'high', color: '#f59e0b' },
        ];
        const t = types[Math.floor(Math.random() * types.length)];
        const h = DATA.hotspots[Math.floor(Math.random() * DATA.hotspots.length)];
        const id = `AL-${2026}-${String(7000 + Math.floor(Math.random() * 9000))}`;
        const alert = {
          id, type: t.type, icon: t.icon, sev: t.sev, color: t.color,
          titleKey: t.type === 'new' ? 'al_type_new' : t.type === 'anomaly' ? 'al_type_anomaly' : 'al_type_spread',
          desc: `${h.name} — ${h.district}, ${h.state}`,
          hotspotId: h.id, state: h.state, acked: false,
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        };
        DATA.alerts.unshift(alert);
        if (channelPrefs.dashboard) toast(`${T(alert.titleKey)} — ${alert.desc}`, 'danger', '🚨 ' + T(alert.titleKey));
        const view = document.getElementById('view-alerts');
        if (view.classList.contains('active')) renderAlerts();
      }, 26000);
    }
  }

  // ---------- analytics ----------
  function renderAnalytics() {
    const A = DATA.analytics;
    const period = document.querySelector('#anPeriod .seg-btn.active')?.dataset.period || '12m';
    const slice = period === '3m' ? A.months.slice(-3) : A.months;
    const labels = slice.map(m => m.month);

    lineChart('chMonth', labels, [
      { label: T('kpi_hotspots'), data: slice.map(m => m.total), borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,0.10)', fill: true },
      { label: T('cat_industrial'), data: slice.map(m => m.industrial), borderColor: '#ef4444', backgroundColor: 'transparent' },
      { label: T('cat_forest'), data: slice.map(m => m.forest), borderColor: '#f97316', backgroundColor: 'transparent', borderDash: [4, 3] },
    ]);

    barChart('chState', A.stateTop.map(s => s.state), [{
      label: T('kpi_hotspots'), data: A.stateTop.map(s => s.count),
      backgroundColor: A.stateTop.map((_, i) => i < 3 ? 'rgba(239,68,68,0.75)' : i < 6 ? 'rgba(249,115,22,0.75)' : 'rgba(34,211,238,0.7)'),
      borderRadius: 5,
    }], { indexAxis: 'y', plugins: { legend: { display: false } } });

    doughnutChart('chIndustry', Object.keys(A.industryMap), Object.values(A.industryMap),
      ['#ef4444', '#f97316', '#22c55e', '#f59e0b', '#8b5cf6']);

    barChart('chFlare', Object.keys(A.regionMap), [{
      label: T('cat_flare'), data: Object.values(A.regionMap),
      backgroundColor: 'rgba(245,158,11,0.8)', borderRadius: 5,
    }], { plugins: { legend: { display: false } } });

    barChart('chZones', A.zones.map(z => z.name), [{
      label: T('an_zones_title'), data: A.zones.map(z => +z.count.toFixed(0)),
      backgroundColor: 'rgba(59,130,246,0.75)', borderRadius: 5,
    }], { indexAxis: 'y', plugins: { legend: { display: false } } });

    document.querySelectorAll('#anPeriod .seg-btn').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#anPeriod .seg-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderAnalytics();
      };
    });
    // data-source note under the charts
    const note = document.querySelector('#view-analytics .data-note');
    if (note) {
      note.textContent = DATA_META.live
        ? T('an_note_live')
          .replace('{count}', DATA_META.count)
          .replace('{days}', DATA_META.days)
          .replace('{time}', DATA_META.fetchedAt ? new Date(DATA_META.fetchedAt).toLocaleString('en-IN') : '—')
        : T('an_note_demo');
    }
  }

  // ---------- risk ----------
  function renderRiskChrome(force) {
    const legend = document.getElementById('riskLegend');
    if (legend) {
      legend.innerHTML = ['critical', 'high', 'moderate', 'low'].map(c => {
        const rc = RISK_CAT[c];
        return `<span class="lg-row" style="display:flex;align-items:center;gap:6px"><span class="sw" style="background:${rc.color};width:13px;height:13px;border-radius:4px;display:inline-block"></span><span style="font-size:0.74rem;color:var(--text-soft)">${T(rc.label)}</span></span>`;
      }).join('');
    }
    // national score
    const scores = Object.entries(DATA.stateRisk).filter(([k]) => !k.startsWith('_')).map(([, v]) => v.score);
    const nat = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const cat = nat >= 82 ? 'critical' : nat >= 62 ? 'high' : nat >= 40 ? 'moderate' : 'low';
    gaugeChart('gaugeNational', nat, RISK_CAT[cat].color);
    document.getElementById('gaugeNationalVal').textContent = nat;
    document.getElementById('riskGaugeLabel').textContent = `${T('rs_cat')}: ${T(RISK_CAT[cat].label)} (${nat}%)`;
  }

  function showStatePanel(st, layer) {
    const info = DATA.stateRisk[st];
    if (!info) return;
    if (highlightedState && highlightedState.resetStyle) { highlightedState.resetStyle(); }
    if (layer) { layer.setStyle({ weight: 2.5, color: '#22d3ee', fillOpacity: 0.9 }); highlightedState = layer; }
    const rc = RISK_CAT[info.category];
    const districts = Object.entries(info.districts).sort((a, b) => b[1] - a[1]);
    document.getElementById('riskStatePlaceholder').classList.add('hidden');
    const content = document.getElementById('riskStateContent');
    content.classList.remove('hidden');
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px">
        <b style="font-family:var(--font-head);font-size:1.05rem">${st}</b>
        <span class="risk-badge ${rc.color === '#ef4444' ? 'risk-critical' : rc.color === '#f97316' ? 'risk-high' : rc.color === '#f59e0b' ? 'risk-moderate' : 'risk-low'}">${T(rc.label)} • ${info.score}</span>
      </div>
      <div class="d-grid" style="margin-bottom:12px">
        <div class="d-item"><div class="k">${T('rs_hist')}</div><div class="v">${info.incidents}</div></div>
        <div class="d-item"><div class="k">${T('nav_alerts')}</div><div class="v">${info.alerts}</div></div>
        <div class="d-item full"><div class="k">${T('rs_pops')}</div><div class="v">${(info.score * 4200).toLocaleString('en-IN')}</div></div>
      </div>
      <div class="section-label">${T('d_district')} — ${T('d_hotspot_id')} counts</div>
      ${districts.slice(0, 8).map(([d, c]) => `
        <div class="state-district"><span>📍 ${d}</span><span class="cnt">${c} hotspots</span></div>`).join('')}
      <div class="section-label">${T('rs_reco')}</div>
      <div class="reason-list">
        <div class="reason-item"><span class="ok">→</span>Increase satellite revisit cadence to 3-hourly for ${st}</div>
        <div class="reason-item"><span class="ok">→</span>Pre-position response units in top ${districts.slice(0, 2).map(([d]) => d).join(', ')} districts</div>
        <div class="reason-item"><span class="ok">→</span>Cross-check ${districts[0][0]} plume with air-quality sensors</div>
      </div>`;
    toast(`${st} — ${T('rs_score')} ${info.score}/100 (${T(rc.label)})`, 'warn', '🗺️ ' + T('risk_state_title'));
  }

  // ---------- alerts ----------
  function renderAlerts() {
    const list = document.getElementById('alertList');
    const shown = DATA.alerts.filter(a => alertFilter === 'all' || a.type === alertFilter);
    const open = DATA.alerts.filter(a => !a.acked).length;
    document.getElementById('alertsOpen').textContent = open;
    document.getElementById('alertsTotal').textContent = DATA.alerts.length;
    list.innerHTML = shown.map(a => {
      const sevCls = 'sev-' + (a.sev === 'critical' ? 'critical' : a.sev === 'high' ? 'high' : a.sev === 'medium' ? 'medium' : 'low');
      return `<div class="alert-card ${sevCls}" data-id="${a.id}">
        <span class="alert-ico" style="border-color:${a.color}33">${a.icon}</span>
        <div class="alert-body">
          <div class="alert-title">${T(a.titleKey)} ${a.acked ? '<span class="alert-tag" style="background:rgba(34,197,94,0.12);color:var(--green)">' + T('al_acked') + '</span>' : ''}</div>
          <div class="alert-desc">${a.desc}</div>
          <div class="alert-meta">
            <span class="alert-tag" style="color:${a.color};border:1px solid ${a.color}55;padding:2px 8px">${T(a.sev === 'critical' ? 'sev_critical' : a.sev === 'high' ? 'sev_high' : a.sev === 'medium' ? 'sev_medium' : 'sev_low')}</span>
            <span>🛰️ ${a.hotspotId}</span><span>📍 ${a.state}</span><span>🕐 ${a.date} ${a.time}</span>
          </div>
        </div>
        <div class="alert-actions">
          <button class="alert-ack ${a.acked ? 'done' : ''}" data-id="${a.id}">${a.acked ? '✓' : T('al_ack')}</button>
        </div>
      </div>`;
    }).join('') || '<div class="muted" style="padding:30px;text-align:center">No alerts in this category.</div>';

    list.querySelectorAll('.alert-ack').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        const a = DATA.alerts.find(x => x.id === b.dataset.id);
        if (a) { a.acked = !a.acked; renderAlerts(); }
      };
    });
    list.querySelectorAll('.alert-card').forEach(card => {
      card.onclick = e => {
        if (e.target.closest('.alert-ack')) return;
        const a = DATA.alerts.find(x => x.id === card.dataset.id);
        if (a && a.hotspotId) {
          showView('map');
          setTimeout(() => LiveMap.selectHotspot(a.hotspotId), 260);
        }
      };
    });
  }

  function initChannels() {
    const box = document.getElementById('channelToggles');
    box.querySelectorAll('.ch-btn').forEach(b => {
      b.classList.toggle('on', !!channelPrefs[b.dataset.ch]);
      b.onclick = () => {
        channelPrefs[b.dataset.ch] = !channelPrefs[b.dataset.ch];
        localStorage.setItem('tw_channels', JSON.stringify(channelPrefs));
        b.classList.toggle('on', channelPrefs[b.dataset.ch]);
        const on = Object.entries(channelPrefs).filter(([, v]) => v).map(([k]) => k).join(', ');
        toast('Notification channels: ' + on, 'ok');
      };
    });
  }

  // ---------- dataset explorer ----------
  function renderDtCards() {
    const dates = DATA.records.map(r => r.acq_date).sort();
    const sats = [...new Set(DATA.records.map(r => r.satellite))].length;
    const states = [...new Set(DATA.records.map(r => r.state))].length;
    const cards = [
      ['📦', DATA.records.length, T('records')],
      ['📅', `${dates[0]} → ${dates[dates.length - 1]}`, 'acq_date range'],
      ['🛰️', sats, 'satellites'],
      ['🗺️', states, 'states covered'],
    ];
    document.getElementById('dtCards').innerHTML = cards.map(([ico, v, k]) =>
      `<div class="dt-card-mini"><div class="k">${ico} ${k}</div><div class="v">${v}</div></div>`).join('');
  }

  function renderDataTable() {
    renderDtCards();
    const typeSel = document.getElementById('dtType');
    if (!typeSel.options.length) {
      typeSel.innerHTML = '<option value="all">' + T('dt_t_all') + '</option>' + Object.entries(CAT).map(([k, c]) => `<option value="${k}">${T(c.label)}</option>`).join('');
      document.getElementById('dtSat').innerHTML = '<option value="all">' + T('dt_s_all') + '</option>' + ['Terra', 'Aqua', 'Suomi-NPP', 'NOAA-20', 'NOAA-21'].map(s => `<option>${s}</option>`).join('');
      const states = [...new Set(DATA.hotspots.map(h => h.state))].sort();
      document.getElementById('dtState').innerHTML = '<option value="all">' + T('dt_st_all') + '</option>' + states.map(s => `<option>${s}</option>`).join('');
    }
    const q = (document.getElementById('dtSearch').value || '').toLowerCase();
    const t = document.getElementById('dtType').value;
    const sat = document.getElementById('dtSat').value;
    const st = document.getElementById('dtState').value;
    let rows = DATA.records.filter(r =>
      (!q || r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.state.toLowerCase().includes(q) || r.district.toLowerCase().includes(q)) &&
      (t === 'all' || r.category === t) &&
      (sat === 'all' || r.satellite === sat) &&
      (st === 'all' || r.state === st)
    );
    rows = rows.sort((a, b) => {
      const va = a[dataSort.key], vb = b[dataSort.key];
      return (va < vb ? -1 : va > vb ? 1 : 0) * dataSort.dir;
    });
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    dataPage = Math.min(dataPage, pages);
    const pageRows = rows.slice((dataPage - 1) * PAGE_SIZE, dataPage * PAGE_SIZE);
    document.getElementById('dtCount').textContent = `${rows.length} ${T('records')} • ${pages} p.`;
    document.getElementById('dtPage').textContent = `${dataPage} / ${pages}`;
    document.getElementById('dtPrev').disabled = dataPage <= 1;
    document.getElementById('dtNext').disabled = dataPage >= pages;

    const cols = [
      ['id', 'ID'], ['acq_date', 'ACQ_DATE'], ['acq_time', 'ACQ_TIME'], ['satellite', 'SATELLITE'],
      ['instrument', 'INSTRUMENT'], ['confidence', 'CONF'], ['brightness', 'BRIGHTNESS'], ['bright_t31', 'T31'],
      ['frp', 'FRP'], ['type', 'TYPE'], ['daynight', 'D/N'], ['category', 'CATEGORY'], ['state', 'STATE'],
      ['district', 'DISTRICT'], ['latitude', 'LAT'], ['longitude', 'LON'],
    ];
    document.getElementById('dtHead').innerHTML = cols.map(([key, lbl]) =>
      `<th data-key="${key}" class="${dataSort.key === key ? 'sorted' : ''}">${lbl} ${dataSort.key === key ? (dataSort.dir === 1 ? '▲' : '▼') : ''}</th>`).join('');
    document.getElementById('dtHead').querySelectorAll('th').forEach(th => {
      th.onclick = () => {
        const k = th.dataset.key;
        if (dataSort.key === k) dataSort.dir *= -1;
        else { dataSort.key = k; dataSort.dir = -1; }
        dataPage = 1;
        renderDataTable();
      };
    });
    document.getElementById('dtBody').innerHTML = pageRows.map(r => {
      const c = CAT[r.category] || CAT.industrial;
      return `<tr data-id="${r.id}">
        <td><b style="color:var(--cyan)">${r.id}</b></td>
        <td>${r.acq_date}</td><td>${r.acq_time}</td>
        <td>${r.satellite}</td><td>${r.instrument}</td>
        <td>${r.confidence}</td><td>${r.brightness}</td><td>${r.bright_t31}</td>
        <td><b>${r.frp}</b></td><td>${r.type}</td><td>${r.daynight}</td>
        <td><span class="dt-tag" style="color:${c.color};border:1px solid ${c.color}55">${T(c.label)}</span></td>
        <td>${r.state}</td><td>${r.district}</td><td>${r.latitude}</td><td>${r.longitude}</td>
      </tr>`;
    }).join('');
    document.getElementById('dtBody').querySelectorAll('tr').forEach(tr => {
      tr.onclick = () => {
        const id = tr.dataset.id;
        document.querySelectorAll('#dtBody tr').forEach(x => x.classList.remove('row-selected'));
        tr.classList.add('row-selected');
        showView('map');
        setTimeout(() => LiveMap.selectHotspot(id), 260);
      };
    });
  }

  function exportCsv() {
    const header = ['latitude', 'longitude', 'brightness', 'scan', 'track', 'acq_date', 'acq_time', 'satellite', 'instrument', 'confidence', 'bright_t31', 'frp', 'daynight', 'type'];
    const lines = [header.join(',')];
    DATA.records.forEach(r => lines.push(header.map(k => r[k]).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'NASA_FIRMS_India_ThermalWatch.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('NASA_FIRMS_India_ThermalWatch.csv — ' + DATA.records.length + ' ' + T('records'), 'ok', '📄 ' + T('dt_csv'));
  }

  // ---------- data source modal ----------
  function openDsModal() {
    const prefs = getDataPrefs();
    document.querySelectorAll('input[name=dsMode]').forEach(r => {
      r.checked = r.value === prefs.mode;
      r.closest('.ds-opt').classList.toggle('on', r.checked);
      r.onchange = () => {
        document.querySelectorAll('input[name=dsMode]').forEach(x => x.closest('.ds-opt').classList.toggle('on', x.checked));
        document.getElementById('dsKeyWrap').classList.toggle('hidden', r.value !== 'live');
      };
    });
    document.getElementById('dsKey').value = prefs.key || '';
    document.getElementById('dsKeyWrap').classList.toggle('hidden', prefs.mode !== 'live');
    const note = document.getElementById('dsNote');
    if (note) {
      note.innerHTML =
        `<b>${T('ds_status')}:</b> ${DATA_META.live ? T('ds_mode_live') : DATA_META.demo ? T('ds_mode_demo') : T('ds_mode_sample')}` +
        (DATA_META.count ? ` — ${DATA_META.count.toLocaleString('en-IN')} detections` : '') +
        (DATA_META.fetchedAt ? ` • ${new Date(DATA_META.fetchedAt).toLocaleTimeString('en-IN')}` : '') +
        (DATA_META.reason ? `<div style="color:var(--amber);margin-top:4px">⚠ ${DATA_META.reason}</div>` : '');
    }
    document.getElementById('dsModal').classList.remove('hidden');
  }

  function closeDsModal() {
    document.getElementById('dsModal').classList.add('hidden');
  }

  // ---------- data source switching ----------
  function setDataSource(mode, key) {
    try {
      localStorage.setItem('tw_data_mode', mode);
      localStorage.setItem('tw_firms_key', key || '');
    } catch (_) { /* storage unavailable */ }

    // Show a loading overlay while switching — prevents UI interaction and
    // hides the stale data-badge state during the transition window.
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.remove('done');
      const sub = loader.querySelector('.loader-sub');
      if (sub) sub.textContent = mode === 'live'
        ? '🔄 Switching to LIVE — connecting to NASA FIRMS…'
        : '🔄 Switching to DEMO — loading archive…';
    }

    const badge = document.getElementById('dataBadge');
    const badgeText = document.getElementById('dataBadgeText');
    if (badge) badge.style.pointerEvents = 'none';
    if (badgeText) badgeText.textContent = 'SYNCING…';
    if (badge) badge.classList.add('demo');
    const dot = document.getElementById('dataBadgeDot');
    if (dot) dot.className = 'live-dot amber';

    toast(mode === 'live'
      ? 'Switching to live mode — syncing NASA FIRMS feed…'
      : 'Switching to demo mode — loading bundled CSV archive…', 'warn', '🛰️ Data Source');

    // Timeout: if initData takes >30s something is wrong (bad key, network, 502).
    const switched = initData();
    const timeout = setTimeout(() => {
      if (loader && !loader.classList.contains('done')) {
        const sub = loader.querySelector('.loader-sub');
        if (sub) sub.textContent = '⚠ Data source timed out — showing cached sample data';
        toast('Data source switch timed out — using cached sample data', 'warn', '🛰️ Data Source');
      }
    }, 30000);
    return switched.then(meta => {
      clearTimeout(timeout);
      onDataReady(meta);
    }).catch(err => {
      clearTimeout(timeout);
      // Keep the seeded sample active; show a warning that the switch failed.
      if (loader) {
        const sub = loader.querySelector('.loader-sub');
        if (sub) sub.textContent = '⚠ Switch failed — using bundled sample data';
      }
      toast('Data source switch failed — using bundled sample data', 'warn', '🛰️ Data Source');
      onDataReady();
    });
  }

  // Called after the data source (demo/live) finishes syncing: swap the
  // rendered views to the freshly loaded data without a full page reload.
  function onDataReady(meta) {
    meta = meta || DATA_META;
    renderDataBadge();
    // Restore pointer-events on the data badge after sync completes.
    const badge = document.getElementById('dataBadge');
    if (badge) badge.style.pointerEvents = '';
    // Hide the loader if it's still showing.
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('done');
      const sub = loader.querySelector('.loader-sub');
      if (sub) sub.textContent = '🛰️ Syncing data source…';
    }
    renderHeroStats();
    renderStrip();
    refreshDashboard();
    renderLegend();
    renderRiskChrome(true);
    if (INIT.map) LiveMap.refreshAll();
    if (INIT.risk) { LiveMap.resetRiskMap(); renderRiskChrome(true); }
    if (INIT.analytics) { renderAnalytics(); LiveMap.resetHeatMini(); }
    if (INIT.alerts) renderAlerts();
    if (INIT.data) {
      ['dtType', 'dtSat', 'dtState'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
      renderDataTable();
    }
    if (INIT.reports) Reports.init();
    toast(
      meta.live
        ? `Live feed synced — ${meta.count.toLocaleString('en-IN')} detections (last ${meta.days}d)`
        : meta.demo
          ? `Demo archive loaded — ${meta.count.toLocaleString('en-IN')} detections (12 months)`
          : 'Data feed unavailable — showing bundled sample data',
      meta.live || meta.demo ? 'ok' : 'warn', '🛰️ Data Source'
    );
  }

  // ---------- public ----------
  return {
    init() {
      // theme
      const saved = localStorage.getItem('tw_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', saved);
      document.getElementById('themeToggle').onclick = () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('tw_theme', next);
        if (INIT.map) LiveMap.invalidateAll();
      };
      // lang
      document.querySelectorAll('.lang-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === CURRENT_LANG);
        b.onclick = () => setLang(b.dataset.lang);
      });
      // nav — re-running the current view closes the mobile drawer (clicking the
      // active link otherwise fires no hashchange and leaves the menu open)
      document.querySelectorAll('[data-nav]').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault();
          const id = a.dataset.nav;
          if (location.hash === '#' + id) showView(id); else location.hash = id;
          document.getElementById('navLinks').classList.remove('open');
          document.getElementById('hamburger').classList.remove('open');
        });
      });
      document.getElementById('hamburger').onclick = () => {
        document.getElementById('navLinks').classList.toggle('open');
        document.getElementById('hamburger').classList.toggle('open');
      };
      window.addEventListener('hashchange', () => showView(location.hash.replace('#', '') || 'home'));
      window.addEventListener('scroll', () => {
        document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 24);
      });
      // clock
      setInterval(() => {
        const el = document.getElementById('clock');
        if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }, 1000);
      // dataset controls (search is debounced — demo archive holds ~200k records)
      document.getElementById('dtSearch').addEventListener('input', debounce(() => { dataPage = 1; renderDataTable(); }, 200));
      ['dtType', 'dtSat', 'dtState'].forEach(id => document.getElementById(id).addEventListener('input', () => { dataPage = 1; renderDataTable(); }));
      document.getElementById('dtReset').onclick = () => {
        document.getElementById('dtSearch').value = '';
        document.getElementById('dtType').value = 'all';
        document.getElementById('dtSat').value = 'all';
        document.getElementById('dtState').value = 'all';
        dataPage = 1; renderDataTable();
      };
      document.getElementById('dtPrev').onclick = () => { dataPage--; renderDataTable(); };
      document.getElementById('dtNext').onclick = () => { dataPage++; renderDataTable(); };
      document.getElementById('dtCsv').onclick = exportCsv;
      // alert filters
      document.querySelectorAll('#alertFilter .seg-btn').forEach(b => {
        b.onclick = () => {
          document.querySelectorAll('#alertFilter .seg-btn').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          alertFilter = b.dataset.af;
          renderAlerts();
        };
      });
      initChannels();
      applyI18n();
      function debounce(fn, ms) {
        let t;
        return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
      }
      renderDataBadge();
      renderHeroStats();
      renderStrip();

      // data source modal (demo / live + API key)
      const dsModal = document.getElementById('dsModal');
      document.getElementById('dataBadge').onclick = openDsModal;
      document.getElementById('dsClose').onclick = closeDsModal;
      document.getElementById('dsCancel').onclick = closeDsModal;
      document.getElementById('dsApply').onclick = () => {
        const mode = document.querySelector('input[name=dsMode]:checked').value;
        const key = document.getElementById('dsKey').value.trim();
        closeDsModal();
        setDataSource(mode, key);
      };
      dsModal.onclick = e => { if (e.target === dsModal) closeDsModal(); };
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dsModal.classList.contains('hidden')) closeDsModal(); });

      showView(location.hash.replace('#', '') || 'home');
      startLiveSim();
      // loader — the chosen data source syncs in the background (see boot below)
      const loaderSub = document.querySelector('#loader .loader-sub');
      if (loaderSub) loaderSub.textContent = '🛰️ Syncing data source…';
      setTimeout(() => document.getElementById('loader').classList.add('done'), 700);
      if (INIT.map) LiveMap.invalidateAll();
    },
    onLangChange,
    showView,
    onDataReady,
    setDataSource,
    goHotspot(id) {
      showView('map');
      setTimeout(() => LiveMap.selectHotspot(id), 300);
    },
    openReports(id) {
      showView('reports');
      setTimeout(() => { if (!INIT.reports) { Reports.init(); INIT.reports = true; } Reports.setHotspot(id); }, 120);
    },
    showStatePanel,
    toast,
  };
})();

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  const loaderSub = document.querySelector('#loader .loader-sub');
  if (loaderSub) loaderSub.textContent = '🛰️ Syncing data source…';
  // Instant first paint with the bundled sample, then hot-swap in the chosen
  // data source (demo CSV archive or live NASA FIRMS) the moment it arrives —
  // no more waiting on the feed before the UI shows.
  App.init();
  initData().then(meta => App.onDataReady(meta)).catch(() => App.onDataReady());
});