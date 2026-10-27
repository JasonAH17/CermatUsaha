import '../styles/form.css';
import '../styles/list.css';
import '../styles/item.css';
import '../styles/inventaris.css';
import '../styles/riwayat.css';
import { getAll, getById, subscribe } from '../data/store.js';
import { arusKas, alurBarang } from '../data/selectors.js';
import { rupiah, toDateKey, tanggal } from '../utils/format.js';
import { esc } from '../components/fields.js';
import { openSheet } from '../components/sheet.js';
import { trxRow, trxTitle, openTrxDetail, isMasuk } from '../components/trx.js';
import { openItemForm, itemAvatar, stokStatus } from '../components/itemForms.js';
import { openForm } from '../components/forms.js';

const TABS = [
  { key: 'uang', label: 'Uang', icon: 'payments' },
  { key: 'stok', label: 'Stok', icon: 'inventory_2' },
  { key: 'ai', label: 'AI', icon: 'auto_awesome' },
];

export function waktuLabel(iso) {
  const d = new Date(iso);
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (toDateKey(d) === toDateKey()) return `Hari ini ${jam}`;
  if (toDateKey(d) === toDateKey(new Date(Date.now() - 864e5))) return `Kemarin ${jam}`;
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${jam}`;
}

function dayLabel(key) {
  if (key === toDateKey()) return 'Hari ini';
  if (key === toDateKey(new Date(Date.now() - 864e5))) return 'Kemarin';
  return new Date(`${key}T00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
}

const kosong = (icon, judul, sub, tombol = '') => `
  <div class="card empty">
    <span class="icon empty-icon">${icon}</span>
    <p class="empty-title">${judul}</p>
    <p class="empty-sub">${sub}</p>
    ${tombol}
  </div>`;

// ================= Tab Uang =================
const FILTERS = [
  { value: 'semua', label: 'Semua', test: () => true },
  { value: 'masuk', label: 'Uang masuk', test: isMasuk },
  { value: 'keluar', label: 'Uang keluar', test: (t) => !isMasuk(t) },
];

const htmlUang = () => `
  <div class="month-nav">
    <button data-month="-1" aria-label="Bulan sebelumnya"><span class="icon">chevron_left</span></button>
    <strong data-month-label></strong>
    <button data-month="1" aria-label="Bulan berikutnya"><span class="icon">chevron_right</span></button>
  </div>
  <div class="flow-stats">
    <div class="flow in"><small><span class="icon">south_west</span>Uang masuk</small><strong data-stat="masuk">Rp 0</strong></div>
    <div class="flow out"><small><span class="icon">north_east</span>Uang keluar</small><strong data-stat="keluar">Rp 0</strong></div>
  </div>
  <div class="search">
    <span class="icon">search</span>
    <input class="input" type="search" placeholder="Cari nama, toko, atau catatan..." data-search>
  </div>
  <div class="hscroll">
    ${FILTERS.map((f) => `<button class="opt ${f.value === 'semua' ? 'active' : ''}" data-filter="${f.value}">${f.label}</button>`).join('')}
  </div>
  <div class="trx-list"></div>`;

function mountUang(el) {
  const month = new Date();
  month.setDate(1);
  let filter = FILTERS[0];
  let query = '';
  const listEl = el.querySelector('.trx-list');

  const render = (animate = false) => {
    const key = toDateKey(month).slice(0, 7);
    el.querySelector('[data-month-label]').textContent = month.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    el.querySelector('[data-month="1"]').disabled = key >= toDateKey().slice(0, 7);

    const q = query.toLowerCase();
    const rows = getAll('transaksi')
      .filter((t) => t.tanggal.startsWith(key))
      .filter(filter.test)
      .filter((t) => !q || [trxTitle(t), t.catatan, t.kategori, t.toko].some((s) => (s || '').toLowerCase().includes(q)))
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || (b.createdAt || '').localeCompare(a.createdAt || ''));

    const flows = rows.map(arusKas);
    el.querySelector('[data-stat="masuk"]').textContent = rupiah(flows.filter((v) => v > 0).reduce((s, v) => s + v, 0));
    el.querySelector('[data-stat="keluar"]').textContent = rupiah(flows.filter((v) => v < 0).reduce((s, v) => s - v, 0));
    listEl.classList.toggle('animate', animate);

    if (!rows.length) {
      const belum = !getAll('transaksi').length;
      listEl.innerHTML = belum
        ? kosong('receipt_long', 'Belum ada catatan', 'Jualan, belanja, dan biaya yang Anda catat akan muncul di sini.',
          '<button class="btn btn-primary" data-nav-action="catat"><span class="icon">add</span>Catat sekarang</button>')
        : kosong('receipt_long', 'Tidak ada transaksi', 'Tidak ada transaksi di bulan atau pilihan ini.');
      return;
    }

    const groups = new Map();
    rows.forEach((t) => {
      if (!groups.has(t.tanggal)) groups.set(t.tanggal, []);
      groups.get(t.tanggal).push(t);
    });
    listEl.innerHTML = [...groups].map(([tgl, list], i) => {
      const net = list.reduce((s, t) => s + arusKas(t), 0);
      return `
        <section class="day-group" style="--i:${i}">
          <div class="day-head">
            <span>${dayLabel(tgl)}</span>
            <span class="${net >= 0 ? 'amount-in' : 'amount-out'}">${net >= 0 ? '+' : '−'}${rupiah(Math.abs(net))}</span>
          </div>
          <div class="row-card">${list.map((t) => trxRow(t)).join('')}</div>
        </section>`;
    }).join('');
  };

  el.addEventListener('click', (e) => {
    const trx = e.target.closest('[data-trx]');
    if (trx) return openTrxDetail(trx.dataset.trx);

    const m = e.target.closest('[data-month]');
    if (m && !m.disabled) {
      month.setMonth(month.getMonth() + Number(m.dataset.month));
      return render(true);
    }
    const opt = e.target.closest('[data-filter]');
    if (opt) {
      filter = FILTERS.find((f) => f.value === opt.dataset.filter);
      el.querySelectorAll('[data-filter]').forEach((o) => o.classList.toggle('active', o === opt));
      render(true);
    }
  });
  el.querySelector('[data-search]').addEventListener('input', (e) => { query = e.target.value; render(); });

  render(true);
  return () => render();
}

// ================= Tab Stok =================
const STOK_FILTER = [
  { value: 'semua', label: 'Semua' },
  { value: 'tipis', label: 'Hampir habis' },
  { value: 'habis', label: 'Habis' },
];
const BAR = { aman: 'var(--in)', tipis: 'var(--warn)', habis: 'var(--out)' };
const ORDER = { habis: 0, tipis: 1, aman: 2 };

const htmlStok = () => `
  <div class="stok-tools">
    <div class="search">
      <span class="icon">search</span>
      <input class="input" type="search" placeholder="Cari barang..." data-search>
    </div>
    <button class="icon-btn primary pressable" data-add-item aria-label="Tambah barang"><span class="icon">add</span></button>
  </div>
  <div class="hscroll">
    ${STOK_FILTER.map((f) => `<button class="opt ${f.value === 'semua' ? 'active' : ''}" data-filter="${f.value}">${f.label}</button>`).join('')}
  </div>
  <p class="tab-hint">Ketuk barang untuk melihat alur keluar-masuknya.</p>
  <div class="inv-list"></div>`;

function mountStok(el) {
  let query = '';
  let filter = 'semua';
  const listEl = el.querySelector('.inv-list');

  const render = (animate = false) => {
    const rows = getAll('item')
      .map((it) => ({ it, st: stokStatus(it) }))
      .filter(({ it, st }) => it.nama.toLowerCase().includes(query.toLowerCase()) && (filter === 'semua' || st.cls === filter))
      .sort((a, b) => ORDER[a.st.cls] - ORDER[b.st.cls] || a.it.nama.localeCompare(b.it.nama));
    listEl.classList.toggle('animate', animate);

    if (!rows.length) {
      const belum = !getAll('item').length;
      listEl.innerHTML = belum
        ? kosong('inventory_2', 'Belum ada barang', 'Upload nota belanja di tombol + Tambah, barangnya akan masuk ke sini otomatis.',
          '<button class="btn btn-primary" data-form="scan"><span class="icon">document_scanner</span>Upload nota</button>')
        : kosong('inventory_2', 'Barang tidak ditemukan', 'Coba kata kunci atau pilihan lain.');
      return;
    }

    listEl.innerHTML = rows.map(({ it, st }, i) => {
      const pct = Math.min(100, (Math.max(st.s, 0) / Math.max((it.stokMin || 1) * 3, 1)) * 100);
      return `
        <button class="inv-item pressable" data-item="${it.id}" style="--i:${i}">
          ${itemAvatar(it)}
          <span class="grow">
            <strong>${esc(it.nama)}</strong>
            <small>${it.hargaJual ? `Jual ${rupiah(it.hargaJual)}` : '<span class="amount-out">Harga jual belum diisi</span>'}</small>
            <span class="stok-bar" style="--c:${BAR[st.cls]}"><span style="width:${pct}%"></span></span>
          </span>
          <span class="inv-stok ${st.cls}"><strong>${st.s}</strong><small>${esc(it.satuan)}</small></span>
        </button>`;
    }).join('');
  };

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-item]')) return openItemForm();
    if (e.target.closest('[data-form="scan"]')) return openForm('scan');
    const item = e.target.closest('[data-item]');
    if (item) return openAlurBarang(item.dataset.item);
    const opt = e.target.closest('[data-filter]');
    if (opt) {
      filter = opt.dataset.filter;
      el.querySelectorAll('[data-filter]').forEach((o) => o.classList.toggle('active', o === opt));
      render(true);
    }
  });
  el.querySelector('[data-search]').addEventListener('input', (e) => { query = e.target.value; render(); });

  render(true);
  return () => render();
}

// Alur satu barang: dari stok awal, setiap belanja (+) dan jualan (−), sisa berjalan
export function openAlurBarang(id) {
  const it = getById('item', id);
  if (!it) return;
  const st = stokStatus(it);
  const { stokAwal, gerak } = alurBarang(id);

  const baris = [...gerak].reverse().map((g) => {
    const t = getById('transaksi', g.trxId);
    const masuk = g.qty > 0;
    const asal = masuk ? `Belanja${t?.toko ? ` · ${esc(t.toko)}` : ''}` : 'Jualan';
    return `
      <button class="row-item" data-trx="${g.trxId}">
        <span class="row-icon tone-${masuk ? 'in' : 'out'}"><span class="icon">${masuk ? 'add_box' : 'storefront'}</span></span>
        <span class="grow"><strong>${asal}</strong><small>${tanggal(g.tanggal)}</small></span>
        <span class="row-amount">
          <strong class="${masuk ? 'amount-in' : 'amount-out'}">${masuk ? '+' : '−'}${Math.abs(g.qty)} ${esc(it.satuan)}</strong>
          <span class="running">sisa ${g.sisa}</span>
        </span>
      </button>`;
  }).join('');

  openSheet({
    title: it.nama,
    body: `
      <div class="detail">
        <div class="alur-head">
          <div><small>Stok sekarang</small><strong class="stok-now ${st.cls}">${st.s} ${esc(it.satuan)}</strong></div>
          <span class="stok-badge ${st.cls}">${st.label}</span>
        </div>
        <div class="flow-stats">
          <div class="flow"><small>Harga jual</small><strong>${it.hargaJual ? rupiah(it.hargaJual) : '–'}</strong></div>
          <div class="flow"><small>Harga modal</small><strong>${it.hargaBeli ? rupiah(it.hargaBeli) : '–'}</strong></div>
        </div>
        <div class="section-title"><h2>Alur keluar-masuk</h2></div>
        <div class="row-card">
          ${baris}
          <div class="row-item">
            <span class="row-icon tone-muted"><span class="icon">flag</span></span>
            <span class="grow"><strong>Stok awal</strong><small>Saat barang ditambahkan</small></span>
            <span class="row-amount"><strong>${stokAwal} ${esc(it.satuan)}</strong></span>
          </div>
        </div>
        ${gerak.length ? '' : '<p class="tab-hint">Belum ada jualan atau belanja untuk barang ini.</p>'}
        <button class="btn btn-soft" data-edit><span class="icon">edit</span>Ubah harga & batas stok</button>
      </div>`,
    onMount(body, close) {
      body.addEventListener('click', (e) => {
        const trx = e.target.closest('[data-trx]');
        if (trx) return openTrxDetail(trx.dataset.trx);
        if (e.target.closest('[data-edit]')) {
          close();
          setTimeout(() => openItemForm(getById('item', id)), 200);
        }
      });
    },
  });
}

// ================= Tab AI =================
const IKON_AI = { nota: 'document_scanner', insight: 'lightbulb' };

const htmlAI = () => `
  <div class="section-title"><h2>Percakapan dengan Cermat AI</h2><a href="#/chat/baru">Chat baru</a></div>
  <div class="ai-chats"></div>
  <div class="section-title"><h2>Yang dikerjakan AI</h2></div>
  <div class="ai-log"></div>`;

function mountAI(el) {
  const render = () => {
    const chats = [...getAll('percakapan')].sort((a, b) => (b.diubah || '').localeCompare(a.diubah || ''));
    el.querySelector('.ai-chats').innerHTML = chats.length
      ? `<div class="row-card">${chats.map((c) => `
          <a class="row-item" href="#/chat/${c.id}">
            <span class="row-icon tone-brand"><span class="icon">forum</span></span>
            <span class="grow"><strong>${esc(c.judul)}</strong><small>${c.pesan.length} pesan · ${waktuLabel(c.diubah)}</small></span>
            <span class="icon chev">chevron_right</span>
          </a>`).join('')}</div>`
      : kosong('forum', 'Belum ada percakapan', 'Pertanyaan Anda ke Cermat AI tersimpan di sini.',
        '<a class="btn btn-primary" href="#/chat/baru"><span class="icon">auto_awesome</span>Mulai chat</a>');

    const log = [...getAll('aktivitasAI')].reverse();
    el.querySelector('.ai-log').innerHTML = log.length
      ? `<div class="row-card">${log.map((a) => `
          <button class="row-item" ${a.transaksiId ? `data-trx="${a.transaksiId}"` : ''}>
            <span class="row-icon tone-info"><span class="icon">${IKON_AI[a.jenis] || 'auto_awesome'}</span></span>
            <span class="grow"><strong class="wrap">${esc(a.ringkasan)}</strong><small>${waktuLabel(a.waktu)}</small></span>
          </button>`).join('')}</div>`
      : '<p class="tab-hint">Belum ada. Contohnya: membaca nota yang Anda upload atau memperbarui insight stok.</p>';
  };

  el.addEventListener('click', (e) => {
    const trx = e.target.closest('[data-trx]');
    if (trx && getById('transaksi', trx.dataset.trx)) openTrxDetail(trx.dataset.trx);
  });

  render();
  return render;
}

// ================= Halaman =================
const MOUNT = { uang: [htmlUang, mountUang], stok: [htmlStok, mountStok], ai: [htmlAI, mountAI] };

export const riwayat = {
  render({ tab = 'uang' } = {}) {
    const aktif = MOUNT[tab] ? tab : 'uang';
    return `
      <header class="page-header"><h1>Riwayat</h1></header>
      <nav class="tabs" style="--n:${TABS.length}" aria-label="Jenis riwayat">
        ${TABS.map((t) => `
          <a href="#/riwayat${t.key === 'uang' ? '' : `/${t.key}`}" class="tab ${t.key === aktif ? 'active' : ''}" ${t.key === aktif ? 'aria-current="page"' : ''}>
            <span class="icon">${t.icon}</span>${t.label}
          </a>`).join('')}
      </nav>
      <div class="list-page tab-body">${MOUNT[aktif][0]()}</div>`;
  },

  mount(view, { tab = 'uang' } = {}) {
    const aktif = MOUNT[tab] ? tab : 'uang';
    const rerender = MOUNT[aktif][1](view.querySelector('.tab-body'));
    return subscribe(() => rerender());
  },
};
