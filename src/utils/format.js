const rp = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});

export const rupiah = (n) => rp.format(n || 0);

export function rupiahSingkat(n = 0) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${+(n / 1e9).toFixed(1)}M`;
  if (abs >= 1e6) return `${+(n / 1e6).toFixed(1)}jt`;
  if (abs >= 1e3) return `${+(n / 1e3).toFixed(0)}rb`;
  return `${n}`;
}

export function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const tanggal = (key) =>
  new Date(`${key}T00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export const namaBulan = (date = new Date()) =>
  date.toLocaleDateString('id-ID', { month: 'long' });