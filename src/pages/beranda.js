import '../styles/beranda.css';
import { FITUR } from '../config.js';
import { getAll, getProfil, subscribe, catatAktivitasAI } from '../data/store.js';
import { currentUser } from '../data/auth.js';
import { ringkasanStok, insightStok } from '../data/insights.js';
import { buildInventoryContext } from '../data/aiContext.js';
import { buildReport } from '../data/reports.js';
import { seedDemo } from '../data/seed.js';
import { getInsight } from '../utils/ai.js';
import { rupiah, rupiahSingkat, namaBulan, toDateKey } from '../utils/format.js';
import { countUp } from '../utils/anim.js';
import { navigate } from '../router.js';
import { esc } from '../components/fields.js';
import { toast } from '../components/toast.js';
import { openForm } from '../components/forms.js';
import { openTutorial } from '../components/tutorial.js';
import { askLater } from './chat.js';

function sapaan() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

// Untung bulan ini dan perbandingannya dengan periode yang sama bulan lalu
function ringkasanUntung() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const bersih = (r) => r.rows.find((row) => row._style === 'total')?.jumlah ?? 0;

  const ini = buildReport('labarugi', { from: toDateKey(new Date(y, m, 1)), to: toDateKey(now) });
  const lalu = buildReport('labarugi', {
    from: toDateKey(new Date(y, m - 1, 1)),
    to: toDateKey(new Date(y, m - 1, Math.min(d, new Date(y, m, 0).getDate()))),
  });
  const pendapatan = ini.summary[0].value;
  const untung = bersih(ini);
  const prev = bersih(lalu);
  return { untung, pendapatan, biaya: pendapatan - untung, trend: prev > 0 ? Math.round(((untung - prev) / prev) * 100) : null };
}

// ===== Insight AI: 1x per hari per akun (hemat kuota), atau saat ditekan "Perbarui" =====
const kunciInsight = () => `cermatusaha:insight:v1:${currentUser()?.id}`;
const bacaCache = () => {
  try { return JSON.parse(localStorage.getItem(kunciInsight())); } catch { return null; }
};
const simpanCache = (v) => {
  try { localStorage.setItem(kunciInsight(), JSON.stringify(v)); } catch { /* abaikan */ }
};

const rupiahPendek = (n) => `Rp ${rupiahSingkat(n).replace('.', ',')}`;

const kartuUang = () => `
  <section class="money-card">
    <div class="money-top">
      <span data-money-label>Untung bulan ${namaBulan()}</span>
      <span class="money-trend" data-trend hidden></span>
    </div>
    <strong class="num" data-count="untung">Rp 0</strong>
    <small><span data-count="pendapatan">Rp 0</span> penjualan · <span data-count="biaya">Rp 0</span> modal &amp; biaya</small>
  </section>`;

export const beranda = {
  render() {
    const nama = getProfil().namaUsaha || 'Usaha Saya';
    return `
      <header class="home-header">
        <a href="#/pengaturan" class="biz pressable">
          <span class="biz-avatar">${esc(nama[0].toUpperCase())}</span>
          <span class="biz-text"><small>${sapaan()}</small><strong>${esc(nama)}</strong></span>
        </a>
        <button class="icon-btn pressable" data-help aria-label="Lihat panduan"><span class="icon">help</span></button>
      </header>

      <div class="home stagger">
        ${FITUR.ringkasanUang ? `<div style="--i:0">${kartuUang()}</div>` : ''}

        <section class="card insight-card" style="--i:1">
          <div class="insight-head">
            <span class="ai-avatar sm"><span class="icon fill">auto_awesome</span></span>
            <strong>Saran Cermat AI</strong>
            <button class="icon-btn sm" data-refresh aria-label="Perbarui saran"><span class="icon">refresh</span></button>
          </div>
          <div class="insight-body" aria-live="polite"></div>
          <div class="insight-foot">
            <small data-insight-meta></small>
            <button class="btn-link" data-ask-stok><span class="icon">forum</span>Tanya di Chat</button>
          </div>
        </section>

        <div class="section-title" style="--i:2"><h2>Stok barang</h2><a href="#/riwayat/stok">Lihat semua</a></div>
        <div class="stok-grid" style="--i:3">
          <a href="#/riwayat/stok" class="stok-tile"><small>Jumlah barang</small><strong class="num" data-stok="jumlah">0</strong></a>
          <a href="#/riwayat/stok" class="stok-tile"><small>Nilai stok</small><strong class="num" data-stok="nilai">Rp 0</strong></a>
          <a href="#/riwayat/stok" class="stok-tile warn"><small>Perlu dibeli</small><strong class="num" data-stok="perlu">0</strong></a>
          <a href="#/riwayat/stok" class="stok-tile out"><small>Habis</small><strong class="num" data-stok="habis">0</strong></a>
          <a href="#/riwayat/stok" class="stok-tile wide"><span class="icon">star</span><small>Paling laku bulan ini</small><strong data-stok="terlaris">–</strong></a>
        </div>

        <section class="card start-card" style="--i:4">
          <h2>Mulai dari sini</h2>
          <p>Tiga langkah untuk mengenal CermatUsaha:</p>
          <div class="start-steps">
            <button class="row-item" data-form="scan">
              <span class="step-no">1</span>
              <span class="grow"><strong>Upload nota belanja</strong><small>Stok barang terisi otomatis</small></span>
              <span class="icon chev">chevron_right</span>
            </button>
            <button class="row-item" data-form="catat">
              <span class="step-no">2</span>
              <span class="grow"><strong>Catat jualan hari ini</strong><small>Lewat tombol + Tambah</small></span>
              <span class="icon chev">chevron_right</span>
            </button>
            <a class="row-item" href="#/chat/baru">
              <span class="step-no">3</span>
              <span class="grow"><strong>Ngobrol dengan Cermat AI</strong><small>Tanya apa saja soal usaha</small></span>
              <span class="icon chev">chevron_right</span>
            </a>
          </div>
          <button class="btn btn-soft" data-demo><span class="icon">science</span>Isi dengan data contoh</button>
        </section>
      </div>
    `;
  },

  mount(view) {
    const home = view.querySelector('.home');
    const body = view.querySelector('.insight-body');
    const meta = view.querySelector('[data-insight-meta]');
    const refreshBtn = view.querySelector('[data-refresh]');
    let memuat = false;

    const fillUang = (animate) => {
      if (!FITUR.ringkasanUang) return;
      const u = ringkasanUntung();
      const values = { untung: u.untung, pendapatan: u.pendapatan, biaya: u.biaya };
      view.querySelectorAll('[data-count]').forEach((el) => {
        const v = values[el.dataset.count];
        const fmt = el.dataset.count === 'untung' ? (n) => (n < 0 ? '−' : '') + rupiah(Math.abs(n)) : rupiahPendek;
        animate ? countUp(el, v, fmt, 700) : (el.textContent = fmt(v));
      });
      view.querySelector('.money-card').classList.toggle('rugi', u.untung < 0);
      view.querySelector('[data-money-label]').textContent = `${u.untung < 0 ? 'Rugi' : 'Untung'} bulan ${namaBulan()}`;
      const trend = view.querySelector('[data-trend]');
      trend.hidden = u.trend === null;
      if (u.trend !== null) {
        trend.innerHTML = `<span class="icon sm">${u.trend >= 0 ? 'trending_up' : 'trending_down'}</span>${Math.abs(u.trend)}%`;
      }
    };

    const fillStok = () => {
      const r = ringkasanStok();
      view.querySelector('[data-stok="jumlah"]').textContent = r.jumlah;
      view.querySelector('[data-stok="nilai"]').textContent = rupiahPendek(r.nilai);
      view.querySelector('[data-stok="perlu"]').textContent = r.perluBeli.length;
      view.querySelector('[data-stok="habis"]').textContent = r.habis.length;
      view.querySelector('[data-stok="terlaris"]').textContent = r.terlaris || 'Belum ada';
      home.classList.toggle('is-empty', !getAll('transaksi').length && !r.jumlah);
    };

    const tampilSaran = (saran, info) => {
      body.innerHTML = saran.length
        ? `<ul>${saran.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
        : `<p class="insight-empty">Belum ada barang. Upload nota belanja lewat <b>+ Tambah</b>, barangnya masuk ke stok otomatis.</p>
           <button class="btn btn-soft" data-form="scan"><span class="icon">document_scanner</span>Upload nota</button>`;
      meta.textContent = info;
    };

    const muatInsight = async (paksa = false) => {
      if (memuat) return;
      if (!getAll('item').length) return tampilSaran([], '');

      const cache = bacaCache();
      if (!paksa && cache?.tanggal === toDateKey() && cache.saran?.length) {
        return tampilSaran(cache.saran, `${cache.sumber === 'ai' ? 'Dari Cermat AI' : 'Saran otomatis'} · ${cache.jam}`);
      }

      memuat = true;
      refreshBtn.classList.add('spin');
      body.innerHTML = '<div class="skeleton"></div><div class="skeleton short"></div>';
      meta.textContent = 'Cermat AI sedang membaca data stok...';
      const jam = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      try {
        const saran = await getInsight(buildInventoryContext());
        if (!view.isConnected) return;
        simpanCache({ tanggal: toDateKey(), saran, sumber: 'ai', jam });
        catatAktivitasAI({ jenis: 'insight', ringkasan: `Memperbarui saran stok: ${saran[0]}` });
        tampilSaran(saran, `Dari Cermat AI · ${jam}`);
      } catch (err) {
        if (!view.isConnected) return;
        const saran = insightStok();
        const sebab = err.code === 'NO_KEY' ? 'Cermat AI belum aktif' : 'Cermat AI sedang sibuk';
        tampilSaran(saran, `Saran otomatis (${sebab}) · ${jam}`);
        if (paksa) toast(err.message, 'info');
      } finally {
        memuat = false;
        refreshBtn.classList.remove('spin');
      }
    };

    view.addEventListener('click', (e) => {
      const el = e.target.closest('[data-form],[data-help],[data-demo],[data-refresh],[data-ask-stok]');
      if (!el) return;
      if (el.dataset.form) openForm(el.dataset.form);
      if (el.hasAttribute('data-help')) openTutorial();
      if (el.hasAttribute('data-refresh')) muatInsight(true);
      if (el.hasAttribute('data-ask-stok')) {
        askLater('Dari data stok saya, barang apa yang perlu dibeli dan mana yang paling menguntungkan?');
        navigate('/chat');
      }
      if (el.hasAttribute('data-demo')) {
        seedDemo();
        toast('Data contoh dimuat', 'check_circle');
      }
    });

    fillUang(true);
    fillStok();
    muatInsight();

    let jumlahBarang = getAll('item').length;
    return subscribe(() => {
      view.querySelector('.biz-text strong').textContent = getProfil().namaUsaha;
      view.querySelector('.biz-avatar').textContent = (getProfil().namaUsaha || 'U')[0].toUpperCase();
      fillUang(false);
      fillStok();
      // Barang pertama baru masuk (misalnya dari nota): tampilkan saran tanpa menunggu besok
      if (!jumlahBarang && getAll('item').length) muatInsight();
      jumlahBarang = getAll('item').length;
    });
  },
};
