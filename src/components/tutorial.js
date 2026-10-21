import '../styles/tutorial.css';
import { getAll, getProfil, setProfil } from '../data/store.js';
import { seedDemo } from '../data/seed.js';
import { currentUser } from '../data/auth.js';
import { esc } from './fields.js';

// Panduan ditandai per akun, jadi akun baru di perangkat yang sama tetap melihatnya
const key = () => `cermatusaha:tutorial:v1:${currentUser()?.id}`;

const SLIDES = [
  {
    icon: 'add', tone: 'brand',
    title: 'Catat uang masuk & keluar',
    text: 'Tekan tombol <b>＋ Catat</b> di bawah layar. Pilih jualan, belanja, atau biaya, isi jumlahnya, selesai.',
  },
  {
    icon: 'document_scanner', tone: 'brand',
    title: 'Scan struk, tanpa ngetik',
    text: 'Foto nota belanja. Total dan barangnya dibaca otomatis, Anda <b>cek dulu</b> sebelum disimpan.',
  },
  {
    icon: 'forum', tone: 'brand',
    title: 'Tanya Cermat AI',
    text: 'Bingung untung atau rugi? Tanya saja pakai bahasa sehari-hari, jawabannya dari data usaha Anda.',
  },
  {
    icon: 'description', tone: 'brand',
    title: 'Laporan rapi otomatis',
    text: 'Laporan untung rugi dan buku kas tersusun sendiri, siap diunduh PDF kapan saja.',
  },
];

const seen = () => { try { return localStorage.getItem(key()) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(key(), '1'); } catch { /* abaikan */ } };

export function maybeShowTutorial() {
  if (!currentUser()) return;
  const kosong = !getAll('transaksi').length && !getAll('pihak').length && !getAll('item').length;
  if (!seen() && kosong) openTutorial();
}

export function openTutorial() {
  let i = 0;
  const last = SLIDES.length; // slide terakhir = isi nama usaha

  const root = document.createElement('div');
  root.className = 'tutorial';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Panduan singkat');
  root.innerHTML = `
    <div class="tut-top">
      <span class="tut-brand"><span class="icon">show_chart</span>CermatUsaha</span>
      <button type="button" class="tut-skip" data-skip>Lewati</button>
    </div>
    <div class="tut-track">
      ${SLIDES.map((s) => `
        <section class="tut-slide">
          <span class="tut-art tone-${s.tone}"><span class="icon">${s.icon}</span></span>
          <h2>${s.title}</h2>
          <p>${s.text}</p>
        </section>`).join('')}
      <section class="tut-slide">
        <span class="tut-art tone-brand"><span class="icon">storefront</span></span>
        <h2>Apa nama usaha Anda?</h2>
        <p>Dipakai di beranda dan di kop laporan. Bisa diubah nanti di Menu.</p>
        <input class="input tut-input" data-nama placeholder="Contoh: Warung Bu Sri" value="${esc(getProfil().namaUsaha === 'Usaha Saya' ? '' : getProfil().namaUsaha)}" aria-label="Nama usaha">
      </section>
    </div>
    <div class="tut-bottom">
      <div class="tut-dots">${[...SLIDES, 0].map(() => '<span></span>').join('')}</div>
      <button type="button" class="btn btn-primary" data-next>Lanjut</button>
      <button type="button" class="btn-link tut-demo" data-demo hidden>Coba dulu pakai data contoh</button>
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => root.classList.add('open'));

  const track = root.querySelector('.tut-track');
  const dots = [...root.querySelectorAll('.tut-dots span')];
  const next = root.querySelector('[data-next]');
  const demo = root.querySelector('[data-demo]');
  const nama = root.querySelector('[data-nama]');

  const go = (n) => {
    i = Math.max(0, Math.min(last, n));
    track.style.transform = `translateX(${-i * 100}%)`;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    next.textContent = i === last ? 'Mulai Pakai' : 'Lanjut';
    demo.hidden = i !== last;
    root.querySelector('[data-skip]').hidden = i === last;
    if (i === last) setTimeout(() => nama.focus({ preventScroll: true }), 350);
  };

  const finish = (withDemo = false) => {
    const n = nama.value.trim();
    if (withDemo) seedDemo();
    if (n) setProfil({ namaUsaha: n });
    if (!getProfil().pemilik && currentUser()) setProfil({ pemilik: currentUser().nama });
    markSeen();
    root.classList.remove('open');
    setTimeout(() => {
      root.remove();
      document.body.classList.remove('no-scroll');
    }, 300);
  };

  next.addEventListener('click', () => (i === last ? finish() : go(i + 1)));
  demo.addEventListener('click', () => finish(true));
  root.querySelector('[data-skip]').addEventListener('click', () => go(last));
  nama.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });

  // Geser kiri / kanan
  let x0 = null;
  track.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  go(0);
}
