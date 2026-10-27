import { getAll, getProfil } from '../data/store.js';
import { totalSaldo, stokItem, arusKas } from '../data/selectors.js';
import { buildReport } from '../data/reports.js';
import { rupiah, toDateKey } from './format.js';

/*
  Cermat AI memakai Gemini lewat proxy server (server/ai.js) bila GEMINI_API_KEY terisi.
  Bila belum ada key / server tidak tersedia, chat memakai mode demo (jawaban template).
*/
let statusPromise = null;

export function aiStatus() {
  statusPromise ??= fetch('/api/ai')
    .then((r) => (r.ok ? r.json() : { ready: false }))
    .catch(() => ({ ready: false }));
  return statusPromise;
}

async function post(body) {
  let res;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Tidak bisa terhubung. Periksa koneksi internet.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.code === 'NO_KEY') statusPromise = Promise.resolve({ ready: false });
    throw Object.assign(new Error(data.error || 'Gagal menghubungi Cermat AI.'), { code: data.code, status: res.status });
  }
  return data;
}

// Chat. attachment (opsional) = hasil siapkanLampiran() di utils/attachment.js
export async function askAI({ context, messages, attachment }) {
  const { ready } = await aiStatus();
  const demo = () => mockAnswer({ messages, attachment });
  if (!ready) return demo();
  try {
    const { nama, mimeType, data, teks } = attachment || {};
    const data_ = await post({ task: 'chat', context, messages, attachment: attachment ? { nama, mimeType, data, teks } : undefined });
    return data_.text;
  } catch (err) {
    if (err.code !== 'NO_KEY') throw err;
    return demo();
  }
}

// Membaca nota (foto/PDF) -> { toko, tanggal, total, items:[{nama, qty, harga}] }
export async function readNota(attachment) {
  const { ready } = await aiStatus();
  if (!ready) throw Object.assign(new Error('Cermat AI belum aktif.'), { code: 'NO_KEY' });
  const { nama, mimeType, data } = attachment;
  const res = await post({ task: 'nota', attachment: { nama, mimeType, data } });
  return res.nota;
}

// Saran singkat dari ringkasan inventaris -> ['...', '...']
export async function getInsight(context) {
  const { ready } = await aiStatus();
  if (!ready) throw Object.assign(new Error('Cermat AI belum aktif.'), { code: 'NO_KEY' });
  const res = await post({ task: 'insight', context });
  return res.saran;
}

// ================= Mode template =================
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (q, words) => words.some((w) => q.includes(w));
const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function periode() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return {
    y, m, d,
    today: toDateKey(now),
    startThis: toDateKey(new Date(y, m, 1)),
    startPrev: toDateKey(new Date(y, m - 1, 1)),
    samePrev: toDateKey(new Date(y, m - 1, Math.min(d, new Date(y, m, 0).getDate()))),
  };
}

function labaBulanIni() {
  const { startThis, today } = periode();
  const lr = buildReport('labarugi', { from: startThis, to: today });
  return {
    pendapatan: lr.summary[0].value,
    hpp: -lr.rows[1].jumlah,
    kotor: lr.rows[2].jumlah,
    biaya: lr.rows.filter((r) => r._style === 'sub').map((r) => ({ nama: r.ket, nilai: -r.jumlah })),
    bersih: lr.rows.find((r) => r._style === 'total').jumlah,
  };
}

const kosong = () =>
  'Belum ada transaksi bulan ini, jadi saya belum bisa menganalisis.\n\nSaran:\n1. Catat jualan lewat tombol **＋ Tambah → Jualan**.\n2. Catat pengeluaran rutin seperti bahan baku, gaji, dan listrik.';

function jawabRingkasan() {
  const { pendapatan, bersih } = labaBulanIni();
  if (!pendapatan && !getAll('transaksi').length) return kosong();

  return [
    `Ringkasan keuangan **${getProfil().namaUsaha}** bulan ini:`,
    `- Uang di kas: **${rupiah(totalSaldo())}**`,
    `- Pendapatan penjualan: **${rupiah(pendapatan)}**`,
    `- Laba bersih: **${rupiah(bersih)}**${pendapatan ? ` (margin ${pct(bersih, pendapatan)}%)` : ''}`,
    '',
    'Saran:',
    bersih < 0
      ? '1. Tinjau biaya terbesar bulan ini dan tunda pengeluaran yang tidak mendesak.'
      : '1. Sisihkan sebagian laba sebagai dana cadangan usaha.',
    '2. Cek stok barang di **Riwayat → Stok** supaya barang laku tidak kehabisan.',
  ].join('\n');
}

function jawabLaba() {
  const { pendapatan, hpp, kotor, biaya, bersih } = labaBulanIni();
  if (!pendapatan) return kosong();

  const totalBiaya = sum(biaya, (b) => b.nilai);
  const top = biaya[0];

  return [
    `Dari pendapatan **${rupiah(pendapatan)}** bulan ini:`,
    `- Modal barang terjual (HPP): **${rupiah(hpp)}** (${pct(hpp, pendapatan)}%)`,
    `- Laba kotor: **${rupiah(kotor)}** (${pct(kotor, pendapatan)}%)`,
    `- Biaya operasional: **${rupiah(totalBiaya)}**${top ? `, terbesar **${top.nama}** ${rupiah(top.nilai)}` : ''}`,
    `- Laba bersih: **${rupiah(bersih)}** (margin ${pct(bersih, pendapatan)}%)`,
    '',
    pct(hpp, pendapatan) > 60
      ? 'Untung terasa tipis terutama karena **modal barang cukup besar** dibanding harga jual.'
      : top && pct(top.nilai, pendapatan) > 20
        ? `Untung tertekan oleh biaya **${top.nama}** yang cukup besar.`
        : 'Struktur biaya masih wajar, fokus berikutnya adalah menambah volume penjualan.',
    '',
    'Saran:',
    '1. Cek barang dengan untung tipis di **Riwayat → Stok**, pertimbangkan menaikkan harga jual sedikit.',
    top ? `2. Buat batas anggaran bulanan untuk **${top.nama}**.` : '2. Catat semua biaya agar analisis lebih akurat.',
  ].join('\n');
}

function jawabPenjualan() {
  const { startThis, today, startPrev, samePrev } = periode();
  const jual = (from, to) =>
    sum(getAll('transaksi').filter((t) => t.jenis === 'penjualan' && t.tanggal >= from && t.tanggal <= to), (t) => t.total);

  const now = jual(startThis, today);
  const prev = jual(startPrev, samePrev);
  if (!now && !prev) return kosong();

  const top = buildReport('penjualan', { from: startThis, to: today }).rows[0];
  const ch = prev ? Math.round(((now - prev) / prev) * 100) : null;

  return [
    `Penjualan bulan ini **${rupiah(now)}**${ch !== null ? `, ${ch >= 0 ? 'naik' : 'turun'} **${Math.abs(ch)}%** dari periode yang sama bulan lalu (${rupiah(prev)})` : ''}.`,
    top ? `Item terlaris: **${top.nama}** (${top.qty}, omzet ${rupiah(top.omzet)}).` : '',
    '',
    'Saran:',
    ch !== null && ch < 0
      ? '1. Hubungi pelanggan lama lewat WhatsApp dengan promo kecil atau paket hemat.'
      : '1. Jaga ketersediaan stok item terlaris agar tidak kehabisan saat ramai.',
    '2. Buat paket bundling item terlaris dengan item yang kurang laku.',
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
}

function jawabItem() {
  const { startThis, today } = periode();
  const rows = [...buildReport('penjualan', { from: startThis, to: today }).rows].sort((a, b) => b.laba - a.laba);
  if (!rows.length) {
    return 'Belum ada penjualan item bulan ini.\n\nSaran:\n1. Pakai **＋ Tambah → Jualan → Pilih dari daftar barang** agar penjualan tiap barang tercatat.';
  }

  return [
    'Item paling menguntungkan bulan ini:',
    ...rows.slice(0, 3).map((r, i) =>
      `${i + 1}. **${r.nama}**: laba ${rupiah(r.laba)} dari omzet ${rupiah(r.omzet)} (margin ${pct(r.laba, r.omzet)}%)`),
    '',
    'Saran:',
    `1. Tonjolkan **${rows[0].nama}** di etalase atau promosi WhatsApp.`,
    rows.length > 1
      ? `2. Evaluasi harga **${rows[rows.length - 1].nama}** karena labanya paling kecil.`
      : '2. Tambah variasi item untuk memperluas pilihan pelanggan.',
  ].join('\n');
}

function jawabStok() {
  const low = getAll('item')
    .map((it) => ({ it, s: stokItem(it.id) }))
    .filter((x) => x.s <= (x.it.stokMin || 0));

  if (!low.length) return 'Semua stok item masih **aman** di atas batas minimum. 👍';

  return [
    `Ada **${low.length} item** yang perlu restok:`,
    ...low.map(({ it, s }) => {
      const beli = Math.max((it.stokMin || 1) * 3 - s, 1);
      return `- **${it.nama}**: sisa ${s} ${it.satuan}, saran beli ${beli} ${it.satuan} (±${rupiah(beli * (it.hargaBeli || 0))})`;
    }),
    '',
    'Saran:',
    '1. Catat lewat **＋ Tambah → Scan / Upload Nota** atau **Belanja Stok** agar stok otomatis bertambah.',
    '2. Belanja sekaligus beberapa item ke pemasok yang sama untuk hemat ongkos.',
  ].join('\n');
}

const TIPS_BIAYA = {
  'Bahan Baku': 'bandingkan harga beberapa pemasok dan beli dalam jumlah grosir',
  Gaji: 'sesuaikan jadwal kerja dengan jam ramai pelanggan',
  Sewa: 'negosiasikan pembayaran tahunan untuk potongan harga',
  'Listrik & Air': 'matikan peralatan saat tidak dipakai dan cek alat yang boros daya',
  Transportasi: 'gabungkan belanja dan pengiriman dalam satu perjalanan',
  Lainnya: 'catat keterangan lebih rinci agar mudah dievaluasi',
};

function jawabBiaya() {
  const { biaya, pendapatan } = labaBulanIni();
  if (!biaya.length) {
    return 'Belum ada pengeluaran tercatat bulan ini.\n\nSaran:\n1. Catat biaya rutin lewat **＋ Tambah → Biaya Usaha** agar bisa dianalisis.';
  }

  const total = sum(biaya, (b) => b.nilai);
  return [
    `Total biaya operasional bulan ini **${rupiah(total)}**${pendapatan ? ` (${pct(total, pendapatan)}% dari pendapatan)` : ''}:`,
    ...biaya.slice(0, 3).map((b) => `- **${b.nama}**: ${rupiah(b.nilai)} (${pct(b.nilai, total)}%)`),
    '',
    'Saran:',
    ...biaya.slice(0, 2).map((b, i) => `${i + 1}. ${b.nama}: ${TIPS_BIAYA[b.nama] || TIPS_BIAYA.Lainnya}.`),
  ].join('\n');
}

function jawabKas() {
  const { y, m, d, today } = periode();
  const from30 = toDateKey(new Date(y, m, d - 29));
  const keluar = sum(
    getAll('transaksi').filter((t) => t.tanggal >= from30 && t.tanggal <= today && arusKas(t) < 0),
    (t) => -arusKas(t)
  );
  const saldo = totalSaldo();

  if (!keluar) {
    return `Uang di kas saat ini **${rupiah(saldo)}**. Belum ada uang keluar dalam 30 hari terakhir untuk menghitung ketahanan kas.`;
  }

  const perHari = keluar / 30;
  const hari = Math.floor(saldo / perHari);

  return [
    `Uang di kas: **${rupiah(saldo)}**`,
    `Rata-rata uang keluar: **${rupiah(Math.round(perHari))}/hari** (30 hari terakhir)`,
    `Perkiraan kas cukup untuk **${hari > 365 ? 'lebih dari setahun' : `±${Math.max(hari, 0)} hari`}** tanpa pemasukan baru.`,
    '',
    'Saran:',
    hari < 30
      ? '1. Tunda pembelian stok yang belum mendesak dan dahulukan menjual barang yang sudah ada.'
      : '1. Kondisi kas cukup aman, sisihkan dana cadangan minimal 1 bulan biaya operasional.',
    '2. Pisahkan uang pribadi dan uang usaha agar arus kas mudah dipantau.',
  ].join('\n');
}

function jawabUmum() {
  return [
    'Saya bisa membantu menganalisis data usaha Anda, misalnya:',
    '- Kondisi keuangan bulan ini',
    '- Laba, margin, dan biaya terbesar',
    '- Barang paling laku dan paling menguntungkan',
    '- Stok yang perlu dibeli ulang',
    '- Ketahanan arus kas',
    '',
    'Coba tanyakan salah satu topik di atas.',
  ].join('\n');
}

async function mockAnswer({ messages, attachment }) {
  const q = (messages.at(-1)?.content || '').toLowerCase();
  await wait(700 + Math.random() * 700);
  if (attachment) return 'Mode demo belum bisa membaca file. Lampiran bisa dibaca setelah Cermat AI tersambung ke Gemini.';

  let text;
  if (has(q, ['stok', 'restok', 'persediaan'])) text = jawabStok();
  else if (has(q, ['item', 'produk', 'terlaris', 'menguntungkan', 'barang'])) text = jawabItem();
  else if (has(q, ['hemat', 'biaya', 'pengeluaran', 'boros'])) text = jawabBiaya();
  else if (has(q, ['arus kas', 'saldo', 'kas '])) text = jawabKas();
  else if (has(q, ['untung', 'laba', 'rugi', 'margin', 'tipis'])) text = jawabLaba();
  else if (has(q, ['penjualan', 'jualan', 'omzet'])) text = jawabPenjualan();
  else if (has(q, ['kondisi', 'ringkas', 'keuangan', 'bulan ini'])) text = jawabRingkasan();
  else text = jawabUmum();

  return `${text}\n\nMode demo · jawaban dibuat otomatis dari data Anda.`;
}