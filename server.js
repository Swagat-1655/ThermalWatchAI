// ThermalWatch AI — minimal static dev server (no dependencies).
// Usage: FIRMS_API_KEY=xxx GROQ_API_KEY=yyy npm start  (or: node server.js)
// Secrets live in `.env` (never committed) — see .env.example.
const http = require('http');
const fs = require('fs');
const path = require('path');
const firms = require('./firms');

// ---------------- tiny .env loader (no dependencies) ----------------
// Loads KEY=VALUE pairs from .env into process.env — real environment
// variables always win, so CI/hosting dashboards override the file.
(() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) return;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    });
  } catch (_) { /* no .env file — env vars or defaults apply */ }
})();

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  const qs = new URL(req.url, 'http://localhost').searchParams;
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // ---------------- Groq LLM proxy (keeps GROQ_API_KEY server-side) ----------------
  if (urlPath === '/api/ai/chat') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'POST only' }));
      return;
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AI assistant offline: GROQ_API_KEY is not configured on the server. Set it in .env (see .env.example).' }));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 64 * 1024) { // sanity cap on request body
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'request body too large' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid JSON body' }));
        return;
      }
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 25000);
      fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model: body.model || 'openai/gpt-oss-20b',
          messages: Array.isArray(body.messages) ? body.messages : [],
          temperature: typeof body.temperature === 'number' ? body.temperature : 0.4,
          max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 900,
        }),
        signal: ctrl.signal,
      }).then(async groqRes => {
        clearTimeout(to);
        const text = await groqRes.text();
        res.writeHead(groqRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(text);
      }).catch(err => {
        clearTimeout(to);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Groq request failed: ' + (err.message || String(err)) }));
      });
    });
    return;
  }

  // ---------------- NASA FIRMS proxy (live API or bundled demo archive) ----------------
  if (urlPath === '/api/firms') {
    firms.fetchFirms(qs.get('days') || firms.CONFIG.MAX_DAYS, {
      mode: qs.get('mode') || 'live',
      // Key arrives via the x-firms-key header (not the URL) when the user
      // enters one in the Data Source panel; env key is used otherwise.
      key: req.headers['x-firms-key'] || undefined,
    }).then(payload => {
      // gzip the payload when the client accepts it — the demo archive is
      // ~16MB of JSON and compresses to ~2-3MB (much faster syncs).
      const enc = firms.encodeResponse(payload, /gzip/i.test(req.headers['accept-encoding'] || ''));
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...enc.headers,
      });
      res.end(enc.body);
    }).catch(err => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ live: false, demo: false, error: err.message || String(err) }));
    });
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  // Prevent path traversal
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🔥 ThermalWatch AI running at http://localhost:${PORT}`);
  if (process.env.FIRMS_API_KEY) {
    console.log(`  🛰️  NASA FIRMS live feed ON (sources: ${firms.CONFIG.SOURCES.join(', ')} • key from env)`);
  } else {
    console.log('  🛰️  DEMO mode — bundled NASA FIRMS CSV archive (12 months). Set FIRMS_API_KEY=<key> npm start for live mode.');
  }
  console.log(process.env.GROQ_API_KEY
    ? '  🤖 Groq LLM proxy ON (GROQ_API_KEY from env)'
    : '  🤖 AI assistant offline — set GROQ_API_KEY=<key> in .env for live LLM (fallback replies stay active).');
  console.log();
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is busy — try: PORT=${PORT + 1} npm start`);
    process.exit(1);
  }
  throw e;
});