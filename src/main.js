import './styles/base.css';
import './styles/ui.css';
import { route, startRouter, goBack, isKnownRoute } from './router.js';
import { BottomNav, setActiveNav } from './components/bottomNav.js';
import { openForm } from './components/forms.js';
import { closeAllSheets } from './components/sheet.js';
import { maybeShowTutorial } from './components/tutorial.js';
import { masuk, daftar } from './pages/auth.js';
import { beranda } from './pages/beranda.js';
import { riwayat } from './pages/riwayat.js';
import { chat } from './pages/chat.js';
import { pengaturan } from './pages/pengaturan.js';
import { laporan } from './pages/laporan.js';
import { currentUser, resumeSession } from './data/auth.js';
import * as store from './data/store.js';
import * as sel from './data/selectors.js';
import { seedDemo } from './data/seed.js';

if (import.meta.env.DEV) window.ku = { store, sel, seedDemo };

// Lima halaman utama: Beranda · Riwayat · + Tambah · Chat · Pengaturan
const NAV = [
  { path: '/beranda', label: 'Beranda', icon: 'home', page: beranda },
  { path: '/riwayat', label: 'Riwayat', icon: 'receipt_long', page: riwayat },
  { action: 'catat', label: 'Tambah', icon: 'add' },
  { path: '/chat', label: 'Chat', icon: 'forum', page: chat },
  { path: '/pengaturan', label: 'Pengaturan', icon: 'settings', page: pengaturan, also: ['/laporan'] },
];

// '/beranda' didaftarkan pertama supaya jadi halaman cadangan bila alamat tidak dikenal
NAV.filter((n) => n.page).forEach((n) => route(n.path, n.page));
route('/riwayat/:tab', riwayat);
route('/chat/:id', chat);
route('/laporan', laporan);
route('/masuk', masuk);
route('/daftar', daftar);

const AUTH_PAGES = ['/masuk', '/daftar'];

// Belum masuk -> ke halaman Masuk; sudah masuk -> tidak perlu melihat halaman Masuk lagi
function guard(path) {
  if (!isKnownRoute(path)) return currentUser() ? '/beranda' : '/masuk';
  const authPage = AUTH_PAGES.includes(path);
  if (!currentUser()) return authPage ? null : '/masuk';
  return authPage ? '/beranda' : null;
}

document.querySelector('#app').innerHTML = `
  <div class="app">
    <main id="outlet"></main>
    ${BottomNav(NAV)}
  </div>
`;

// Aksi global: tombol kembali & tombol Tambah di navigasi
document.addEventListener('click', (e) => {
  const back = e.target.closest('[data-back]');
  if (back) return goBack(back.dataset.back);

  const act = e.target.closest('[data-nav-action]');
  if (act) openForm(act.dataset.navAction);
});

// Pindah halaman (termasuk tombol Back HP) menutup lembar yang masih terbuka
window.addEventListener('hashchange', closeAllSheets);

resumeSession();
startRouter(document.querySelector('#outlet'), (path) => {
  document.body.classList.toggle('auth-mode', AUTH_PAGES.includes(path));
  setActiveNav(path);
}, guard);
maybeShowTutorial();
