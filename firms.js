// ============================================================
// ThermalWatch AI — NASA FIRMS proxy (server-side)
// Fetches live MODIS/VIIRS thermal detections over India,
// parses the CSV into JSON and caches briefly so reloads
// don't hammer the FIRMS API.
//
// Env config:
//   FIRMS_API_KEY   — free NASA MAP_KEY (https://firms.modaps.eosdis.nasa.gov/api/map_key/)
//   FIRMS_BBOX      — "west,south,east,north" (default: India)
//   FIRMS_SOURCES   — comma-separated source list (default: MODIS_NRT + all VIIRS 375m NRT)
//   FIRMS_DAYS      — max day range (FIRMS allows 1..5 per request)
// ============================================================
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CONFIG = {
  // Live NASA FIRMS API key. Demo mode (bundled CSV archive) is used when this
  // is not set — start with FIRMS_API_KEY=<key> npm start to go online.
  KEY: process.env.FIRMS_API_KEY || null,
  BBOX: process.env.FIRMS_BBOX || '67.0,6.0,98.5,37.5',
  SOURCES: (process.env.FIRMS_SOURCES ||
    'MODIS_NRT,VIIRS_SNPP_NRT,VIIRS_NOAA20_NRT,VIIRS_NOAA21_NRT')
    .split(',').map(s => s.trim()).filter(Boolean),
  CACHE_MS: 5 * 60 * 1000,
  TIMEOUT_MS: 25000,
  MAX_DAYS: 5,
  // The bbox also reaches neighbours (Sri Lanka, Pakistan, Bangladesh, Nepal, Myanmar).
  // By default only detections inside India's state boundaries are kept; set
  // FIRMS_INCLUDE_OUTSIDE=1 to keep them (labelled state: '—').
  INDIA_ONLY: process.env.FIRMS_INCLUDE_OUTSIDE !== '1',
  // Bundled demo CSV archive (4 FIRMS NRT products, ~1 year of India detections)
  DEMO_DIR: path.join(__dirname, 'data'),
  // Precomputed demo archive (parsed + thinned + state-attributed once, so
  // cold starts on memory-limited hosts like Render never re-parse the 63MB
  // CSVs). Stored gzipped; gunzipped + expanded at first use (~0.5s).
  // Regenerate with:  node scripts/build-demo-json.js
  DEMO_JSON: path.join(__dirname, 'data', 'demo_records.json.gz'),
  // Spatial cell (degrees) used to thin the demo archive: one record per
  // satellite / day / cell, keeping the max-FRP detection (~28 km cell).
  DEMO_CELL: 0.25,
  // The map's "live hotspots" are built from this many most-recent days of the
  // demo archive; analytics + dataset explorer still span the full year.
  DEMO_HOTSPOT_WINDOW_DAYS: 30,
};

let cache = null; // { at, payload, cacheKey } — separate cache slot per mode + key

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ThermalWatch-AI/1.0' } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('FIRMS request timed out')));
  });
}

// ---------------- India state attribution (point-in-polygon) ----------------
// Uses the bundled state-boundary GeoJSON so every detection gets a real state.
const STATE_NORM = { 'Orissa': 'Odisha', 'Uttaranchal': 'Uttarakhand' };

let indiaStates = null; // [{ name, polys: [{ bbox, rings }] }]

function loadIndiaStates() {
  if (indiaStates) return indiaStates;
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'assets', 'india_states.geojson'), 'utf8');
    const gj = JSON.parse(raw);
    const toRings = (geom) => {
      const rings = [];
      const push = (coords) => rings.push(coords.map(([lon, lat]) => ({ lon, lat })));
      if (!geom) return rings;
      if (geom.type === 'Polygon') geom.coordinates.forEach(push);
      else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(push));
      return rings;
    };
    indiaStates = (gj.features || []).map(f => {
      const rings = toRings(f.geometry);
      const polys = rings.map(ring => {
        const bbox = {
          minLon: Math.min(...ring.map(p => p.lon)), maxLon: Math.max(...ring.map(p => p.lon)),
          minLat: Math.min(...ring.map(p => p.lat)), maxLat: Math.max(...ring.map(p => p.lat)),
        };
        return { bbox, ring };
      });
      return {
        name: STATE_NORM[f.properties.NAME_1] || f.properties.NAME_1,
        polys,
      };
    }).filter(s => s.polys.length);
  } catch (e) {
    indiaStates = [];
  }
  return indiaStates;
}

function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    const intersects = ((a.lat > lat) !== (b.lat > lat)) &&
      (lon < (b.lon - a.lon) * (lat - a.lat) / (b.lat - a.lat) + a.lon);
    if (intersects) inside = !inside;
  }
  return inside;
}

function stateFor(lat, lon) {
  for (const s of loadIndiaStates()) {
    for (const p of s.polys) {
      if (lat < p.bbox.minLat || lat > p.bbox.maxLat || lon < p.bbox.minLon || lon > p.bbox.maxLon) continue;
      if (pointInRing(lat, lon, p.ring)) return s.name;
    }
  }
  return null; // outside India (bbox neighbour countries, ocean, etc.)
}

// Minimal RFC-4180-ish line splitter (FIRMS CSV is plain, but be safe).
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// MODIS CSV: brightness, bright_t31 ...  VIIRS CSV: bright_ti4, bright_ti5 ...
// Normalise both to the app schema: brightness / bright_t31.
// VIIRS NRT CSV shortens satellite names: N -> Suomi-NPP, N20 -> NOAA-20, N21 -> NOAA-21.
const SATELLITE_FRIENDLY = { N: 'Suomi-NPP', N20: 'NOAA-20', N21: 'NOAA-21' };

function parseFirmsCsv(text) {
  const clean = String(text).replace(/^\uFEFF/, '');
  const lines = clean.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) throw new Error('empty response from FIRMS');
  const header = splitCsvLine(lines[0]).map(h => h.trim());
  const looksLikeError = !header.includes('latitude') &&
    /error|invalid|unauthorized|missing|key/i.test(lines[0]);
  if (looksLikeError) throw new Error('FIRMS rejected request: ' + lines[0].slice(0, 200));
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });
  if (idx.latitude === undefined || idx.longitude === undefined) {
    throw new Error('unexpected FIRMS header: ' + header.join(','));
  }
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    if (c.length < header.length) continue;
    const g = k => (idx[k] !== undefined ? c[idx[k]] : '');
    const latitude = num(g('latitude'));
    const longitude = num(g('longitude'));
    if (!latitude && !longitude) continue;
    const brightness = num(g('bright_ti4')) || num(g('brightness'));
    // VIIRS NRT reports confidence as nominal/high/low (n/h/l); map to numeric
    // so risk scoring works. MODIS reports an integer 0..100.
    const confRaw = String(g('confidence') || '').trim();
    let confidence = 0;
    if (/^[nhl]$/i.test(confRaw)) confidence = confRaw.toLowerCase() === 'h' ? 95 : confRaw.toLowerCase() === 'n' ? 70 : 40;
    else confidence = Math.round(num(confRaw));
    records.push({
      latitude,
      longitude,
      brightness,
      bright_t31: num(g('bright_ti5')) || num(g('bright_t31')),
      scan: num(g('scan')),
      track: num(g('track')),
      acq_date: g('acq_date'),
      acq_time: String(g('acq_time') || '').padStart(4, '0'),
      satellite: SATELLITE_FRIENDLY[g('satellite')] || g('satellite'),
      instrument: g('instrument'),
      confidence,
      frp: num(g('frp')),
      daynight: (g('daynight') || 'D').toUpperCase().slice(0, 1),
      type: num(g('type')),
      version: g('version'),
    });
  }
  return records;
}

function dedupe(records) {
  const seen = new Set();
  const out = [];
  records.forEach(r => {
    const k = `${r.satellite}|${r.acq_date}|${r.acq_time}|${r.latitude.toFixed(3)}|${r.longitude.toFixed(3)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(r);
  });
  return out;
}

async function fetchFirmsSource(key, source, bbox, days) {
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${source}/${bbox}/${days}`;
  const { status, body } = await httpsGet(url, CONFIG.TIMEOUT_MS);
  if (status !== 200) throw new Error(`FIRMS ${source}: HTTP ${status}`);
  const records = parseFirmsCsv(body);
  return { source, count: records.length, records };
}

// ============================================================
// DEMO MODE — bundled NASA FIRMS CSV archive
// The four NRT product CSVs in ./data span ~1 year of India detections
// (MODIS Terra/Aqua + VIIRS S-NPP/NOAA-20/NOAA-21). They are parsed once,
// thinned to one record per satellite/day/0.25° cell (max FRP) so the
// browser stays fast, and attributed to Indian states.
// ============================================================
let demoRecords = null; // cached parsed + thinned + attributed records

function loadDemoRecords(forceRebuild) {
  if (demoRecords) return demoRecords;
  // Fast path: the precomputed archive JSON. Building it from the raw CSVs
  // costs ~63MB of parsing + per-record point-in-polygon attribution on every
  // cold start — that is what OOM'd the Render instance (502 Bad Gateway) and
  // made switching to demo feel stuck.
  if (!forceRebuild && process.env.FIRMS_REBUILD_DEMO !== '1') {
    // Try the gzipped precomputed archive, then a plain-JSON one, then CSV.
    for (const file of [CONFIG.DEMO_JSON, CONFIG.DEMO_JSON.replace(/\.gz$/, '')]) {
      try {
        let text = fs.readFileSync(file);
        if (file.endsWith('.gz')) text = zlib.gunzipSync(text);
        const parsed = JSON.parse(text.toString('utf8'));
        // Compact columnar format: { h: [fields...], r: [[values...], ...] }
        if (parsed && Array.isArray(parsed.h) && Array.isArray(parsed.r) && parsed.r.length) {
          demoRecords = parsed.r.map(row => {
            const rec = {};
            for (let i = 0; i < parsed.h.length; i++) rec[parsed.h[i]] = row[i];
            return rec;
          });
          return demoRecords;
        }
      } catch (_) {
        // missing/corrupt — try the next source below
      }
    }
  }
  const files = fs.readdirSync(CONFIG.DEMO_DIR).filter(f => /\.csv$/i.test(f));
  if (!files.length) return [];
  const all = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(CONFIG.DEMO_DIR, f), 'utf8');
    try {
      const parsed = parseFirmsCsv(text);
      for (const r of parsed) all.push(r); // push in a loop — the archive is large
    } catch (e) { /* skip unparseable file */ }
  }
  // Normalise satellite names used by these archive exports (SNPP shorthand).
  all.forEach(r => { if (r.satellite === 'SNPP') r.satellite = 'Suomi-NPP'; });
  // Thin: one record per satellite / day / cell (keep the max-FRP detection).
  const byCell = new Map();
  const cell = CONFIG.DEMO_CELL;
  for (const r of all) {
    const key = `${r.satellite}|${r.acq_date}|${Math.floor(r.latitude / cell)}|${Math.floor(r.longitude / cell)}`;
    const cur = byCell.get(key);
    if (!cur || r.frp > cur.frp) byCell.set(key, r);
  }
  const sampled = [...byCell.values()];
  sampled.forEach(r => { r.state = stateFor(r.latitude, r.longitude) || '—'; });
  let records = dedupe(sampled);
  if (CONFIG.INDIA_ONLY) records = records.filter(r => r.state !== '—');
  // Trim fields the browser pipeline never reads — keeps the payload lean.
  records.forEach(r => { delete r.version; delete r.scan; delete r.track; });
  demoRecords = records;
  return records;
}

// Serialise a fetchFirms payload for the wire: plain JSON by default, or gzip
// (cached per cache-fill) when the client accepts it. The 226k-record demo
// archive drops from ~54MB of JSON to ~5MB over the network.
function encodeResponse(payload, acceptGzip) {
  let json;
  let gzip = null;
  if (cache && cache.payload === payload) {
    if (!cache.json) cache.json = JSON.stringify(payload);
    json = cache.json;
    if (acceptGzip) {
      if (!cache.gzip) cache.gzip = zlib.gzipSync(Buffer.from(json));
      gzip = cache.gzip;
    }
  } else {
    json = JSON.stringify(payload);
    if (acceptGzip) gzip = zlib.gzipSync(Buffer.from(json));
  }
  return gzip
    ? { body: gzip, headers: { 'Content-Encoding': 'gzip' } }
    : { body: json, headers: {} };
}

function demoPayload() {
  const records = loadDemoRecords();
  return {
    live: false,
    demo: true,
    demoLabel: 'Bundled NASA FIRMS CSV archive (MODIS + VIIRS, 12 months)',
    fetchedAt: new Date().toISOString(),
    days: 365,
    bbox: CONFIG.BBOX,
    sources: ['MODIS_NRT', 'VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'],
    hotspotWindowDays: CONFIG.DEMO_HOTSPOT_WINDOW_DAYS,
    count: records.length,
    records,
  };
}

async function fetchFirms(days, opts) {
  opts = opts || {};
  const mode = opts.mode === 'demo' ? 'demo' : 'live';
  // The API key may come from the request (in-app live mode), the env var, or nothing.
  const key = (mode === 'live') ? (opts.key || CONFIG.KEY || '') : '';
  const cacheKey = mode + '|' + key;
  if (cache && cache.cacheKey === cacheKey && Date.now() - cache.at < CONFIG.CACHE_MS) return cache.payload;

  if (mode !== 'live') {
    const p = demoPayload();
    cache = { at: Date.now(), payload: p, json: null, gzip: null, cacheKey };
    return p;
  }
  if (!key) {
    // Live requested but no key anywhere — fall back to demo with a clear reason.
    const p = demoPayload();
    p.error = 'no FIRMS API key — enter one in the Data Source panel or set FIRMS_API_KEY=<key> npm start';
    cache = { at: Date.now(), payload: p, json: null, gzip: null, cacheKey };
    return p;
  }
  try {
    const dayRange = Math.min(CONFIG.MAX_DAYS, Math.max(1, parseInt(days, 10) || CONFIG.MAX_DAYS));
    const results = await Promise.allSettled(
      CONFIG.SOURCES.map(src => fetchFirmsSource(key, src, CONFIG.BBOX, dayRange))
    );
    const ok = results.filter(r => r.status === 'fulfilled');
    const errors = results.filter(r => r.status === 'rejected')
      .map(r => String(r.reason && r.reason.message || r.reason));
    if (!ok.length) throw new Error('All FIRMS sources failed: ' + errors.join('; '));
    const all = ok.flatMap(r => r.value.records);
    all.forEach(r => { r.state = stateFor(r.latitude, r.longitude) || '—'; });
    let records = dedupe(all);
    if (CONFIG.INDIA_ONLY) records = records.filter(r => r.state !== '—');
    const payload = {
      live: true,
      fetchedAt: new Date().toISOString(),
      days: dayRange,
      bbox: CONFIG.BBOX,
      sources: ok.map(r => r.value.source),
      sourceCounts: ok.map(r => ({ source: r.value.source, count: r.value.count })),
      errors,
      count: records.length,
      records,
    };
    cache = { at: Date.now(), payload, json: null, gzip: null, cacheKey };
    return payload;
  } catch (err) {
    // Live feed failed — fall back to the bundled CSV archive (demo mode).
    const p = demoPayload();
    p.error = String((err && err.message) || err);
    cache = { at: Date.now(), payload: p, json: null, gzip: null, cacheKey };
    return p;
  }
}

module.exports = { CONFIG, parseFirmsCsv, splitCsvLine, fetchFirms, encodeResponse, stateFor, loadIndiaStates, loadDemoRecords };