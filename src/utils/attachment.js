/*
  Menyiapkan file dari pengguna untuk dikirim ke Cermat AI.
  - Foto & PDF  -> base64, dibaca langsung oleh Gemini
  - Excel / CSV -> teks tabel (SheetJS), Word -> teks (mammoth), diubah di browser
  Library Excel/Word baru dimuat saat dipakai.
*/

export const MAX_FILE_MB = 3; // batas Vercel: body permintaan maks 4,5 MB setelah base64
const MAX_TEKS = 60_000; // karakter
const MAX_SISI_FOTO = 1600; // px, foto besar diperkecil supaya cepat dan hemat

export const ACCEPT_LAMPIRAN = 'image/*,.pdf,.xlsx,.xls,.csv,.docx';
export const ACCEPT_NOTA = 'image/*,.pdf';

const ext = (nama) => nama.split('.').pop().toLowerCase();

export function jenisFile(file) {
  const e = ext(file.name);
  if (file.type.startsWith('image/')) return 'foto';
  if (file.type === 'application/pdf' || e === 'pdf') return 'pdf';
  if (['xlsx', 'xls', 'csv'].includes(e)) return 'excel';
  if (e === 'docx') return 'word';
  return null;
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(new Error('File tidak bisa dibaca.'));
  r.readAsDataURL(blob);
});

// Foto diperkecil dan diubah ke JPEG; canvas (struk contoh) juga diterima
async function fotoKeJpeg(source) {
  let canvas = source;
  if (!(source instanceof HTMLCanvasElement)) {
    const bmp = await createImageBitmap(source);
    const skala = Math.min(1, MAX_SISI_FOTO / Math.max(bmp.width, bmp.height));
    canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * skala);
    canvas.height = Math.round(bmp.height * skala);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  }
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  return toBase64(blob);
}

const potong = (teks) => (teks.length > MAX_TEKS ? `${teks.slice(0, MAX_TEKS)}\n...(dipotong)` : teks);

/*
  Hasil: { nama, jenis, mimeType, data }  untuk foto/PDF
       | { nama, jenis, teks }            untuk Excel/Word
  Melempar Error berisi pesan untuk pengguna bila file tidak didukung / terlalu besar.
*/
export async function siapkanLampiran(file, { hanya } = {}) {
  if (file instanceof HTMLCanvasElement) {
    return { nama: 'struk-contoh.jpg', jenis: 'foto', mimeType: 'image/jpeg', data: await fotoKeJpeg(file) };
  }

  const jenis = jenisFile(file);
  if (!jenis || (hanya && !hanya.includes(jenis))) {
    throw new Error(hanya ? 'Pilih foto atau file PDF nota.' : 'File ini belum didukung. Pakai foto, PDF, Excel, atau Word (.docx).');
  }
  if (jenis !== 'foto' && file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`File terlalu besar. Maksimal ${MAX_FILE_MB} MB.`);
  }

  if (jenis === 'foto') return { nama: file.name, jenis, mimeType: 'image/jpeg', data: await fotoKeJpeg(file) };
  if (jenis === 'pdf') return { nama: file.name, jenis, mimeType: 'application/pdf', data: await toBase64(file) };

  if (jenis === 'excel') {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const teks = wb.SheetNames
      .map((n) => `## Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })}`)
      .join('\n\n');
    if (!teks.trim()) throw new Error('File Excel ini kosong.');
    return { nama: file.name, jenis, teks: potong(teks) };
  }

  const mammoth = await import('mammoth');
  const { value } = await (mammoth.default || mammoth).extractRawText({ arrayBuffer: await file.arrayBuffer() });
  if (!value.trim()) throw new Error('Dokumen Word ini kosong.');
  return { nama: file.name, jenis, teks: potong(value) };
}
