/*
  Proxy Cermat AI -> Google Gemini.
  Berjalan di sisi server, jadi GEMINI_API_KEY tidak pernah dikirim ke browser:
  - lokal  : middleware di dev server / preview Vite (vite.config.js)
  - online : Vercel Function (api/ai.js)

  GET  /api/ai  -> { ready, model }
  POST /api/ai  task 'chat'    { context, messages, attachment? } -> { text, model, offTopic? }
                task 'nota'    { attachment (foto/PDF) }           -> { nota: { toko, tanggal, total, items }, model }
                task 'insight' { context (ringkasan inventaris) }  -> { saran: [..], model }
  attachment = { nama, mimeType, data (base64) } untuk foto/PDF, atau { nama, teks } untuk Excel/Word.
  Instruksi & batas topik dibuat di server (prompt.js), bukan dikirim dari browser.
*/

import { buildSystem, GUARD_PROMPT, NOTA_PROMPT, INSIGHT_PROMPT, REFUSAL } from './prompt.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const GUARD_MODEL = 'gemini-flash-lite-latest';
const GUARD_TIMEOUT_MS = 8_000;
const MAX_BODY = 4_600_000; // karakter; Vercel menolak body di atas 4,5 MB
const MAX_CONTEXT = 40_000; // ringkasan data usaha
const MAX_MESSAGE = 1_000; // satu pesan, sama dengan batas kolom chat
const MAX_MESSAGES = 20;
const MAX_BASE64 = 4_300_000; // ~3,2 MB file asli
const MAX_TEKS_LAMPIRAN = 60_000;
const MIME_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const TIMEOUT_MS = 30_000;
const QUICK_TIMEOUT_MS = 10_000; // batas tunggu bila masih ada model cadangan
const TIMEOUT_FILE_MS = 45_000; // membaca PDF/foto butuh lebih lama

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
    if (req.body.length > MAX_BODY) return Promise.reject(new AiError(413, 'File atau pertanyaan terlalu besar.'));
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
      if (raw.length > MAX_BODY) reject(new AiError(413, 'File atau pertanyaan terlalu besar.'));
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

// ===== Validasi masukan dari browser =====
function validLampiran(a, { hanyaFile = false } = {}) {
  if (!a || typeof a !== 'object' || typeof a.nama !== 'string' || a.nama.length > 200) {
    throw new AiError(400, 'Lampiran tidak valid.');
  }
  if (typeof a.data === 'string') {
    if (!MIME_OK.has(a.mimeType)) throw new AiError(415, 'Jenis file belum didukung. Pakai foto atau PDF.');
    if (a.data.length > MAX_BASE64) throw new AiError(413, 'File terlalu besar. Maksimal 3 MB.');
    return { nama: a.nama, mimeType: a.mimeType, data: a.data };
  }
  if (!hanyaFile && typeof a.teks === 'string') {
    if (a.teks.length > MAX_TEKS_LAMPIRAN) throw new AiError(413, 'Isi file terlalu panjang.');
    return { nama: a.nama, teks: a.teks };
  }
  throw new AiError(400, hanyaFile ? 'Pilih foto atau file PDF nota.' : 'Lampiran tidak valid.');
}

function validChat({ context = '', messages, attachment }) {
  if (typeof context !== 'string' || !Array.isArray(messages) || !messages.length) {
    throw new AiError(400, 'Format permintaan tidak valid.');
  }
  const ok = messages.every((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string');
  if (!ok || messages.at(-1).role !== 'user') throw new AiError(400, 'Format pesan tidak valid.');
  if (context.length > MAX_CONTEXT) throw new AiError(413, 'Data usaha terlalu besar untuk dikirim.');
  if (messages.some((m) => m.content.length > MAX_MESSAGE)) {
    throw new AiError(413, `Pertanyaan terlalu panjang. Maksimal ${MAX_MESSAGE} karakter.`);
  }
  return {
    system: buildSystem(context),
    messages: messages.slice(-MAX_MESSAGES),
    lampiran: attachment ? validLampiran(attachment) : null,
  };
}

// Lampiran ikut pada pesan terakhir pengguna saja
function toContents(messages, lampiran) {
  return messages.map((m, i) => {
    const parts = [{ text: m.content }];
    if (lampiran && i === messages.length - 1) {
      if (lampiran.data) {
        parts.unshift({ text: `Lampiran: ${lampiran.nama}` }, { inlineData: { mimeType: lampiran.mimeType, data: lampiran.data } });
      } else {
        parts.unshift({ text: `<lampiran nama="${lampiran.nama.replace(/"/g, '')}">\n${lampiran.teks}\n</lampiran>` });
      }
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
}

// ===== Pemanggilan Gemini =====
async function generate(model, key, body, timeout) {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(timeout),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AiError(res.status, data.error?.message || `Gemini error ${res.status}`);
  if (data.promptFeedback?.blockReason) return { blocked: true };

  const cand = data.candidates?.[0];
  const raw = (cand?.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('').trim();
  if (!raw) throw new AiError(502, 'Gemini tidak memberi jawaban.');
  if (cand.finishReason === 'MAX_TOKENS') throw new AiError(502, 'Jawaban terlalu panjang. Coba persempit pertanyaannya.');
  try {
    return { json: JSON.parse(raw) };
  } catch {
    return { raw };
  }
}

// Coba model utama, lalu cadangan; model yang sibuk dilewati sementara
async function withModels(models, run, longTimeout = TIMEOUT_MS) {
  const now = Date.now();
  const ready = models.filter((m) => (coolingUntil.get(m) || 0) <= now);
  const order = ready.length ? ready : models;
  let lastErr;
  for (const [i, model] of order.entries()) {
    try {
      // Masih ada cadangan: jangan menunggu terlalu lama di model yang lambat
      const quick = longTimeout > TIMEOUT_MS ? 25_000 : QUICK_TIMEOUT_MS;
      const timeout = i < order.length - 1 ? quick : longTimeout;
      return { model, ...(await run(model, timeout)) };
    } catch (err) {
      lastErr = err;
      if (!RETRYABLE.has(err.status) && err.name !== 'TimeoutError') break;
      coolingUntil.set(model, Date.now() + COOLDOWN_MS);
    }
  }
  throw lastErr;
}

const jsonConfig = (schema, temperature = 0.3, maxOutputTokens = 2048) => ({
  temperature, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema,
});

// Penjaga topik terpisah (opsional): model kecil menilai pesan terakhir sebelum model utama menjawab.
// true = boleh, false = di luar topik, null = penjaga gagal (lanjut; aturan di model utama tetap berlaku)
async function checkTopic(key, messages, model) {
  const transcript = messages.slice(-4)
    .map((m) => `${m.role === 'user' ? 'Pengguna' : 'Cermat AI'}: ${m.content.slice(0, 600)}`)
    .join('\n');
  try {
    const out = await generate(model, key, {
      systemInstruction: { parts: [{ text: GUARD_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: `<percakapan>\n${transcript}\n</percakapan>` }] }],
      generationConfig: jsonConfig({ type: 'OBJECT', properties: { boleh: { type: 'BOOLEAN' } }, required: ['boleh'] }, 0, 64),
    }, GUARD_TIMEOUT_MS);
    return typeof out.json?.boleh === 'boolean' ? out.json.boleh : null;
  } catch {
    return null;
  }
}

// Chat: model menilai topik dan menjawab dalam satu panggilan; server memutuskan dari penilaiannya
async function taskChat(models, key, payload) {
  const { system, messages, lampiran } = payload;
  return withModels(models, async (model, timeout) => {
    const out = await generate(model, key, {
      systemInstruction: { parts: [{ text: system }] },
      contents: toContents(messages, lampiran),
      generationConfig: jsonConfig({
        type: 'OBJECT',
        properties: { topik_sesuai: { type: 'BOOLEAN' }, jawaban: { type: 'STRING' } },
        required: ['topik_sesuai', 'jawaban'],
        propertyOrdering: ['topik_sesuai', 'jawaban'],
      }),
    }, timeout);
    if (out.blocked || out.json?.topik_sesuai === false) return { text: REFUSAL, offTopic: true };
    const text = String(out.json ? out.json.jawaban : out.raw || '').trim();
    if (!text) throw new AiError(502, 'Gemini tidak memberi jawaban.');
    return { text };
  }, lampiran?.data ? TIMEOUT_FILE_MS : TIMEOUT_MS);
}

const NOTA_SCHEMA = {
  type: 'OBJECT',
  properties: {
    adalah_nota: { type: 'BOOLEAN' },
    toko: { type: 'STRING' },
    tanggal: { type: 'STRING' },
    total: { type: 'NUMBER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { nama: { type: 'STRING' }, qty: { type: 'NUMBER' }, harga: { type: 'NUMBER' } },
        required: ['nama', 'qty', 'harga'],
      },
    },
  },
  required: ['adalah_nota', 'toko', 'tanggal', 'total', 'items'],
  propertyOrdering: ['adalah_nota', 'toko', 'tanggal', 'total', 'items'],
};

const angka = (v) => Math.max(0, Math.round(Number(v) || 0));

async function taskNota(models, key, attachment) {
  const lampiran = validLampiran(attachment, { hanyaFile: true });
  const result = await withModels(models, async (model, timeout) => {
    const out = await generate(model, key, {
      systemInstruction: { parts: [{ text: NOTA_PROMPT }] },
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: lampiran.mimeType, data: lampiran.data } }, { text: 'Baca nota ini.' }] }],
      generationConfig: jsonConfig(NOTA_SCHEMA, 0, 4096),
    }, timeout);
    if (!out.json) throw new AiError(502, 'Nota tidak terbaca.');
    return { hasil: out.json };
  }, TIMEOUT_FILE_MS);

  const h = result.hasil;
  if (!h.adalah_nota) throw new AiError(422, 'File ini sepertinya bukan nota atau struk. Coba foto nota belanja.');
  return {
    model: result.model,
    nota: {
      toko: String(h.toko || '').trim().slice(0, 80),
      tanggal: /^\d{4}-\d{2}-\d{2}$/.test(h.tanggal) ? h.tanggal : '',
      total: angka(h.total),
      items: (h.items || []).slice(0, 40)
        .map((it) => ({ nama: String(it.nama || '').trim().slice(0, 80), qty: Math.max(1, angka(it.qty)), harga: angka(it.harga) }))
        .filter((it) => it.nama),
    },
  };
}

async function taskInsight(models, key, context) {
  if (typeof context !== 'string' || !context.trim()) throw new AiError(400, 'Data inventaris kosong.');
  if (context.length > MAX_CONTEXT) throw new AiError(413, 'Data inventaris terlalu besar.');
  const result = await withModels(models, async (model, timeout) => {
    const out = await generate(model, key, {
      systemInstruction: { parts: [{ text: INSIGHT_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: `<data_inventaris>\n${context}\n</data_inventaris>` }] }],
      generationConfig: jsonConfig({
        type: 'OBJECT', properties: { saran: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['saran'],
      }, 0.4, 1024),
    }, timeout);
    const saran = (out.json?.saran || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 3);
    if (!saran.length) throw new AiError(502, 'Insight belum tersedia.');
    return { saran };
  });
  return result;
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
      const body = await readBody(req);
      const task = body.task || 'chat';

      if (task === 'nota') return send(res, 200, await taskNota(uniqueModels, key, body.attachment));
      if (task === 'insight') return send(res, 200, await taskInsight(uniqueModels, key, body.context));
      if (task !== 'chat') throw new AiError(400, 'Tugas tidak dikenal.');

      const payload = validChat(body);
      if (guardOn && (await checkTopic(key, payload.messages, guardModel)) === false) {
        return send(res, 200, { text: REFUSAL, model: guardModel, offTopic: true });
      }
      const { text, offTopic, model } = await taskChat(uniqueModels, key, payload);
      return send(res, 200, offTopic ? { text, model, offTopic } : { text, model });
    } catch (err) {
      console.error('[cermat-ai]', err.status || '', err.message);
      send(res, err.status && err.status < 500 && err.status !== 429 ? err.status : 502, { error: friendly(err) });
    }
  };
}
