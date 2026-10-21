/*
  Proxy Cermat AI -> Google Gemini.
  Berjalan di sisi server, jadi GEMINI_API_KEY tidak pernah dikirim ke browser:
  - lokal  : middleware di dev server / preview Vite (vite.config.js)
  - online : Vercel Function (api/ai.js)

  GET  /api/ai  -> { ready, model }
  POST /api/ai  { system, messages: [{ role: 'user'|'assistant', content }] } -> { text, model }
*/

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const MAX_BODY = 200_000; // karakter
const MAX_MESSAGES = 20;
const TIMEOUT_MS = 30_000;
const QUICK_TIMEOUT_MS = 10_000; // batas tunggu bila masih ada model cadangan

// Status yang layak dicoba ulang dengan model cadangan
const RETRYABLE = new Set([404, 429, 500, 503]);
// Model yang sedang sibuk/kuota habis dilewati dulu supaya jawaban tidak menunggu lama
const COOLDOWN_MS = 5 * 60_000;
const coolingUntil = new Map();

// Batas pertanyaan per pengunjung, supaya kuota Gemini tidak dihabiskan satu orang
const RATE_WINDOW_MS = 10 * 60_000;
const hits = new Map(); // ip -> [waktu permintaan]

function rateLimited(req, max) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= max) {
    hits.set(ip, recent);
    return Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 60_000);
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // jaga memori server
  return 0;
}

class AiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  // Vercel sudah mengurai body JSON lebih dulu (req.body); di Vite dibaca dari stream
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    if (req.body.length > MAX_BODY) return Promise.reject(new AiError(413, 'Pertanyaan terlalu panjang.'));
    try {
      return Promise.resolve(JSON.parse(req.body || '{}'));
    } catch {
      return Promise.reject(new AiError(400, 'Format permintaan tidak valid.'));
    }
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) reject(new AiError(413, 'Pertanyaan terlalu panjang.'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        reject(new AiError(400, 'Format permintaan tidak valid.'));
      }
    });
    req.on('error', reject);
  });
}

function validate({ system, messages }) {
  if (typeof system !== 'string' || !Array.isArray(messages) || !messages.length) {
    throw new AiError(400, 'Format permintaan tidak valid.');
  }
  const ok = messages.every((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string');
  if (!ok) throw new AiError(400, 'Format pesan tidak valid.');
  return { system, messages: messages.slice(-MAX_MESSAGES) };
}

async function callGemini(model, key, { system, messages }, timeout = TIMEOUT_MS) {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AiError(res.status, data.error?.message || `Gemini error ${res.status}`);

  if (data.promptFeedback?.blockReason) {
    return 'Maaf, pertanyaan ini tidak bisa saya jawab. Coba tanyakan hal lain seputar keuangan usaha Anda.';
  }
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || [])
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join('')
    .trim();
  if (!text) throw new AiError(502, 'Gemini tidak memberi jawaban.');
  return cand.finishReason === 'MAX_TOKENS' ? `${text}\n\n_(Jawaban terpotong, coba minta lanjutannya.)_` : text;
}

// Pesan error yang ramah untuk pengguna awam
function friendly(err) {
  if (err.name === 'TimeoutError') return 'Cermat AI terlalu lama menjawab. Coba lagi sebentar.';
  if (err.status === 429) return 'Kuota gratis Cermat AI sedang habis. Coba lagi beberapa menit lagi.';
  if (err.status === 400 || err.status === 401 || err.status === 403) {
    return err.message?.includes('API key') ? 'API key Gemini tidak valid. Periksa GEMINI_API_KEY di file .env.' : err.message;
  }
  if (err.status === 503 || err.status === 500) return 'Server Gemini sedang sibuk. Coba lagi sebentar.';
  return err.message || 'Gagal menghubungi Cermat AI.';
}

export function aiMiddleware(env) {
  const key = (env.GEMINI_API_KEY || '').trim();
  const models = env.GEMINI_MODEL ? [env.GEMINI_MODEL.trim(), ...DEFAULT_MODELS] : DEFAULT_MODELS;
  const uniqueModels = [...new Set(models)];
  const maxPerWindow = Number(env.AI_RATE_LIMIT) || 20;

  return async (req, res) => {
    if (req.method === 'GET') {
      return send(res, 200, { ready: !!key, model: uniqueModels[0] });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Metode tidak didukung.' });
    if (!key) return send(res, 503, { error: 'API key Gemini belum diisi.', code: 'NO_KEY' });

    const tunggu = rateLimited(req, maxPerWindow);
    if (tunggu) {
      return send(res, 429, { error: `Anda sudah banyak bertanya. Coba lagi sekitar ${tunggu} menit lagi.` });
    }

    try {
      const payload = validate(await readBody(req));
      const now = Date.now();
      const ready = uniqueModels.filter((m) => (coolingUntil.get(m) || 0) <= now);
      const order = ready.length ? ready : uniqueModels;

      let lastErr;
      for (const [i, model] of order.entries()) {
        try {
          const timeout = i < order.length - 1 ? QUICK_TIMEOUT_MS : TIMEOUT_MS;
          const text = await callGemini(model, key, payload, timeout);
          return send(res, 200, { text, model });
        } catch (err) {
          lastErr = err;
          if (!RETRYABLE.has(err.status) && err.name !== 'TimeoutError') break;
          coolingUntil.set(model, Date.now() + COOLDOWN_MS);
        }
      }
      throw lastErr;
    } catch (err) {
      console.error('[cermat-ai]', err.status || '', err.message);
      send(res, err.status && err.status < 500 && err.status !== 429 ? err.status : 502, { error: friendly(err) });
    }
  };
}
