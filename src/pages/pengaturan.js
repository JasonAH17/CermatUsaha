import '../styles/form.css';
import '../styles/list.css';
import '../styles/lainnya.css';
import { getProfil, setProfil, subscribe } from '../data/store.js';
import { currentUser, logOut } from '../data/auth.js';
import { navigate } from '../router.js';
import { openSheet } from '../components/sheet.js';
import { openTutorial } from '../components/tutorial.js';
import { toast } from '../components/toast.js';
import {
  esc, normalisasiTelepon, validTelepon, invalid, textField, submitButton,
} from '../components/fields.js';

function profileHtml() {
  const p = getProfil();
  const sub = [p.pemilik, p.telepon && `+${p.telepon}`].filter(Boolean).join(' · ') || 'Ketuk untuk melengkapi profil usaha';
  return `
    <span class="biz-avatar">${esc((p.namaUsaha || 'U')[0].toUpperCase())}</span>
    <span class="grow"><strong>${esc(p.namaUsaha)}</strong><small>${esc(sub)}</small></span>
    <span class="icon">edit</span>`;
}

const baris = (action, icon, label, desc, tone = 'brand') => `
  <button class="row-item" data-action="${action}">
    <span class="row-icon tone-${tone}"><span class="icon">${icon}</span></span>
    <span class="grow"><strong>${label}</strong><small>${desc}</small></span>
    <span class="icon chev">chevron_right</span>
  </button>`;

export const pengaturan = {
  render() {
    return `
      <header class="page-header"><h1>Pengaturan</h1></header>

      <div class="list-page stagger">
        <div class="menu-group" style="--i:0">
          <h3>Profil usaha</h3>
          <button class="profile-card pressable" data-action="profil">${profileHtml()}</button>
        </div>

        <div class="menu-group" style="--i:1">
          <h3>Laporan</h3>
          <div class="row-card">
            ${baris('laporan', 'description', 'Laporan Keuangan', 'Buku kas, untung rugi, penjualan per barang · unduh PDF')}
          </div>
        </div>

        <div class="menu-group" style="--i:2">
          <h3>Lainnya</h3>
          <div class="row-card">
            ${baris('panduan', 'help', 'Lihat Panduan', 'Ulangi pengenalan aplikasi', 'muted')}
            ${baris('keluar', 'logout', 'Keluar', esc(currentUser()?.email || ''), 'muted')}
          </div>
        </div>

        <p class="app-version">CermatUsaha v1.0 · Data tersimpan di perangkat ini</p>
      </div>
    `;
  },

  mount(view) {
    const actions = {
      profil: openProfilForm,
      laporan: () => navigate('/laporan'),
      panduan: openTutorial,
      keluar: () => {
        const nama = currentUser()?.nama;
        logOut();
        navigate('/masuk');
        toast(`Sampai jumpa${nama ? `, ${nama}` : ''}! Data Anda tetap tersimpan`, 'logout');
      },
    };

    view.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) actions[btn.dataset.action]?.();
    });

    return subscribe(() => {
      const card = view.querySelector('.profile-card');
      if (card) card.innerHTML = profileHtml();
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
