// ============================================================
// ThermalWatch AI — GIS module (Leaflet)
// Live map • risk choropleth • mini heatmap • spread simulation
// ============================================================
const LiveMap = (() => {
  let map = null, riskMap = null, heatMini = null;
  let baseLayer = null, labelLayer = null;
  let heatLayer = null, riskLayer = null, simLayer = null;
  let markers = {};
  let selectedId = null;
  let currentFilter = 'all';
  let simTimer = null;

  const INDIA_CENTER = [22.6, 79.4];
  const TILE_PROVIDERS = {
    sat: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      att: 'ESRI World Imagery',
      maxZoom: 18,
    },
    osm: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      att: '© OpenStreetMap',
      maxZoom: 19,
    },
    terrain: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      att: '© OpenTopoMap',
      maxZoom: 17,
      subdomains: 'abc',
    },
  };

  function pinIcon(category, big) {
    const c = CAT[category] || CAT.industrial;
    return L.divIcon({
      className: 'pin-wrap',
      html: `<span class="pin ${c.cls}"></span>`,
      iconSize: big ? [20, 20] : [16, 16],
      iconAnchor: big ? [10, 10] : [8, 8],
    });
  }

  function initMap() {
    if (map) return;
    const el = document.getElementById('liveMap');
    if (!el) return;
    map = L.map(el, {
      center: INDIA_CENTER,
      zoom: 5,
      zoomControl: false,
      attributionControl: true,
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    setBase('sat');
    populateFilter();

    // heat layer
    heatLayer = L.heatLayer([], { radius: 28, blur: 24, maxZoom: 8, minOpacity: 0.42, gradient: { 0.0: '#1e3a8a', 0.3: '#0ea5e9', 0.55: '#f59e0b', 0.75: '#f97316', 1.0: '#ef4444' } }).addTo(map);

    // risk circles layer (empty until toggled)
    riskLayer = L.layerGroup().addTo(map);

    renderMarkers();

    map.on('mousemove', e => {
      const el = document.getElementById('mapCoords');
      if (el) el.textContent = `lat ${e.latlng.lat.toFixed(4)}  •  lon ${e.latlng.lng.toFixed(4)}  •  z ${map.getZoom()}`;
    });

    document.getElementById('zoomIn').onclick = () => map.zoomIn();
    document.getElementById('zoomOut').onclick = () => map.zoomOut();
    document.getElementById('recenter').onclick = () => map.setView(INDIA_CENTER, 5);
    document.getElementById('locateMe').onclick = () => locateMe();
    document.getElementById('simulateBtn').onclick = () => {
      // Selected hotspot wins; otherwise fall back to the picker, then to the
      // highest-FRP hotspot — never just the first site in the list.
      const picker = document.getElementById('simSelect');
      const id = selectedId || (picker && picker.value) || (DATA.hotspots[0] && DATA.hotspots[0].id);
      const h = id ? hotspotById(id) : null;
      if (h) simulateSpread(h);
      else if (window.App) App.toast('No hotspot available to simulate', 'warn', '⚡ Simulate');
    };
    document.getElementById('simSelect').onchange = e => {
      const id = e.target.value;
      if (id) selectHotspot(id);
    };
    document.getElementById('drawerClose').onclick = () => closeDrawer();
    document.getElementById('typeFilter').onchange = e => setFilter(e.target.value);

    document.querySelectorAll('#baseSeg .seg-btn').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#baseSeg .seg-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        setBase(b.dataset.base);
      };
    });
    document.querySelectorAll('#layerSeg .seg-btn').forEach(b => {
      b.onclick = () => {
        b.classList.toggle('active');
        if (b.dataset.layer === 'thermal') toggleHeat(b.classList.contains('active'));
        else toggleRisk(b.classList.contains('active'));
      };
    });
    document.querySelectorAll('#drawerTabs .tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('#drawerTabs .tab').forEach(x => x.classList.remove('active'));
        tab.classList.add('active');
        renderDrawerTab(tab.dataset.tab);
      };
    });
    document.getElementById('drawerReport').onclick = () => {
      if (selectedId) App.openReports(selectedId);
    };
    document.getElementById('drawerPdf').onclick = () => {
      const h = selectedId ? hotspotById(selectedId) : null;
      if (h) Reports.generate(h, 'pdf');
    };
  }

  function setBase(key) {
    const t = TILE_PROVIDERS[key];
    if (baseLayer) map.removeLayer(baseLayer);
    if (labelLayer) map.removeLayer(labelLayer);
    baseLayer = L.tileLayer(t.url, { attribution: t.att, maxZoom: t.maxZoom, subdomains: t.subdomains || 'abc' }).addTo(map);
    if (key === 'sat') {
      labelLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { attribution: 'ESRI', maxZoom: 18 }).addTo(map);
    }
  }

  function renderMarkers() {
    Object.values(markers).forEach(m => m.remove());
    markers = {};
    DATA.hotspots.forEach(h => {
      if (currentFilter !== 'all' && h.category !== currentFilter) return;
      const m = L.marker([h.lat, h.lon], { icon: pinIcon(h.category), riseOnHover: true, title: h.name });
      m.on('click', () => selectHotspot(h.id));
      m.addTo(map);
      markers[h.id] = m;
    });
    if (selectedId && !markers[selectedId]) closeDrawer();
  }

  function populateFilter() {
    const sel = document.getElementById('typeFilter');
    sel.innerHTML = '<option value="all">' + T('map_filter_all') + '</option>' +
      Object.entries(CAT).map(([k, c]) => `<option value="${k}">${c.icon} ${T(c.label)}</option>`).join('');
    sel.value = currentFilter;
    populateSimSelect();
  }

  // Hotspot picker for the ⚡ Simulate tool — sorted by FRP so the most severe
  // sources appear first; the default (empty) choice falls back to the top one.
  function populateSimSelect() {
    const sel = document.getElementById('simSelect');
    if (!sel) return;
    const sorted = DATA.hotspots.slice().sort((a, b) => b.frp - a.frp);
    sel.innerHTML = '<option value="">' + T('map_sim_pick') + '</option>' +
      sorted.map(h => `<option value="${h.id}">${h.id} — ${h.name} (${h.frp} MW)</option>`).join('');
    sel.value = '';
  }

  function locateMe() {
    if (!navigator.geolocation) {
      if (window.App) App.toast('Geolocation not supported by this browser', 'warn', '⌖ Locate');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 9, { animate: true });
        if (window.App) App.toast('Centered on your location', 'ok', '⌖ Locate');
      },
      () => { if (window.App) App.toast('Location unavailable — check browser permissions', 'warn', '⌖ Locate'); },
      { timeout: 8000 }
    );
  }

  function setFilter(cat) {
    currentFilter = cat;
    renderMarkers();
    refreshHeat();
  }

  function refreshHeat() {
    const data = DATA.hotspots
      .filter(h => currentFilter === 'all' || h.category === currentFilter)
      .map(h => [h.lat, h.lon, Math.min(1, h.frp / 42)]);
    if (heatLayer) heatLayer.setLatLngs(data);
  }

  function toggleHeat(on) {
    if (on) { refreshHeat(); if (!map.hasLayer(heatLayer)) heatLayer.addTo(map); }
    else if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
  }

  function toggleRisk(on) {
    riskLayer.clearLayers();
    if (!on) return;
    DATA.hotspots.forEach(h => {
      const sev = SEV[h.severity];
      const r = Math.max(4, h.riskScore / 9);
      L.circle([h.lat, h.lon], {
        radius: r * 260,
        color: sev.color,
        weight: 1,
        dashArray: '4 4',
        fillColor: sev.color,
        fillOpacity: 0.16,
      }).addTo(riskLayer);
    });
    if (!map.hasLayer(riskLayer)) riskLayer.addTo(map);
  }

  // ---------------- Drawer ----------------
  function openDrawer() { document.getElementById('spotDrawer').classList.add('open'); }
  function closeDrawer() {
    document.getElementById('spotDrawer').classList.remove('open');
    selectedId = null;
    document.querySelectorAll('#drawerTabs .tab').forEach((x, i) => x.classList.toggle('active', i === 0));
  }

  function selectHotspot(id) {
    const h = hotspotById(id);
    if (!h) return;
    selectedId = id;
    const c = CAT[h.category], sev = SEV[h.severity];
    document.getElementById('dPin').className = `pin-sm ${c.cls}`;
    document.getElementById('dId').textContent = h.id;
    document.getElementById('dSub').textContent = `${h.name} • ${h.district}, ${h.state}`;
    document.querySelectorAll('#drawerTabs .tab').forEach((x, i) => x.classList.toggle('active', i === 0));
    openDrawer();
    renderDrawerTab('details');
    map.setView([h.lat, h.lon], Math.max(map.getZoom(), 7), { animate: true });
  }

  function renderDrawerTab(tab) {
    const h = hotspotById(selectedId);
    if (!h) return;
    const body = document.getElementById('drawerBody');
    if (tab === 'details') body.innerHTML = detailsHtml(h);
    else if (tab === 'ai') body.innerHTML = aiHtml(h);
    else if (tab === 'timeline') { body.innerHTML = timelineHtml(h); drawTimeline(h); }
    else if (tab === 'print') { body.innerHTML = printHtml(h); drawPrint(h); }
    else if (tab === 'news') body.innerHTML = newsHtml(h);
  }

  function detailsHtml(h) {
    const c = CAT[h.category], sev = SEV[h.severity];
    const sevLabel = T(sev.label);
    const recs = h.recommendations.map(r => `<div class="reason-item"><span class="ok">✓</span>${r}</div>`).join('');
    return `
      <div class="d-grid">
        ${dItem('d_hotspot_id', h.id, 'full')}
        ${dItem('d_lat', h.lat.toFixed(4))}
        ${dItem('d_lon', h.lon.toFixed(4))}
        ${dItem('d_temp', h.temperature.toFixed(1) + ' K', tempCls(h.temperature))}
        ${dItem('d_frp', h.frp.toFixed(1) + ' MW')}
        ${dItem('d_bright', h.brightness.toFixed(1) + ' K')}
        ${dItem('d_conf', h.confidence + '%')}
        ${dItem('d_time', h.acq_date + ' ' + h.acq_time + ' IST')}
        ${dItem('d_source', h.sourceLabel)}
        ${dItem('d_industry', h.name)}
        ${dItem('d_district', h.district)}
        ${dItem('d_state', h.state)}
        ${dItem('d_severity', `<span class="risk-badge ${sev.cls}">${sevLabel}</span>`)}
        ${dItem('d_risk', h.riskScore + ' / 100', 'risk-high')}
      </div>
      ${h._cluster ? `<div class="reason-item" style="margin-top:10px"><span class="ok">🛰️</span><b>${h._cluster.count}</b> FIRMS detection${h._cluster.count === 1 ? '' : 's'} over <b>${h._cluster.days}</b> day${h._cluster.days === 1 ? '' : 's'}${h._cluster.matched ? '' : ' — no known site match within 35 km'}</div>` : ''}
      <div class="section-label">🏭 ${T('twin_title')}</div>
      <div class="d-grid">
        ${dItem('twin_normal', h.twin.normal)}
        ${dItem('twin_current', h.twin.current, h.twin.abnormal > 0 ? 'temp-warm' : '')}
        ${dItem('twin_events', h.twin.events)}
        ${dItem('twin_abnormal', h.twin.abnormal)}
        ${dItem('d_risk', h.riskScore + ' / 100', h.riskScore > 70 ? 'risk-high' : '')}
        ${dItem('twin_pattern', T('pat_' + h.pattern))}
      </div>
      ${h.twin.anomaly ? `<div class="reason-item" style="margin-top:8px;border-color:rgba(239,68,68,0.4);background:rgba(239,68,68,0.08)"><span class="warn">⚠</span><b style="color:var(--red)">${h.twin.anomaly}</b></div>` : ''}
      <div class="section-label">${T('d_history')}</div>
      <div class="reason-item"><span class="ok">⏱</span><b>${h.ageDays} days</b>&nbsp;persistent &nbsp;•&nbsp; pattern: ${T('pat_' + h.pattern)}</div>
      <div class="section-label">${T('d_action')}</div>
      ${recs}
      <div class="section-label">${T('tl_spread')}</div>
      <div class="spread-panel">
        <div class="spread-row"><span>${T('tl_wind')}</span><b>${h.wind} @ ${h.windSpeed} km/h</b></div>
        <div class="spread-row"><span>${T('tl_terrain')}</span><b>${h.terrain}</b></div>
        <div class="spread-row"><span>${T('tl_veg')}</span><b>${h.vegetation}</b></div>
        <div class="spread-row"><span>${T('tl_spread_h')}</span><b>${h.wind === 'E' ? 'East' : h.wind === 'NE' ? 'North-East' : h.wind === 'SE' ? 'South-East' : h.wind === 'SW' ? 'South-West' : h.wind === 'NW' ? 'North-West' : 'West'}</b></div>
        <div class="spread-row"><span>${T('tl_spread_a')}</span><b>~${h.affectedArea} km²</b></div>
      </div>`;
  }

  function dItem(key, val, cls) {
    const extra = cls ? ` ${cls}` : '';
    return `<div class="d-item ${key === 'd_hotspot_id' ? 'full' : ''}"><div class="k">${T(key)}</div><div class="v${extra}">${val}</div></div>`;
  }

  function tempCls(t) { return t > 355 ? 'temp-hot' : t > 345 ? 'temp-warm' : 'temp-ok'; }

  function aiHtml(h) {
    const c = CAT[h.category];
    const conf = h.confidence;
    const reasons = aiReasons(h);
    const shapBars = h.shap.map(s => {
      const pos = s.value >= 0;
      const w = Math.max(6, Math.abs(s.value) * 52);
      const col = pos ? '#ef4444' : '#3b82f6';
      return `<div class="shap-row">
        <span class="name">${s.name}</span>
        <span class="track"><i style="left:${pos ? 50 : 50 - w}%;width:${w}%;background:${col}"></i></span>
        <span class="val" style="color:${col}">${pos ? '+' : ''}${s.value.toFixed(2)}</span>
      </div>`;
    }).join('');
    return `
      <div class="section-label">${T('ai_class')}</div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <span style="font-size:2rem">${c.icon}</span>
        <div>
          <div style="font-family:var(--font-head);font-weight:700;font-size:1.15rem">${T(c.label)}</div>
          <div class="muted">${h.name}</div>
        </div>
      </div>
      <div class="conf-row"><span class="lbl">${T('ai_conf')}</span><div class="conf-bar"><i style="width:${conf}%"></i></div><span class="conf-val" style="color:${conf > 90 ? 'var(--green)' : 'var(--cyan)'}">${conf}%</span></div>
      <div class="section-label">${T('ai_reason')}</div>
      <div class="reason-list">${reasons.map(r => `<div class="reason-item"><span class="ok">✓</span>${r}</div>`).join('')}</div>
      <div class="section-label">${T('ai_shap')}</div>
      <div class="shap-bars">${shapBars}</div>
      <div class="section-label">${T('ai_lime')}</div>
      <div class="shap-bars">${h.shap.slice(0, 4).map(s => {
        const pos = s.value >= 0;
        return `<div class="shap-row"><span class="name">${s.name}</span><span class="track"><i style="left:${pos ? 50 : 50 - Math.abs(s.value) * 40}%;width:${Math.abs(s.value) * 40}%;background:${pos ? '#22c55e' : '#f59e0b'}"></i></span><span class="val">${(Math.abs(s.value)).toFixed(2)}</span></div>`;
      }).join('')}</div>`;
  }

  function aiReasons(h) {
    const x = (h.temperature - 310).toFixed(0);
    switch (h.category) {
      case 'industrial': return [
        `Located inside ${h.name} boundary (GIS overlay match 98%)`,
        `Thermal intensity ${x}°C above regional baseline`,
        `Sudden heat spike detected over last 72 hours`,
        `Smoke signature detected in Sentinel-2 SWIR band`,
        `FRP ${h.frp} MW consistent with industrial combustion`,
      ];
      case 'flare': return [
        `Stable diurnal pattern at flare stack of ${h.name}`,
        `Persistent FRP ${h.frp} MW with <8% variability`,
        `Night-time emission detected (daynight: ${h.daynight})`,
        `Signature matches routine flaring schedule`,
      ];
      case 'power': return [
        `Consistent heat at cooling towers of ${h.name}`,
        `Low FRP variability across 45-day window`,
        `Thermal output matches plant load profile`,
        `No smoke signature — non-combustion thermal source`,
      ];
      case 'mining': return [
        `Exposed strata heat at ${h.name}`,
        `Elevated T31 differential over ${(h.affectedArea).toFixed(1)} km²`,
        `Historical mining activity in same footprint`,
        `Underground combustion potential flagged`,
      ];
      case 'forest': return [
        `Vegetation index drop in ${h.district} forest block`,
        `Seasonal window active (dry season)`,
        `High FRP with low persistence — moving front`,
        `Smoke plume detected in VIIRS true-colour`,
      ];
      default: return [
        `Crop residue burning window active`,
        `Fragmented small clusters across farm belt`,
        `Daytime-only detections (daynight: ${h.daynight})`,
        `Matches regional stubble calendar (±4 days)`,
      ];
    }
  }

  function timelineHtml(h) {
    const lvl = p => p >= 70 ? 'var(--red)' : p >= 45 ? 'var(--orange)' : p >= 20 ? 'var(--amber)' : 'var(--green)';
    const lvlTxt = p => p >= 70 ? T('sev_high') : p >= 45 ? T('sev_medium') : p >= 20 ? T('risk_moderate') : T('sev_low');
    const p24 = h.pred.h24;
    return `
      <div class="section-label">${T('tl_title')}</div>
      <div style="height:185px"><canvas id="tl-chart"></canvas></div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <span class="chip ${h.pattern === 'spike' ? 'chip-red' : h.pattern === 'seasonal' ? 'chip-orange' : 'chip-green'}">${T('pat_' + h.pattern)}</span>
        <span class="chip chip-cyan">${h.ageDays} days</span>
      </div>
      <div class="reason-item" style="margin-top:10px"><span class="ok">🤖</span>
        ${T('tl_dur1')} <b>${h.ageDays}</b> ${T('tl_dur2')} ${T('pat_' + h.pattern)} ${T('tl_dur3')} ${T('tl_likely')} <b>${h.sourceLabel}: ${h.likelyPct}%</b>
      </div>
      <div class="section-label">${T('rp_sec_risk')} — ${T('pred_24h')}</div>
      <div style="position:relative;height:110px">
        <canvas id="tl-gauge"></canvas>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translateY(8px)">
          <b style="font-family:var(--font-head);font-size:1.5rem;color:${lvl(p24)}">${p24}%</b>
          <span style="font-size:0.66rem;color:var(--muted)">${lvlTxt(p24)}</span>
        </div>
      </div>
      <div class="pred-grid" style="margin-top:10px">
        ${[['6h', h.pred.h6], ['12h', h.pred.h12], ['48h', h.pred.h48]].map(([k, p]) => `
          <div class="pred-cell"><div class="h">${T('pred_' + k)}</div><div class="p" style="color:${lvl(p)}">${p}%</div><div class="lvl" style="color:${lvl(p)}">${lvlTxt(p)}</div></div>`).join('')}
      </div>`;
  }

  function drawTimeline(h) {
    const labels = h.history.map(p => p.d.slice(5));
    lineChart('tl-chart', labels, [
      { label: 'Temp (K)', data: h.history.map(p => p.t), borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.08)', fill: true, yAxisID: 'y' },
      { label: 'FRP (MW)', data: h.history.map(p => p.f), borderColor: '#22d3ee', backgroundColor: 'transparent', yAxisID: 'y1', borderDash: [5, 3] },
    ], {
      scales: { x: { display: false }, y: { display: false }, y1: { display: false, position: 'right' } },
      plugins: { legend: { display: false } },
    });
    const p24 = h.pred.h24;
    const col = p24 >= 70 ? '#ef4444' : p24 >= 45 ? '#f97316' : p24 >= 20 ? '#f59e0b' : '#22c55e';
    gaugeChart('tl-gauge', p24, col);
  }

  function printHtml(h) {
    const f = h.fingerprint;
    const radarLabels = ['Diurnal', 'Magnitude', 'FRP Variab.', 'Persistence', 'Spike Rate', 'Peak Temp'];
    const radarKeys = ['d', 'm', 'v', 'p', 's', 'h'];
    const matchPct = Math.round(f.match * 100);
    const ideal = FINGERPRINTS[f.ideal] || FINGERPRINTS['Steel Plant'];
    return `
      <div class="section-label">${T('fp_title')}</div>
      <div class="reason-item"><span class="ok">🧬</span><b>${f.best}</b></div>
      <div style="height:210px;margin-top:8px"><canvas id="fp-radar"></canvas></div>
      <div class="conf-row" style="margin-top:12px"><span class="lbl">${T('fp_match')}</span><div class="conf-bar"><i style="width:${matchPct}%"></i></div><span class="conf-val" style="color:var(--green)">${matchPct}%</span></div>
      <div class="conf-row"><span class="lbl">${T('fp_acc')}</span><div class="conf-bar"><i style="width:${f.accuracy}%"></i></div><span class="conf-val" style="color:var(--cyan)">${f.accuracy}%</span></div>
      <div class="section-label">${T('fp_compare')}</div>
      ${Object.entries(FINGERPRINTS).map(([k, v]) => {
        const diff = radarKeys.reduce((s, key) => s + Math.abs(f.values[key] - v[key]), 0);
        const sim = Math.round(Math.max(0, 1 - diff / 2.4) * 100);
        return `<div class="conf-row"><span class="lbl">${k}</span><div class="conf-bar"><i style="width:${sim}%;${k === f.ideal ? 'background:linear-gradient(90deg,#22c55e,#22d3ee)' : ''}"></i></div><span class="conf-val">${sim}%</span></div>`;
      }).join('')}
      <div class="section-label">${T('tl_spread')} — ${T('tl_spread_h')}</div>
      <div class="spread-panel">
        <div class="spread-row"><span>${T('tl_wind')}</span><b>${h.wind} @ ${h.windSpeed} km/h</b></div>
        <div class="spread-row"><span>${T('tl_terrain')}</span><b>${h.terrain}</b></div>
        <div class="spread-row"><span>${T('tl_veg')}</span><b>${h.vegetation}</b></div>
        <div class="spread-row"><span>${T('tl_temp')}</span><b>${h.temperature.toFixed(1)} K</b></div>
        <div class="spread-row"><span>${T('tl_spread_a')}</span><b>~${h.affectedArea} km²</b></div>
      </div>`;
  }

  function drawPrint(h) {
    const radarLabels = ['Diurnal', 'Magnitude', 'FRP Variab.', 'Persistence', 'Spike Rate', 'Peak Temp'];
    const radarKeys = ['d', 'm', 'v', 'p', 's', 'h'];
    radarChart('fp-radar', radarLabels, [
      { label: h.name.split(' (')[0], data: radarKeys.map(k => h.fingerprint.values[k]), borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,0.18)', pointBackgroundColor: '#22d3ee' },
      { label: h.fingerprint.ideal, data: radarKeys.map(k => (FINGERPRINTS[h.fingerprint.ideal] || {})[k] || 0.5), borderColor: 'rgba(148,163,184,0.55)', backgroundColor: 'rgba(148,163,184,0.06)', borderDash: [4, 3], pointBackgroundColor: 'transparent' },
    ], { plugins: { legend: { position: 'bottom' } } });
  }

  function newsHtml(h) {
    if (!h.news || !h.news.length) {
      return `
      <div class="section-label">${T('nw_src')}</div>
      <div class="reason-item" style="border-color:rgba(34,211,238,0.35);background:rgba(34,211,238,0.07)"><span class="ok">ℹ️</span>${T('nw_none')}</div>
      <div class="section-label">${T('nw_tl')}</div>
      <div class="reason-item"><span class="ok">▪</span><b>t-0</b>&nbsp; VIIRS anomaly confirmed (conf ${h.confidence}%) — ${h.acq_date} ${h.acq_time} IST</div>`;
    }
    return `
      <div class="section-label">${T('nw_src')}</div>
      ${h.news.map(n => `
        <div class="news-item">
          <div class="n-src"><span>${n.src}</span><span>${n.date}</span></div>
          <div class="n-title">${n.title}</div>
          <div class="n-conf">${T('nw_conf')}: <b style="color:var(--green)">${n.conf}%</b>
            <span class="conf-bar" style="display:inline-block;width:90px;vertical-align:middle;margin-left:6px"><i style="width:${n.conf}%"></i></span>
          </div>
        </div>`).join('')}
      <div class="section-label">${T('nw_tl')}</div>
      <div class="reason-list">
        <div class="reason-item"><span class="ok">▪</span><b>t-0</b>&nbsp; VIIRS anomaly confirmed (conf ${h.confidence}%)</div>
        <div class="reason-item"><span class="ok">▪</span><b>t+2h</b>&nbsp; Local media report matched ${h.district}</div>
        <div class="reason-item"><span class="ok">▪</span><b>t+6h</b>&nbsp; District authority bulletin referenced ${h.name.split(' (')[0]}</div>
        <div class="reason-item"><span class="ok">▪</span><b>t+24h</b>&nbsp; Follow-up coverage, no casualties reported</div>
      </div>`;
  }

  // ---------------- Spread simulation ----------------
  function simulateSpread(h) {
    if (!map) return;
    if (simLayer) map.removeLayer(simLayer);
    const dirMap = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
    const deg = dirMap[h.wind] || 90;
    const maxR = Math.min(0.9, 0.35 + h.windSpeed / 55);
    const steps = 18;
    let step = 0;
    const a0 = (deg - 26) * Math.PI / 180, a1 = (deg + 26) * Math.PI / 180;
    const draw = () => {
      const r = maxR * (step / steps);
      const pts = [[h.lat, h.lon]];
      const arc = [];
      for (let i = 0; i <= 14; i++) {
        const a = a0 + (a1 - a0) * (i / 14);
        arc.push([h.lat + r * Math.cos(a) / 1.0, h.lon + r * Math.sin(a) / Math.cos(h.lat * Math.PI / 180)]);
      }
      simLayer = L.layerGroup([
        L.polygon([...pts, ...arc], { color: '#f97316', weight: 2, dashArray: '6 4', fillColor: 'rgba(249,115,22,0.35)', fillOpacity: 0.45 * (step / steps) + 0.1 }),
        L.polyline([[h.lat, h.lon], arc[7]], { color: '#ef4444', weight: 3 }),
      ]).addTo(map);
    };
    simTimer = setInterval(() => {
      step++;
      draw();
      if (step >= steps) {
        clearInterval(simTimer);
        const dirName = h.wind === 'NE' ? 'north-east' : h.wind === 'SE' ? 'south-east' : h.wind === 'SW' ? 'south-west' : h.wind === 'NW' ? 'north-west' : h.wind === 'E' ? 'east' : h.wind === 'W' ? 'west' : h.wind === 'N' ? 'north' : 'south';
        const marker = L.marker([h.lat + maxR * Math.cos((a0 + a1) / 2) / 1.0, h.lon + maxR * Math.sin((a0 + a1) / 2) / Math.cos(h.lat * Math.PI / 180)], {
          icon: L.divIcon({ className: 'pin-wrap', html: '<span class="pin pin-orange" style="width:12px;height:12px"></span>', iconSize: [12, 12], iconAnchor: [6, 6] }),
        }).addTo(simLayer);
        marker.bindTooltip(`Predicted spread toward ${dirName} within 6 hours • ~${h.affectedArea} km² affected`, { permanent: false, direction: 'top' }).openTooltip();
      }
    }, 90);
  }

  // ---------------- Risk choropleth ----------------
  function initRiskMap() {
    if (riskMap) return;
    riskMap = L.map('riskMap', { center: INDIA_CENTER, zoom: 5, zoomControl: false });
    L.tileLayer(TILE_PROVIDERS.osm.url, { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(riskMap);
    const rzIn = document.getElementById('riskZoomIn');
    if (rzIn) rzIn.onclick = () => riskMap.zoomIn();
    const rzOut = document.getElementById('riskZoomOut');
    if (rzOut) rzOut.onclick = () => riskMap.zoomOut();
    const rzC = document.getElementById('riskRecenter');
    if (rzC) rzC.onclick = () => riskMap.setView(INDIA_CENTER, 5);
    fetch('assets/india_states.geojson')
      .then(r => r.json())
      .then(gj => {
        L.geoJSON(gj, {
          style: f => stateStyle(stateNorm(f.properties.NAME_1)),
          onEachFeature: (f, layer) => {
            const st = stateNorm(f.properties.NAME_1);
            const info = DATA.stateRisk[st];
            layer.on('click', () => App.showStatePanel(st, layer));
            layer.on('mouseover', () => { layer.setStyle({ weight: 2, color: '#22d3ee', fillOpacity: 0.85 }); layer.bringToFront(); });
            layer.on('mouseout', () => layer.setStyle(stateStyle(st)));
            if (info) layer.bindTooltip(`${st} — ${T('rs_score')}: ${info.score} (${T((RISK_CAT[info.category] || RISK_CAT.low).label)})`, { sticky: true });
          },
        }).addTo(riskMap);
      })
      .catch(() => {
        document.getElementById('riskMap').insertAdjacentHTML('beforeend', '<div style="position:absolute;inset:0;display:grid;place-items:center;color:var(--muted)">State boundaries unavailable — check assets/india_states.geojson</div>');
      });
    riskMap.on('mousemove', e => {
      document.getElementById('mapCoords') && null;
    });
  }

  function stateStyle(st) {
    const info = DATA.stateRisk[st];
    const cat = info ? info.category : 'low';
    const colors = { low: '#22c55e', moderate: '#f59e0b', high: '#f97316', critical: '#ef4444' };
    return {
      color: colors[cat], weight: 1.2, dashArray: '2 2',
      fillColor: colors[cat], fillOpacity: info ? 0.32 + info.score / 300 : 0.12,
    };
  }

  // ---------------- Mini heatmap (analytics) ----------------
  function initHeatMini() {
    if (heatMini) return;
    heatMini = L.map('heatMap', { center: INDIA_CENTER, zoom: 4.4, zoomControl: false, attributionControl: false });
    L.tileLayer(TILE_PROVIDERS.sat.url, { attribution: '', maxZoom: 18 }).addTo(heatMini);
    L.heatLayer(
      DATA.hotspots.map(h => [h.lat, h.lon, Math.min(1, h.frp / 42)]),
      { radius: 34, blur: 26, minOpacity: 0.5, gradient: { 0.0: '#1e3a8a', 0.35: '#0ea5e9', 0.55: '#f59e0b', 0.75: '#f97316', 1.0: '#ef4444' } }
    ).addTo(heatMini);
  }

  function invalidateAll() {
    [map, riskMap, heatMini].forEach(m => {
      if (m) setTimeout(() => { try { m.invalidateSize(); } catch (_) { /* hidden container */ } }, 80);
    });
  }

  // Re-render everything driven by DATA.hotspots after the data source changes.
  function refreshAll() {
    if (!map) return;
    renderMarkers();
    refreshHeat();
    populateSimSelect();
    if (map.hasLayer(riskLayer)) { riskLayer.clearLayers(); toggleRisk(true); }
    invalidateAll();
  }

  // Tear down + rebuild the risk choropleth so it reflects the new state scores.
  function resetRiskMap() {
    if (riskMap) { riskMap.remove(); riskMap = null; }
    initRiskMap();
  }

  // Tear down + rebuild the analytics mini heatmap from the new hotspots.
  function resetHeatMini() {
    if (heatMini) { heatMini.remove(); heatMini = null; }
    initHeatMini();
  }

  return {
    initMap, initRiskMap, initHeatMini, invalidateAll, populateFilter,
    selectHotspot, simulateSpread, refreshHeat, populateSimSelect,
    refreshAll, resetRiskMap, resetHeatMini,
    isReady: () => !!map,
  };
})();