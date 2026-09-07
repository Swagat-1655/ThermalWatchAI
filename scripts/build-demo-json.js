#!/usr/bin/env node
// ============================================================
// ThermalWatch AI — precompute the bundled demo archive
// Parses the raw FIRMS CSVs in ./data once, thins them to one
// record per satellite/day/0.25° cell, attributes Indian states,
// dedupes and writes the result to data/demo_records.json in a
// compact columnar format (header + arrays) to keep the file small.
//
// Runtime then loads the JSON instead of re-parsing ~63MB of CSVs
// on every cold start (that re-parse is what OOM'd Render's
// instance → 502 Bad Gateway on restart / on switching to demo).
//
// Usage:   node scripts/build-demo-json.js
// Re-run after replacing the CSVs with a fresh FIRMS export.
// ============================================================
const fs = require('fs');
const zlib = require('zlib');
const firms = require('../firms');

const outPath = firms.CONFIG.DEMO_JSON;
// Field order shared with loadDemoRecords() in firms.js — keep in sync.
const FIELDS = [
  'latitude', 'longitude', 'brightness', 'bright_t31', 'acq_date', 'acq_time',
  'satellite', 'instrument', 'confidence', 'frp', 'daynight', 'type', 'state',
];

console.log('Parsing + thinning CSV archives (this runs only once)…');
const t0 = Date.now();
const records = firms.loadDemoRecords(true); // force the CSV pipeline

if (!records.length) {
  console.error('No demo records produced — check that data/*.csv exists.');
  process.exit(1);
}

const rows = records.map(r => FIELDS.map(k => r[k]));
const payload = { h: FIELDS, r: rows };
fs.writeFileSync(outPath, zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }));
const mb = (fs.statSync(outPath).size / 1048576).toFixed(1);
console.log(`Wrote ${records.length.toLocaleString('en-IN')} records → ${outPath} (${mb} MB gzipped) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('Restart the server; demo mode now loads from the precomputed archive.');