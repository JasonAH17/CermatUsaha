import '../styles/form.css';
import '../styles/auth.css';
import { signUp, logIn, quickLogIn, validEmail } from '../data/auth.js';
import { getAll, setProfil } from '../data/store.js';
import { seedDemo } from '../data/seed.js';
import { navigate } from '../router.js';
import { openSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { maybeShowTutorial } from '../components/tutorial.js';
import { esc, invalid, textField } from '../components/fields.js';

const MIN_SANDI = 8;

// Akun Google yang ditampilkan di simulasi pemilih akun (prototype, belum terhubung ke Google)
const AKUN_GOOGLE = [
  { nama: 'Sri Wahyuni', email: 'sri.wahyuni.usaha@gmail.com' },
  { nama: 'Budi Santoso', email: 'budi.santoso.kopi@gmail.com' },
];

const GOOGLE_ICON = `
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
  </svg>`;

// Setelah berhasil masuk: ke Beranda; akun baru diajak lewat panduan singkat
function masukSelesai(sapaan) {
  navigate('/beranda');
  toast(sapaan, 'waving_hand');
  setTimeout(maybeShowTutorial, 50);
}

function layout(mode) {
  const daftar = mode === 'daftar';
  return `
    <div class="auth">
      <div class="auth-brand">
        <span class="auth-logo"><span class="icon">show_chart</span></span>
        <strong>CermatUsaha</strong>
      </div>

      <div class="auth-head">
        <h1>${daftar ? 'Buat akun gratis' : 'Selamat datang kembali'}</h1>
        <p>${daftar ? 'Mulai catat keuangan usaha Anda dalam 1 menit.' : 'Masuk untuk melanjutkan catatan usaha Anda.'}</p>
      </div>

      <div class="auth-quick">
        <button type="button" class="btn btn-social" data-google>${GOOGLE_ICON}Lanjutkan dengan Google</button>
        <button type="button" class="btn btn-plain" data-demo><span class="icon">storefront</span>Coba dulu tanpa daftar</button>
      </div>

      <div class="auth-or"><span>atau pakai email</span></div>

      <form class="form" novalidate>
        ${daftar ? textField('nama', 'Nama Anda', { placeholder: 'Contoh: Sri Wahyuni' }) : ''}
        <div class="field">
          <label for="f-email">Email</label>
          <input class="input" id="f-email" name="email" type="email" inputmode="email"
            autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="nama@email.com">
        </div>
        <div class="field">
          <label for="f-password">Kata sandi</label>
          <div class="pass">
            <input class="input" id="f-password" name="password" type="password"
              autocomplete="${daftar ? 'new-password' : 'current-password'}" placeholder="${daftar ? `Minimal ${MIN_SANDI} karakter` : 'Kata sandi Anda'}">
            <button type="button" class="pass-toggle" data-toggle aria-label="Tampilkan kata sandi"><span class="icon">visibility</span></button>
          </div>
          <small class="field-warn" data-caps hidden><span class="icon">keyboard_capslock</span>Caps Lock sedang menyala</small>
          ${daftar ? `<small class="pass-rule" data-rule><span class="icon">radio_button_unchecked</span>Minimal ${MIN_SANDI} karakter</small>` : ''}
        </div>
        ${daftar ? '' : '<button type="button" class="btn-link auth-forgot" data-forgot>Lupa kata sandi?</button>'}
        <button type="submit" class="btn btn-primary" data-submit>${daftar ? 'Daftar' : 'Masuk'}</button>
      </form>

      <p class="auth-switch">
        ${daftar ? 'Sudah punya akun? <a href="#/masuk">Masuk</a>' : 'Belum punya akun? <a href="#/daftar">Daftar gratis</a>'}
      </p>
      <p class="auth-note"><span class="icon sm">lock</span>Versi prototype: akun & data tersimpan di perangkat ini.</p>
    </div>`;
}

function mount(view, mode) {
  const daftar = mode === 'daftar';
  const form = view.querySelector('form');
  const f = form.elements;
  const submit = view.querySelector('[data-submit]');

  // Lihat / sembunyikan kata sandi
  view.querySelector('[data-toggle]').addEventListener('click', (e) => {
    const show = f.password.type === 'password';
    f.password.type = show ? 'text' : 'password';
    e.currentTarget.querySelector('.icon').textContent = show ? 'visibility_off' : 'visibility';
    e.currentTarget.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
  });

  // Peringatan Caps Lock (penyebab umum "kata sandi salah")
  const caps = view.querySelector('[data-caps]');
  f.password.addEventListener('keyup', (e) => { caps.hidden = !e.getModifierState?.('CapsLock'); });
  f.password.addEventListener('blur', () => { caps.hidden = true; });

  // Syarat kata sandi terlihat sejak awal, tercentang saat terpenuhi
  const rule = view.querySelector('[data-rule]');
  f.password.addEventListener('input', () => {
    if (!rule) return;
    const ok = f.password.value.length >= MIN_SANDI;
    rule.classList.toggle('ok', ok);
    rule.querySelector('.icon').textContent = ok ? 'check_circle' : 'radio_button_unchecked';
  });

  view.querySelector('[data-forgot]')?.addEventListener('click', () =>
    toast('Reset kata sandi belum tersedia di versi prototype', 'info'));

  view.querySelector('[data-google]').addEventListener('click', openGooglePicker);

  view.querySelector('[data-demo]').addEventListener('click', () => {
    quickLogIn({ provider: 'demo', nama: 'Pengguna Demo', email: 'demo@cermatusaha.id' });
    if (!getAll('transaksi').length) {
      seedDemo();
      setProfil({ namaUsaha: 'Warung Bu Sri', pemilik: 'Pengguna Demo' });
    }
    masukSelesai('Mode demo: data contoh sudah disiapkan');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;

    const nama = f.nama?.value.trim();
    const email = f.email.value.trim();
    const password = f.password.value;

    if (daftar && !nama) return invalid(f.nama, 'Isi nama Anda.');
    if (!email) return invalid(f.email, 'Isi alamat email Anda.');
    if (!validEmail(email)) return invalid(f.email, 'Format email belum benar. Contoh: nama@gmail.com');
    if (!password) return invalid(f.password, 'Isi kata sandi Anda.');
    if (daftar && password.length < MIN_SANDI) return invalid(f.password, `Kata sandi minimal ${MIN_SANDI} karakter.`);

    submit.disabled = true;
    submit.textContent = daftar ? 'Membuat akun...' : 'Memeriksa...';
    try {
      if (daftar) {
        await signUp({ nama, email, password });
        masukSelesai(`Akun dibuat. Selamat datang, ${nama}!`);
      } else {
        const user = await logIn({ email, password });
        masukSelesai(`Halo lagi, ${user.nama}!`);
      }
    } catch (err) {
      submit.disabled = false;
      submit.textContent = daftar ? 'Daftar' : 'Masuk';
      invalid(f[err.field] || f.email, err.message);
    }
  });
}

// Simulasi pemilih akun Google untuk prototype
function openGooglePicker() {
  openSheet({
    title: 'Pilih akun Google',
    body: `
      <div class="form">
        <div class="note-box"><span class="icon">info</span>
          <span>Simulasi untuk prototype. Belum benar-benar terhubung ke Google.</span>
        </div>
        <div class="row-card">
          ${AKUN_GOOGLE.map((a, i) => `
            <button type="button" class="row-item" data-pick="${i}">
              <span class="avatar">${esc(a.nama[0])}</span>
              <span class="grow"><strong>${esc(a.nama)}</strong><small>${esc(a.email)}</small></span>
              <span class="icon chev">chevron_right</span>
            </button>`).join('')}
        </div>
        <details class="more">
          <summary>
            <span class="icon">person_add</span>
            <span class="grow"><strong>Gunakan akun lain</strong><small>Isi nama dan email Gmail</small></span>
            <span class="icon">expand_more</span>
          </summary>
          <form class="form" novalidate>
            ${textField('nama', 'Nama', { placeholder: 'Nama Anda' })}
            <div class="field">
              <label for="f-gmail">Email</label>
              <input class="input" id="f-gmail" name="email" type="email" inputmode="email" autocapitalize="off" placeholder="nama@gmail.com">
            </div>
            <button type="submit" class="btn btn-primary">Lanjutkan</button>
          </form>
        </details>
      </div>`,
    onMount(body, close) {
      const lanjut = (akun) => {
        const { baru } = quickLogIn({ provider: 'google', ...akun });
        close();
        masukSelesai(baru ? `Akun dibuat. Selamat datang, ${akun.nama}!` : `Halo lagi, ${akun.nama}!`);
      };

      body.querySelector('.row-card').addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]');
        if (b) lanjut(AKUN_GOOGLE[+b.dataset.pick]);
      });

      const form = body.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = form.elements;
        if (!f.nama.value.trim()) return invalid(f.nama, 'Isi nama Anda.');
        if (!validEmail(f.email.value)) return invalid(f.email, 'Format email belum benar. Contoh: nama@gmail.com');
        lanjut({ nama: f.nama.value.trim(), email: f.email.value.trim() });
      });
    },
  });
}

export const masuk = { render: () => layout('masuk'), mount: (view) => mount(view, 'masuk') };
export const daftar = { render: () => layout('daftar'), mount: (view) => mount(view, 'daftar') };
