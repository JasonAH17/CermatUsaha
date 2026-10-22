/*
  Proxy Cermat AI -> Google Gemini.
  Berjalan di sisi server, jadi GEMINI_API_KEY tidak pernah dikirim ke browser:
  - lokal  : middleware di dev server / preview Vite (vite.config.js)
  - online : Vercel Function (api/ai.js)

  GET  /api/ai  -> { ready, model }
  POST /api/ai  { context, messages: [{ role: 'user'|'assistant', content }] } -> { text, model, offTopic? }
                context = ringkasan data usaha; instruksi & batas topik dibuat di server (prompt.js)
*/

import { buildSystem, GUARD_PROMPT, REFUSAL } from './prompt.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const GUARD_MODEL = 'gemini-flash-lite-latest';
const GUARD_TIMEOUT_MS = 8_000;
const MAX_BODY = 200_000; // karakter
const MAX_CONTEXT = 40_000; // ringkasan data usaha
const MAX_MESSAGE = 1_000; // satu pesan, sama dengan batas kolom chat
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

// Browser hanya boleh mengirim ringkasan data usaha + percakapan; instruksi dibuat di server
function validate({ context = '', messages }) {
  if (typeof context !== 'string' || !Array.isArray(messages) || !messages.length) {
    throw new AiError(400, 'Format permintaan tidak valid.');
  }
  const ok = messages.every((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string');
  if (!ok || messages.at(-1).role !== 'user') throw new AiError(400, 'Format pesan tidak valid.');
  if (context.length > MAX_CONTEXT) throw new AiError(413, 'Data usaha terlalu besar untuk dikirim.');
  if (messages.some((m) => m.content.length > MAX_MESSAGE)) {
    throw new AiError(413, `Pertanyaan terlalu panjang. Maksimal ${MAX_MESSAGE} karakter.`);
  }
  return { system: buildSystem(context), messages: messages.slice(-MAX_MESSAGES) };
}

// Penjaga topik: model kecil menilai pesan terakhir sebelum model utama menjawab.
// true = boleh, false = di luar topik, null = penjaga gagal (lanjut; aturan di model utama tetap berlaku)
async function checkTopic(key, messages, model) {
  const transcript = messages.slice(-4)
    .map((m) => `${m.role === 'user' ? 'Pengguna' : 'Cermat AI'}: ${m.content.slice(0, 600)}`)
    .join('\n');
  try {
    const res = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(GUARD_TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: GUARD_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `<percakapan>\n${transcript}\n</percakapan>` }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 64,
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: { boleh: { type: 'BOOLEAN' } }, required: ['boleh'] },
        },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    const { boleh } = JSON.parse(raw);
    return typeof boleh === 'boolean' ? boleh : null;
  } catch {
    return null;
  }
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
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        // Model menilai topik dan menjawab dalam satu panggilan; server yang memutuskan dari penilaiannya
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { topik_sesuai: { type: 'BOOLEAN' }, jawaban: { type: 'STRING' } },
          required: ['topik_sesuai', 'jawaban'],
          propertyOrdering: ['topik_sesuai', 'jawaban'],
        },
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AiError(res.status, data.error?.message || `Gemini error ${res.status}`);

  if (data.promptFeedback?.blockReason) return { text: REFUSAL, offTopic: true };
  const cand = data.candidates?.[0];
  const raw = (cand?.content?.parts || [])
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join('')
    .trim();
  if (!raw) throw new AiError(502, 'Gemini tidak memberi jawaban.');
  if (cand.finishReason === 'MAX_TOKENS') {
    throw new AiError(502, 'Jawaban terlalu panjang. Coba persempit pertanyaannya.');
  }

  let out;
  try {
    out = JSON.parse(raw);
  } catch {
    return { text: raw, offTopic: false }; // model menjawab teks biasa: tetap tampilkan
  }
  if (out.topik_sesuai === false) return { text: REFUSAL, offTopic: true };
  const text = String(out.jawaban || '').trim();
  if (!text) throw new AiError(502, 'Gemini tidak memberi jawaban.');
  return { text, offTopic: false };
}

// Pesan error yang ramah untuk pengguna awam
function friendly(err) {
  if (err.name === 'TimeoutError') return 'Cermat AI terlalu lama menjawab. Coba lagi sebentar.';
  if (err.status === 429) return 'Cermat AI sedang banyak dipakai (kuota gratis per menit habis). Coba lagi sekitar 1 menit lagi.';
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
  const guardModel = env.GEMINI_GUARD_MODEL?.trim() || GUARD_MODEL;
  // Penjaga terpisah = 1 panggilan tambahan per pertanyaan; bawaannya mati supaya kuota gratis cukup
  const guardOn = env.AI_TOPIC_GUARD === 'on';

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

      if (guardOn && (await checkTopic(key, payload.messages, guardModel)) === false) {
        return send(res, 200, { text: REFUSAL, model: guardModel, offTopic: true });
      }

      const now = Date.now();
      const ready = uniqueModels.filter((m) => (coolingUntil.get(m) || 0) <= now);
      const order = ready.length ? ready : uniqueModels;

      let lastErr;
      for (const [i, model] of order.entries()) {
        try {
          const timeout = i < order.length - 1 ? QUICK_TIMEOUT_MS : TIMEOUT_MS;
          const { text, offTopic } = await callGemini(model, key, payload, timeout);
          return send(res, 200, offTopic ? { text, model, offTopic } : { text, model });
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
