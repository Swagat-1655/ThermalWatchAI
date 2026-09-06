// ============================================================
// ThermalWatch AI — Runtime Configuration
// ============================================================
// ⚠️ SECURITY: no API keys live here.
//   GROQ_API_KEY  → read by server.js from .env / environment
//   FIRMS_API_KEY → read by server.js from .env / environment
// The browser talks only to same-origin server proxies:
//   /api/ai/chat  (Groq LLM)  ·  /api/firms (NASA FIRMS)
const TW_CONFIG = {
  // Server-side proxy for Groq chat completions (see server.js).
  LLM_PROXY_ENDPOINT: 'api/ai/chat',
  GROQ_MODEL: 'openai/gpt-oss-20b',
  GROQ_TEMPERATURE: 0.4,
  GROQ_MAX_TOKENS: 900,
  LLM_TIMEOUT_MS: 25000,
  // NASA FIRMS live feed
  FIRMS_DAYS: 5, // max window requested from the FIRMS API (1..5)
  // Live-simulation cadence
  SIM_INTERVAL_MS: 3200,
  SATELLITES: ['MODIS Aqua', 'MODIS Terra', 'VIIRS S-NPP', 'VIIRS NOAA-20'],
  INSTRUMENTS: ['MODIS', 'VIIRS'],
};
