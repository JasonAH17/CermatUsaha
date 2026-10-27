import '../styles/form.css';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { add } from '../data/store.js';
import { rupiah } from '../utils/format.js';
import { navigate } from '../router.js';
import { openItemForm, openFakturForm } from './itemForms.js';
import { openScan } from './scan.js';
import {
  parseMoney, invalid, bindFields,
  moneyField, textField, dateField, optionsField, moreFields, submitButton,
} from './fields.js';

export const KATEGORI = ['Bahan Baku', 'Gaji', 'Sewa', 'Listrik & Air', 'Transportasi', 'Lainnya'];

const MASUK = [
  { key: 'penjualan', label: 'Jualan', desc: 'Uang hasil jualan', icon: 'storefront' },
  { key: 'uang_masuk', label: 'Terima Uang', desc: 'Tambahan modal, pinjaman, dll', icon: 'call_received' },
];
const KELUAR = [
  { key: 'pengeluaran', label: 'Biaya Usaha', desc: 'Listrik, gaji, sewa, bensin, dll', icon: 'receipt' },
  { key: 'pembelian', label: 'Belanja Stok', desc: 'Beli barang dagangan atau bahan', icon: 'shopping_basket' },
  { key: 'uang_keluar', label: 'Bayar Uang', desc: 'Ambil uang pribadi, cicilan, dll', icon: 'call_made' },
];

const KAS = {
  uang_masuk: { title: 'Terima Uang', placeholder: 'Contoh: tambahan modal dari tabungan' },
  uang_keluar: { title: 'Bayar Uang', placeholder: 'Contoh: cicilan pinjaman' },
};

// Semua uang dicatat di satu kas
const AKUN = 'kas';

const focusLater = (el) => setTimeout(() => el.focus({ preventScroll: true }), 380);

// ===== Dispatcher =====
export function openForm(key) {
  const map = {
    catat: () => openCatat(),
    masuk: () => openCatat('masuk'),
    keluar: () => openCatat('keluar'),
    penjualan: () => openNotaForm('penjualan'),
    pembelian: () => openNotaForm('pembelian'),
    faktur_penjualan: () => openFakturForm('penjualan'),
    faktur_pembelian: () => openFakturForm('pembelian'),
    uang_masuk: () => openKasForm('uang_masuk'),
    uang_keluar: () => openKasForm('uang_keluar'),
    pengeluaran: openPengeluaranForm,
    scan: openScan,
    item: () => openItemForm(),
    laporan: () => navigate('/laporan'),
  };
  map[key]?.();
}

// ===== Lembar "Tambah" (satu pintu untuk semua pencatatan) =====
const opsi = (o, tone) => `
  <button class="catat-opt tone-${tone}" data-key="${o.key}">
    <span class="row-icon tone-${tone}"><span class="icon">${o.icon}</span></span>
    <span class="grow"><strong>${o.label}</strong><small>${o.desc}</small></span>
    <span class="icon chev">chevron_right</span>
  </button>`;

function openCatat(arah) {
  const title = { masuk: 'Uang masuk dari mana?', keluar: 'Uang keluar untuk apa?' }[arah] || 'Mau catat apa?';
  openSheet({
    title,
    body: `
      <div class="catat">
        ${arah !== 'masuk' ? `
          <button class="catat-opt catat-feature" data-key="scan">
            <span class="row-icon tone-brand" style="--cs:#fff"><span class="icon">document_scanner</span></span>
            <span class="grow"><strong>Scan / Upload Nota</strong><small>Foto atau file PDF, dibaca AI, dicek dulu</small></span>
            <span class="icon chev">chevron_right</span>
          </button>` : ''}

        ${arah !== 'keluar' ? `
          <div class="catat-group" style="--c:var(--in)">
            ${arah ? '' : '<h4><span class="dot"></span>Uang masuk</h4>'}
            ${MASUK.map((o) => opsi(o, 'in')).join('')}
          </div>` : ''}

        ${arah !== 'masuk' ? `
          <div class="catat-group" style="--c:var(--out)">
            ${arah ? '' : '<h4><span class="dot"></span>Uang keluar</h4>'}
            ${KELUAR.map((o) => opsi(o, 'out')).join('')}
          </div>` : ''}
      </div>`,
    onMount(body, close) {
      body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-key]');
        if (!btn) return;
        close();
        setTimeout(() => openForm(btn.dataset.key), 180);
      });
    },
  });
}

// ===== Jualan / Belanja Stok (cukup total, tanpa daftar barang) =====
const NOTA = {
  penjualan: { title: 'Catat Jualan', total: 'Total jualan', faktur: 'faktur_penjualan', fakturDesc: 'stok berkurang otomatis' },
  pembelian: { title: 'Belanja Stok', total: 'Total belanja', faktur: 'faktur_pembelian', fakturDesc: 'stok bertambah otomatis' },
};

function openNotaForm(jenis) {
  const cfg = NOTA[jenis];
  openSheet({
    title: cfg.title,
    body: `
      <form class="form" novalidate>
        ${moneyField('total', cfg.total)}
        ${moreFields(`${dateField()}${textField('catatan', 'Catatan', { textarea: true })}`)}
        <button type="button" class="switch-link" data-faktur>
          <span class="icon">list_alt</span>
          <span class="grow">Mau rinci per barang? <strong>Pilih dari daftar barang</strong> · ${cfg.fakturDesc}</span>
        </button>
        ${submitButton('Simpan')}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      bindFields(form);
      focusLater(f.total);

      form.querySelector('[data-faktur]').addEventListener('click', () => {
        close();
        setTimeout(() => openForm(cfg.faktur), 180);
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const total = parseMoney(f.total.value);
        if (!total) return invalid(f.total, `Isi ${cfg.total.toLowerCase()} dulu.`);

        add('transaksi', {
          jenis,
          items: [],
          total,
          dibayar: total,
          akunId: AKUN,
          tanggal: f.tanggal.value,
          catatan: f.catatan.value.trim(),
        });
        close();
        toast(`${cfg.title.replace('Catat ', '')} ${rupiah(total)} tersimpan`, 'check_circle');
      });
    },
  });
}

// ===== Terima Uang / Bayar Uang =====
function openKasForm(jenis) {
  const cfg = KAS[jenis];
  openSheet({
    title: cfg.title,
    body: `
      <form class="form" novalidate>
        ${moneyField('total', 'Jumlah uang')}
        ${textField('catatan', 'Untuk apa? (boleh dikosongkan)', { placeholder: cfg.placeholder })}
        ${moreFields(dateField())}
        ${submitButton()}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      bindFields(form);
      focusLater(f.total);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const total = parseMoney(f.total.value);
        if (!total) return invalid(f.total, 'Isi jumlah uangnya dulu.');

        add('transaksi', {
          jenis,
          total,
          akunId: AKUN,
          tanggal: f.tanggal.value,
          catatan: f.catatan.value.trim(),
        });
        close();
        toast(`${cfg.title} ${rupiah(total)} tersimpan`, 'check_circle');
      });
    },
  });
}

// ===== Biaya Usaha =====
function openPengeluaranForm() {
  openSheet({
    title: 'Biaya Usaha',
    body: `
      <form class="form" novalidate>
        ${moneyField('total', 'Jumlah biaya')}
        ${optionsField('kategori', 'Untuk apa?', KATEGORI.map((k) => ({ value: k, label: k })), KATEGORI[0])}
        ${moreFields(`${dateField()}${textField('catatan', 'Catatan', { placeholder: 'Contoh: token listrik', textarea: true })}`)}
        ${submitButton()}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      bindFields(form);
      focusLater(f.total);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const total = parseMoney(f.total.value);
        if (!total) return invalid(f.total, 'Isi jumlah biayanya dulu.');

        add('transaksi', {
          jenis: 'pengeluaran',
          total,
          kategori: f.kategori.value,
          akunId: AKUN,
          tanggal: f.tanggal.value,
          catatan: f.catatan.value.trim(),
        });
        close();
        toast(`Biaya ${rupiah(total)} tersimpan`, 'check_circle');
      });
    },
  });
}
