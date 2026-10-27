import { getAll } from './store.js';
import { stokItem } from './selectors.js';
import { buildReport } from './reports.js';
import { toDateKey } from '../utils/format.js';

// Angka inventaris untuk Beranda
export function ringkasanStok() {
  const items = getAll('item');
  const stok = items.map((it) => ({ it, s: stokItem(it.id) }));
  const now = new Date();
  const terlaris = buildReport('penjualan', { from: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: toDateKey(now) }).rows[0];
  return {
    jumlah: items.length,
    nilai: stok.reduce((sum, { it, s }) => sum + Math.max(s, 0) * (it.hargaBeli || 0), 0),
    perluBeli: stok.filter(({ it, s }) => s > 0 && s <= (it.stokMin || 0)),
    habis: stok.filter(({ s }) => s <= 0),
    terlaris: terlaris?.nama || null,
  };
}

// Saran berbasis aturan, dipakai bila Cermat AI belum aktif atau sedang tidak tersedia
export function insightStok() {
  const r = ringkasanStok();
  if (!r.jumlah) return [];
  const out = [];
  const saranBeli = ({ it, s }) => Math.max((it.stokMin || 1) * 3 - Math.max(s, 0), 1);

  r.habis.slice(0, 2).forEach((x) => out.push(`${x.it.nama} sudah habis. Beli sekitar ${saranBeli(x)} ${x.it.satuan} supaya bisa dijual lagi.`));
  r.perluBeli.slice(0, 2).forEach((x) => out.push(`${x.it.nama} tinggal ${x.s} ${x.it.satuan}. Sebaiknya beli lagi ${saranBeli(x)} ${x.it.satuan}.`));
  if (r.terlaris) out.push(`${r.terlaris} paling laku bulan ini. Jaga stoknya jangan sampai kosong.`);

  const tanpaHarga = getAll('item').filter((it) => !it.hargaJual);
  if (tanpaHarga.length) out.push(`Harga jual ${tanpaHarga[0].nama} belum diisi. Isi di Riwayat → Stok supaya untungnya terhitung.`);

  if (!out.length) out.push('Semua stok barang masih aman. Terus catat jualan supaya saran makin tepat.');
  return out.slice(0, 3);
}
