import '../styles/form.css';
import '../styles/item.css';
import '../styles/list.css';
import '../styles/report.css';
import { getById, getProfil } from '../data/store.js';
import { REPORTS, buildReport, formatValue } from '../data/reports.js';
import { toDateKey } from '../utils/format.js';
import { esc } from '../components/fields.js';
import { toast } from '../components/toast.js';

const PERIODS = [
  { value: 'bulan', label: 'Bulan ini' },
  { value: 'lalu', label: 'Bulan lalu' },
  { value: '3bulan', label: '3 bulan' },
  { value: 'tahun', label: 'Tahun ini' },
  { value: 'custom', label: 'Pilih tanggal' },
];

function periodRange(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const ranges = {
    bulan: [new Date(y, m, 1), now],
    lalu: [new Date(y, m - 1, 1), new Date(y, m, 0)],
    '3bulan': [new Date(y, m - 2, 1), now],
    tahun: [new Date(y, 0, 1), now],
  };
  return ranges[key].map((d) => toDateKey(d));
}

export const laporan = {
  render({ id } = {}) {
    const pihak = id && getById('pihak', id);
    if (id && !pihak) {
      return `
        <div class="card empty">
          <span class="icon empty-icon">description</span>
          <p class="empty-title">Kontak tidak ditemukan</p>
          <a href="#/pihak" class="btn-link">Kembali</a>
        </div>`;
    }

    return `
      <header class="page-header">
        <button class="icon-btn sm pressable" data-back="${pihak ? `/pihak/${id}` : '/lainnya'}" aria-label="Kembali">
          <span class="icon">arrow_back</span>
        </button>
        <span class="titles">
          <h1>${pihak ? 'Laporan Kontak' : 'Laporan Keuangan'}</h1>
          <small>${pihak ? esc(pihak.nama) : 'Tersusun otomatis dari catatan Anda'}</small>
        </span>
      </header>

      <div class="list-page stagger report-page">
        ${pihak ? '' : `
          <div class="report-types" style="--i:0">
            ${Object.entries(REPORTS).map(([key, r]) => `
              <button class="report-type pressable ${key === 'bukukas' ? 'active' : ''}" data-type="${key}">
                <span class="row-icon tone-brand"><span class="icon">${r.icon}</span></span>
                <strong>${r.label}</strong>
                <small>${r.desc}</small>
              </button>`).join('')}
          </div>`}

        <div class="hscroll" style="--i:1">
          ${PERIODS.map((p) => `
            <button class="opt ${p.value === 'bulan' ? 'active' : ''}" data-period="${p.value}">${p.label}</button>
          `).join('')}
        </div>

        <div class="row2 custom-range" hidden>
          <div class="field"><label>Dari</label><input class="input" type="date" data-from></div>
          <div class="field"><label>Sampai</label><input class="input" type="date" data-to></div>
        </div>

        <div class="card report-preview" style="--i:2"></div>
      </div>

      <div class="sticky-actions single">
        <button class="btn btn-primary pressable" data-download>
          <span class="icon">download</span>Unduh PDF
        </button>
      </div>
    `;
  },

  mount(view, { id } = {}) {
    if (id && !getById('pihak', id)) return;

    let type = id ? 'pihak' : 'bukukas';
    let [from, to] = periodRange('bulan');
    let current = null;

    const preview = view.querySelector('.report-preview');
    const custom = view.querySelector('.custom-range');
    const fromEl = view.querySelector('[data-from]');
    const toEl = view.querySelector('[data-to]');
    fromEl.value = from;
    toEl.value = to;

    const renderPreview = () => {
      current = buildReport(type, { from, to, id });
      const r = current;
      const wide = r.columns.length > 3;

      preview.innerHTML = `
        <div class="rp-head">
          <div><strong>${esc(r.title)}</strong><small>${esc(r.period)}</small></div>
          <span class="tag muted">${r.rows.length} baris</span>
        </div>

        <div class="rp-summary">
          ${r.summary.map((s) => `
            <div class="rp-stat ${s.tone || ''}">
              <small>${esc(s.label)}</small>
              <strong>${formatValue(s.value, s.type || 'money')}</strong>
            </div>`).join('')}
        </div>

        <div class="rp-table-wrap">
          <table class="rp-table ${wide ? 'wide' : ''}">
            <thead>
              <tr>${r.columns.map((c) => `<th class="${c.align === 'right' ? 'r' : ''}">${c.header}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${r.rows.length
                ? r.rows.map((row) => `
                    <tr class="${row._style || ''}">
                      ${r.columns.map((c) => `<td class="${c.align === 'right' ? 'r' : ''}">${esc(formatValue(row[c.key], c.type))}</td>`).join('')}
                    </tr>`).join('')
                : `<tr><td colspan="${r.columns.length}" class="rp-empty">Tidak ada data pada periode ini</td></tr>`}
            </tbody>
          </table>
        </div>

        ${r.note ? `<p class="rp-note">${esc(r.note)}</p>` : ''}
      `;

      preview.classList.remove('fade');
      void preview.offsetWidth;
      preview.classList.add('fade');
    };

    view.addEventListener('click', async (e) => {
      const typeBtn = e.target.closest('[data-type]');
      if (typeBtn) {
        type = typeBtn.dataset.type;
        view.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('active', b === typeBtn));
        return renderPreview();
      }

      const periodBtn = e.target.closest('[data-period]');
      if (periodBtn) {
        const key = periodBtn.dataset.period;
        view.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b === periodBtn));
        custom.hidden = key !== 'custom';
        if (key !== 'custom') {
          [from, to] = periodRange(key);
          fromEl.value = from;
          toEl.value = to;
        }
        return renderPreview();
      }

      const dl = e.target.closest('[data-download]');
      if (dl) {
        dl.disabled = true;
        toast('Menyiapkan PDF...', 'hourglass_top');
        try {
          const { exportPdf } = await import('../utils/pdf.js');
          exportPdf(current, getProfil());
          toast('PDF berhasil diunduh', 'check_circle');
        } catch (err) {
          console.error(err);
          toast('Gagal membuat PDF', 'error');
        } finally {
          dl.disabled = false;
        }
      }
    });

    [fromEl, toEl].forEach((el) => el.addEventListener('change', () => {
      if (!fromEl.value || !toEl.value) return;
      if (fromEl.value > toEl.value) return toast('Tanggal awal harus sebelum tanggal akhir', 'error');
      from = fromEl.value;
      to = toEl.value;
      renderPreview();
    }));

    renderPreview();
  },
};