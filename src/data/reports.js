import { getAll, getById } from './store.js';
import { arusKas } from './selectors.js';
import { tanggal } from '../utils/format.js';

export const REPORTS = {
  bukukas: { label: 'Buku Kas', desc: 'Semua uang masuk & keluar', icon: 'account_balance_wallet', color: '#10b981' },
  labarugi: { label: 'Laba Rugi', desc: 'Usaha untung atau rugi', icon: 'trending_up', color: '#3b82f6' },
  penjualan: { label: 'Penjualan per Barang', desc: 'Barang paling laku & untungnya', icon: 'sell', color: '#0ea5e9' },
};

const JENIS_LABEL = {
  penjualan: 'Penjualan',
  pembelian: 'Pembelian',
  uang_masuk: 'Uang Masuk',
  uang_keluar: 'Uang Keluar',
  pengeluaran: 'Pengeluaran',
};

const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);
const inRange = (t, from, to) => t.tanggal >= from && t.tanggal <= to;
const byDate = (a, b) => a.tanggal.localeCompare(b.tanggal) || (a.createdAt || '').localeCompare(b.createdAt || '');

// Nama kontak hanya ada di transaksi lama (sebelum fitur utang piutang dihapus)
function uraian(t) {
  const p = t.pihakId && getById('pihak', t.pihakId);
  const nama = t.toko || p?.nama;
  const base = t.jenis === 'pengeluaran'
    ? `Pengeluaran - ${t.kategori || 'Lainnya'}`
    : `${JENIS_LABEL[t.jenis]}${nama ? ` - ${nama}` : ''}`;
  return t.catatan && t.catatan !== 'POS' && !t.catatan.startsWith('Nota ') ? `${base} (${t.catatan})` : base;
}

// Format nilai untuk layar & PDF (hanya karakter aman untuk PDF)
export function formatValue(v, type = 'text') {
  if (v === null || v === undefined || v === '') return type === 'money' ? '-' : '';
  if (type === 'money') return `${v < 0 ? '-' : ''}Rp ${Math.abs(Math.round(v)).toLocaleString('id-ID')}`;
  if (type === 'date') return tanggal(v);
  if (type === 'percent') return `${v.toFixed(1).replace('.', ',')}%`;
  if (type === 'number') return v.toLocaleString('id-ID');
  return String(v);
}

// ===== Buku Kas =====
function bukuKas(from, to) {
  const trx = [...getAll('transaksi')].sort(byDate);
  let saldo = sum(getAll('akun'), (a) => a.saldoAwal || 0) + sum(trx.filter((t) => t.tanggal < from), arusKas);
  const awal = saldo;
  let masuk = 0;
  let keluar = 0;

  const rows = trx
    .filter((t) => inRange(t, from, to) && arusKas(t) !== 0)
    .map((t) => {
      const v = arusKas(t);
      if (v > 0) masuk += v;
      else keluar -= v;
      saldo += v;
      return {
        tanggal: t.tanggal,
        uraian: uraian(t),
        masuk: v > 0 ? v : null,
        keluar: v < 0 ? -v : null,
        saldo,
      };
    });

  return {
    summary: [
      { label: 'Saldo awal', value: awal },
      { label: 'Uang masuk', value: masuk, tone: 'in' },
      { label: 'Uang keluar', value: keluar, tone: 'out' },
      { label: 'Saldo akhir', value: saldo, tone: 'strong' },
    ],
    columns: [
      { key: 'tanggal', header: 'Tanggal', type: 'date', width: 24 },
      { key: 'uraian', header: 'Uraian' },
      { key: 'masuk', header: 'Masuk', type: 'money', align: 'right', width: 27 },
      { key: 'keluar', header: 'Keluar', type: 'money', align: 'right', width: 27 },
      { key: 'saldo', header: 'Saldo', type: 'money', align: 'right', width: 29 },
    ],
    rows,
  };
}

// ===== Laba Rugi =====
function labaRugi(from, to) {
  const trx = getAll('transaksi').filter((t) => inRange(t, from, to));
  const jual = trx.filter((t) => t.jenis === 'penjualan');

  const pendapatan = sum(jual, (t) => t.total);
  const hpp = sum(jual, (t) => sum(t.items || [], (li) => li.qty * (getById('item', li.itemId)?.hargaBeli || 0)));
  const kotor = pendapatan - hpp;

  const kategori = {};
  trx.filter((t) => t.jenis === 'pengeluaran').forEach((t) => {
    const k = t.kategori || 'Lainnya';
    kategori[k] = (kategori[k] || 0) + t.total;
  });
  const biaya = sum(Object.values(kategori), (v) => v);
  const bersih = kotor - biaya;

  return {
    summary: [
      { label: 'Pendapatan', value: pendapatan, tone: 'in' },
      { label: 'Laba kotor', value: kotor },
      { label: 'Laba bersih', value: bersih, tone: bersih >= 0 ? 'strong' : 'out' },
      { label: 'Margin bersih', value: pendapatan ? (bersih / pendapatan) * 100 : 0, type: 'percent' },
    ],
    columns: [
      { key: 'ket', header: 'Keterangan' },
      { key: 'jumlah', header: 'Jumlah', type: 'money', align: 'right', width: 45 },
    ],
    rows: [
      { ket: 'Pendapatan penjualan', jumlah: pendapatan },
      { ket: 'Harga pokok penjualan (HPP)', jumlah: -hpp },
      { ket: 'Laba kotor', jumlah: kotor, _style: 'bold' },
      { ket: 'Biaya operasional', jumlah: null, _style: 'bold' },
      ...Object.entries(kategori)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({ ket: k, jumlah: -v, _style: 'sub' })),
      { ket: 'Total biaya operasional', jumlah: -biaya, _style: 'bold' },
      { ket: 'LABA BERSIH', jumlah: bersih, _style: 'total' },
    ],
    note: 'HPP dihitung dari harga beli item saat ini. Pembelian stok tidak dihitung sebagai biaya.',
  };
}

// ===== Penjualan per Item =====
function penjualanItem(from, to) {
  const map = new Map();
  getAll('transaksi')
    .filter((t) => t.jenis === 'penjualan' && inRange(t, from, to))
    .forEach((t) => (t.items || []).forEach((li) => {
      const it = getById('item', li.itemId);
      const r = map.get(li.itemId) || { nama: li.nama || it?.nama || 'Item', satuan: it?.satuan || '', qty: 0, omzet: 0, modal: 0 };
      r.qty += li.qty;
      r.omzet += li.qty * li.harga;
      r.modal += li.qty * (it?.hargaBeli || 0);
      map.set(li.itemId, r);
    }));

  const list = [...map.values()].sort((a, b) => b.omzet - a.omzet);
  const omzet = sum(list, (r) => r.omzet);
  const laba = sum(list, (r) => r.omzet - r.modal);

  return {
    summary: [
      { label: 'Item terjual', value: sum(list, (r) => r.qty), type: 'number' },
      { label: 'Omzet', value: omzet, tone: 'in' },
      { label: 'Laba kotor', value: laba, tone: 'strong' },
    ],
    columns: [
      { key: 'no', header: 'No', width: 12 },
      { key: 'nama', header: 'Item' },
      { key: 'qty', header: 'Terjual', align: 'right', width: 26 },
      { key: 'omzet', header: 'Omzet', type: 'money', align: 'right', width: 32 },
      { key: 'laba', header: 'Laba', type: 'money', align: 'right', width: 32 },
    ],
    rows: list.map((r, i) => ({
      no: i + 1,
      nama: r.nama,
      qty: `${r.qty} ${r.satuan}`.trim(),
      omzet: r.omzet,
      laba: r.omzet - r.modal,
    })),
  };
}

// ===== Pembangun laporan =====
export function buildReport(type, { from, to }) {
  const builders = {
    bukukas: () => bukuKas(from, to),
    labarugi: () => labaRugi(from, to),
    penjualan: () => penjualanItem(from, to),
  };

  const data = builders[type]();
  return {
    title: REPORTS[type]?.label || 'Laporan',
    period: `${tanggal(from)} - ${tanggal(to)}`,
    from,
    to,
    ...data,
  };
}