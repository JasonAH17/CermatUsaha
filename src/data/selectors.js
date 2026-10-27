import { getAll } from './store.js';
import { toDateKey } from '../utils/format.js';

const paid = (t) => t.dibayar ?? t.total;
const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

// Aturan 1: efek transaksi ke uang kas/bank (+ masuk, - keluar)
const ARUS = {
  penjualan: (t) => paid(t),
  uang_masuk: (t) => t.total,
  pembelian: (t) => -paid(t),
  uang_keluar: (t) => -t.total,
  pengeluaran: (t) => -t.total,
};
export const arusKas = (t) => ARUS[t.jenis]?.(t) ?? 0;

// ===== Uang di kas (semua rekening lama ikut dijumlah) =====
export const totalSaldo = () =>
  sum(getAll('akun'), (a) => a.saldoAwal || 0) + sum(getAll('transaksi'), arusKas);

// ===== Ringkasan bulanan =====
export function ringkasanBulan(date = new Date()) {
  const prefix = toDateKey(date).slice(0, 7); // 'YYYY-MM'
  const trx = getAll('transaksi').filter((t) => t.tanggal.startsWith(prefix));
  const total = (jenis) => sum(trx.filter((t) => t.jenis === jenis), (t) => t.total);
  return {
    penjualan: total('penjualan'),
    pembelian: total('pembelian'),
    pengeluaran: total('pengeluaran'),
  };
}

// ===== Inventaris =====
export function stokItem(itemId) {
  const item = getAll('item').find((i) => i.id === itemId);
  let stok = item?.stokAwal || 0;
  getAll('transaksi').forEach((t) => {
    (t.items || []).forEach((li) => {
      if (li.itemId !== itemId) return;
      if (t.jenis === 'pembelian') stok += li.qty;
      if (t.jenis === 'penjualan') stok -= li.qty;
    });
  });
  return stok;
}

// Alur satu barang: stok awal, lalu setiap belanja (+) dan jualan (-) dengan sisa berjalan
export function alurBarang(itemId) {
  const item = getAll('item').find((i) => i.id === itemId);
  const gerak = [];
  getAll('transaksi').forEach((t) => {
    if (!['pembelian', 'penjualan'].includes(t.jenis)) return;
    (t.items || []).forEach((li) => {
      if (li.itemId !== itemId) return;
      gerak.push({ trxId: t.id, tanggal: t.tanggal, jenis: t.jenis, qty: t.jenis === 'pembelian' ? li.qty : -li.qty, createdAt: t.createdAt || '' });
    });
  });
  gerak.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.createdAt.localeCompare(b.createdAt));

  let sisa = item?.stokAwal || 0;
  return {
    stokAwal: sisa,
    gerak: gerak.map((g) => ({ ...g, sisa: (sisa += g.qty) })),
  };
}

// ===== Grafik arus kas =====
export function seriArusKas(days = 7) {
  const trx = getAll('transaksi');
  const keys = [...Array(days)].map((_, i) =>
    toDateKey(new Date(Date.now() - (days - 1 - i) * 864e5))
  );

  let saldo =
    sum(getAll('akun'), (a) => a.saldoAwal || 0) +
    sum(trx.filter((t) => t.tanggal < keys[0]), arusKas);

  return keys.map((tanggal) => {
    const hari = trx.filter((t) => t.tanggal === tanggal);
    const total = (jenis) =>
      sum(hari.filter((t) => jenis.includes(t.jenis)), (t) => Math.abs(arusKas(t)));

    const masuk = total(['penjualan', 'uang_masuk']);
    const keluar = total(['uang_keluar', 'pengeluaran']);
    const pembelian = total(['pembelian']);
    saldo += masuk - keluar - pembelian;

    return { tanggal, masuk, keluar, pembelian, saldo };
  });
}

// ===== Grafik arus kas per periode =====
export function seriArus(mode = 'harian') {
  const trx = getAll('transaksi');
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const fmt = (dt, opt) => dt.toLocaleDateString('id-ID', opt);

  let buckets;
  if (mode === 'harian') {
    buckets = [...Array(7)].map((_, i) => {
      const dt = new Date(y, m, d - 6 + i);
      return { start: dt, end: dt, label: fmt(dt, { day: 'numeric', month: 'short' }) };
    });
  } else if (mode === 'mingguan') {
    buckets = [...Array(8)].map((_, i) => {
      const end = new Date(y, m, d - (7 - i) * 7);
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
      return { start, end, label: fmt(start, { day: 'numeric', month: 'short' }) };
    });
  } else {
    buckets = [...Array(6)].map((_, i) => ({
      start: new Date(y, m - 5 + i, 1),
      end: new Date(y, m - 4 + i, 0),
      label: fmt(new Date(y, m - 5 + i, 1), { month: 'short' }),
    }));
  }

  const ranges = buckets.map((b) => ({ ...b, s: toDateKey(b.start), e: toDateKey(b.end) }));

  let saldo =
    sum(getAll('akun'), (a) => a.saldoAwal || 0) +
    sum(trx.filter((t) => t.tanggal < ranges[0].s), arusKas);

  return ranges.map(({ s, e, label }) => {
    const isi = trx.filter((t) => t.tanggal >= s && t.tanggal <= e);
    const total = (jenis) =>
      sum(isi.filter((t) => jenis.includes(t.jenis)), (t) => Math.abs(arusKas(t)));

    const masuk = total(['penjualan', 'uang_masuk']);
    const keluar = total(['uang_keluar', 'pengeluaran']);
    const pembelian = total(['pembelian']);
    saldo += masuk - keluar - pembelian;

    return { label, masuk, keluar, pembelian, saldo };
  });
}