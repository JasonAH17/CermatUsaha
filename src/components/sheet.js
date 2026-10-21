import '../styles/sheet.css';

// Sheet yang sedang terbuka, paling atas di akhir
const stack = [];
const closers = new Map(); // root -> fungsi tutup langsung
let z = 200;

// Tutup semua sheet, misalnya saat pindah halaman (tombol Back HP)
export function closeAllSheets() {
  [...stack].reverse().forEach((root) => closers.get(root)?.());
}

/*
  openSheet({ title, body, onMount, onClose, guard })
  guard (default true): kalau user sudah mengisi sesuatu lalu menutup sheet
  (ketuk luar, tombol X, Esc, geser ke bawah), tanyakan dulu supaya isian tidak hilang.
  Fungsi close yang diberikan ke onMount menutup langsung (dipakai setelah Simpan).
*/
export function openSheet({ title, body, onMount, onClose, guard = true }) {
  const root = document.createElement('div');
  root.className = 'sheet-root';
  root.style.zIndex = ++z;
  stack.push(root);
  root.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="sheet-handle"><span></span></div>
      <header class="sheet-header">
        <h3>${title}</h3>
        <button class="icon-btn sm pressable" data-close aria-label="Tutup">
          <span class="icon">close</span>
        </button>
      </header>
      <div class="sheet-body">${body}</div>
    </div>
  `;
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');

  const sheet = root.querySelector('.sheet');
  const bodyEl = root.querySelector('.sheet-body');
  requestAnimationFrame(() => root.classList.add('open'));

  // Tandai "ada isian" hanya dari ketikan / pilihan user, bukan dari kolom pencarian
  let dirty = false;
  const markDirty = (e) => {
    if (e.isTrusted && e.target.closest('form') && !e.target.matches('[data-search]')) dirty = true;
  };
  bodyEl.addEventListener('input', markDirty);
  bodyEl.addEventListener('change', markDirty);
  bodyEl.addEventListener('click', (e) => {
    if (e.isTrusted && e.target.closest('form .opt, form .stepper button, form [data-add-line], form [data-del-line]')) dirty = true;
  });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    stack.splice(stack.indexOf(root), 1);
    closers.delete(root);
    root.classList.remove('open');
    sheet.style.transform = '';
    document.removeEventListener('keydown', onKey);
    onClose?.();
    setTimeout(() => {
      root.remove();
      if (!stack.length) document.body.classList.remove('no-scroll');
    }, 320);
  }

  function requestClose() {
    if (closed) return;
    if (!guard || !dirty) return close();
    askDiscard(() => close(), () => { sheet.style.transform = ''; });
  }

  const onKey = (e) => {
    if (e.key === 'Escape' && stack.at(-1) === root) requestClose();
  };

  document.addEventListener('keydown', onKey);
  root.querySelector('.sheet-backdrop').addEventListener('click', requestClose);
  root.querySelector('[data-close]').addEventListener('click', requestClose);

  // Geser ke bawah untuk menutup
  let startY = null;
  let dy = 0;
  const onStart = (e) => {
    startY = e.touches[0].clientY;
    dy = 0;
    sheet.style.transition = 'none';
  };
  const onMove = (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    if (startY === null) return;
    startY = null;
    sheet.style.transition = '';
    if (dy > 100) requestClose();
    else sheet.style.transform = '';
  };
  [root.querySelector('.sheet-handle'), root.querySelector('.sheet-header')].forEach((el) => {
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
  });

  closers.set(root, close);
  onMount?.(bodyEl, close);
  return close;
}

// Pertanyaan "buang isian?" sebelum form yang sudah diisi ditutup
function askDiscard(onDiscard, onKeep) {
  let discarded = false;
  openSheet({
    title: 'Tutup tanpa menyimpan?',
    guard: false,
    body: `
      <div class="confirm">
        <span class="row-icon lg tone-warn"><span class="icon">edit_off</span></span>
        <p>Isian yang sudah Anda ketik akan hilang.</p>
        <div class="row2">
          <button type="button" class="btn btn-plain" data-keep>Lanjut mengisi</button>
          <button type="button" class="btn btn-ghost-danger" data-discard>Buang isian</button>
        </div>
      </div>`,
    onMount(b, close) {
      b.querySelector('[data-keep]').addEventListener('click', close);
      b.querySelector('[data-discard]').addEventListener('click', () => { discarded = true; close(); });
    },
    onClose: () => (discarded ? onDiscard() : onKeep()),
  });
}
