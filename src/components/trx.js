import '../styles/list.css';
import { getAll, getById } from '../data/store.js';
import { rupiah, tanggal } from '../utils/format.js';
import { esc } from './fields.js';
import { openSheet } from './sheet.js';
import { removeWithUndo } from './safety.js';

// Nama jenis transaksi dalam bahasa sehari-hari
export const JENIS = {
  penjualan: { label: 'Jualan', icon: 'storefront', tone: 'in' },
  uang_masuk: { label: 'Terima Uang', icon: 'call_received', tone: 'in' },
  pembelian: { label: 'Belanja Stok', icon: 'shopping_basket', tone: 'out' },
  pengeluaran: { label: 'Biaya Usaha', icon: 'receipt', tone: 'out' },
  uang_keluar: { label: 'Bayar Uang', icon: 'call_made', tone: 'out' },
};

export const isMasuk = (t) => ['penjualan', 'uang_masuk'].includes(t.jenis);

export const waLink = (phone, text) => `https://wa.me/${phone || ''}?text=${encodeURIComponent(text)}`;

export function trxTitle(t) {
  const pihak = t.pihakId && getById('pihak', t.pihakId);
  if (t.jenis === 'pengeluaran') return t.kategori || 'Biaya usaha';
  if (pihak) return pihak.nama;
  if (t.toko) return t.toko;
  if (t.jenis === 'penjualan') return t.catatan === 'POS' ? 'Jualan kasir' : 'Jualan tunai';
  if (t.jenis === 'pembelian') return 'Belanja stok';
  return JENIS[t.jenis].label;
}

function trxSub(t) {
  const parts = [JENIS[t.jenis].label];
  if (t.items?.length) parts.push(`${t.items.reduce((s, i) => s + i.qty, 0)} barang`);
  return parts.filter(Boolean).join(' · ');
}

export function trxRow(t, extra = '') {
  const j = JENIS[t.jenis];
  const masuk = isMasuk(t);
  return `
    <button class="row-item" data-trx="${t.id}">
      <span class="row-icon tone-${j.tone}"><span class="icon">${j.icon}</span></span>
      <span class="grow">
        <strong>${esc(trxTitle(t))}</strong>
        <small>${esc(trxSub(t))}</small>
      </span>
      <span class="row-amount">
        <strong class="${masuk ? 'amount-in' : 'amount-out'}">${masuk ? '+' : '−'}${rupiah(t.total)}</strong>
        ${extra}
      </span>
    </button>`;
}

function struk(t) {
  const usaha = getAll('profil')?.namaUsaha || 'Usaha Saya';
  const lines = [`*${usaha}*`, `${JENIS[t.jenis].label} · ${tanggal(t.tanggal)}`, ''];
  t.items?.forEach((li) => lines.push(`${li.nama} x${li.qty} = ${rupiah(li.qty * li.harga)}`));
  lines.push(`*Total: ${rupiah(t.total)}*`);
  if (t.catatan && t.catatan !== 'POS') lines.push(`Catatan: ${t.catatan}`);
  lines.push('', 'Terima kasih 🙏');
  return lines.join('\n');
}

export function openTrxDetail(id) {
  const t = getById('transaksi', id);
  if (!t) return;

  const j = JENIS[t.jenis];
  const pihak = t.pihakId && getById('pihak', t.pihakId);

  const rows = [
    ['Tanggal', tanggal(t.tanggal)],
    t.toko && ['Toko', esc(t.toko)],
    t.kategori && ['Untuk', esc(t.kategori)],
    t.catatan && t.catatan !== 'POS' && ['Catatan', esc(t.catatan)],
    t.struk && ['Sumber', '<span class="tag brand">Dari scan struk</span>'],
  ].filter(Boolean);

  openSheet({
    title: 'Detail Transaksi',
    body: `
      <div class="detail">
        <div class="detail-hero">
          <span class="row-icon lg tone-${j.tone}"><span class="icon">${j.icon}</span></span>
          <small>${j.label}</small>
          <strong class="${isMasuk(t) ? 'amount-in' : 'amount-out'}">${rupiah(t.total)}</strong>
        </div>

        ${t.items?.length ? `
          <div class="detail-items">
            ${t.items.map((li) => `
              <div>
                <span>${esc(li.nama || getById('item', li.itemId)?.nama || 'Barang')} <small>× ${li.qty}</small></span>
                <span>${rupiah(li.qty * li.harga)}</span>
              </div>`).join('')}
          </div>` : ''}

        <dl class="detail-rows">
          ${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
        </dl>

        <div class="row2">
          <button class="btn btn-soft" data-share><span class="icon">share</span>Kirim WA</button>
          <button class="btn btn-ghost-danger" data-delete><span class="icon">delete</span>Hapus</button>
        </div>
      </div>`,
    onMount(body, close) {
      body.querySelector('[data-share]').addEventListener('click', () => {
        window.open(waLink(pihak?.telepon, struk(t)), '_blank');
      });

      body.querySelector('[data-delete]').addEventListener('click', () => {
        close();
        removeWithUndo('transaksi', t.id, 'Transaksi dihapus. Saldo & stok ikut disesuaikan');
      });
    },
  });
}
