import './styles/base.css';
import './styles/ui.css';
import { route, startRouter, goBack, isKnownRoute } from './router.js';
import { BottomNav, setActiveNav } from './components/bottomNav.js';
import { openForm } from './components/forms.js';
import { closeAllSheets } from './components/sheet.js';
import { maybeShowTutorial } from './components/tutorial.js';
import { masuk, daftar } from './pages/auth.js';
import { beranda } from './pages/beranda.js';
import { transaksi } from './pages/transaksi.js';
import { pihakList, pihakDetail } from './pages/pihak.js';
import { inventaris } from './pages/inventaris.js';
import { lainnya } from './pages/lainnya.js';
import { laporan } from './pages/laporan.js';
import { ai } from './pages/ai.js';
import { currentUser, resumeSession } from './data/auth.js';
import * as store from './data/store.js';
import * as sel from './data/selectors.js';
import { seedDemo } from './data/seed.js';

if (import.meta.env.DEV) window.ku = { store, sel, seedDemo };

const NAV = [
  { path: '/beranda', label: 'Beranda', icon: 'home', page: beranda },
  { path: '/transaksi', label: 'Riwayat', icon: 'receipt_long', page: transaksi },
  { action: 'catat', label: 'Catat', icon: 'add' },
  { path: '/ai', label: 'Tanya AI', icon: 'forum', page: ai },
  { path: '/lainnya', label: 'Menu', icon: 'menu', page: lainnya, also: ['/pihak', '/inventaris', '/laporan'] },
];

// '/beranda' didaftarkan pertama supaya jadi halaman cadangan bila alamat tidak dikenal
NAV.filter((n) => n.page).forEach((n) => route(n.path, n.page));
route('/pihak', pihakList);
route('/pihak/:id', pihakDetail);
route('/inventaris', inventaris);
route('/laporan', laporan);
route('/laporan/pihak/:id', laporan);
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

// Aksi global: tombol kembali & tombol Catat di navigasi
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
