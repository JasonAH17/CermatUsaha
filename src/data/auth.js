/*
  Akun untuk prototype: disimpan di perangkat (localStorage), belum ada server.
  Kata sandi disimpan sebagai hash SHA-256 + salt, bukan teks asli.
  Login Google masih simulasi (lihat pages/auth.js).

  user: { id, nama, email, provider: 'email'|'google'|'demo', salt?, hash?, createdAt }
*/
import { openAccount, closeAccount, uid } from './store.js';

const USERS = 'cermatusaha:users:v1';
const SESSION = 'cermatusaha:session:v1';

const readUsers = () => {
  try {
    return JSON.parse(localStorage.getItem(USERS)) || [];
  } catch {
    return [];
  }
};
const writeUsers = (users) => localStorage.setItem(USERS, JSON.stringify(users));
const publik = ({ salt, hash, ...u }) => u;

export const normalEmail = (v) => v.trim().toLowerCase();
export const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function currentUser() {
  try {
    const id = localStorage.getItem(SESSION);
    const u = id && readUsers().find((x) => x.id === id);
    return u ? publik(u) : null;
  } catch {
    return null;
  }
}

function startSession(user) {
  const pertama = readUsers().length === 1 && readUsers()[0].id === user.id;
  localStorage.setItem(SESSION, user.id);
  openAccount(user.id, { adoptOld: pertama }); // akun pertama mewarisi data lama di perangkat ini
  return publik(user);
}

// Pulihkan sesi saat aplikasi dibuka
export function resumeSession() {
  const u = currentUser();
  if (u) openAccount(u.id);
  return u;
}

export async function signUp({ nama, email, password }) {
  const users = readUsers();
  const e = normalEmail(email);
  if (users.some((u) => u.email === e)) {
    throw Object.assign(new Error('Email ini sudah terdaftar. Silakan masuk.'), { field: 'email' });
  }
  const salt = crypto.getRandomValues(new Uint32Array(4)).join('-');
  const user = {
    id: uid('user'), nama: nama.trim(), email: e, provider: 'email',
    salt, hash: await sha256(`${salt}:${password}`), createdAt: new Date().toISOString(),
  };
  writeUsers([...users, user]);
  return startSession(user);
}

export async function logIn({ email, password }) {
  const user = readUsers().find((u) => u.email === normalEmail(email));
  if (!user) throw Object.assign(new Error('Email ini belum terdaftar. Coba daftar dulu.'), { field: 'email' });
  if (user.provider !== 'email') {
    throw Object.assign(new Error('Akun ini dibuat lewat Google. Pakai tombol "Lanjutkan dengan Google".'), { field: 'email' });
  }
  if (await sha256(`${user.salt}:${password}`) !== user.hash) {
    throw Object.assign(new Error('Kata sandi salah. Periksa lagi, perhatikan huruf besar/kecil.'), { field: 'password' });
  }
  return startSession(user);
}

// Login cepat (Google simulasi / akun demo): buat akun bila belum ada
export function quickLogIn({ provider, nama, email }) {
  const users = readUsers();
  const e = normalEmail(email);
  let user = users.find((u) => u.email === e);
  if (!user) {
    user = { id: uid('user'), nama, email: e, provider, createdAt: new Date().toISOString() };
    writeUsers([...users, user]);
  }
  return { user: startSession(user), baru: !users.includes(user) };
}

export function logOut() {
  localStorage.removeItem(SESSION);
  closeAccount();
}
