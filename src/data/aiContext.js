import { getAll, getById, getProfil } from './store.js';
import { saldoAkun, totalSaldo, stokItem, seriArus } from './selectors.js';
import { buildReport, formatValue } from './reports.js';
import { tanggal, toDateKey } from '../utils/format.js';

// Ringkasan data usaha yang dikirim ke server setiap kali Cermat AI ditanya.
// Instruksi & batas topik Cermat AI ada di server (server/prompt.js), bukan di browser.

const rp = (v) => formatValue(v, 'money');

const JENIS = {
  penjualan: 'Penjualan',
  pembelian: 'Pembelian',
  uang_masuk: 'Uang masuk',
  uang_keluar: 'Uang keluar',
  pengeluaran: 'Pengeluaran',
};

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

  L.push('', '## Saldo kas & bank');
  getAll('akun').forEach((a) => L.push(`- ${a.nama}: ${rp(saldoAkun(a.id))}`));
  L.push(`- Total: ${rp(totalSaldo())}`);

  const labaRugi = (judul, from, to) => {
    const r = buildReport('labarugi', { from, to });
    L.push('', `## ${judul} (${r.period})`);
    r.rows.forEach((row) => { if (row.jumlah !== null) L.push(`- ${row.ket}: ${rp(row.jumlah)}`); });
  };
  labaRugi('Laba rugi bulan ini', startThis, today);
  labaRugi('Laba rugi bulan lalu', startPrev, endPrev);

  const pj = buildReport('penjualan', { from: startThis, to: today });
  L.push('', '## Penjualan per item bulan ini');
  if (pj.rows.length) {
    pj.rows.slice(0, 10).forEach((r) => L.push(`- ${r.nama}: terjual ${r.qty}, omzet ${rp(r.omzet)}, laba ${rp(r.laba)}`));
  } else {
    L.push('- Belum ada penjualan item bulan ini');
  }

  L.push('', '## Arus kas 7 hari terakhir');
  seriArus('harian').forEach((d) =>
    L.push(`- ${d.label}: masuk ${rp(d.masuk)}, keluar ${rp(d.keluar)}, pembelian ${rp(d.pembelian)}, saldo ${rp(d.saldo)}`));

  L.push('', '## Arus kas 6 bulan terakhir');
  seriArus('bulanan').forEach((d) =>
    L.push(`- ${d.label}: masuk ${rp(d.masuk)}, keluar ${rp(d.keluar)}, pembelian ${rp(d.pembelian)}, saldo akhir ${rp(d.saldo)}`));

  const up = buildReport('utangpiutang', { to: today });
  L.push('', '## Utang piutang per pihak');
  const pihakRows = up.rows.filter((r) => r._style !== 'total');
  if (pihakRows.length) {
    pihakRows.slice(0, 10).forEach((r) =>
      L.push(`- ${r.nama} (${r.jenis}): ${r.piutang ? `piutang ${rp(r.piutang)}` : `utang ${rp(r.utang)}`}`));
  } else {
    L.push('- Tidak ada utang piutang');
  }

  L.push('', '## Stok item');
  const items = getAll('item');
  if (items.length) {
    items.slice(0, 30).forEach((it) =>
      L.push(`- ${it.nama}: stok ${stokItem(it.id)} ${it.satuan} (batas menipis ${it.stokMin || 0}), beli ${rp(it.hargaBeli)}, jual ${rp(it.hargaJual)}`));
  } else {
    L.push('- Belum ada item');
  }

  L.push('', '## 15 transaksi terbaru');
  [...getAll('transaksi')]
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 15)
    .forEach((t) => {
      const pihak = t.pihakId ? getById('pihak', t.pihakId)?.nama : '';
      const ket = t.jenis === 'pengeluaran' ? t.kategori : pihak;
      const belum = t.total - (t.dibayar ?? t.total);
      L.push(`- ${tanggal(t.tanggal)} | ${JENIS[t.jenis]}${ket ? ` | ${ket}` : ''} | ${rp(t.total)}${belum > 0 ? ` | belum dibayar ${rp(belum)}` : ''}`);
    });

  return L.join('\n');
}