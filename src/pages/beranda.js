import Chart from 'chart.js/auto';
import '../styles/beranda.css';
import '../styles/list.css';
import { getAll, getProfil, subscribe } from '../data/store.js';
import * as sel from '../data/selectors.js';
import { getInsights } from '../data/insights.js';
import { buildReport } from '../data/reports.js';
import { seedDemo } from '../data/seed.js';
import { rupiah, rupiahSingkat, namaBulan, toDateKey } from '../utils/format.js';
import { countUp } from '../utils/anim.js';
import { navigate } from '../router.js';
import { esc } from '../components/fields.js';
import { toast } from '../components/toast.js';
import { openForm } from '../components/forms.js';
import { trxRow, openTrxDetail } from '../components/trx.js';
import { openTutorial } from '../components/tutorial.js';
import { openAkunSheet } from './lainnya.js';
import { askLater } from './ai.js';

Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";

const C_IN = '#15803d';
const C_OUT = '#c9372c';
const TONE = { good: 'in', bad: 'out', warn: 'warn', info: 'info' };
const AI_CHIPS = ['Usaha saya untung atau rugi?', 'Siapa yang perlu ditagih?'];

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
  return {
    untung,
    pendapatan,
    biaya: pendapatan - untung,
    trend: prev > 0 ? Math.round(((untung - prev) / prev) * 100) : null,
  };
}

// Berapa hari kas cukup tanpa pemasukan, dari rata-rata uang keluar 30 hari
function ketahananKas(saldo) {
  const from = toDateKey(new Date(Date.now() - 29 * 864e5));
  const keluar = getAll('transaksi')
    .filter((t) => t.tanggal >= from && sel.arusKas(t) < 0)
    .reduce((s, t) => s - sel.arusKas(t), 0);
  return keluar ? Math.floor(saldo / (keluar / 30)) : null;
}

function insightRow(ins) {
  const attr = ins.ask ? `data-ask="${esc(ins.ask)}"` : `data-href="${ins.href}"`;
  return `
    <button class="row-item attention" ${attr}>
      <span class="row-icon tone-${TONE[ins.tone]}"><span class="icon">${ins.icon}</span></span>
      <span class="grow">
        <strong>${esc(ins.title)}</strong>
        <small>${esc(ins.text)}</small>
        <span class="attention-cta">${ins.ask ? '<span class="icon">auto_awesome</span>Tanya AI' : esc(ins.cta || 'Lihat')}</span>
      </span>
      <span class="icon chev">chevron_right</span>
    </button>`;
}

function chartConfig(data) {
  const tick = { color: '#8a928f', font: { size: 11, weight: 600 } };
  const bar = { borderRadius: 5, borderSkipped: false, barPercentage: 0.75, categoryPercentage: 0.6 };
  return {
    type: 'bar',
    data: {
      labels: data.map((d) => d.label),
      datasets: [
        { label: 'Masuk', data: data.map((d) => d.masuk), backgroundColor: C_IN, ...bar },
        { label: 'Keluar', data: data.map((d) => d.keluar + d.pembelian), backgroundColor: C_OUT, ...bar },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 500, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#18211f',
          padding: 10,
          cornerRadius: 10,
          usePointStyle: true,
          boxPadding: 4,
          callbacks: { label: (c) => ` ${c.dataset.label}: ${rupiah(c.parsed.y)}` },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { ...tick, maxRotation: 0, autoSkipPadding: 6 } },
        y: {
          beginAtZero: true,
          grid: { color: '#eeeeea' },
          border: { display: false },
          ticks: { ...tick, maxTicksLimit: 4, callback: (v) => rupiahSingkat(v) },
        },
      },
    },
  };
}

export const beranda = {
  render() {
    const nama = getProfil().namaUsaha || 'Usaha Saya';

    return `
      <header class="home-header">
        <a href="#/lainnya" class="biz pressable">
          <span class="biz-avatar">${esc(nama[0].toUpperCase())}</span>
          <span class="biz-text"><small>${sapaan()}</small><strong>${esc(nama)}</strong></span>
        </a>
        <button class="icon-btn pressable" data-help aria-label="Lihat panduan">
          <span class="icon">help</span>
        </button>
      </header>

      <div class="home stagger">
        <section class="hero" style="--i:0">
          <div class="hero-top">
            <span data-hero-label>Untung bulan ${namaBulan()}</span>
            <span class="hero-trend" data-trend hidden></span>
          </div>
          <strong class="hero-value num" data-count="untung">Rp 0</strong>
          <div class="hero-split">
            <div><small>Penjualan</small><b class="num" data-count="pendapatan">Rp 0</b></div>
            <div><small>Modal &amp; biaya</small><b class="num" data-count="biaya">Rp 0</b></div>
          </div>
        </section>

        <div class="quick" style="--i:1">
          <button class="quick-btn in" data-form="masuk">
            <span class="icon">south_west</span><span>Uang Masuk</span>
          </button>
          <button class="quick-btn out" data-form="keluar">
            <span class="icon">north_east</span><span>Uang Keluar</span>
          </button>
        </div>

        <div class="features" style="--i:2">
          <button class="feature pressable" data-form="scan">
            <span class="row-icon tone-brand"><span class="icon">document_scanner</span></span>
            <span><strong>Scan Struk</strong><small>Foto nota, terbaca otomatis</small></span>
          </button>
          <a class="feature pressable" href="#/laporan">
            <span class="row-icon tone-brand"><span class="icon">description</span></span>
            <span><strong>Laporan</strong><small>Rapi, siap unduh PDF</small></span>
          </a>
        </div>

        <section class="ai-card" style="--i:3">
          <div class="ai-head">
            <span class="ai-avatar"><span class="icon fill">auto_awesome</span></span>
            <span><strong>Tanya Cermat AI</strong><small>Konsultan keuangan untuk usaha Anda</small></span>
          </div>
          <a href="#/ai" class="ai-input">
            <span>Tulis pertanyaan soal usaha Anda...</span>
            <span class="icon">arrow_upward</span>
          </a>
          <div class="ai-chips">
            ${AI_CHIPS.map((q) => `<button class="ai-chip" data-ask="${esc(q)}">${esc(q)}</button>`).join('')}
          </div>
        </section>

        <section class="card start-card" style="--i:4">
          <h2>Mulai dari sini</h2>
          <p>Tiga langkah untuk mengenal CermatUsaha:</p>
          <div class="start-steps">
            <button class="row-item" data-form="catat">
              <span class="step-no">1</span>
              <span class="grow"><strong>Catat transaksi pertama</strong><small>Jualan hari ini atau belanja stok</small></span>
              <span class="icon chev">chevron_right</span>
            </button>
            <button class="row-item" data-form="scan">
              <span class="step-no">2</span>
              <span class="grow"><strong>Coba scan struk</strong><small>Pakai contoh struk kalau belum punya</small></span>
              <span class="icon chev">chevron_right</span>
            </button>
            <a class="row-item" href="#/ai">
              <span class="step-no">3</span>
              <span class="grow"><strong>Ngobrol dengan Cermat AI</strong><small>Tanya apa saja soal usaha</small></span>
              <span class="icon chev">chevron_right</span>
            </a>
          </div>
          <button class="btn btn-soft" data-demo><span class="icon">science</span>Isi dengan data contoh</button>
        </section>

        <div class="needs-data section-title" style="--i:4"><h2>Perlu perhatian</h2></div>
        <div class="needs-data row-card attention-list" style="--i:5"></div>

        <a href="#/pihak" class="needs-data card debt-card pressable" style="--i:6">
          <div class="debt-head"><h2>Utang piutang</h2><span class="icon chev">chevron_right</span></div>
          <div class="debt-split">
            <div><small>Orang berutang ke Anda</small><b class="num amount-in" data-debt="terima">Rp 0</b></div>
            <div><small>Anda berutang</small><b class="num amount-out" data-debt="bayar">Rp 0</b></div>
          </div>
        </a>

        <section class="needs-data card chart-card" style="--i:7">
          <div class="chart-head">
            <div>
              <small>Uang di kas &amp; bank</small>
              <strong class="num" data-saldo>Rp 0</strong>
              <span class="chart-sub" data-tahan></span>
            </div>
            <button class="btn-link" data-akun>Atur<span class="icon">chevron_right</span></button>
          </div>
          <div class="chart-bar">
            <div class="legend">
              <span><i style="background:${C_IN}"></i>Masuk</span>
              <span><i style="background:${C_OUT}"></i>Keluar</span>
            </div>
            <div class="seg" style="--n:2">
              <span class="seg-pill"></span>
              <button class="active" data-mode="harian">7 hari</button>
              <button data-mode="bulanan">6 bulan</button>
            </div>
          </div>
          <div class="chart-wrap"><canvas id="arus-chart" aria-label="Grafik uang masuk dan keluar"></canvas></div>
        </section>

        <div class="needs-data section-title" style="--i:8">
          <h2>Transaksi terakhir</h2><a href="#/transaksi">Lihat semua</a>
        </div>
        <div class="needs-data row-card recent-list" style="--i:9"></div>
      </div>
    `;
  },

  mount(view) {
    let mode = 'harian';
    let chart;
    const home = view.querySelector('.home');

    const fill = (animate) => {
      const u = ringkasanUntung();
      const values = { untung: u.untung, pendapatan: u.pendapatan, biaya: u.biaya };
      view.querySelectorAll('[data-count]').forEach((el) => {
        const v = values[el.dataset.count];
        const fmt = (n) => (n < 0 ? '−' : '') + rupiah(Math.abs(n));
        animate ? countUp(el, v, fmt, 700) : (el.textContent = fmt(v));
      });
      view.querySelector('.hero').classList.toggle('rugi', u.untung < 0);
      view.querySelector('[data-hero-label]').textContent = `${u.untung < 0 ? 'Rugi' : 'Untung'} bulan ${namaBulan()}`;

      const trend = view.querySelector('[data-trend]');
      trend.hidden = u.trend === null;
      if (u.trend !== null) {
        trend.innerHTML = `<span class="icon sm">${u.trend >= 0 ? 'trending_up' : 'trending_down'}</span>${Math.abs(u.trend)}% dari bulan lalu`;
      }

      const kosong = !getAll('transaksi').length;
      home.classList.toggle('is-empty', kosong);
      if (kosong) return;

      const pu = sel.ringkasanPiutangUtang();
      view.querySelector('[data-debt="terima"]').textContent = rupiah(pu.terima);
      view.querySelector('[data-debt="bayar"]').textContent = rupiah(pu.bayar);

      const saldo = sel.totalSaldo();
      const hari = ketahananKas(saldo);
      view.querySelector('[data-saldo]').textContent = rupiah(saldo);
      view.querySelector('[data-tahan]').innerHTML = hari === null ? ''
        : hari < 14
          ? `<span class="icon sm">warning</span>Hanya cukup ±${Math.max(hari, 0)} hari pengeluaran`
          : `<span class="icon sm">verified</span>Cukup untuk ${hari > 365 ? 'lebih dari setahun' : `±${hari} hari`} pengeluaran`;
      view.querySelector('[data-tahan]').classList.toggle('bad', hari !== null && hari < 14);

      const ins = getInsights().slice(0, 3);
      view.querySelector('.attention-list').innerHTML = ins.length
        ? ins.map(insightRow).join('')
        : '<p class="list-empty">Semua aman. Tidak ada yang perlu diperhatikan 👍</p>';

      const recent = [...getAll('transaksi')]
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 4);
      view.querySelector('.recent-list').innerHTML = recent.map((t) => trxRow(t)).join('');

      drawChart();
    };

    const drawChart = () => {
      const data = sel.seriArus(mode);
      if (!chart) {
        chart = new Chart(view.querySelector('#arus-chart'), chartConfig(data));
        return;
      }
      chart.data.labels = data.map((d) => d.label);
      chart.data.datasets[0].data = data.map((d) => d.masuk);
      chart.data.datasets[1].data = data.map((d) => d.keluar + d.pembelian);
      chart.update();
    };

    view.addEventListener('click', (e) => {
      const el = e.target.closest('[data-form],[data-mode],[data-ask],[data-href],[data-trx],[data-help],[data-demo],[data-akun]');
      if (!el) return;

      if (el.dataset.form) openForm(el.dataset.form);
      if (el.dataset.href) navigate(el.dataset.href.replace(/^#/, ''));
      if (el.dataset.trx) openTrxDetail(el.dataset.trx);
      if (el.hasAttribute('data-help')) openTutorial();
      if (el.hasAttribute('data-akun')) openAkunSheet();

      if (el.hasAttribute('data-demo')) {
        seedDemo();
        toast('Data contoh dimuat', 'check_circle');
      }

      if (el.dataset.ask) {
        askLater(el.dataset.ask);
        navigate('/ai');
      }

      if (el.dataset.mode) {
        mode = el.dataset.mode;
        view.querySelector('.seg-pill').style.transform = `translateX(${mode === 'harian' ? 0 : 100}%)`;
        view.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === el));
        drawChart();
      }
    });

    fill(true);

    const unsubscribe = subscribe(() => {
      view.querySelector('.biz-text strong').textContent = getProfil().namaUsaha;
      view.querySelector('.biz-avatar').textContent = (getProfil().namaUsaha || 'U')[0].toUpperCase();
      fill(false);
    });
    return () => { unsubscribe(); chart?.destroy(); };
  },
};
