/*
  Bentuk data:
  profil    : { namaUsaha, pemilik, telepon, alamat }
  akun      : { id, nama, saldoAwal }
  pihak     : { id, nama, jenis: 'pelanggan'|'pemasok', telepon, saldoAwal }  (+ = dia berutang ke kita)
  item      : { id, nama, satuan, hargaBeli, hargaJual, stokAwal, stokMin }
  transaksi : { id, jenis, tanggal 'YYYY-MM-DD', akunId, pihakId?, items?, kategori?, total, dibayar?, jatuhTempo?, catatan? }
  catatan   : { id, judul, isi, pengingat? }
  percakapan: { id, judul, pesan: [{ role, content, lampiran?: { nama, jenis } }], dibuat, diubah }
  aktivitasAI: { id, jenis: 'nota'|'insight', ringkasan, transaksiId?, waktu }

  Data lama (pihak, akun selain Kas, catatan) tetap disimpan walau tidak lagi ditampilkan.
*/

// Setiap akun punya data sendiri: cermatusaha:db:v1:<userId>
const PREFIX = 'cermatusaha:db:v1';
// Data dari sebelum ada fitur akun (dan nama lama aplikasi); diambil alih oleh akun pertama yang dibuat
const KEY_TANPA_AKUN = ['cermatusaha:db:v1', 'kawanusaha:db:v1'];
let KEY = null;

const DEFAULT = () => ({
  profil: { namaUsaha: 'Usaha Saya', pemilik: '', telepon: '', alamat: '' },
  akun: [
    { id: 'kas', nama: 'Kas', saldoAwal: 0 },
    { id: 'bank', nama: 'Bank', saldoAwal: 0 },
  ],
  pihak: [],
  item: [],
  transaksi: [],
  catatan: [],
  percakapan: [],
  aktivitasAI: [],
});

const merge = (data = {}) => {
  const base = DEFAULT();
  return { ...base, ...data, profil: { ...base.profil, ...(data.profil || {}) } };
};

let db = DEFAULT();
const listeners = new Set();

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

// Dipanggil setelah masuk: memuat data milik akun ini
export function openAccount(userId, { adoptOld = false } = {}) {
  KEY = `${PREFIX}:${userId}`;
  let data = read(KEY);
  if (!data && adoptOld) {
    const lama = KEY_TANPA_AKUN.find((k) => read(k));
    if (lama) {
      data = read(lama);
      KEY_TANPA_AKUN.forEach((k) => localStorage.removeItem(k));
    }
  }
  db = merge(data || {});
  save();
}

// Dipanggil saat keluar
export function closeAccount() {
  KEY = null;
  db = DEFAULT();
  listeners.forEach((fn) => fn(db));
}

function save() {
  if (KEY) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      console.error('Gagal menyimpan data', e);
    }
  }
  listeners.forEach((fn) => fn(db));
}

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const getAll = (col) => db[col];
export const getById = (col, id) => db[col].find((x) => x.id === id);

export function add(col, data) {
  const row = { id: uid(col), createdAt: new Date().toISOString(), ...data };
  db[col] = [...db[col], row];
  save();
  return row;
}

export function update(col, id, patch) {
  db[col] = db[col].map((x) =>
    x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x
  );
  save();
  return getById(col, id);
}

// Mengembalikan baris yang dihapus supaya bisa di-"Urungkan"
export function remove(col, id) {
  const row = getById(col, id);
  db[col] = db[col].filter((x) => x.id !== id);
  save();
  return row;
}

// Memasukkan kembali baris utuh (dengan id lamanya), dipakai untuk Urungkan
export function restore(col, row) {
  if (!row || getById(col, row.id)) return;
  db[col] = [...db[col], row];
  save();
}

// ===== Kegiatan AI (tampil di Riwayat > AI) =====
const MAX_AKTIVITAS = 200;

export function catatAktivitasAI(data) {
  const row = { id: uid('ai'), waktu: new Date().toISOString(), ...data };
  db.aktivitasAI = [...db.aktivitasAI, row].slice(-MAX_AKTIVITAS);
  save();
  return row;
}

// ===== Profil usaha =====
export const getProfil = () => db.profil;

export function setProfil(patch) {
  db.profil = { ...db.profil, ...patch };
  save();
}

// ===== Seluruh data =====
export const exportDb = () => JSON.parse(JSON.stringify(db));

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetDb() {
  db = DEFAULT();
  save();
}

export function replaceDb(data) {
  db = merge(data);
  save();
}