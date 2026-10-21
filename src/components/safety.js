/*
  Pengaman dari salah tekan:
  - removeWithUndo / withUndo : hapus langsung, tapi bisa di-"Urungkan" beberapa detik
  - confirmAction             : konfirmasi yang jelas untuk tindakan besar (bukan confirm() bawaan browser)
*/
import { remove, restore, exportDb, replaceDb } from '../data/store.js';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { esc } from './fields.js';

export function removeWithUndo(col, id, message) {
  const row = remove(col, id);
  toast(message, 'delete', {
    action: { label: 'Urungkan', onClick: () => { restore(col, row); toast('Dikembalikan', 'undo'); } },
  });
}

// Untuk tindakan yang mengganti seluruh data (hapus semua, data contoh, pulihkan)
export function withUndo(fn, message) {
  const before = exportDb();
  fn();
  toast(message, 'check_circle', {
    duration: 10000,
    action: { label: 'Urungkan', onClick: () => { replaceDb(before); toast('Data dikembalikan', 'undo'); } },
  });
}

/*
  confirmAction({ title, message, confirmLabel, danger, typeToConfirm, extra })
  -> Promise<boolean>
  typeToConfirm: kata yang harus diketik dulu (untuk tindakan yang sangat berisiko)
  extra: { label, icon, onClick } tombol tambahan, misalnya "Simpan cadangan dulu"
*/
export function confirmAction({ title, message, confirmLabel = 'Lanjutkan', danger = false, typeToConfirm, extra }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (!answered) { answered = true; resolve(v); } };

    const closeSheet = openSheet({
      title,
      guard: false,
      body: `
        <div class="confirm">
          <span class="row-icon lg ${danger ? 'tone-out' : 'tone-warn'}"><span class="icon">${danger ? 'delete_forever' : 'help'}</span></span>
          <p>${message}</p>
          ${typeToConfirm ? `
            <div class="field">
              <label for="f-type-confirm">Ketik <b>${esc(typeToConfirm)}</b> untuk melanjutkan</label>
              <input class="input" id="f-type-confirm" autocomplete="off" autocapitalize="characters" data-type-confirm>
            </div>` : ''}
          ${extra ? `<button type="button" class="btn btn-soft" data-extra><span class="icon">${extra.icon}</span>${extra.label}</button>` : ''}
          <div class="row2">
            <button type="button" class="btn btn-plain" data-no>Batal</button>
            <button type="button" class="btn ${danger ? 'btn-out' : 'btn-primary'}" data-yes ${typeToConfirm ? 'disabled' : ''}>${confirmLabel}</button>
          </div>
        </div>`,
      onMount(body, close) {
        const yes = body.querySelector('[data-yes]');
        const typed = body.querySelector('[data-type-confirm]');
        typed?.addEventListener('input', () => {
          yes.disabled = typed.value.trim().toUpperCase() !== typeToConfirm.toUpperCase();
        });
        body.querySelector('[data-no]').addEventListener('click', () => { answer(false); close(); });
        yes.addEventListener('click', () => { answer(true); close(); });
        body.querySelector('[data-extra]')?.addEventListener('click', () => extra.onClick());
      },
      onClose: () => answer(false),
    });
    return closeSheet;
  });
}
