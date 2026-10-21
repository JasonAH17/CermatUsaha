import '../styles/form.css';
import '../styles/item.css';
import '../styles/list.css';
import '../styles/lainnya.css';
import {
  getAll, getProfil, setProfil, add, update,
  exportDb, replaceDb, resetDb, subscribe,
} from '../data/store.js';
import { removeWithUndo, withUndo, confirmAction } from '../components/safety.js';
import { currentUser, logOut } from '../data/auth.js';
import { saldoAkun } from '../data/selectors.js';
import { seedDemo } from '../data/seed.js';
import { rupiah, tanggal, toDateKey } from '../utils/format.js';
import { navigate } from '../router.js';
import { openSheet } from '../components/sheet.js';
import { openForm } from '../components/forms.js';
import { openTutorial } from '../components/tutorial.js';
import { toast } from '../components/toast.js';
import {
  esc, parseMoney, setMoney, normalisasiTelepon, validTelepon, invalid, bindFields,
  textField, moneyField, submitButton,
} from '../components/fields.js';

// Fitur utama: tampil besar supaya mudah ditemukan
const TILES = [
  { href: '#/pihak', label: 'Utang Piutang', desc: 'Pelanggan & supplier', icon: 'handshake' },
  { href: '#/inventaris', label: 'Stok Barang', desc: 'Daftar & sisa stok', icon: 'inventory_2' },
  { href: '#/laporan', label: 'Laporan', desc: 'Untung rugi, buku kas', icon: 'description' },
  { action: 'akun', label: 'Kas & Bank', desc: 'Saldo tiap rekening', icon: 'account_balance_wallet' },
];

const GROUPS = [
  {
    title: 'Alat bantu',
    items: [
      { action: 'pos', label: 'Kasir', desc: 'Jualan cepat dengan pilih barang', icon: 'point_of_sale' },
      { action: 'catatan', label: 'Catatan & Pengingat', desc: 'Lihat catatan tersimpan', icon: 'edit_note' },
      { action: 'panduan', label: 'Lihat Panduan', desc: 'Ulangi pengenalan aplikasi', icon: 'help' },
    ],
  },
  {
    title: 'Data',
    items: [
      { action: 'ekspor', label: 'Simpan Cadangan', desc: 'Unduh semua data ke file', icon: 'download' },
      { action: 'impor', label: 'Pulihkan Data', desc: 'Muat dari file cadangan', icon: 'upload' },
      { action: 'demo', label: 'Isi Data Contoh', desc: 'Untuk mencoba aplikasi', icon: 'science' },
      { action: 'reset', label: 'Hapus Semua Data', desc: 'Mulai dari awal', icon: 'delete_forever', tone: 'out' },
    ],
  },
];

const jumlahData = () => ['transaksi', 'pihak', 'item', 'catatan'].reduce((s, c) => s + getAll(c).length, 0);

function profileHtml() {
  const p = getProfil();
  const sub = [p.pemilik, p.telepon && `+${p.telepon}`].filter(Boolean).join(' · ') || 'Ketuk untuk melengkapi profil usaha';
  return `
    <span class="biz-avatar">${esc((p.namaUsaha || 'U')[0].toUpperCase())}</span>
    <span class="grow"><strong>${esc(p.namaUsaha)}</strong><small>${esc(sub)}</small></span>
    <span class="icon">edit</span>`;
}

export const lainnya = {
  render() {
    return `
      <header class="page-header"><h1>Menu</h1></header>

      <div class="list-page stagger">
        <button class="profile-card pressable" data-action="profil" style="--i:0">${profileHtml()}</button>

        <div class="menu-tiles" style="--i:1">
          ${TILES.map((t) => `
            <${t.href ? `a href="${t.href}"` : `button data-action="${t.action}"`} class="menu-tile pressable">
              <span class="row-icon tone-brand"><span class="icon">${t.icon}</span></span>
              <strong>${t.label}</strong>
              <small>${t.desc}</small>
            </${t.href ? 'a' : 'button'}>`).join('')}
        </div>

        ${GROUPS.map((g, gi) => `
          <div class="menu-group" style="--i:${gi + 2}">
            <h3>${g.title}</h3>
            <div class="row-card">
              ${g.items.map((it) => `
                <button class="row-item" data-action="${it.action}">
                  <span class="row-icon tone-${it.tone || 'muted'}"><span class="icon">${it.icon}</span></span>
                  <span class="grow"><strong>${it.label}</strong><small>${it.desc}</small></span>
                  <span class="icon chev">chevron_right</span>
                </button>`).join('')}
            </div>
          </div>`).join('')}

        <div class="menu-group" style="--i:${GROUPS.length + 2}">
          <h3>Akun</h3>
          <div class="row-card">
            <button class="row-item" data-action="keluar">
              <span class="row-icon tone-muted"><span class="icon">logout</span></span>
              <span class="grow"><strong>Keluar</strong><small>${esc(currentUser()?.email || '')}</small></span>
              <span class="icon chev">chevron_right</span>
            </button>
          </div>
        </div>

        <p class="app-version">CermatUsaha v1.0 · Data tersimpan di perangkat ini</p>
      </div>

      <input type="file" accept="application/json,.json" data-import hidden>
    `;
  },

  mount(view) {
    const fileInput = view.querySelector('[data-import]');

    const actions = {
      profil: openProfilForm,
      laporan: () => navigate('/laporan'),
      akun: openAkunSheet,
      pos: () => openForm('pos'),
      catatan: openCatatanList,
      panduan: openTutorial,
      keluar: () => {
        const nama = currentUser()?.nama;
        logOut();
        navigate('/masuk');
        toast(`Sampai jumpa${nama ? `, ${nama}` : ''}! Data Anda tetap tersimpan`, 'logout');
      },
      ekspor: exportBackup,
      impor: () => fileInput.click(),
      demo: async () => {
        const n = jumlahData();
        if (n && !(await confirmAction({
          title: 'Ganti dengan data contoh?',
          message: `${n} catatan Anda sekarang akan <b>diganti</b> dengan data contoh.`,
          confirmLabel: 'Ganti',
          extra: { label: 'Simpan cadangan dulu', icon: 'download', onClick: exportBackup },
        }))) return;
        withUndo(seedDemo, 'Data contoh dimuat');
      },
      reset: async () => {
        const n = jumlahData();
        if (!(await confirmAction({
          title: 'Hapus semua data?',
          message: `Semua ${n} data Anda (transaksi, kontak, barang, catatan) akan dihapus dari perangkat ini.`,
          confirmLabel: 'Hapus semua',
          danger: true,
          typeToConfirm: 'HAPUS',
          extra: { label: 'Simpan cadangan dulu', icon: 'download', onClick: exportBackup },
        }))) return;
        withUndo(resetDb, 'Semua data dihapus');
      },
    };

    view.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) actions[btn.dataset.action]?.();
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
        if (!Array.isArray(data.transaksi) || !Array.isArray(data.akun)) throw new Error('format');
      } catch {
        return toast('File ini bukan file cadangan CermatUsaha', 'error');
      }
      const ok = await confirmAction({
        title: 'Pulihkan dari file cadangan?',
        message: `Data sekarang (${jumlahData()} catatan) akan diganti dengan isi file: <b>${data.transaksi.length} transaksi</b>, ${data.pihak?.length || 0} kontak, ${data.item?.length || 0} barang.`,
        confirmLabel: 'Pulihkan',
      });
      if (ok) withUndo(() => replaceDb(data), 'Data berhasil dipulihkan');
    });

    return subscribe(() => {
      view.querySelector('.profile-card').innerHTML = profileHtml();
    });
  },
};

// ===== Profil Usaha =====
function openProfilForm() {
  const p = getProfil();
  openSheet({
    title: 'Profil Usaha',
    body: `
      <form class="form" novalidate>
        ${textField('namaUsaha', 'Nama usaha', { placeholder: 'Contoh: Warung Bu Sri' })}
        ${textField('pemilik', 'Nama pemilik', { placeholder: 'Tampil di tanda tangan laporan' })}
        ${textField('telepon', 'No. WhatsApp usaha', { type: 'tel', placeholder: '08xxxxxxxxxx' })}
        ${textField('alamat', 'Alamat', { textarea: true })}
        ${submitButton('Simpan Profil')}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      f.namaUsaha.value = p.namaUsaha || '';
      f.pemilik.value = p.pemilik || '';
      f.telepon.value = p.telepon ? `0${p.telepon.replace(/^62/, '')}` : '';
      f.alamat.value = p.alamat || '';

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nama = f.namaUsaha.value.trim();
        if (!nama) return invalid(f.namaUsaha, 'Isi nama usaha Anda.');
        if (!validTelepon(f.telepon.value)) {
          return invalid(f.telepon, 'Nomor WhatsApp sepertinya salah. Contoh yang benar: 081234567890.');
        }

        setProfil({
          namaUsaha: nama,
          pemilik: f.pemilik.value.trim(),
          telepon: normalisasiTelepon(f.telepon.value),
          alamat: f.alamat.value.trim(),
        });
        close();
        toast('Profil tersimpan', 'check_circle');
      });
    },
  });
}

// ===== Akun Kas & Bank =====
export function openAkunSheet() {
  let unsubscribe;
  openSheet({
    title: 'Kas & Bank',
    body: `
      <div class="form">
        <div class="row-card akun-list"></div>
        <button type="button" class="add-line pressable" data-new><span class="icon">add</span>Tambah rekening</button>
      </div>`,
    onMount(body) {
      const listEl = body.querySelector('.akun-list');

      const render = () => {
        listEl.innerHTML = getAll('akun').map((a) => `
          <button type="button" class="row-item" data-id="${a.id}">
            <span class="row-icon tone-brand">
              <span class="icon">${a.id === 'kas' ? 'payments' : 'account_balance'}</span>
            </span>
            <span class="grow"><strong>${esc(a.nama)}</strong><small>Saldo awal ${rupiah(a.saldoAwal || 0)} · ketuk untuk ubah</small></span>
            <span class="row-amount"><strong>${rupiah(saldoAkun(a.id))}</strong></span>
          </button>`).join('');
      };

      render();
      unsubscribe = subscribe(render); // ikut diperbarui saat Urungkan
      listEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (b) openAkunForm(getAll('akun').find((a) => a.id === b.dataset.id), render);
      });
      body.querySelector('[data-new]').addEventListener('click', () => openAkunForm(null, render));
    },
    onClose: () => unsubscribe?.(),
  });
}

function openAkunForm(akun, onSaved) {
  const edit = !!akun;
  const bawaan = edit && ['kas', 'bank'].includes(akun.id);

  openSheet({
    title: edit ? 'Ubah Rekening' : 'Tambah Rekening',
    body: `
      <form class="form" novalidate>
        ${textField('nama', 'Nama', { placeholder: 'Contoh: BCA, QRIS, Dana' })}
        ${moneyField('saldoAwal', 'Saldo saat mulai pakai aplikasi', true)}
        ${submitButton(edit ? 'Simpan' : 'Tambah')}
        ${edit && !bawaan ? `<button type="button" class="btn btn-ghost-danger pressable" data-delete><span class="icon">delete</span>Hapus rekening</button>` : ''}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      bindFields(form);

      if (edit) {
        f.nama.value = akun.nama;
        setMoney(f.saldoAwal, akun.saldoAwal || 0);
      }

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nama = f.nama.value.trim();
        if (!nama) return invalid(f.nama, 'Isi nama rekeningnya, misalnya BCA atau QRIS.');
        const kembar = getAll('akun').some((a) => a.id !== akun?.id && a.nama.trim().toLowerCase() === nama.toLowerCase());
        if (kembar) return invalid(f.nama, `Sudah ada rekening bernama ${nama}.`);

        const data = { nama, saldoAwal: parseMoney(f.saldoAwal.value) };
        edit ? update('akun', akun.id, data) : add('akun', data);
        close();
        toast(edit ? 'Rekening diperbarui' : 'Rekening ditambahkan', 'check_circle');
        onSaved?.();
      });

      form.querySelector('[data-delete]')?.addEventListener('click', () => {
        if (getAll('transaksi').some((t) => t.akunId === akun.id)) {
          return toast(`${akun.nama} masih dipakai di transaksi, jadi tidak bisa dihapus`, 'info');
        }
        close();
        removeWithUndo('akun', akun.id, `Rekening ${akun.nama} dihapus`);
        onSaved?.();
      });
    },
  });
}

// ===== Catatan =====
function openCatatanList() {
  let unsubscribe;
  openSheet({
    title: 'Catatan & Pengingat',
    body: `<div class="catatan-list"></div>`,
    onClose: () => unsubscribe?.(),
    onMount(body) {
      const el = body.querySelector('.catatan-list');

      const render = () => {
        const list = [...getAll('catatan')].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        el.innerHTML = list.length
          ? list.map((c) => `
              <div class="note">
                <div class="note-head">
                  <strong>${esc(c.judul)}</strong>
                  <button class="icon-btn sm" data-del="${c.id}" aria-label="Hapus"><span class="icon">delete</span></button>
                </div>
                ${c.isi ? `<p>${esc(c.isi)}</p>` : ''}
                ${c.pengingat ? `<span class="tag ${c.pengingat <= toDateKey() ? 'warn' : 'ok'}">Ingatkan ${tanggal(c.pengingat)}</span>` : ''}
              </div>`).join('')
          : `<p class="list-empty">Belum ada catatan</p>`;
      };

      render();
      unsubscribe = subscribe(render); // ikut diperbarui saat Urungkan
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-del]');
        if (b) removeWithUndo('catatan', b.dataset.del, 'Catatan dihapus');
      });
    },
  });
}

// ===== Backup =====
function exportBackup() {
  const blob = new Blob([JSON.stringify(exportDb(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-cermatusaha-${toDateKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Cadangan data diunduh', 'check_circle');
}