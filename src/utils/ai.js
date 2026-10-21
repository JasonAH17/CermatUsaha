import { getAll, getProfil } from '../data/store.js';
import { totalSaldo, ringkasanPiutangUtang, saldoPihak, stokItem, arusKas } from '../data/selectors.js';
import { buildReport } from '../data/reports.js';
import { rupiah, toDateKey } from './format.js';

/*
  Cermat AI memakai Gemini lewat proxy server (server/ai.js) bila GEMINI_API_KEY terisi.
  Bila belum ada key / server tidak tersedia, otomatis memakai mode demo (jawaban template).
*/
let statusPromise = null;

export function aiStatus() {
  statusPromise ??= fetch('/api/ai')
    .then((r) => (r.ok ? r.json() : { ready: false }))
    .catch(() => ({ ready: false }));
  return statusPromise;
}

export async function askAI(payload) {
  const { ready } = await aiStatus();
  if (!ready) return mockAnswer(payload);
  try {
    return await realAnswer(payload);
  } catch (err) {
    if (err.code !== 'NO_KEY') throw err;
    statusPromise = Promise.resolve({ ready: false });
    return mockAnswer(payload);
  }
}

// ================= AI sungguhan =================
async function realAnswer({ system, messages }) {
  let res;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system, messages }),
    });
  } catch {
    throw new Error('Tidak bisa terhubung. Periksa koneksi internet.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Gagal menghubungi Cermat AI.'), { code: data.code });
  return data.text;
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
  'Belum ada transaksi bulan ini, jadi saya belum bisa menganalisis.\n\nSaran:\n1. Catat jualan lewat tombol **＋ Catat → Jualan** atau **Kasir**.\n2. Catat pengeluaran rutin seperti bahan baku, gaji, dan listrik.';

function jawabRingkasan() {
  const { pendapatan, bersih } = labaBulanIni();
  if (!pendapatan && !getAll('transaksi').length) return kosong();
  const pu = ringkasanPiutangUtang();

  return [
    `Ringkasan keuangan **${getProfil().namaUsaha}** bulan ini:`,
    `- Saldo kas & bank: **${rupiah(totalSaldo())}**`,
    `- Pendapatan penjualan: **${rupiah(pendapatan)}**`,
    `- Laba bersih: **${rupiah(bersih)}**${pendapatan ? ` (margin ${pct(bersih, pendapatan)}%)` : ''}`,
    `- Piutang pelanggan: **${rupiah(pu.terima)}**, utang ke pemasok: **${rupiah(pu.bayar)}**`,
    '',
    'Saran:',
    bersih < 0
      ? '1. Tinjau biaya terbesar bulan ini dan tunda pengeluaran yang tidak mendesak.'
      : '1. Sisihkan sebagian laba sebagai dana cadangan usaha.',
    pu.terima > 0
      ? '2. Tagih piutang pelanggan supaya kas tetap longgar.'
      : '2. Pertahankan pola penjualan tunai yang sehat.',
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
    '1. Cek barang dengan untung tipis di **Stok Barang**, pertimbangkan menaikkan harga jual sedikit.',
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

function jawabTagihan() {
  const list = getAll('pihak').map((p) => ({ p, s: saldoPihak(p.id) }));
  const piutang = list.filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const utang = list.filter((x) => x.s < 0).sort((a, b) => a.s - b.s);

  if (!piutang.length && !utang.length) {
    return 'Saat ini **tidak ada utang maupun piutang**. Semua pihak sudah lunas. 👍';
  }

  const lines = [];
  if (piutang.length) {
    lines.push(`Pelanggan yang perlu ditagih (total **${rupiah(sum(piutang, (x) => x.s))}**):`);
    piutang.slice(0, 5).forEach((x) => lines.push(`- **${x.p.nama}**: ${rupiah(x.s)}`));
  }
  if (utang.length) {
    lines.push('', `Utang Anda ke pemasok (total **${rupiah(sum(utang, (x) => -x.s))}**):`);
    utang.slice(0, 3).forEach((x) => lines.push(`- **${x.p.nama}**: ${rupiah(-x.s)}`));
  }
  lines.push(
    '',
    'Saran:',
    piutang.length
      ? `1. Mulai dari **${piutang[0].p.nama}**, gunakan tombol **Tagih** di halaman kontaknya untuk kirim WhatsApp.`
      : '1. Pertahankan pembayaran tunai dari pelanggan.',
    utang.length
      ? '2. Bayar utang pemasok tepat waktu agar tetap dapat harga dan tempo yang baik.'
      : '2. Manfaatkan tempo pembayaran pemasok bila tersedia.',
  );
  return lines.join('\n');
}

function jawabItem() {
  const { startThis, today } = periode();
  const rows = [...buildReport('penjualan', { from: startThis, to: today }).rows].sort((a, b) => b.laba - a.laba);
  if (!rows.length) {
    return 'Belum ada penjualan item bulan ini.\n\nSaran:\n1. Pakai **Kasir** atau **Jualan per Barang** agar penjualan tiap barang tercatat.';
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
    '1. Catat lewat **Belanja Stok** (pilih dari daftar barang) agar stok otomatis bertambah.',
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
    return 'Belum ada pengeluaran tercatat bulan ini.\n\nSaran:\n1. Catat biaya rutin lewat **＋ Catat → Biaya Usaha** agar bisa dianalisis.';
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
    return `Saldo kas & bank saat ini **${rupiah(saldo)}**. Belum ada uang keluar dalam 30 hari terakhir untuk menghitung ketahanan kas.`;
  }

  const perHari = keluar / 30;
  const hari = Math.floor(saldo / perHari);

  return [
    `Saldo kas & bank: **${rupiah(saldo)}**`,
    `Rata-rata uang keluar: **${rupiah(Math.round(perHari))}/hari** (30 hari terakhir)`,
    `Perkiraan kas cukup untuk **${hari > 365 ? 'lebih dari setahun' : `±${Math.max(hari, 0)} hari`}** tanpa pemasukan baru.`,
    '',
    'Saran:',
    hari < 30
      ? '1. Prioritaskan penagihan piutang dan tunda pembelian stok yang belum mendesak.'
      : '1. Kondisi kas cukup aman, sisihkan dana cadangan minimal 1 bulan biaya operasional.',
    '2. Pisahkan uang pribadi dan uang usaha agar arus kas mudah dipantau.',
  ].join('\n');
}

function jawabUmum() {
  return [
    'Saya bisa membantu menganalisis data usaha Anda, misalnya:',
    '- Kondisi keuangan bulan ini',
    '- Laba, margin, dan biaya terbesar',
    '- Pelanggan yang perlu ditagih',
    '- Barang paling laku dan paling menguntungkan',
    '- Stok yang perlu dibeli ulang',
    '- Ketahanan arus kas',
    '',
    'Coba tanyakan salah satu topik di atas.',
  ].join('\n');
}

async function mockAnswer({ messages }) {
  const q = (messages.at(-1)?.content || '').toLowerCase();
  await wait(700 + Math.random() * 700);

  let text;
  if (has(q, ['tagih', 'piutang', 'utang', 'belum bayar', 'belum lunas'])) text = jawabTagihan();
  else if (has(q, ['stok', 'restok', 'persediaan'])) text = jawabStok();
  else if (has(q, ['item', 'produk', 'terlaris', 'menguntungkan', 'barang'])) text = jawabItem();
  else if (has(q, ['hemat', 'biaya', 'pengeluaran', 'boros'])) text = jawabBiaya();
  else if (has(q, ['arus kas', 'saldo', 'kas '])) text = jawabKas();
  else if (has(q, ['untung', 'laba', 'rugi', 'margin', 'tipis'])) text = jawabLaba();
  else if (has(q, ['penjualan', 'jualan', 'omzet'])) text = jawabPenjualan();
  else if (has(q, ['kondisi', 'ringkas', 'keuangan', 'bulan ini'])) text = jawabRingkasan();
  else text = jawabUmum();

  return `${text}\n\nMode demo · jawaban dibuat otomatis dari data Anda.`;
}