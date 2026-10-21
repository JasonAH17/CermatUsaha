import { toDateKey } from './format.js';

/*
  Pembaca struk.
  Sekarang: OCR di perangkat pakai Tesseract.js (gratis, tanpa API key, butuh internet
  saat pertama kali untuk mengunduh data bahasa).
  Nanti: bisa diganti / dilengkapi Gemini Vision supaya hasilnya lebih rapi.
  Apa pun mesinnya, hasilnya SELALU dicek user dulu sebelum disimpan.
*/

const MAX_SIDE = 1600;

// Perkecil foto besar supaya OCR cepat
async function toCanvas(source) {
  if (source instanceof HTMLCanvasElement) return source;
  const bmp = await createImageBitmap(source);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

export async function readReceipt(source, onProgress = () => {}) {
  const canvas = await toCanvas(source);
  const { createWorker } = await import('tesseract.js');
  onProgress(0.05, 'Menyiapkan pembaca struk...');

  const worker = await createWorker('ind+eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(0.2 + m.progress * 0.8, 'Membaca tulisan di struk...');
      else if (m.status?.startsWith('loading')) onProgress(0.1 + (m.progress || 0) * 0.1, 'Mengunduh data bahasa...');
    },
  });

  try {
    const { data } = await worker.recognize(canvas);
    return { ...parseReceipt(data.text), raw: data.text };
  } finally {
    await worker.terminate();
  }
}

// ===== Membaca teks hasil OCR jadi data =====
const SKIP = /\b(sub\s*total|subtotal|tunai|cash|kembali|kembalian|change|diskon|disc|ppn|pajak|tax|bayar|debit|kredit|kartu|qris|ovo|gopay|dana|terima\s*kasih|npwp|telp|kasir)\b/i;
const TOTAL = /\b(grand\s*total|total\s*(bayar|belanja|harga)?|jumlah|tagihan)\b/i;
const BULAN = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

// Angka rupiah di akhir baris, misal "64.000", "Rp 154,000", "18000", "72.000,00"
function amountAtEnd(line) {
  const m = line.match(/(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:[.,]\d{2})?\s*$/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[.,]/g, ''));
  return n >= 100 ? { value: n, index: m.index } : null;
}

function findDate(text) {
  const num = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  const word = text.match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})\b/);
  let d; let m; let y;
  if (num) [, d, m, y] = num.map(Number);
  else if (word && BULAN[word[2].toLowerCase()]) { d = +word[1]; m = BULAN[word[2].toLowerCase()]; y = +word[3]; }
  else return null;
  if (y < 100) y += 2000;
  const date = new Date(y, m - 1, d);
  if (date.getMonth() !== m - 1 || y < 2000 || date > new Date()) return null;
  return toDateKey(date);
}

const tidyName = (s) => s
  .replace(/\b\d+\s*[xX@]\s*[\d.,]+/g, '') // "2 x 32.000"
  .replace(/[^\p{L}\d\s.,/&()-]/gu, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();

// 'TOKO SUMBER MAKMUR' -> 'Toko Sumber Makmur'
const rapikanNama = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()) : s);

export function parseReceipt(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 1);

  // Total: baris berlabel total (yang paling bawah), bukan subtotal
  let total = null;
  let totalIdx = lines.length;
  lines.forEach((l, i) => {
    if (!TOTAL.test(l) || /sub\s*total|subtotal/i.test(l)) return;
    const a = amountAtEnd(l) || (lines[i + 1] && amountAtEnd(lines[i + 1]));
    if (a) { total = a.value; totalIdx = i; }
  });

  // Nama toko: baris pertama yang berisi kata, bukan angka/alamat
  const toko = lines.slice(0, 4).find((l) => /[A-Za-z]{3,}/.test(l) && !/\d{3,}/.test(l) && !/^(jl|jalan|struk|nota)\b/i.test(l)) || '';

  // Barang: baris sebelum total yang diakhiri nominal
  const items = [];
  let pending = ''; // nama barang di baris sendiri, harganya di baris bawahnya
  lines.slice(0, totalIdx).forEach((l) => {
    if (SKIP.test(l) || TOTAL.test(l)) { pending = ''; return; }
    const a = amountAtEnd(l);
    if (!a) {
      pending = l === toko ? '' : tidyName(l);
      return;
    }
    let nama = tidyName(l.slice(0, a.index));
    if (nama.replace(/[^A-Za-z]/g, '').length < 3) nama = pending;
    pending = '';
    if (nama.replace(/[^A-Za-z]/g, '').length < 3) return;
    items.push({ nama, harga: a.value });
  });

  const totalTebakan = !total && items.length ? items.reduce((s, i) => s + i.harga, 0) : null;

  return {
    toko: rapikanNama(tidyName(toko)),
    tanggal: findDate(text),
    total: total ?? totalTebakan,
    totalPasti: !!total,
    items: items.slice(0, 20),
  };
}

// ===== Contoh struk untuk mencoba fitur tanpa struk asli =====
export function sampleReceipt() {
  const now = new Date();
  const tgl = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const rows = [
    ['TOKO SUMBER MAKMUR', 'c', 'bold'],
    ['Jl. Pasar Baru No. 12', 'c'],
    [`${tgl}  09:45`, 'c'],
    ['--------------------------------', 'c'],
    ['Minyak Goreng 2L', 'l'], ['  2 x 32.000', 'l', '', '64.000'],
    ['Gula Pasir 1kg', 'l', '', '18.000'],
    ['Beras Premium 5kg', 'l', '', '72.000'],
    ['Telur Ayam 1kg', 'l', '', '28.500'],
    ['--------------------------------', 'c'],
    ['SUBTOTAL', 'l', '', '182.500'],
    ['TOTAL', 'l', 'bold', '182.500'],
    ['TUNAI', 'l', '', '200.000'],
    ['KEMBALI', 'l', '', '17.500'],
    ['', 'c'],
    ['Terima kasih', 'c'],
  ];

  const W = 760;
  const LH = 52;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = rows.length * LH + 80;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, c.height);
  g.fillStyle = '#111';
  g.textBaseline = 'middle';

  rows.forEach(([text, align, weight, right], i) => {
    const y = 60 + i * LH;
    g.font = `${weight === 'bold' ? 'bold ' : ''}34px "Courier New", monospace`;
    g.textAlign = align === 'c' ? 'center' : 'left';
    g.fillText(text, align === 'c' ? W / 2 : 50, y);
    if (right) {
      g.textAlign = 'right';
      g.fillText(right, W - 50, y);
    }
  });
  return c;
}
