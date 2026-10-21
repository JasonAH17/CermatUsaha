import '../styles/form.css';
import '../styles/item.css';
import '../styles/inventaris.css';
import { getAll, getById, subscribe } from '../data/store.js';
import { rupiah, rupiahSingkat } from '../utils/format.js';
import { esc } from '../components/fields.js';
import { openItemForm, itemAvatar, stokStatus } from '../components/itemForms.js';

const FILTERS = [
  { value: 'semua', label: 'Semua' },
  { value: 'tipis', label: 'Hampir habis' },
  { value: 'habis', label: 'Habis' },
];
const BAR = { aman: 'var(--in)', tipis: 'var(--warn)', habis: 'var(--out)' };
const ORDER = { habis: 0, tipis: 1, aman: 2 };

export const inventaris = {
  render() {
    return `
      <header class="page-header">
        <button class="icon-btn sm pressable" data-back="/lainnya" aria-label="Kembali"><span class="icon">arrow_back</span></button>
        <span class="titles"><h1>Stok Barang</h1><small>Otomatis ikut jualan &amp; belanja</small></span>
        <button class="icon-btn primary pressable" data-add aria-label="Tambah barang">
          <span class="icon">add</span>
        </button>
      </header>

      <div class="inv stagger">
        <div class="inv-stats" style="--i:0">
          <div class="card stat"><small>Barang</small><strong data-stat="count">0</strong></div>
          <div class="card stat"><small>Nilai stok</small><strong data-stat="nilai">Rp 0</strong></div>
          <div class="card stat warn"><small>Perlu dibeli</small><strong data-stat="restok">0</strong></div>
        </div>

        <div class="inv-tools" style="--i:1">
          <div class="search">
            <span class="icon">search</span>
            <input class="input" type="search" placeholder="Cari barang..." data-search>
          </div>
          <div class="options">
            ${FILTERS.map((f) => `
              <button class="opt ${f.value === 'semua' ? 'active' : ''}" data-filter="${f.value}">${f.label}</button>
            `).join('')}
          </div>
        </div>

        <div class="inv-list" style="--i:2"></div>
      </div>
    `;
  },

  mount(view) {
    let query = '';
    let filter = 'semua';
    const listEl = view.querySelector('.inv-list');

    const renderStats = () => {
      const items = getAll('item');
      const status = items.map(stokStatus);
      const nilai = items.reduce((s, it, i) => s + Math.max(status[i].s, 0) * (it.hargaBeli || 0), 0);

      view.querySelector('[data-stat="count"]').textContent = items.length;
      view.querySelector('[data-stat="nilai"]').textContent = 'Rp ' + rupiahSingkat(nilai).replace('.', ',');
      view.querySelector('[data-stat="restok"]').textContent = status.filter((s) => s.cls !== 'aman').length;
    };

    const renderList = (animate = false) => {
      const rows = getAll('item')
        .map((it) => ({ it, st: stokStatus(it) }))
        .filter(({ it, st }) =>
          it.nama.toLowerCase().includes(query.toLowerCase()) && (filter === 'semua' || st.cls === filter))
        .sort((a, b) => ORDER[a.st.cls] - ORDER[b.st.cls] || a.it.nama.localeCompare(b.it.nama));

      listEl.classList.toggle('animate', animate);

      if (!rows.length) {
        const kosong = !getAll('item').length;
        listEl.innerHTML = `
          <div class="card empty">
            <span class="icon empty-icon">inventory_2</span>
            <p class="empty-title">${kosong ? 'Belum ada barang' : 'Barang tidak ditemukan'}</p>
            <p class="empty-sub">${kosong ? 'Tambahkan barang yang Anda jual supaya stoknya terpantau.' : 'Coba kata kunci atau pilihan lain.'}</p>
            ${kosong ? '<button class="btn btn-primary" data-add><span class="icon">add</span>Tambah barang</button>' : ''}
          </div>`;
        return;
      }

      listEl.innerHTML = rows.map(({ it, st }, i) => {
        const pct = Math.min(100, (Math.max(st.s, 0) / Math.max((it.stokMin || 1) * 3, 1)) * 100);
        return `
          <button class="inv-item pressable" data-id="${it.id}" style="--i:${i}">
            ${itemAvatar(it)}
            <span class="grow">
              <strong>${esc(it.nama)}</strong>
              <small>Jual ${rupiah(it.hargaJual)}</small>
              <span class="stok-bar" style="--c:${BAR[st.cls]}"><span style="width:${pct}%"></span></span>
            </span>
            <span class="inv-stok ${st.cls}">
              <strong>${st.s}</strong>
              <small>${esc(it.satuan)}</small>
            </span>
          </button>`;
      }).join('');
    };

    view.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) return openItemForm();

      const item = e.target.closest('[data-id]');
      if (item) return openItemForm(getById('item', item.dataset.id));

      const opt = e.target.closest('[data-filter]');
      if (opt) {
        filter = opt.dataset.filter;
        view.querySelectorAll('[data-filter]').forEach((o) => o.classList.toggle('active', o === opt));
        renderList(true);
      }
    });

    view.querySelector('[data-search]').addEventListener('input', (e) => {
      query = e.target.value;
      renderList();
    });

    renderStats();
    renderList(true);

    return subscribe(() => { renderStats(); renderList(); });
  },
};