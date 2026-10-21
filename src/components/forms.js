import '../styles/form.css';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { add, getAll, getById } from '../data/store.js';
import { saldoPihak } from '../data/selectors.js';
import { rupiah, toDateKey } from '../utils/format.js';
import { navigate } from '../router.js';
import { openItemForm, openFakturForm, openPOS } from './itemForms.js';
import { openScan } from './scan.js';
import {
  esc, parseMoney, setMoney, normalisasiTelepon, validTelepon, invalid, bindFields,
  moneyField, textField, dateField, optionsField, akunField, pihakField, moreFields, submitButton,
} from './fields.js';

export const KATEGORI = ['Bahan Baku', 'Gaji', 'Sewa', 'Listrik & Air', 'Transportasi', 'Lainnya'];

const MASUK = [
  { key: 'penjualan', label: 'Jualan', desc: 'Hasil jualan, tunai atau dihutangi', icon: 'storefront' },
  { key: 'uang_masuk', label: 'Terima Uang', desc: 'Pelanggan bayar utang, modal masuk', icon: 'call_received' },
];
const KELUAR = [
  { key: 'pengeluaran', label: 'Biaya Usaha', desc: 'Listrik, gaji, sewa, bensin, dll', icon: 'receipt' },
  { key: 'pembelian', label: 'Belanja Stok', desc: 'Beli barang dagangan atau bahan', icon: 'shopping_basket' },
  { key: 'uang_keluar', label: 'Bayar Uang', desc: 'Bayar utang ke supplier, dll', icon: 'call_made' },
];
const LAINNYA = [
  { key: 'pos', label: 'Kasir', icon: 'point_of_sale' },
  { key: 'item', label: 'Tambah Barang', icon: 'inventory_2' },
  { key: 'pihak', label: 'Tambah Kontak', icon: 'person_add' },
  { key: 'catatan', label: 'Catatan', icon: 'edit_note' },
];

const KAS = {
  uang_masuk: { title: 'Terima Uang', pihakLabel: 'Dari siapa?', pihakJenis: 'pelanggan', placeholder: 'Contoh: cicilan ke-2' },
  uang_keluar: { title: 'Bayar Uang', pihakLabel: 'Ke siapa?', pihakJenis: 'pemasok', placeholder: 'Contoh: pelunasan nota' },
};

const focusLater = (el) => setTimeout(() => el.focus({ preventScroll: true }), 380);
const jenisLabel = (p) => (p.jenis === 'pemasok' ? 'Supplier' : 'Pelanggan');

// Kontak yang otomatis terpilih saat form dibuka dari halaman detail kontak
let presetPihakId = null;

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
    pos: openPOS,
    pihak: () => openPihakForm(),
    catatan: openCatatanForm,
    laporan: () => navigate('/laporan'),
  };
  map[key]?.();
}

export function openFormFor(key, pihakId) {
  presetPihakId = pihakId;
  try {
    openForm(key);
  } finally {
    presetPihakId = null;
  }
}

// ===== Lembar "Catat" (satu pintu untuk semua pencatatan) =====
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
            <span class="grow"><strong>Scan Struk</strong><small>Foto nota, cek angkanya, simpan</small></span>
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

        ${arah ? '' : `
          <div class="catat-group">
            <h4>Lainnya</h4>
            <div class="catat-mini">
              ${LAINNYA.map((o) => `
                <button data-key="${o.key}"><span class="icon">${o.icon}</span>${o.label}</button>`).join('')}
            </div>
          </div>`}
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
  penjualan: {
    title: 'Catat Jualan', total: 'Total jualan', pihakLabel: 'Pelanggan', pihakJenis: 'pelanggan', sisa: 'piutang',
    belum: 'Dihutang', faktur: 'faktur_penjualan', fakturDesc: 'stok berkurang otomatis',
  },
  pembelian: {
    title: 'Belanja Stok', total: 'Total belanja', pihakLabel: 'Supplier', pihakJenis: 'pemasok', sisa: 'utang',
    belum: 'Belum dibayar', faktur: 'faktur_pembelian', fakturDesc: 'stok bertambah otomatis',
  },
};

function openNotaForm(jenis) {
  const cfg = NOTA[jenis];
  openSheet({
    title: cfg.title,
    body: `
      <form class="form" novalidate>
        ${moneyField('total', cfg.total)}
        ${optionsField('status', 'Sudah dibayar?', [
          { value: 'lunas', label: 'Lunas' },
          { value: 'sebagian', label: 'Sebagian' },
          { value: 'belum', label: cfg.belum },
        ], 'lunas')}
        ${pihakField(cfg.pihakLabel)}
        <div class="bayar-extra form" hidden>
          <div data-dibayar-wrap>${moneyField('dibayar', 'Yang sudah dibayar', true)}</div>
          ${dateField('jatuhTempo', 'Janji bayar tanggal', toDateKey(new Date(Date.now() + 7 * 864e5)), { min: toDateKey() })}
        </div>
        ${moreFields(`${akunField()}${dateField()}${textField('catatan', 'Catatan', { textarea: true })}`)}
        <button type="button" class="switch-link" data-faktur>
          <span class="icon">list_alt</span>
          <span class="grow">Mau rinci per barang? <strong>Pilih dari daftar barang</strong> · ${cfg.fakturDesc}</span>
        </button>
        ${submitButton('Simpan')}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      const extra = form.querySelector('.bayar-extra');
      const opsional = form.querySelector('[data-pihak-picker]').parentElement.querySelector('.field-label em');
      bindFields(form);
      setupPihakPicker(form, cfg.pihakJenis, jenis);
      focusLater(f.total);

      f.status.addEventListener('change', () => {
        extra.hidden = f.status.value === 'lunas';
        form.querySelector('[data-dibayar-wrap]').hidden = f.status.value !== 'sebagian';
        opsional.hidden = f.status.value !== 'lunas';
      });

      form.querySelector('[data-faktur]').addEventListener('click', () => {
        close();
        setTimeout(() => openForm(cfg.faktur), 180);
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const total = parseMoney(f.total.value);
        if (!total) return invalid(f.total, `Isi ${cfg.total.toLowerCase()} dulu.`);

        const status = f.status.value;
        const bayarSebagian = parseMoney(f.dibayar.value);
        if (status === 'sebagian' && !bayarSebagian) return invalid(f.dibayar, 'Isi berapa yang sudah dibayar.');
        if (status === 'sebagian' && bayarSebagian >= total) {
          return invalid(f.dibayar, `Harus kurang dari total ${rupiah(total)}. Kalau sudah dibayar penuh, pilih "Lunas".`);
        }
        const dibayar = status === 'lunas' ? total : status === 'belum' ? 0 : bayarSebagian;
        if (dibayar < total && !f.pihakId.value) {
          return invalid(form.querySelector('[data-pihak-picker]'), `Pilih ${cfg.pihakLabel.toLowerCase()} supaya ${cfg.sisa}nya tercatat.`);
        }

        add('transaksi', {
          jenis,
          pihakId: f.pihakId.value || undefined,
          items: [],
          total,
          dibayar,
          jatuhTempo: dibayar < total ? f.jatuhTempo.value : null,
          akunId: f.akunId.value,
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
        ${pihakField(cfg.pihakLabel)}
        ${moreFields(`${akunField()}${dateField()}${textField('catatan', 'Catatan', { placeholder: cfg.placeholder, textarea: true })}`)}
        ${submitButton()}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      bindFields(form);
      setupPihakPicker(form, cfg.pihakJenis, jenis);
      focusLater(f.total);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const total = parseMoney(f.total.value);
        if (!total) return invalid(f.total, 'Isi jumlah uangnya dulu.');

        add('transaksi', {
          jenis,
          total,
          akunId: f.akunId.value,
          pihakId: f.pihakId.value || undefined,
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
        ${moreFields(`${akunField()}${dateField()}${textField('catatan', 'Catatan', { placeholder: 'Contoh: token listrik', textarea: true })}`)}
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
          akunId: f.akunId.value,
          tanggal: f.tanggal.value,
          catatan: f.catatan.value.trim(),
        });
        close();
        toast(`Biaya ${rupiah(total)} tersimpan`, 'check_circle');
      });
    },
  });
}

// ===== Tambah Kontak =====
export function openPihakForm(jenisDefault = 'pelanggan', onSaved) {
  openSheet({
    title: 'Tambah Kontak',
    body: `
      <form class="form" novalidate>
        ${textField('nama', 'Nama', { placeholder: 'Contoh: Bu Sri' })}
        <small class="field-warn" data-dupe hidden></small>
        ${optionsField('jenis', 'Dia siapa?', [
          { value: 'pelanggan', label: 'Pelanggan' },
          { value: 'pemasok', label: 'Supplier' },
        ], jenisDefault)}
        ${textField('telepon', 'No. WhatsApp (boleh dikosongkan)', { placeholder: '08xxxxxxxxxx', type: 'tel' })}
        ${moreFields(`
          ${moneyField('saldoAwal', 'Jumlah utang sebelumnya', true)}
          ${optionsField('arah', 'Siapa yang berutang?', [
            { value: 'terima', label: 'Dia ke saya' },
            { value: 'bayar', label: 'Saya ke dia' },
          ], 'terima')}`, { title: 'Sudah ada utang sebelumnya?', sub: 'Isi kalau ada catatan utang lama' })}
        ${submitButton('Simpan Kontak')}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      bindFields(form);
      focusLater(f.nama);

      // Peringatan halus kalau nama sudah ada, supaya tidak tercatat dobel
      const dupe = form.querySelector('[data-dupe]');
      f.nama.addEventListener('input', () => {
        const nama = f.nama.value.trim().toLowerCase();
        const ada = nama && getAll('pihak').find((p) => p.nama.trim().toLowerCase() === nama);
        dupe.hidden = !ada;
        if (ada) dupe.innerHTML = `<span class="icon">warning</span>Sudah ada kontak bernama ${esc(ada.nama)}. Pastikan ini orang yang berbeda.`;
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nama = f.nama.value.trim();
        if (!nama) return invalid(f.nama, 'Isi nama kontaknya dulu.');
        if (!validTelepon(f.telepon.value)) {
          return invalid(f.telepon, 'Nomor WhatsApp sepertinya salah. Contoh yang benar: 081234567890.');
        }

        const saldo = parseMoney(f.saldoAwal.value);
        const pihak = add('pihak', {
          nama,
          jenis: f.jenis.value,
          telepon: normalisasiTelepon(f.telepon.value),
          saldoAwal: f.arah.value === 'bayar' ? -saldo : saldo,
        });
        close();
        toast(`${nama} ditambahkan`, 'check_circle');
        onSaved?.(pihak);
      });
    },
  });
}

// ===== Tambah Catatan =====
function openCatatanForm() {
  openSheet({
    title: 'Tambah Catatan',
    body: `
      <form class="form" novalidate>
        ${textField('judul', 'Judul', { placeholder: 'Contoh: Tagih Pak Budi' })}
        ${textField('isi', 'Isi catatan', { textarea: true })}
        ${dateField('pengingat', 'Ingatkan pada (boleh dikosongkan)', '', { min: toDateKey() })}
        ${submitButton('Simpan Catatan')}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      bindFields(form);
      focusLater(f.judul);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const judul = f.judul.value.trim();
        if (!judul) return invalid(f.judul, 'Isi judul catatannya dulu.');

        add('catatan', { judul, isi: f.isi.value.trim(), pengingat: f.pengingat.value || null });
        close();
        toast('Catatan tersimpan', 'check_circle');
      });
    },
  });
}

// ===== Pemilih Kontak =====
export function setupPihakPicker(form, jenisDefault, trxJenis) {
  const btn = form.querySelector('[data-pihak-picker]');
  const hint = btn.parentElement.querySelector('.hint');

  const select = (p) => {
    form.elements.pihakId.value = p.id;
    btn.classList.remove('invalid');
    btn.querySelector('.avatar').textContent = p.nama[0].toUpperCase();
    btn.querySelector('.picker-text').innerHTML = `<strong>${esc(p.nama)}</strong><small>${jenisLabel(p)}</small>`;

    const s = saldoPihak(p.id);
    if (!s) { hint.hidden = true; return; }

    const sisa = Math.abs(s);
    const bisaLunasi = (trxJenis === 'uang_masuk' && s > 0) || (trxJenis === 'uang_keluar' && s < 0);
    hint.hidden = false;
    hint.innerHTML = `
      <span>${s > 0 ? `${esc(p.nama)} masih berutang` : 'Anda masih berutang'} <strong>${rupiah(sisa)}</strong></span>
      ${bisaLunasi ? `<button type="button" data-lunasi="${sisa}">Lunasi</button>` : ''}`;
  };

  hint.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lunasi]');
    if (b) setMoney(form.elements.total, +b.dataset.lunasi);
  });

  btn.addEventListener('click', () => openPihakPicker(jenisDefault, select));

  if (presetPihakId) {
    const p = getById('pihak', presetPihakId);
    if (p) select(p);
  }
}

export function openPihakPicker(jenisDefault, onPick) {
  openSheet({
    title: 'Pilih Nama',
    body: `
      <div class="form">
        <div class="search">
          <span class="icon">search</span>
          <input class="input" type="search" placeholder="Cari nama..." data-search>
        </div>
        <button type="button" class="list-item" data-new>
          <span class="avatar"><span class="icon">add</span></span>
          <span class="grow"><strong>Tambah kontak baru</strong></span>
        </button>
        <div class="pick-list"></div>
      </div>`,
    onMount(body, close) {
      const listEl = body.querySelector('.pick-list');

      const renderList = (q = '') => {
        const rows = getAll('pihak')
          .filter((p) => p.nama.toLowerCase().includes(q.toLowerCase()))
          .sort((a, b) => (b.jenis === jenisDefault) - (a.jenis === jenisDefault) || a.nama.localeCompare(b.nama));

        listEl.innerHTML = rows.length
          ? rows.map((p) => {
              const s = saldoPihak(p.id);
              return `
                <button type="button" class="list-item" data-id="${p.id}">
                  <span class="avatar">${esc(p.nama[0].toUpperCase())}</span>
                  <span class="grow"><strong>${esc(p.nama)}</strong><small>${jenisLabel(p)}</small></span>
                  ${s ? `<small class="${s > 0 ? 'amount-in' : 'amount-out'}">${rupiah(Math.abs(s))}</small>` : ''}
                </button>`;
            }).join('')
          : `<p class="list-empty">Belum ada kontak</p>`;
      };

      renderList();
      body.querySelector('[data-search]').addEventListener('input', (e) => renderList(e.target.value));

      listEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (!b) return;
        onPick(getAll('pihak').find((p) => p.id === b.dataset.id));
        close();
      });

      body.querySelector('[data-new]').addEventListener('click', () =>
        openPihakForm(jenisDefault, (p) => { onPick(p); close(); })
      );
    },
  });
}
