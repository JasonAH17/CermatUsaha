import { getAll, getProfil } from './store.js';
import { totalSaldo, stokItem, seriArus } from './selectors.js';
import { buildReport, formatValue } from './reports.js';
import { tanggal, toDateKey } from '../utils/format.js';

// Ringkasan data usaha yang dikirim ke server setiap kali Cermat AI ditanya.
// Instruksi & batas topik Cermat AI ada di server (server/prompt.js), bukan di browser.

const rp = (v) => formatValue(v, 'money');

const JENIS = {
  penjualan: 'Penjualan',
  pembelian: 'Belanja stok',
  uang_masuk: 'Uang masuk',
  uang_keluar: 'Uang keluar',
  pengeluaran: 'Biaya usaha',
};

const hariLalu = (n) => toDateKey(new Date(Date.now() - n * 864e5));

// Keluar-masuk tiap barang dalam N hari terakhir
function gerakStok(sejak) {
  const map = new Map(); // itemId -> { masuk, keluar }
  getAll('transaksi')
    .filter((t) => t.tanggal >= sejak && ['pembelian', 'penjualan'].includes(t.jenis))
    .forEach((t) => (t.items || []).forEach((li) => {
      if (!li.itemId) return;
      const g = map.get(li.itemId) || { masuk: 0, keluar: 0 };
      if (t.jenis === 'pembelian') g.masuk += li.qty;
      else g.keluar += li.qty;
      map.set(li.itemId, g);
    }));
  return map;
}

function barisStok(L, sejak) {
  const items = getAll('item');
  if (!items.length) {
    L.push('- Belum ada barang');
    return;
  }
  const gerak = gerakStok(sejak);
  items.slice(0, 40).forEach((it) => {
    const g = gerak.get(it.id) || { masuk: 0, keluar: 0 };
    L.push(`- ${it.nama}: sisa ${stokItem(it.id)} ${it.satuan} (ingatkan bila ≤ ${it.stokMin || 0}), `
      + `30 hari: masuk ${g.masuk}, terjual ${g.keluar}; modal ${rp(it.hargaBeli)}, jual ${it.hargaJual ? rp(it.hargaJual) : 'belum diisi'}`);
  });
}

export function buildContext() {
  const p = getProfil();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = toDateKey(now);
  const startThis = toDateKey(new Date(y, m, 1));
  const startPrev = toDateKey(new Date(y, m - 1, 1));
  const endPrev = toDateKey(new Date(y, m, 0));

  const L = [];
  L.push(`Nama usaha: ${p.namaUsaha}`);
  L.push(`Tanggal hari ini: ${tanggal(today)}`);
  L.push(`Uang di kas sekarang: ${rp(totalSaldo())}`);

  const labaRugi = (judul, from, to) => {
    const r = buildReport('labarugi', { from, to });
    L.push('', `## ${judul} (${r.period})`);
    r.rows.forEach((row) => { if (row.jumlah !== null) L.push(`- ${row.ket}: ${rp(row.jumlah)}`); });
  };
  labaRugi('Laba rugi bulan ini', startThis, today);
  labaRugi('Laba rugi bulan lalu', startPrev, endPrev);

  const pj = buildReport('penjualan', { from: startThis, to: today });
  L.push('', '## Penjualan per barang bulan ini');
  if (pj.rows.length) {
    pj.rows.slice(0, 10).forEach((r) => L.push(`- ${r.nama}: terjual ${r.qty}, omzet ${rp(r.omzet)}, laba ${rp(r.laba)}`));
  } else {
    L.push('- Belum ada penjualan per barang bulan ini');
  }

  L.push('', '## Arus kas 7 hari terakhir');
  seriArus('harian').forEach((d) =>
    L.push(`- ${d.label}: masuk ${rp(d.masuk)}, keluar ${rp(d.keluar)}, belanja stok ${rp(d.pembelian)}, saldo ${rp(d.saldo)}`));

  L.push('', '## Arus kas 6 bulan terakhir');
  seriArus('bulanan').forEach((d) =>
    L.push(`- ${d.label}: masuk ${rp(d.masuk)}, keluar ${rp(d.keluar)}, belanja stok ${rp(d.pembelian)}, saldo akhir ${rp(d.saldo)}`));

  L.push('', '## Stok barang dan alurnya 30 hari terakhir');
  barisStok(L, hariLalu(29));

  L.push('', '## 15 transaksi terbaru');
  [...getAll('transaksi')]
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 15)
    .forEach((t) => {
      const ket = t.jenis === 'pengeluaran' ? t.kategori : t.toko || t.catatan;
      L.push(`- ${tanggal(t.tanggal)} | ${JENIS[t.jenis]}${ket && ket !== 'POS' ? ` | ${ket}` : ''} | ${rp(t.total)}`);
    });

  return L.join('\n');
}

// Ringkasan khusus inventaris untuk insight di Beranda
export function buildInventoryContext() {
  const L = [`Nama usaha: ${getProfil().namaUsaha}`, `Tanggal hari ini: ${tanggal(toDateKey())}`, '', '## Barang'];
  barisStok(L, hariLalu(29));
  return L.join('\n');
}
