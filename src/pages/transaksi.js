import '../styles/form.css';
import '../styles/list.css';
import { getAll, subscribe } from '../data/store.js';
import { arusKas } from '../data/selectors.js';
import { rupiah, toDateKey } from '../utils/format.js';
import { trxRow, trxTitle, openTrxDetail, isMasuk, sisaTagihan } from '../components/trx.js';
import { openForm } from '../components/forms.js';

const FILTERS = [
  { value: 'semua', label: 'Semua', test: () => true },
  { value: 'masuk', label: 'Uang masuk', test: isMasuk },
  { value: 'keluar', label: 'Uang keluar', test: (t) => !isMasuk(t) },
  { value: 'belum', label: 'Belum lunas', test: (t) => sisaTagihan(t) > 0 },
];

function dayLabel(key) {
  if (key === toDateKey()) return 'Hari ini';
  if (key === toDateKey(new Date(Date.now() - 864e5))) return 'Kemarin';
  return new Date(`${key}T00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
}

export const transaksi = {
  render() {
    return `
      <header class="page-header">
        <h1>Riwayat</h1>
        <button class="icon-btn primary pressable" data-add aria-label="Catat transaksi">
          <span class="icon">add</span>
        </button>
      </header>

      <div class="list-page stagger">
        <div class="month-nav" style="--i:0">
          <button data-month="-1" aria-label="Bulan sebelumnya"><span class="icon">chevron_left</span></button>
          <strong data-month-label></strong>
          <button data-month="1" aria-label="Bulan berikutnya"><span class="icon">chevron_right</span></button>
        </div>

        <div class="flow-stats" style="--i:1">
          <div class="flow in"><small><span class="icon">south_west</span>Uang masuk</small><strong data-stat="masuk">Rp 0</strong></div>
          <div class="flow out"><small><span class="icon">north_east</span>Uang keluar</small><strong data-stat="keluar">Rp 0</strong></div>
        </div>

        <div class="search" style="--i:2">
          <span class="icon">search</span>
          <input class="input" type="search" placeholder="Cari nama, toko, atau catatan..." data-search>
        </div>

        <div class="hscroll" style="--i:3">
          ${FILTERS.map((f) => `
            <button class="opt ${f.value === 'semua' ? 'active' : ''}" data-filter="${f.value}">${f.label}</button>
          `).join('')}
        </div>

        <div class="trx-list" style="--i:4"></div>
      </div>
    `;
  },

  mount(view) {
    const month = new Date();
    month.setDate(1);
    let filter = FILTERS[0];
    let query = '';
    const listEl = view.querySelector('.trx-list');

    const render = (animate = false) => {
      const key = toDateKey(month).slice(0, 7);
      view.querySelector('[data-month-label]').textContent =
        month.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      view.querySelector('[data-month="1"]').disabled = key >= toDateKey().slice(0, 7);

      const q = query.toLowerCase();
      const rows = getAll('transaksi')
        .filter((t) => t.tanggal.startsWith(key))
        .filter(filter.test)
        .filter((t) => !q || [trxTitle(t), t.catatan, t.kategori, t.toko].some((s) => (s || '').toLowerCase().includes(q)))
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || (b.createdAt || '').localeCompare(a.createdAt || ''));

      const flows = rows.map(arusKas);
      view.querySelector('[data-stat="masuk"]').textContent =
        rupiah(flows.filter((v) => v > 0).reduce((s, v) => s + v, 0));
      view.querySelector('[data-stat="keluar"]').textContent =
        rupiah(flows.filter((v) => v < 0).reduce((s, v) => s - v, 0));

      listEl.classList.toggle('animate', animate);

      if (!rows.length) {
        const kosong = !getAll('transaksi').length;
        listEl.innerHTML = `
          <div class="card empty">
            <span class="icon empty-icon">receipt_long</span>
            <p class="empty-title">${kosong ? 'Belum ada catatan' : 'Tidak ada transaksi'}</p>
            <p class="empty-sub">${kosong
              ? 'Jualan, belanja, dan biaya yang Anda catat akan muncul di sini.'
              : 'Tidak ada transaksi di bulan atau pilihan ini.'}</p>
            ${kosong ? '<button class="btn btn-primary" data-add><span class="icon">add</span>Catat sekarang</button>' : ''}
          </div>`;
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

    view.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) return openForm('catat');

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
        view.querySelectorAll('[data-filter]').forEach((o) => o.classList.toggle('active', o === opt));
        render(true);
      }
    });

    view.querySelector('[data-search]').addEventListener('input', (e) => {
      query = e.target.value;
      render();
    });

    render(true);
    return subscribe(() => render());
  },
};
