import { add, update, resetDb } from './store.js';
import { toDateKey } from '../utils/format.js';

const d = (n) => toDateKey(new Date(Date.now() - n * 864e5));

export function seedDemo() {
  resetDb();
  update('akun', 'kas', { saldoAwal: 2000000 });
  update('akun', 'bank', { saldoAwal: 5000000 });

  const sri = add('pihak', { nama: 'Bu Sri', jenis: 'pelanggan', telepon: '6281200000001', saldoAwal: 0 });
  const budi = add('pihak', { nama: 'Pak Budi', jenis: 'pelanggan', telepon: '6281200000002', saldoAwal: 150000 });
  const makmur = add('pihak', { nama: 'Toko Makmur', jenis: 'pemasok', telepon: '6281200000003', saldoAwal: -300000 });

  const nasi = add('item', { nama: 'Nasi Kotak', satuan: 'kotak', hargaBeli: 15000, hargaJual: 25000, stokAwal: 50, stokMin: 10 });
  const minyak = add('item', { nama: 'Minyak Goreng 2L', satuan: 'botol', hargaBeli: 32000, hargaJual: 38000, stokAwal: 20, stokMin: 5 });
  add('item', { nama: 'Gula 1kg', satuan: 'pack', hargaBeli: 15000, hargaJual: 18000, stokAwal: 8, stokMin: 10 });

  add('transaksi', { jenis: 'penjualan', tanggal: d(6), akunId: 'kas', pihakId: sri.id, items: [{ itemId: nasi.id, qty: 20, harga: 25000 }], total: 500000, dibayar: 500000 });
  add('transaksi', { jenis: 'pembelian', tanggal: d(5), akunId: 'bank', pihakId: makmur.id, items: [{ itemId: minyak.id, qty: 10, harga: 32000 }], total: 320000, dibayar: 200000 });
  add('transaksi', { jenis: 'pengeluaran', tanggal: d(4), akunId: 'kas', kategori: 'Listrik', total: 250000 });
  add('transaksi', { jenis: 'penjualan', tanggal: d(3), akunId: 'kas', pihakId: budi.id, items: [{ itemId: nasi.id, qty: 30, harga: 25000 }], total: 750000, dibayar: 400000 });
  add('transaksi', { jenis: 'uang_masuk', tanggal: d(2), akunId: 'bank', pihakId: budi.id, total: 150000, catatan: 'Cicilan' });
  add('transaksi', { jenis: 'pengeluaran', tanggal: d(1), akunId: 'kas', kategori: 'Gaji', total: 600000 });
  add('transaksi', { jenis: 'uang_keluar', tanggal: d(0), akunId: 'bank', pihakId: makmur.id, total: 300000, catatan: 'Pelunasan' });
  add('transaksi', { jenis: 'penjualan', tanggal: d(0), akunId: 'kas', items: [{ itemId: minyak.id, qty: 4, harga: 38000 }], total: 152000, dibayar: 152000 });

  console.log('✅ Data demo dimuat');
}