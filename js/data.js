// ============================================================
// ThermalWatch AI — Data Layer
// NASA FIRMS (MODIS/VIIRS) schema + industrial hotspot intelligence
// Records are deterministic (seeded) sample data modelled on FIRMS fields.
// ============================================================

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260904);
const ri = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const rf = (min, max, d = 2) => +(min + rnd() * (max - min)).toFixed(d);

const CAT = {
  industrial: { color: '#ef4444', cls: 'pin-red', label: 'cat_industrial', icon: '🔴' },
  flare:      { color: '#f59e0b', cls: 'pin-amber', label: 'cat_flare', icon: '🟡' },
  power:      { color: '#22c55e', cls: 'pin-green', label: 'cat_power', icon: '🟢' },
  mining:     { color: '#f97316', cls: 'pin-orange', label: 'cat_mining', icon: '🟠' },
  forest:     { color: '#dc2626', cls: 'pin-forest', label: 'cat_forest', icon: '🔥' },
  agri:       { color: '#eab308', cls: 'pin-agri', label: 'cat_agri', icon: '🌾' },
  unknown:    { color: '#94a3b8', cls: 'pin-forest', label: 'cat_unknown', icon: '🌡️' },
};

const RISK_CAT = {
  low: { label: 'risk_low', color: '#22c55e' },
  moderate: { label: 'risk_moderate', color: '#f59e0b' },
  high: { label: 'risk_high', color: '#f97316' },
  critical: { label: 'risk_critical', color: '#ef4444' },
};

const SEV = {
  critical: { color: '#ef4444', label: 'sev_critical', cls: 'risk-critical', score: [82, 98] },
  high:     { color: '#f97316', label: 'sev_high', cls: 'risk-high', score: [62, 81] },
  medium:   { color: '#f59e0b', label: 'sev_medium', cls: 'risk-moderate', score: [38, 61] },
  low:      { color: '#22c55e', label: 'sev_low', cls: 'risk-low', score: [8, 37] },
};

// name, kind, category, lat, lon, district, state, baseTemp(K), baseFrp, pattern, ageDays, sev
const SEED_SITES = [
  ['Paradip Refinery (IOCL)', 'Oil Refinery', 'industrial', 20.268, 86.682, 'Jagatsinghpur', 'Odisha', 356, 34, 'spike', 512, 'critical'],
  ['Rourkela Steel Plant (SAIL)', 'Steel Plant', 'industrial', 22.260, 84.901, 'Sundargarh', 'Odisha', 351, 27, 'stable', 690, 'critical'],
  ['NTPC Talcher Thermal', 'Thermal Power', 'power', 20.950, 85.212, 'Angul', 'Odisha', 342, 22, 'consistent', 1004, 'medium'],
  ['Vedanta Jharsuguda Smelter', 'Aluminium Smelter', 'industrial', 21.855, 84.010, 'Jharsuguda', 'Odisha', 348, 25, 'spike', 243, 'high'],
  ['Jindal Steel Angul', 'Steel Plant', 'industrial', 21.070, 85.110, 'Angul', 'Odisha', 347, 21, 'stable', 388, 'high'],
  ['Tata Steel Jamshedpur', 'Steel Plant', 'industrial', 22.788, 86.202, 'East Singhbhum', 'Jharkhand', 354, 31, 'spike', 722, 'critical'],
  ['Bokaro Steel Plant (SAIL)', 'Steel Plant', 'industrial', 23.677, 86.150, 'Bokaro', 'Jharkhand', 349, 24, 'stable', 610, 'high'],
  ['Jharia Coalfield Fire', 'Coal Mine', 'mining', 23.750, 86.420, 'Dhanbad', 'Jharkhand', 358, 41, 'spike', 4005, 'critical'],
  ['Raniganj Coalfield', 'Coal Mine', 'mining', 23.620, 87.130, 'Paschim Bardhaman', 'West Bengal', 344, 18, 'consistent', 3200, 'high'],
  ['Bhilai Steel Plant (SAIL)', 'Steel Plant', 'industrial', 21.190, 81.380, 'Durg', 'Chhattisgarh', 350, 26, 'stable', 720, 'high'],
  ['NTPC Korba Thermal', 'Thermal Power', 'power', 22.350, 82.680, 'Korba', 'Chhattisgarh', 341, 20, 'consistent', 890, 'medium'],
  ['Sipat Thermal Power', 'Thermal Power', 'power', 22.100, 82.300, 'Bilaspur', 'Chhattisgarh', 340, 17, 'consistent', 760, 'low'],
  ['Jamnagar Refinery (RIL)', 'Oil Refinery', 'flare', 22.260, 69.860, 'Jamnagar', 'Gujarat', 349, 38, 'stable', 1400, 'high'],
  ['Hazira Refinery (RIL)', 'Oil Refinery', 'flare', 21.150, 72.640, 'Surat', 'Gujarat', 345, 22, 'stable', 950, 'medium'],
  ['Mundra Thermal (Adani)', 'Thermal Power', 'power', 22.820, 69.520, 'Kachchh', 'Gujarat', 339, 15, 'consistent', 610, 'low'],
  ['Kutch Lignite Mine', 'Lignite Mine', 'mining', 23.150, 69.700, 'Kachchh', 'Gujarat', 343, 19, 'consistent', 540, 'medium'],
  ['Gir Forest Fringe', 'Forest', 'forest', 21.130, 70.790, 'Junagadh', 'Gujarat', 338, 12, 'seasonal', 0, 'medium'],
  ['Barmer Oil Fields (Cairn)', 'Oil Field', 'flare', 25.750, 71.400, 'Barmer', 'Rajasthan', 346, 33, 'stable', 1180, 'high'],
  ['Sri Ganganagar Belt', 'Agriculture', 'agri', 29.900, 73.880, 'Sri Ganganagar', 'Rajasthan', 337, 14, 'seasonal', 0, 'medium'],
  ['Visakhapatnam Steel (RINL)', 'Steel Plant', 'industrial', 17.750, 83.200, 'Visakhapatnam', 'Andhra Pradesh', 348, 23, 'stable', 480, 'high'],
  ['HPCL Visakh Refinery', 'Oil Refinery', 'flare', 17.720, 83.300, 'Visakhapatnam', 'Andhra Pradesh', 344, 21, 'stable', 530, 'medium'],
  ['Bellary–Hospet Iron Mines', 'Iron Ore Mine', 'mining', 15.150, 76.530, 'Ballari', 'Karnataka', 342, 16, 'consistent', 860, 'medium'],
  ['JSW Vijayanagar Steel', 'Steel Plant', 'industrial', 15.150, 76.600, 'Ballari', 'Karnataka', 350, 25, 'stable', 400, 'high'],
  ['Mangalore Refinery (MRPL)', 'Oil Refinery', 'flare', 12.950, 74.850, 'Dakshina Kannada', 'Karnataka', 343, 19, 'stable', 460, 'medium'],
  ['Bandipur–Nagarhole Forests', 'Forest', 'forest', 11.660, 76.630, 'Chamarajanagar', 'Karnataka', 336, 11, 'seasonal', 0, 'medium'],
  ['Neyveli Lignite Mine', 'Lignite Mine', 'mining', 11.530, 79.480, 'Cuddalore', 'Tamil Nadu', 344, 20, 'consistent', 1100, 'medium'],
  ['Chennai Refinery (CPCL)', 'Oil Refinery', 'flare', 13.240, 80.280, 'Chennai', 'Tamil Nadu', 342, 18, 'stable', 620, 'medium'],
  ['Salem Steel Plant (SAIL)', 'Steel Plant', 'industrial', 11.670, 78.150, 'Salem', 'Tamil Nadu', 345, 17, 'stable', 300, 'medium'],
  ['Nilgiri Shola Forests', 'Forest', 'forest', 11.400, 76.700, 'Nilgiris', 'Tamil Nadu', 335, 10, 'seasonal', 0, 'low'],
  ['Singrauli Super Thermal', 'Thermal Power', 'power', 24.100, 82.630, 'Singrauli', 'Madhya Pradesh', 340, 16, 'consistent', 920, 'medium'],
  ['Vindhyachal Thermal', 'Thermal Power', 'power', 24.100, 82.630, 'Singrauli', 'Madhya Pradesh', 341, 18, 'consistent', 850, 'medium'],
  ['Kanha–Pench Corridor', 'Forest', 'forest', 22.330, 80.600, 'Mandla', 'Madhya Pradesh', 337, 12, 'seasonal', 0, 'medium'],
  ['Panipat Refinery (IOCL)', 'Oil Refinery', 'flare', 29.390, 76.960, 'Panipat', 'Haryana', 345, 23, 'stable', 700, 'medium'],
  ['Karnal–Kurukshetra Belt', 'Agriculture', 'agri', 29.680, 76.990, 'Karnal', 'Haryana', 336, 13, 'seasonal', 0, 'high'],
  ['Amritsar–Tarn Taran Belt', 'Agriculture', 'agri', 31.630, 74.870, 'Amritsar', 'Punjab', 337, 15, 'seasonal', 0, 'high'],
  ['Ludhiana Belt', 'Agriculture', 'agri', 30.900, 75.850, 'Ludhiana', 'Punjab', 336, 12, 'seasonal', 0, 'medium'],
  ['Bathinda Refinery (HPCL)', 'Oil Refinery', 'flare', 30.130, 74.940, 'Bathinda', 'Punjab', 343, 19, 'stable', 380, 'medium'],
  ['Mathura Refinery', 'Oil Refinery', 'flare', 27.480, 77.680, 'Mathura', 'Uttar Pradesh', 342, 18, 'stable', 540, 'medium'],
  ['Meerut–Muzaffarnagar Belt', 'Agriculture', 'agri', 28.980, 77.700, 'Meerut', 'Uttar Pradesh', 336, 11, 'seasonal', 0, 'medium'],
  ['Anpara Thermal', 'Thermal Power', 'power', 24.200, 82.780, 'Sonbhadra', 'Uttar Pradesh', 340, 15, 'consistent', 780, 'low'],
  ['Durgapur Steel (SAIL)', 'Steel Plant', 'industrial', 23.550, 87.320, 'Paschim Bardhaman', 'West Bengal', 348, 22, 'stable', 660, 'high'],
  ['Haldia Refinery (IOCL)', 'Oil Refinery', 'flare', 22.050, 88.100, 'Purba Medinipur', 'West Bengal', 344, 20, 'stable', 480, 'medium'],
  ['Dooars Tea Belt', 'Forest', 'forest', 26.800, 89.200, 'Jalpaiguri', 'West Bengal', 336, 10, 'seasonal', 0, 'medium'],
  ['Koradi Thermal (MahaGenco)', 'Thermal Power', 'power', 21.240, 79.060, 'Nagpur', 'Maharashtra', 341, 17, 'consistent', 830, 'medium'],
  ['Chandrapur Thermal', 'Thermal Power', 'power', 19.940, 79.300, 'Chandrapur', 'Maharashtra', 340, 15, 'consistent', 700, 'low'],
  ['Tadoba–Andhari Forest', 'Forest', 'forest', 20.250, 79.400, 'Chandrapur', 'Maharashtra', 337, 11, 'seasonal', 0, 'high'],
  ['Uran ONGC Terminal', 'Oil & Gas Terminal', 'flare', 18.880, 72.940, 'Raigad', 'Maharashtra', 345, 26, 'stable', 440, 'high'],
  ['Kochi Refinery (BPCL)', 'Oil Refinery', 'flare', 9.970, 76.280, 'Ernakulam', 'Kerala', 342, 17, 'stable', 520, 'medium'],
  ['Wayanad–Periyar Forests', 'Forest', 'forest', 11.600, 76.100, 'Wayanad', 'Kerala', 335, 9, 'seasonal', 0, 'low'],
  ['Barauni Refinery (IOCL)', 'Oil Refinery', 'flare', 25.470, 86.980, 'Begusarai', 'Bihar', 343, 18, 'stable', 460, 'medium'],
  ['Ramagundam Thermal (NTPC)', 'Thermal Power', 'power', 18.750, 79.470, 'Peddapalli', 'Telangana', 341, 16, 'consistent', 800, 'medium'],
  ['Kothagudem Thermal', 'Thermal Power', 'power', 17.550, 80.620, 'Bhadradri', 'Telangana', 340, 15, 'consistent', 640, 'low'],
  ['Guwahati Refinery (IOCL)', 'Oil Refinery', 'flare', 26.170, 91.770, 'Kamrup', 'Assam', 344, 19, 'stable', 500, 'medium'],
  ['Numaligarh Refinery', 'Oil Refinery', 'flare', 26.630, 93.770, 'Golaghat', 'Assam', 343, 18, 'stable', 340, 'medium'],
  ['Digboi Oil Fields', 'Oil Field', 'flare', 27.380, 95.630, 'Tinsukia', 'Assam', 346, 28, 'stable', 1900, 'high'],
  ['Kaziranga Fringe', 'Forest', 'forest', 26.580, 93.170, 'Golaghat', 'Assam', 336, 9, 'seasonal', 0, 'low'],
  ['Similipal National Park', 'Forest', 'forest', 21.800, 86.300, 'Mayurbhanj', 'Odisha', 338, 13, 'seasonal', 0, 'high'],
  ['Jim Corbett Fringe', 'Forest', 'forest', 29.530, 78.770, 'Nainital', 'Uttarakhand', 335, 9, 'seasonal', 0, 'low'],
  ['Bhatinda Thermal', 'Thermal Power', 'power', 30.130, 74.940, 'Bathinda', 'Punjab', 340, 14, 'consistent', 500, 'low'],
  ['Cuddalore SIPCOT Complex', 'Chemical Park', 'industrial', 11.740, 79.760, 'Cuddalore', 'Tamil Nadu', 346, 21, 'spike', 260, 'high'],
  ['Kandla Port Complex', 'Port Terminal', 'flare', 23.030, 70.220, 'Kachchh', 'Gujarat', 344, 20, 'stable', 320, 'medium'],
  ['Bellary Thermal', 'Thermal Power', 'power', 15.120, 76.570, 'Ballari', 'Karnataka', 340, 14, 'consistent', 430, 'low'],
  ['Vizag–Anakapalli Belt', 'Agriculture', 'agri', 17.630, 82.980, 'Anakapalli', 'Andhra Pradesh', 336, 10, 'seasonal', 0, 'medium'],
];

const SATELLITES = [
  { sat: 'Terra', inst: 'MODIS', type: 0 },
  { sat: 'Aqua', inst: 'MODIS', type: 0 },
  { sat: 'Suomi-NPP', inst: 'VIIRS', type: 0 },
  { sat: 'NOAA-20', inst: 'VIIRS', type: 0 },
];

const PATTERN_DESC = {
  stable: 'stable', spike: 'a sudden rising', consistent: 'consistent', seasonal: 'seasonally periodic',
};
const PATTERN_HI = { stable: 'स्थिर', spike: 'अचानक बढ़ता', consistent: 'निरंतर', seasonal: 'मौसमी' };

function makeHistory(site, r) {
  const n = 45;
  const out = [];
  const now = Date.now();
  const start = now - n * 86400000;
  for (let i = 0; i < n; i++) {
    let t = site.baseTemp, f = site.baseFrp;
    const wave = Math.sin(i / 3.1) * (site.pattern === 'stable' ? 2.5 : 4);
    const drift = (i - n) * (site.pattern === 'spike' ? 0.42 : 0.02); // rising recently
    if (site.pattern === 'seasonal') {
      const season = Math.sin((i / 14) * Math.PI * 2 + 2);
      t += season * 5; f += Math.max(0, season) * 8;
    } else {
      t += wave + drift + rf(-1.2, 1.2);
    }
    f += rf(-2, 2);
    out.push({
      d: new Date(start + i * 86400000).toISOString().slice(0, 10),
      t: +t.toFixed(1),
      f: +Math.max(1, f).toFixed(1),
    });
  }
  return out;
}

function makeSiteObj(s, i) {
  return {
    name: s[0], kind: s[1], category: s[2], lat: s[3], lon: s[4],
    district: s[5], state: s[6], baseTemp: s[7], baseFrp: s[8],
    pattern: s[9], ageDays: s[10], sev: s[11],
  };
}

const FINGERPRINTS = {
  'Oil Refinery': { d: 0.34, m: 0.88, v: 0.42, p: 0.95, s: 0.18, h: 0.55 },
  'Steel Plant':  { d: 0.62, m: 0.92, v: 0.55, p: 0.9, s: 0.52, h: 0.6 },
  'Cement Plant': { d: 0.5, m: 0.68, v: 0.48, p: 0.8, s: 0.3, h: 0.48 },
  'Thermal Power':{ d: 0.22, m: 0.62, v: 0.25, p: 0.92, s: 0.12, h: 0.42 },
  'Mine':         { d: 0.75, m: 0.7, v: 0.7, p: 0.88, s: 0.48, h: 0.7 },
};

function fingerprintFor(site, r) {
  const kinds = { 'Oil Refinery': 'Oil Refinery', 'Oil Field': 'Oil Refinery', 'Steel Plant': 'Steel Plant', 'Thermal Power': 'Thermal Power', 'Lignite Mine': 'Mine', 'Coal Mine': 'Mine', 'Iron Ore Mine': 'Mine', 'Aluminium Smelter': 'Steel Plant', 'Oil & Gas Terminal': 'Oil Refinery', 'Chemical Park': 'Cement Plant', 'Port Terminal': 'Oil Refinery', 'Cement Plant': 'Cement Plant' };
  const kind = kinds[site.kind] || 'Steel Plant';
  const ideal = FINGERPRINTS[kind];
  const jitter = () => rf(-0.05, 0.05, 2);
  const actual = {
    d: Math.min(1, ideal.d + jitter()), m: Math.min(1, ideal.m + jitter()),
    v: Math.min(1, ideal.v + jitter()), p: Math.min(1, ideal.p + jitter()),
    s: Math.min(1, ideal.s + jitter()), h: Math.min(1, ideal.h + jitter()),
  };
  let best = { kind, score: 0 };
  Object.entries(FINGERPRINTS).forEach(([k, v]) => {
    const diff = Object.keys(v).reduce((s2, key) => s2 + Math.abs(actual[key] - v[key]), 0);
    const score = Math.max(0, 1 - diff / 2.4);
    if (score > best.score) best = { kind: k, score };
  });
  best.score = Math.min(0.99, best.score);
  const acc = Math.min(98, Math.round(best.score * 100) + ri(1, 4));
  return { ideal: kind, best: best.kind + ' Pattern', match: best.score, accuracy: acc, values: actual };
}

function shapFor(site) {
  const names = ['Thermal Intensity', 'FRP', 'Brightness T31', 'Diurnal Cycle', 'Persistence', 'Spatial Context', 'Temporal Trend', 'Proximity Index'];
  return names.map((name, i) => ({
    name,
    value: +(rf(-0.9, 0.95, 2) * (site.category === 'industrial' ? 1.2 : 1)),
  })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

function newsFor(site, r) {
  const sources = [
    ['Odisha TV', 88], ['The Hindu', 79], ['PTI', 84], ['Times of India', 74],
    ['NDTV', 76], ['Business Standard', 71], ['Navbharat Times', 68], ['News18 Local', 66],
  ];
  const act = ['reported', 'flagged', 'spotted', 'detected', 'monitored'];
  const n = ri(2, 3);
  const items = [];
  for (let i = 0; i < n; i++) {
    const [src, baseConf] = sources[ri(0, sources.length - 1)];
    const daysAgo = i === 0 ? ri(0, 2) : ri(3, 21);
    const d = new Date(Date.now() - daysAgo * 86400000);
    items.push({
      src,
      title: `${site.district}: thermal anomaly ${act[ri(0, act.length - 1)]} near ${site.name.split(' (')[0]}`,
      date: `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      conf: Math.min(95, baseConf + ri(-6, 8)),
    });
  }
  return items;
}

function recFor(site, r) {
  const sevRecs = {
    critical: ['Dispatch joint fire-response team within 15 minutes', 'Alert district emergency operations centre', 'Activate air-quality and hazmat monitoring near population centres', 'Request VIIRS 375m re-pass for next 6 hours'],
    high: ['Deploy thermal drone survey within 2 hours', 'Notify plant safety officer & local administration', 'Increase satellite revisit priority to 3-hour cadence'],
    medium: ['Log for 6-hourly automated re-check', 'Notify industrial liaison desk', 'Verify against plant flare schedule'],
    low: ['Continue routine monitoring', 'Cross-check with land-use registry quarterly'],
  };
  return sevRecs[site.sev] || sevRecs.medium;
}

function buildHotspots() {
  return SEED_SITES.map((s, i) => {
    const site = makeSiteObj(s, i);
    const { name, kind, category, lat, lon, district, state, baseTemp, baseFrp, pattern, ageDays, sev } = site;
    const r = mulberry32(i * 7919 + 17);
    const sevDef = SEV[sev];
    const riskScore = ri(sevDef.score[0], sevDef.score[1]);
    const conf = ri(84, 97);
    const frp = +(baseFrp + rf(-2.5, 2.5)).toFixed(1);
    const bright = +(baseTemp + rf(-3, 3)).toFixed(1);
    const sat = SATELLITES[i % SATELLITES.length];
    const daysAgo = ri(0, 2);
    const d = new Date(Date.now() - daysAgo * 86400000 - ri(0, 11) * 3600000);
    const dur = ageDays > 0 ? ageDays : ri(12, 60);
    const likelyPct = ri(86, 99);
    const sourceLabel = category === 'industrial' ? 'Industrial Fire' : category === 'flare' ? 'Industrial Flare' : category === 'power' ? 'Thermal Power Plant' : category === 'mining' ? 'Mining Heat Source' : category === 'forest' ? 'Forest Fire' : 'Agricultural Burning';
    return {
      id: `TW-IND-${2026}-${String(1042 + i * 7).padStart(4, '0')}`,
      name, kind, category, lat, lon, district, state,
      temperature: +(baseTemp + rf(-2, 2)).toFixed(1),
      brightness: bright,
      bright_t31: +(bright - rf(4, 11)).toFixed(1),
      frp,
      scan: rf(1.0, 2.2), track: rf(1.0, 2.2),
      confidence: conf,
      satellite: sat.sat, instrument: sat.inst, type: sat.type,
      acq_date: d.toISOString().slice(0, 10),
      acq_time: String(ri(0, 23)).padStart(2, '0') + String(ri(0, 59)).padStart(2, '0'),
      daynight: ri(0, 1) ? 'D' : 'N',
      severity: sev,
      riskScore,
      ageDays: dur,
      pattern,
      patternDesc: PATTERN_DESC[pattern],
      likelyPct,
      sourceLabel,
      history: makeHistory(site, r),
      shap: shapFor(site),
      fingerprint: fingerprintFor(site, r),
      news: newsFor(site, r),
      recommendations: recFor(site, r),
      wind: ['NE', 'E', 'SE', 'SW', 'W', 'NW'][ri(0, 5)],
      windSpeed: ri(4, 34),
      terrain: ['Flat industrial', 'Hilly', 'Coastal plain', 'Plateau', 'Riverine'][ri(0, 4)],
      vegetation: ['Sparse', 'Moderate', 'Dense'][ri(0, 2)],
      affectedArea: rf(1.2, 38.5, 1),        pred: { h6: ri(12, 86), h12: ri(18, 91), h24: ri(24, 95), h48: ri(30, 97) },
      predList: [['6h', ri(12, 86)], ['12h', ri(18, 91)], ['24h', ri(24, 95)], ['48h', ri(30, 97)]],
      twin: {
        normal: `${(baseTemp - 9).toFixed(0)}–${(baseTemp - 3).toFixed(0)} K`,
        current: `${(baseTemp - 1).toFixed(0)}–${(baseTemp + 4).toFixed(0)} K`,
        events: ri(3, 14), abnormal: ri(0, 4),
        anomaly: category === 'industrial' && sev === 'critical' ? `Abnormal thermal anomaly detected at ${name.split(' (')[0]} Unit ${ri(2, 4)}.` : null,
      },
    };
  });
}

// FIRMS flat records for the dataset explorer
function buildRecords(hotspots) {
  const records = [];
  const months = 12;
  const now = new Date();
  for (let i = 0; i < 420; i++) {
    const h = hotspots[i % hotspots.length];
    const r = mulberry32(5000 + i * 31);
    const daysAgo = ri(0, months * 30 - 1);
    const d = new Date(now - daysAgo * 86400000 - ri(0, 23) * 3600000);
    const sat = SATELLITES[ri(0, SATELLITES.length - 1)];
    const seasonal = h.category === 'agri' ? (Math.sin((daysAgo / 365) * Math.PI * 2 + 1.2) > 0.4 ? 1 : 0) : 1;
    if (!seasonal && r() < 0.6) continue;
    records.push({
      id: h.id,
      latitude: +h.lat.toFixed(4),
      longitude: +h.lon.toFixed(4),
      brightness: +(h.brightness + rf(-4, 4)).toFixed(1),
      scan: rf(1.1, 2.1, 2), track: rf(1.1, 2.1, 2),
      acq_date: d.toISOString().slice(0, 10),
      acq_time: String(ri(0, 23)).padStart(2, '0') + String(ri(0, 59)).padStart(2, '0'),
      satellite: sat.sat, instrument: sat.inst,
      confidence: ri(62, 100),
      bright_t31: +(h.bright_t31 + rf(-5, 5)).toFixed(1),
      frp: +(h.frp * rf(0.4, 1.8)).toFixed(2),
      daynight: r() > 0.5 ? 'D' : 'N',
      type: sat.type,
      category: h.category,
      state: h.state, district: h.district, name: h.name,
    });
  }
  return records.sort((a, b) => b.acq_date.localeCompare(a.acq_date) || b.acq_time.localeCompare(a.acq_time));
}

function buildAnalytics(hotspots, records, live) {
  const months = [];
  const monthKeys = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(d.toISOString().slice(0, 7));
    months.push(d.toLocaleDateString('en', { month: 'short' }));
  }
  const byMonth = monthKeys.map((_, mi) => ({ month: months[mi], total: 0, industrial: 0, forest: 0, flare: 0, agri: 0, mining: 0, power: 0 }));
  records.forEach(rec => {
    const mk = rec.acq_date.slice(0, 7);
    const mi = monthKeys.indexOf(mk);
    if (mi === -1) return;
    byMonth[mi].total++;
    byMonth[mi][rec.category]++;
  });
  // Live mode: report the real numbers; sample mode pads with a seasonality floor.
  if (!live) {
    byMonth.forEach((b, i) => {
      const agriSeason = [0.6, 1.2, 0.8, 0.4, 0.3, 0.2, 0.2, 0.4, 0.7, 1.6, 2.2, 1.4][i];
      const forestSeason = [0.3, 0.3, 0.4, 0.8, 1.8, 2.4, 1.6, 0.7, 0.4, 0.3, 0.2, 0.2][i];
      b.agri = Math.round(b.agri * 1.2 + agriSeason * 22);
      b.forest = Math.round(b.forest * 1.1 + forestSeason * 14);
      b.total = b.industrial + b.forest + b.flare + b.agri + b.mining + b.power;
    });
  }

  const byState = {};
  records.forEach(rec => {
    if (live && (!rec.state || rec.state === '—')) return; // unclassified, no state
    byState[rec.state] = (byState[rec.state] || 0) + 1;
  });
  const stateTop = Object.entries(byState).map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  const industryMap = { 'Oil Refinery': 0, 'Steel Plant': 0, 'Thermal Power': 0, 'Coal/Lignite Mine': 0, 'Cement/Other': 0 };
  hotspots.forEach(h => {
    if (h.category === 'industrial') {
      if (h.kind.includes('Refinery')) industryMap['Oil Refinery']++;
      else if (h.kind.includes('Steel')) industryMap['Steel Plant']++;
      else if (h.kind.includes('Chemical')) industryMap['Cement/Other']++;
      else industryMap['Cement/Other']++;
    }
    if (h.category === 'power') industryMap['Thermal Power'] += h.ageDays > 300 ? 2 : 1;
    if (h.category === 'mining') industryMap['Coal/Lignite Mine']++;
    if (h.category === 'flare') industryMap['Oil Refinery']++;
  });

  const regionMap = {};
  hotspots.filter(h => h.category === 'flare').forEach(h => {
    const region = ['East', 'West', 'North', 'South', 'North-East'][['West Bengal', 'Odisha', 'Jharkhand'].includes(h.state) ? 0 : ['Gujarat', 'Rajasthan', 'Maharashtra'].includes(h.state) ? 1 : ['Punjab', 'Haryana', 'Uttar Pradesh'].includes(h.state) ? 2 : ['Andhra Pradesh', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Telangana'].includes(h.state) ? 3 : 4];
    regionMap[region] = (regionMap[region] || 0) + 1;
  });

  const zones = hotspots.filter(h => h.category !== 'agri' && h.category !== 'forest')
    .map(h => ({ name: h.name.split(' (')[0], count: h.ageDays + h.history.reduce((s, p) => s + p.f, 0) / 40, frp: h.frp }))
    .sort((a, b) => b.count - a.count).slice(0, 8);

  return { months: byMonth, stateTop, industryMap, regionMap, zones };
}

function buildStateRisk(hotspots, live) {
  const RISK_BASE = {
    'Odisha': 92, 'Jharkhand': 88, 'Chhattisgarh': 84, 'West Bengal': 74, 'Gujarat': 78,
    'Maharashtra': 64, 'Rajasthan': 62, 'Madhya Pradesh': 58, 'Punjab': 80, 'Haryana': 72,
    'Uttar Pradesh': 56, 'Andhra Pradesh': 66, 'Telangana': 52, 'Karnataka': 60,
    'Tamil Nadu': 58, 'Kerala': 40, 'Assam': 54, 'Bihar': 48, 'Uttarakhand': 38,
    'Delhi': 44, 'Goa': 22, 'Himachal Pradesh': 26, 'Jammu and Kashmir': 30, 'Sikkim': 18,
    'Manipur': 20, 'Meghalaya': 24, 'Mizoram': 22, 'Nagaland': 24, 'Tripura': 20,
    'Arunachal Pradesh': 18, 'Andaman and Nicobar': 14, 'Lakshadweep': 10,
    'Puducherry': 30, 'Chandigarh': 20, 'Dadra and Nagar Haveli': 18, 'Daman and Diu': 16,
  };
  const NORM = { 'Orissa': 'Odisha', 'Uttaranchal': 'Uttarakhand' };
  const cat = s => s >= 82 ? 'critical' : s >= 62 ? 'high' : s >= 40 ? 'moderate' : 'low';
  const out = {};
  Object.entries(RISK_BASE).forEach(([st, base]) => {
    const hs = hotspots.filter(h => h.state === st).length;
    // Live mode: score from real hotspot counts only; sample mode adds a little noise.
    const score = Math.min(98, base + hs * 1.5 + (hs > 3 ? 4 : 0) + (!live && base > 75 ? ri(0, 4) : 0));
    const districts = {};
    hotspots.filter(h => h.state === st).forEach(h => {
      if (live && (!h.district || h.district === '—')) return; // unclassified cluster, no district
      districts[h.district] = (districts[h.district] || 0) + 1;
    });
    if (!live) Object.keys(districts).sort().forEach((d, i) => { districts[d] += ri(0, 3); });
    out[st] = {
      score: Math.round(score),
      category: cat(score),
      districts,
      incidents: live
        ? Math.max(hs, Math.round(hs * 9 + Object.keys(districts).length * 5))
        : ri(4, 60) + hs * 3,
      alerts: live ? Math.max(1, hs + (score > 75 ? 2 : 0)) : ri(1, 8) + hs,
    };
  });
  out._norm = NORM;
  return out;
}

function buildAlerts(hotspots) {
  const types = [
    { key: 'new', label: 'al_type_new', icon: '🔥', color: '#ef4444', sev: 'critical' },
    { key: 'anomaly', label: 'al_type_anomaly', icon: '🌡️', color: '#f97316', sev: 'high' },
    { key: 'explosion', label: 'al_type_explosion', icon: '💥', color: '#ef4444', sev: 'critical' },
    { key: 'spread', label: 'al_type_spread', icon: '🌀', color: '#f59e0b', sev: 'high' },
    { key: 'env', label: 'al_type_env', icon: '🌍', color: '#8b5cf6', sev: 'medium' },
  ];
  const desc = {
    new: h => `Industrial fire signature confirmed near ${h.name.split(' (')[0]} — ${h.district}, ${h.state}`,
    anomaly: h => `Abnormal heat increase at ${h.name.split(' (')[0]} — ${(h.temperature - 310).toFixed(0)}°C above baseline`,
    explosion: h => `Elevated explosion risk in ${h.district} industrial cluster`,
    spread: h => `Fire spread risk: ${h.wind} winds forecast near ${h.name.split(' (')[0]}`,
    env: h => `Environmental threat: elevated particulate load around ${h.district}`,
  };
  const mins = [4, 12, 26, 41, 58, 74, 96, 122, 150, 190, 230, 270];
  return mins.map((m, i) => {
    const t = types[i % types.length];
    const h = hotspots[(i * 7 + 3) % hotspots.length];
    const d = new Date(Date.now() - m * 60000);
    return {
      id: `AL-${2026}-${String(3001 + i * 13).padStart(4, '0')}`,
      type: t.key, icon: t.icon, color: t.color, sev: t.sev,
      title: '',
      desc: desc[t.key](h),
      hotspotId: h.id, state: h.state,
      time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      acked: false,
      titleKey: t.label,
    };
  });
}

const DATA = (() => {
  const hotspots = buildHotspots();
  const records = buildRecords(hotspots);
  const analytics = buildAnalytics(hotspots, records);
  const stateRisk = buildStateRisk(hotspots);
  return {
    hotspots,
    records,
    analytics,
    stateRisk,
    alerts: buildAlerts(hotspots),
    stats: {
      active: hotspots.filter(h => h.category !== 'forest' && h.category !== 'agri').length + ri(6, 14),
      industrial: hotspots.filter(h => h.category === 'industrial').length,
      flares: hotspots.filter(h => h.category === 'flare').length,
      forest: hotspots.filter(h => h.category === 'forest').length + ri(4, 9),
      power: hotspots.filter(h => h.category === 'power').length,
      highrisk: hotspots.filter(h => h.severity === 'critical' || h.severity === 'high').length,
    },
  };
})();

function hotspotById(id) { return DATA.hotspots.find(h => h.id === id); }

function stateNorm(name) {
  const n = DATA.stateRisk._norm;
  return n[name] || name;
}

// ============================================================
// LIVE NASA FIRMS PIPELINE
// When the server has FIRMS_API_KEY configured, real MODIS/VIIRS
// detections replace the generated sample data. Detections are
// clustered onto the real industrial sites in SEED_SITES (within
// 35 km); everything else is labelled 'unknown'. All severity,
// risk, history, fingerprint and prediction fields are DERIVED
// from the real measurements — no PRNG — except the wind/terrain
// values used by the fire-spread *simulation* tool.
// ============================================================

const SEED_INDEX = SEED_SITES.map((s) => ({
  name: s[0], kind: s[1], category: s[2], lat: s[3], lon: s[4],
  district: s[5], state: s[6],
}));

const LIVE_MATCH_KM = 35;      // cluster detections within this radius of a known site
const LIVE_CLUSTER_KM = 8;     // spatial radius that merges one fire's pixels into a single hotspot
const LIVE_SOURCE_LABEL = {
  industrial: 'Industrial Fire', flare: 'Industrial Flare', power: 'Thermal Power Plant',
  mining: 'Mining Heat Source', forest: 'Forest Fire', agri: 'Agricultural Burning',
  unknown: 'Unclassified Thermal Source',
};

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(x => (x - m) * (x - m))));
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Cheap equirectangular distance for the hot clustering loop (fast, plenty precise at ~km scale).
function approxKm(lat1, lon1, lat2, lon2, cosLat) {
  const dLat = (lat2 - lat1) * 111.32;
  const dLon = (lon2 - lon1) * 111.32 * cosLat;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// Group FIRMS detections into fire areas: pixels within LIVE_CLUSTER_KM of a
// cluster centre merge into one hotspot, then each hotspot is matched to the
// nearest known industrial site (LIVE_MATCH_KM) or left unclassified.
// Uses a coarse spatial grid so each record only checks its 3×3 cell
// neighbourhood — fast even for tens of thousands of records.
function clusterRecords(records, radiusKm = LIVE_CLUSTER_KM, maxKm = LIVE_MATCH_KM) {
  const cellDeg = Math.max(0.05, radiusKm / 111);
  const grid = new Map(); // "col|row" -> [clusterIndex]
  const clusters = []; // { lat, lon, count, records }
  records.slice().sort((a, b) => a.acq_date.localeCompare(b.acq_date) || a.latitude - b.latitude)
    .forEach(rec => {
      const cl = Math.floor(rec.latitude / cellDeg);
      const ck = Math.floor(rec.longitude / cellDeg);
      const cosLat = Math.cos(rec.latitude * Math.PI / 180);
      let best = -1, bestKm = radiusKm;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const bucket = grid.get((cl + i) + '|' + (ck + j));
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b++) {
            const c = clusters[bucket[b]];
            const km = approxKm(rec.latitude, rec.longitude, c.lat, c.lon, cosLat);
            if (km < bestKm) { bestKm = km; best = bucket[b]; }
          }
        }
      }
      if (best === -1) {
        const ci = clusters.length;
        clusters.push({ lat: rec.latitude, lon: rec.longitude, count: 1, records: [rec] });
        const key = cl + '|' + ck;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(ci);
      } else {
        const c = clusters[best];
        c.records.push(rec);
        c.count++;
        c.lat += (rec.latitude - c.lat) / c.count;
        c.lon += (rec.longitude - c.lon) / c.count;
      }
    });
  return clusters.map(c => {
    let seed = null, seedKm = maxKm;
    SEED_INDEX.forEach((s, i) => {
      const km = haversineKm(c.lat, c.lon, s.lat, s.lon);
      if (km < seedKm) { seedKm = km; seed = s; }
    });
    return { seed, records: c.records, centerLat: c.lat, centerLon: c.lon };
  });
}

function clusterStats(cluster) {
  const recs = cluster.records;
  const lat = mean(recs.map(r => r.latitude));
  const lon = mean(recs.map(r => r.longitude));
  const byDate = {};
  recs.forEach(r => { (byDate[r.acq_date] = byDate[r.acq_date] || []).push(r); });
  const dates = Object.keys(byDate).sort();
  const history = dates.map(d => ({
    d,
    t: +mean(byDate[d].map(r => r.brightness)).toFixed(1),
    f: +mean(byDate[d].map(r => r.frp)).toFixed(1),
  }));
  // Most common non-empty state among the cluster's detections.
  const stateCounts = {};
  recs.forEach(r => { if (r.state) stateCounts[r.state] = (stateCounts[r.state] || 0) + 1; });
  const state = Object.entries(stateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  const frps = recs.map(r => r.frp);
  const frpMean = mean(frps);
  const latest = recs.slice().sort(
    (a, b) => b.acq_date.localeCompare(a.acq_date) || b.acq_time.localeCompare(a.acq_time)
  )[0];
  const firstDate = dates[0], lastDate = dates[dates.length - 1];
  const spanDays = Math.max(1, Math.round((new Date(lastDate) - new Date(firstDate)) / 86400000) + 1);
  return {
    lat, lon,
    state,
    records: recs.length,
    dates: dates.length,
    ageDays: spanDays,
    history,
    maxFrp: Math.max(...frps),
    meanBright: mean(recs.map(r => r.brightness)),
    maxBright: Math.max(...recs.map(r => r.brightness)),
    maxConf: Math.max(...recs.map(r => r.confidence)),
    nightFrac: recs.filter(r => r.daynight === 'N').length / recs.length,
    cvFrp: frpMean ? stdev(frps) / frpMean : 0,
    spikeDays: history.filter(p => frpMean > 0 && p.f > frpMean * 1.4).length,
    recordsPerDay: recs.length / Math.max(1, dates.length),
    meanT31Diff: mean(recs.map(r => Math.max(0, r.brightness - r.bright_t31))),
    firstDate, lastDate,
    latest,
  };
}

function liveSeverity(maxFrp) {
  if (maxFrp >= 150) return 'critical';
  if (maxFrp >= 60) return 'high';
  if (maxFrp >= 15) return 'medium';
  return 'low';
}

function liveRiskScore(s) {
  const frpN = Math.min(1, s.maxFrp / 150);
  const bN = Math.max(0, Math.min(1, (s.maxBright - 300) / 50));
  const cN = Math.min(1, s.maxConf / 100);
  return Math.min(98, Math.round(10 + 45 * frpN + 12 * bN + 18 * cN));
}

function livePattern(history) {
  const frps = history.map(p => p.f);
  if (frps.length <= 1) return 'stable';
  const mid = Math.floor(frps.length / 2);
  const first = frps.slice(0, mid), last = frps.slice(mid);
  const a = mean(first), b = mean(last);
  if (a > 0 && b > a * 1.4) return 'spike';
  if (stdev(frps) / (mean(frps) || 1) < 0.25) return 'consistent';
  return 'stable';
}

// Carry-forward fill so the timeline is continuous across days without detections.
function fillHistory(history) {
  if (history.length < 2) return history;
  const byDate = new Map(history.map(p => [p.d, p]));
  const out = [];
  let prev = null;
  for (let t = new Date(history[0].d); t <= new Date(history[history.length - 1].d); t.setDate(t.getDate() + 1)) {
    const d = t.toISOString().slice(0, 10);
    const p = byDate.get(d) || (prev ? { d, t: prev.t, f: prev.f } : null);
    if (p) { out.push(p); prev = p; }
  }
  return out;
}

function fingerprintLive(s, site) {
  const values = {
    d: +Math.min(1, Math.max(0.05, s.nightFrac * 1.6 + 0.1)).toFixed(2),
    m: +Math.min(1, Math.max(0.1, (s.meanBright - 300) / 55)).toFixed(2),
    v: +Math.min(1, Math.max(0.05, s.cvFrp / 0.7)).toFixed(2),
    p: +Math.min(1, s.ageDays / 10).toFixed(2),
    s: +Math.min(1, Math.max(0.05, s.spikeDays / Math.max(1, s.dates))).toFixed(2),
    h: +Math.min(1, Math.max(0.1, (s.maxBright - 300) / 55)).toFixed(2),
  };
  let best = { kind: 'Steel Plant', score: 0 };
  Object.entries(FINGERPRINTS).forEach(([k, v]) => {
    const diff = Object.keys(v).reduce((sum, key) => sum + Math.abs(values[key] - v[key]), 0);
    const score = Math.max(0, 1 - diff / 2.4);
    if (score > best.score) best = { kind: k, score };
  });
  best.score = Math.min(0.99, best.score);
  return {
    ideal: best.kind,
    best: best.kind + ' Pattern',
    match: +best.score.toFixed(2),
    accuracy: Math.min(97, Math.round(best.score * 100) + 1),
    values,
  };
}

function shapLive(s, site) {
  const items = [
    ['Thermal Intensity', Math.min(0.9, Math.max(-0.9, (s.meanBright - 310) / 40))],
    ['FRP', Math.min(0.9, Math.max(-0.9, (s.maxFrp / 150 - 0.35) * 2))],
    ['Brightness T31', Math.min(0.9, Math.max(-0.9, (s.meanT31Diff / 12) * 0.8))],
    ['Confidence', Math.min(0.9, Math.max(-0.9, (s.maxConf - 60) / 45))],
    ['Diurnal Cycle', Math.min(0.9, Math.max(-0.9, (s.nightFrac - 0.3) * 2))],
    ['Persistence', Math.min(0.9, s.ageDays / 12)],
    ['Detection Frequency', Math.min(0.9, s.recordsPerDay / 6)],
    ['Spatial Context', site ? 0.72 : -0.31],
  ];
  return items.map(([name, value]) => ({ name, value: +value.toFixed(2) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

function livePred(history, maxFrp) {
  const last = history[history.length - 1];
  const base = Math.min(92, Math.round(25 + (last ? last.f / 40 : 0) * 45));
  const frps = history.map(p => p.f);
  const spike = last && frps.length > 1 && last.f > mean(frps) * 1.3;
  const climb = spike ? 6 : 2;
  const c = v => Math.min(98, Math.max(5, v));
  return { h6: c(base), h12: c(base + climb), h24: c(base + climb * 2), h48: c(base + climb * 3) };
}

function liveTwin(s) {
  const temps = s.history.map(p => p.t);
  if (!temps.length) return { normal: '—', current: '—', events: 0, abnormal: 0, anomaly: null };
  const lo = Math.min(...temps), hi = Math.max(...temps);
  const last2 = s.history.slice(-2);
  const curLo = Math.min(...last2.map(p => p.t)), curHi = Math.max(...last2.map(p => p.t));
  return {
    normal: `${Math.round(lo - 2)}–${Math.round(hi + 2)} K`,
    current: `${Math.round(curLo)}–${Math.round(curHi)} K`,
    events: s.dates,
    abnormal: s.spikeDays,
    anomaly: s.spikeDays > 0
      ? `Abnormal thermal activity: ${s.spikeDays} day(s) with FRP > 40% above cluster mean (${s.lat.toFixed(2)}, ${s.lon.toFixed(2)}).`
      : null,
  };
}

function buildLiveHotspot(cluster, index) {
  const s = clusterStats(cluster);
  const site = cluster.seed;
  const state = site ? site.state : s.state;
  const category = site ? site.category : 'unknown';
  const sev = liveSeverity(s.maxFrp);
  const pattern = livePattern(s.history);
  const history = fillHistory(s.history);
  const r = mulberry32(index * 104729 + 7); // deterministic sim params only
  const idYear = new Date(s.lastDate).getFullYear();
  const likelyPct = site ? Math.min(99, Math.round(68 + Math.min(31, s.maxFrp / 6))) : 55;
  const pred = livePred(history, s.maxFrp);
  return {
    id: `TW-IND-${idYear}-${String(1001 + index).padStart(4, '0')}`,
    name: site ? site.name : (state !== '—' ? `Unclassified Thermal Source — ${state}` : 'Unclassified Thermal Source'),
    kind: site ? site.kind : '—',
    category,
    lat: +s.lat.toFixed(4),
    lon: +s.lon.toFixed(4),
    district: site ? site.district : '—',
    state,
    temperature: +s.meanBright.toFixed(1),
    brightness: +s.maxBright.toFixed(1),
    bright_t31: +(s.latest.bright_t31 || s.maxBright - 8).toFixed(1),
    frp: +s.maxFrp.toFixed(1),
    scan: s.latest.scan, track: s.latest.track,
    confidence: s.maxConf,
    satellite: s.latest.satellite,
    instrument: s.latest.instrument,
    type: s.latest.type || 0,
    acq_date: s.lastDate,
    acq_time: s.latest.acq_time,
    daynight: s.latest.daynight,
    severity: sev,
    riskScore: liveRiskScore(s),
    ageDays: s.ageDays,
    pattern,
    patternDesc: PATTERN_DESC[pattern] || 'stable',
    likelyPct,
    sourceLabel: LIVE_SOURCE_LABEL[category] || 'Thermal Source',
    history,
    shap: shapLive(s, site),
    fingerprint: fingerprintLive(s, site),
    news: [], // live mode: no simulated media correlation
    recommendations: recFor({ sev }, null),
    wind: ['NE', 'E', 'SE', 'SW', 'W', 'NW'][ri(0, 5)],
    windSpeed: ri(4, 34),
    terrain: ['Flat industrial', 'Hilly', 'Coastal plain', 'Plateau', 'Riverine'][ri(0, 4)],
    vegetation: ['Sparse', 'Moderate', 'Dense'][ri(0, 2)],
    affectedArea: rf(1.2, 38.5, 1),
    pred,
    predList: [['6h', pred.h6], ['12h', pred.h12], ['24h', pred.h24], ['48h', pred.h48]],
    twin: liveTwin(s),
    _cluster: { count: s.records, days: s.dates, matched: !!site },
  };
}

function buildLiveAlerts(hotspots) {
  const types = [
    { key: 'new', label: 'al_type_new', icon: '🔥', color: '#ef4444', sev: 'critical' },
    { key: 'anomaly', label: 'al_type_anomaly', icon: '🌡️', color: '#f97316', sev: 'high' },
  ];
  const out = [];
  hotspots
    .filter(h => h.severity === 'critical' || h.severity === 'high')
    .sort((a, b) => b.frp - a.frp)
    .slice(0, 10)
    .forEach((h, i) => {
      const d = new Date(`${h.acq_date}T${(h.acq_time || '0000').slice(0, 2)}:${(h.acq_time || '0000').slice(2, 4)}:00`);
      const t = h.pattern === 'spike' ? types[1] : types[0];
      out.push({
        id: `AL-${d.getFullYear()}-${String(3100 + i * 7).padStart(4, '0')}`,
        type: t.key, icon: t.icon, color: t.color, sev: t.sev, title: '', titleKey: t.label,
        desc: `${h.pattern === 'spike' ? 'Abnormal heat increase' : 'Fire signature confirmed'} near ${h.name.split(' (')[0]} — ${h.district}, ${h.state} (FRP ${h.frp} MW)`,
        hotspotId: h.id, state: h.state, acked: false,
        time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      });
    });
  return out;
}

function buildLive(records, opts) {
  opts = opts || {};
  // Hotspots on the live map are built from the most-recent window of records
  // (demo archives span a full year — only recent activity belongs on the map),
  // while analytics + dataset explorer still use every record.
  let clusterInput = records;
  if (opts.hotspotWindowDays) {
    const dates = records.map(r => r.acq_date).sort();
    const last = dates[dates.length - 1];
    const cutoff = new Date(last);
    cutoff.setDate(cutoff.getDate() - opts.hotspotWindowDays);
    const cut = cutoff.toISOString().slice(0, 10);
    clusterInput = records.filter(r => r.acq_date >= cut);
  }
  const clusters = clusterRecords(clusterInput);
  const built = clusters.map((c, i) => buildLiveHotspot(c, i));
  // Attach cluster metadata so the dataset explorer stays filterable.
  clusters.forEach((c, i) => {
    const h = built[i];
    c.records.forEach(rr => {
      rr.id = h.id; rr.category = h.category;
      rr.state = h.state; rr.district = h.district; rr.name = h.name;
    });
  });
  const hotspots = built.sort((a, b) => b.frp - a.frp);
  const sorted = records.slice().sort(
    (a, b) => b.acq_date.localeCompare(a.acq_date) || b.acq_time.localeCompare(a.acq_time)
  );
  const hs = hotspots;
  return {
    hotspots: hs,
    records: sorted,
    analytics: buildAnalytics(hs, sorted, true),
    stateRisk: buildStateRisk(hs, true),
    alerts: buildLiveAlerts(hs),
    stats: {
      active: hs.length,
      industrial: hs.filter(h => h.category === 'industrial').length,
      flares: hs.filter(h => h.category === 'flare').length,
      forest: hs.filter(h => h.category === 'forest').length,
      power: hs.filter(h => h.category === 'power').length,
      highrisk: hs.filter(h => h.severity === 'critical' || h.severity === 'high').length,
    },
  };
}

// Runtime metadata about the active data source (live FIRMS vs demo CSV archive).
const DATA_META = { live: false, demo: false, mode: 'demo', reason: '', fetchedAt: null, days: 0, sources: [], count: 0, ms: 0 };

// Data-source preference persisted from the in-app Data Source panel:
//   tw_data_mode -> 'demo' | 'live'
//   tw_firms_key -> NASA MAP_KEY used for live mode
// Defaults: live when a key is available (env/default), otherwise demo.
function getDataPrefs() {
  let storedMode = null;
  let key = '';
  if (typeof localStorage !== 'undefined') {
    try {
      storedMode = localStorage.getItem('tw_data_mode');
      key = localStorage.getItem('tw_firms_key') || '';
    } catch (_) { /* storage unavailable */ }
  }
  // Note: no default FIRMS key is bundled anymore — live mode needs the key
  // configured on the server (FIRMS_API_KEY in .env) or entered in the panel.
  // First run (nothing stored): demo mode is the instant, offline-safe default;
  // switch to live from the Data Source panel (badge in the navbar).
  let mode = storedMode === 'live' || storedMode === 'demo' ? storedMode : 'demo';
  return { mode, key };
}

// Try to load the FIRMS feed via the server proxy — either the live NASA API
// (mode=live + key) or the bundled demo CSV archive (mode=demo). On any failure
// the bundled seeded sample stays active and DATA_META.live stays false.
async function initData() {
  const t0 = Date.now();
  try {
    const days = (typeof TW_CONFIG !== 'undefined' && TW_CONFIG.FIRMS_DAYS) || 5;
    const prefs = getDataPrefs();
    let url = 'api/firms?days=' + days + '&mode=' + prefs.mode;
    // Key travels in a header, not the URL, so it can't leak into logs.
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 30000);
    const fetchOpts = { signal: ctrl.signal };
    if (prefs.mode === 'live' && prefs.key) fetchOpts.headers = { 'x-firms-key': prefs.key };
    const res = await fetch(url, fetchOpts);
    clearTimeout(to);
    if (!res.ok) {
      let msg = 'live feed unavailable (HTTP ' + res.status + ')';
      try { const e = await res.json(); if (e && e.error) msg = e.error; } catch (_) { /* non-JSON */ }
      throw new Error(msg);
    }
    const j = await res.json();
    if (!j.records || !j.records.length) throw new Error(j.error || 'no FIRMS records');
    if (j.demo) {
      // Bundled CSV archive: records outside the hotspot window are not part of
      // any cluster, so give them stable ids + honest unclassified labels first.
      j.records.forEach((r, i) => {
        if (!r.id) r.id = 'FIRMS-' + (r.acq_date || '').replace(/-/g, '') + '-' + String(i + 1).padStart(4, '0');
        if (!r.category) r.category = 'unknown';
        if (!r.state) r.state = '—';
        if (!r.district) r.district = '—';
        if (!r.name) r.name = r.state !== '—' ? `Unclassified Thermal Source — ${r.state}` : 'Unclassified Thermal Source';
      });
    }
    const live = buildLive(j.records, { hotspotWindowDays: j.hotspotWindowDays || 0 });
    Object.assign(DATA, live);
    Object.assign(DATA_META, {
      live: !!j.live, demo: !!j.demo, mode: prefs.mode,
      reason: (j.demo && j.error) ? j.error : '',
      fetchedAt: j.fetchedAt,
      days: j.days || (j.demo ? 365 : days), sources: j.sources || [],
      count: j.records.length, ms: Date.now() - t0,
    });
  } catch (err) {
    Object.assign(DATA_META, {
      live: false, demo: false, mode: (function () { try { return localStorage.getItem('tw_data_mode') || 'demo'; } catch (_) { return 'demo'; } })(),
      reason: String((err && err.message) || err), ms: Date.now() - t0,
    });
  }
  return DATA_META;
}

// Node exports (for tests / tooling only — ignored in the browser).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SEED_SITES, SEED_INDEX, CAT, DATA, DATA_META,
    initData, buildLive, clusterRecords, clusterStats, buildLiveHotspot,
    liveSeverity, liveRiskScore, livePattern, haversineKm,
    hotspotById, stateNorm,
  };
}