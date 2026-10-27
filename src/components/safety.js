/*
  Pengaman dari salah tekan: hapus langsung, tapi bisa di-"Urungkan" beberapa detik.
  (Pertanyaan "Tutup tanpa menyimpan?" untuk form ada di sheet.js.)
*/
import { remove, restore } from '../data/store.js';
import { toast } from './toast.js';

export function removeWithUndo(col, id, message) {
  const row = remove(col, id);
  toast(message, 'delete', {
    action: { label: 'Urungkan', onClick: () => { restore(col, row); toast('Dikembalikan', 'undo'); } },
  });
}
