import '../styles/form.css';
import '../styles/list.css';
import { getAll, getById, subscribe } from '../data/store.js';
import { removeWithUndo } from '../components/safety.js';
import { saldoPihak, ringkasanPiutangUtang } from '../data/selectors.js';
import { rupiah } from '../utils/format.js';
import { navigate } from '../router.js';
import { esc } from '../components/fields.js';
import { toast } from '../components/toast.js';
import { openPihakForm, openFormFor } from '../components/forms.js';
import { trxRow, openTrxDetail, waLink } from '../components/trx.js';

const FILTERS = [
  { value: 'semua', label: 'Semua' },
  { value: 'saldo', label: 'Belum lunas' },
  { value: 'pelanggan', label: 'Pelanggan' },
  { value: 'pemasok', label: 'Supplier' },
];

const jenisLabel = (p) => (p.jenis === 'pemasok' ? 'Supplier' : 'Pelanggan');
const initial = (p) => esc(p.nama[0].toUpperCase());
const namaUsaha = () => getAll('profil')?.namaUsaha || 'Usaha Saya';

// Efek transaksi ke saldo pihak (+ piutang, - utang)
function efekPihak(t) {
  const sisa = t.total - (t.dibayar ?? t.total);
  return { penjualan: sisa, pembelian: -sisa, uang_masuk: -t.total, uang_keluar: t.total }[t.jenis] ?? 0;
}

// ================= Daftar Pihak =================
export const pihakList = {
  render() {
    return `
      <header class="page-header">
        <button class="icon-btn sm pressable" data-back="/lainnya" aria-label="Kembali"><span class="icon">arrow_back</span></button>
        <span class="titles"><h1>Utang Piutang</h1><small>Pelanggan &amp; supplier Anda</small></span>
        <button class="icon-btn primary pressable" data-add aria-label="Tambah kontak">
          <span class="icon">person_add</span>
        </button>
      </header>

      <div class="list-page stagger">
        <div class="flow-stats" style="--i:0">
          <div class="flow in"><small><span class="icon">south_west</span>Akan Anda terima</small><strong data-stat="terima">Rp 0</strong></div>
          <div class="flow out"><small><span class="icon">north_east</span>Harus Anda bayar</small><strong data-stat="bayar">Rp 0</strong></div>
        </div>

        <div class="search" style="--i:1">
          <span class="icon">search</span>
          <input class="input" type="search" placeholder="Cari nama..." data-search>
        </div>

        <div class="hscroll" style="--i:2">
          ${FILTERS.map((f) => `
            <button class="opt ${f.value === 'semua' ? 'active' : ''}" data-filter="${f.value}">${f.label}</button>
          `).join('')}
        </div>

        <div class="pihak-list" style="--i:3"></div>
      </div>
    `;
  },

  mount(view) {
    let filter = 'semua';
    let query = '';
    const listEl = view.querySelector('.pihak-list');

    const render = (animate = false) => {
      const pu = ringkasanPiutangUtang();
      view.querySelector('[data-stat="terima"]').textContent = rupiah(pu.terima);
      view.querySelector('[data-stat="bayar"]').textContent = rupiah(pu.bayar);

      const rows = getAll('pihak')
        .map((p) => ({ p, s: saldoPihak(p.id) }))
        .filter(({ p }) => p.nama.toLowerCase().includes(query.toLowerCase()))
        .filter(({ p, s }) =>
          filter === 'semua' || (filter === 'saldo' ? s !== 0 : p.jenis === filter))
        .sort((a, b) => Math.abs(b.s) - Math.abs(a.s) || a.p.nama.localeCompare(b.p.nama));

      listEl.classList.toggle('animate', animate);

      if (!rows.length) {
        const kosong = !getAll('pihak').length;
        listEl.innerHTML = `
          <div class="card empty">
            <span class="icon empty-icon">group</span>
            <p class="empty-title">${kosong ? 'Belum ada kontak' : 'Nama tidak ditemukan'}</p>
            <p class="empty-sub">${kosong ? 'Tambahkan pelanggan atau supplier untuk mencatat utang piutang.' : 'Coba kata kunci atau pilihan lain.'}</p>
            ${kosong ? '<button class="btn btn-primary" data-add><span class="icon">person_add</span>Tambah kontak</button>' : ''}
          </div>`;
        return;
      }

      listEl.innerHTML = `
        <div class="row-card">
          ${rows.map(({ p, s }, i) => `
            <a href="#/pihak/${p.id}" class="row-item" style="--i:${i}">
              <span class="avatar">${initial(p)}</span>
              <span class="grow">
                <strong>${esc(p.nama)}</strong>
                <small>${jenisLabel(p)}</small>
              </span>
              <span class="row-amount">
                ${s
                  ? `<strong class="${s > 0 ? 'amount-in' : 'amount-out'}">${rupiah(Math.abs(s))}</strong>
                     <span class="tag ${s > 0 ? 'ok' : 'bad'}">${s > 0 ? 'Akan diterima' : 'Harus dibayar'}</span>`
                  : '<span class="tag muted">Lunas</span>'}
              </span>
            </a>`).join('')}
        </div>`;
    };

    view.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) return openPihakForm();

      const opt = e.target.closest('[data-filter]');
      if (opt) {
        filter = opt.dataset.filter;
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

// ================= Detail Pihak =================
export const pihakDetail = {
  render({ id }) {
    const p = getById('pihak', id);
    if (!p) {
      return `
        <div class="card empty">
          <span class="icon empty-icon">person_off</span>
          <p class="empty-title">Kontak tidak ditemukan</p>
          <a href="#/pihak" class="btn-link">Kembali ke daftar</a>
        </div>`;
    }

    const pelanggan = p.jenis !== 'pemasok';
    return `
      <header class="page-header">
        <button class="icon-btn sm pressable" data-back="/pihak" aria-label="Kembali"><span class="icon">arrow_back</span></button>
        <span class="avatar">${initial(p)}</span>
        <span class="titles">
          <h1>${esc(p.nama)}</h1>
          <small>${jenisLabel(p)}${p.telepon ? ` · +${esc(p.telepon)}` : ''}</small>
        </span>
        <button class="icon-btn sm pressable" data-delete aria-label="Hapus kontak"><span class="icon">delete</span></button>
      </header>

      <div class="list-page stagger pihak-page">
        <div class="balance-card" data-balance style="--i:0"></div>

        <div class="action-row" style="--i:1">
          <button class="action pressable" data-call><span class="icon">call</span>Telepon</button>
          <button class="action pressable" data-wa><span class="icon">chat</span>WhatsApp</button>
          <button class="action pressable" data-remind><span class="icon">notifications_active</span>Tagih</button>
          <button class="action pressable" data-report><span class="icon">description</span>Laporan</button>
        </div>

        <div class="section-title" style="--i:2"><h2>Riwayat</h2></div>
        <div class="pihak-trx" style="--i:3"></div>
      </div>

      <div class="sticky-actions">
        <button class="btn btn-soft" data-form="${pelanggan ? 'penjualan' : 'pembelian'}">
          <span class="icon">${pelanggan ? 'storefront' : 'shopping_basket'}</span>${pelanggan ? 'Jualan' : 'Belanja'}
        </button>
        <button class="btn btn-primary" data-form="${pelanggan ? 'uang_masuk' : 'uang_keluar'}">
          <span class="icon">${pelanggan ? 'south_west' : 'north_east'}</span>${pelanggan ? 'Terima Uang' : 'Bayar Utang'}
        </button>
      </div>
    `;
  },

  mount(view, { id }) {
    if (!getById('pihak', id)) return;

    const render = () => {
      const p = getById('pihak', id);
      if (!p) return;
      const s = saldoPihak(id);

      // Kartu saldo
      const [tone, label, desc] =
        s > 0 ? ['tone-in', 'Akan Anda terima', `${p.nama} masih berutang kepada Anda`]
        : s < 0 ? ['tone-out', 'Harus Anda bayar', `Anda masih berutang kepada ${p.nama}`]
        : ['tone-muted', 'Lunas', 'Tidak ada utang piutang'];

      const card = view.querySelector('[data-balance]');
      card.className = `balance-card ${tone}`;
      card.innerHTML = `<small>${label}</small><strong>${rupiah(Math.abs(s))}</strong><p>${esc(desc)}</p>`;

      view.querySelector('[data-remind]').disabled = s <= 0;

      // Riwayat dengan saldo berjalan
      const trx = getAll('transaksi')
        .filter((t) => t.pihakId === id)
        .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || (a.createdAt || '').localeCompare(b.createdAt || ''));

      let running = p.saldoAwal || 0;
      const rows = trx.map((t) => {
        running += efekPihak(t);
        return { t, running };
      }).reverse();

      const saldoLabel = (v) => `<span class="running">Saldo ${v < 0 ? '−' : ''}${rupiah(Math.abs(v))}</span>`;
      const listEl = view.querySelector('.pihak-trx');

      if (!rows.length && !p.saldoAwal) {
        listEl.innerHTML = `
          <div class="card empty">
            <span class="icon empty-icon">receipt_long</span>
            <p class="empty-title">Belum ada transaksi</p>
            <p class="empty-sub">Catat jualan atau pembayaran lewat tombol di bawah.</p>
          </div>`;
        return;
      }

      listEl.innerHTML = `
        <div class="row-card">
          ${rows.map(({ t, running: r }) => trxRow(t, saldoLabel(r))).join('')}
          ${p.saldoAwal ? `
            <div class="row-item">
              <span class="row-icon tone-muted"><span class="icon">flag</span></span>
              <span class="grow"><strong>Saldo awal</strong><small>Utang lama saat kontak ditambahkan</small></span>
              <span class="row-amount">
                <strong class="${p.saldoAwal > 0 ? 'amount-in' : 'amount-out'}">${rupiah(Math.abs(p.saldoAwal))}</strong>
              </span>
            </div>` : ''}
        </div>`;
    };

    view.addEventListener('click', (e) => {
      const p = getById('pihak', id);
      if (!p) return;
      const s = saldoPihak(id);

      const trx = e.target.closest('[data-trx]');
      if (trx) return openTrxDetail(trx.dataset.trx);

      const formBtn = e.target.closest('[data-form]');
      if (formBtn) return openFormFor(formBtn.dataset.form, id);

      if (e.target.closest('[data-call]')) {
        if (!p.telepon) return toast('Nomor telepon belum diisi', 'error');
        location.href = `tel:+${p.telepon}`;
      }

      if (e.target.closest('[data-wa]')) {
        if (!p.telepon) return toast('Nomor WhatsApp belum diisi', 'error');
        window.open(waLink(p.telepon, `Halo ${p.nama}, `), '_blank');
      }

      if (e.target.closest('[data-remind]')) {
        if (!p.telepon) return toast('Nomor WhatsApp belum diisi', 'error');
        const pesan = [
          `Halo ${p.nama}, kami dari *${namaUsaha()}*.`,
          `Kami ingin mengingatkan tagihan Anda sebesar *${rupiah(s)}* yang belum dibayar.`,
          'Mohon dapat diselesaikan. Terima kasih 🙏',
        ].join('\n');
        window.open(waLink(p.telepon, pesan), '_blank');
      }

      if (e.target.closest('[data-report]')) {
        navigate(`/laporan/pihak/${id}`);
      }

      if (e.target.closest('[data-delete]')) {
        if (getAll('transaksi').some((t) => t.pihakId === id)) {
          return toast('Kontak ini masih punya transaksi, hapus transaksinya dulu', 'error');
        }
        navigate('/pihak');
        removeWithUndo('pihak', id, `${p.nama} dihapus`);
      }
    });

    render();
    return subscribe(render);
  },
};