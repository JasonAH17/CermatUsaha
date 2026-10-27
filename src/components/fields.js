import { toDateKey, tanggal } from '../utils/format.js';
import { terbilang } from '../utils/terbilang.js';

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MAX_MONEY = 999_999_999_999; // batas wajar supaya salah ketik tidak jadi angka raksasa

export const parseMoney = (v) => Math.min(Number(String(v).replace(/\D/g, '')) || 0, MAX_MONEY);
export const setMoney = (input, n) => {
  input.value = n ? n.toLocaleString('id-ID') : '';
  input.dispatchEvent(new Event('money', { bubbles: true }));
};
export const normalisasiTelepon = (v) => v.replace(/\D/g, '').replace(/^0/, '62');

// Nomor HP Indonesia: 08xx / 628xx / +628xx, 10-15 digit
export const validTelepon = (v) => !v.trim() || /^(\+?62|0)8\d{7,12}$/.test(v.replace(/[\s-]/g, ''));

// ===== HTML field =====
export const moneyField = (name = 'total', label = 'Jumlah', small = false) => `
  <div class="field">
    <label for="f-${name}">${label}</label>
    <div class="money ${small ? 'sm' : ''}">
      <span>Rp</span>
      <input class="input" id="f-${name}" name="${name}" inputmode="numeric" placeholder="0" autocomplete="off">
    </div>
    <small class="field-help" data-terbilang></small>
  </div>`;

export const numberField = (name, label, placeholder = '0') => `
  <div class="field">
    <label for="f-${name}">${label}</label>
    <input class="input" id="f-${name}" type="number" inputmode="numeric" min="0" name="${name}" placeholder="${placeholder}">
  </div>`;

export const textField = (name, label, { placeholder = '', type = 'text', textarea = false } = {}) => `
  <div class="field">
    <label for="f-${name}">${label}</label>
    ${textarea
      ? `<textarea class="input" id="f-${name}" name="${name}" placeholder="${placeholder}" rows="2"></textarea>`
      : `<input class="input" id="f-${name}" type="${type}" name="${name}" placeholder="${placeholder}" autocomplete="off">`}
  </div>`;

// Tanggal transaksi tidak boleh di masa depan; batas lain bisa diberikan lewat { min, max }
export const dateField = (name = 'tanggal', label = 'Tanggal', value = toDateKey(), limits = {}) => {
  const { min, max = name === 'tanggal' ? toDateKey() : undefined } = limits;
  return `
  <div class="field">
    <label for="f-${name}">${label}</label>
    <input class="input" id="f-${name}" type="date" name="${name}" value="${value}"
      ${min ? `min="${min}"` : ''} ${max ? `max="${max}"` : ''}>
  </div>`;
};

export const optionsField = (name, label, options, value) => `
  <div class="field">
    <span class="field-label">${label}</span>
    <div class="options" data-options="${name}" role="radiogroup" aria-label="${label}">
      ${options.map((o) => `
        <button type="button" class="opt ${o.value === value ? 'active' : ''}" data-value="${o.value}">${o.label}</button>
      `).join('')}
    </div>
    <input type="hidden" name="${name}" value="${value ?? ''}">
  </div>`;

// Kolom yang jarang diubah dilipat di sini supaya form tetap ringkas
export const moreFields = (inner, { title = 'Detail lainnya', sub = '' } = {}) => `
  <details class="more">
    <summary>
      <span class="icon">tune</span>
      <span class="grow"><strong>${title}</strong>${sub ? `<small>${sub}</small>` : '<small data-more-sum></small>'}</span>
      <span class="icon">expand_more</span>
    </summary>
    <div class="form">${inner}</div>
  </details>`;

export const submitButton = (label = 'Simpan') => `
  <div class="sheet-footer">
    <button type="submit" class="btn btn-primary">
      <span class="icon">check</span>${label}
    </button>
  </div>`;

// ===== Perilaku field =====
export function bindFields(form) {
  form.querySelectorAll('.money input').forEach((input) => {
    const help = input.closest('.field').querySelector('[data-terbilang]');
    const show = () => { if (help) help.textContent = terbilang(parseMoney(input.value)); };
    input.addEventListener('input', () => setMoney(input, parseMoney(input.value)));
    input.addEventListener('money', show);
    show();
  });

  // Tanggal di luar batas (misalnya masa depan) dikembalikan ke batasnya, dengan penjelasan
  form.querySelectorAll('input[type="date"]').forEach((input) => {
    input.addEventListener('change', () => {
      const { min, max, value } = input;
      if (max && value > max) {
        input.value = max;
        invalid(input, max === toDateKey() ? 'Tanggal tidak boleh di masa depan.' : `Paling lambat ${tanggal(max)}.`);
      } else if (min && value && value < min) {
        input.value = min;
        invalid(input, `Paling cepat ${tanggal(min)}.`);
      }
    });
  });

  form.querySelectorAll('[data-options]').forEach((group) => {
    const hidden = form.elements[group.dataset.options];
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.opt');
      if (!btn) return;
      group.querySelectorAll('.opt').forEach((o) => o.classList.toggle('active', o === btn));
      hidden.value = btn.dataset.value;
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  form.addEventListener('change', () => updateMoreSummary(form));
  form.addEventListener('input', () => updateMoreSummary(form));
  updateMoreSummary(form);
}

// Ringkasan isi "Detail lainnya", jadi nilai bawaannya terlihat tanpa membuka
function updateMoreSummary(form) {
  const el = form.querySelector('[data-more-sum]');
  if (!el) return;
  const f = form.elements;
  const parts = [];
  if (f.tanggal) parts.push(f.tanggal.value === toDateKey() ? 'Hari ini' : tanggal(f.tanggal.value));
  if (f.catatan?.value.trim()) parts.push('ada catatan');
  el.textContent = parts.filter(Boolean).join(' · ') || 'Tanggal, catatan';
}

// Tandai kolom yang salah dan tulis alasannya dengan kalimat yang jelas
export function invalid(el, message) {
  const field = el.closest('.field');
  const target = el.closest('.money') || el;
  field?.querySelector('.field-error')?.remove();
  if (message && field) {
    target.insertAdjacentHTML('afterend',
      `<small class="field-error" role="alert"><span class="icon">error</span>${esc(message)}</small>`);
  }

  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('invalid', 'shake');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });

  const clear = () => {
    el.classList.remove('invalid');
    field?.querySelector('.field-error')?.remove();
  };
  el.addEventListener('input', clear, { once: true });
  el.addEventListener('click', clear, { once: true });
}
