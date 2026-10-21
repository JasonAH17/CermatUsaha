# CermatUsaha

Aplikasi pencatatan keuangan untuk UMKM yang dibuat sesederhana mungkin untuk pemilik usaha yang tidak terbiasa dengan pembukuan. Catat uang masuk dan keluar, pantau untung, lalu tanyakan kondisi usaha ke **Cermat AI**, konsultan keuangan berbasis Google Gemini yang menjawab dari data usaha Anda sendiri.

Project mata kuliah Venture Creation, BINUS University.

## Fitur

- **Catat cepat** – satu tombol "+ Catat" untuk jualan, belanja stok, biaya usaha, terima uang, dan bayar utang
- **Scan struk** – foto nota belanja, angka dibaca otomatis (OCR), lalu dicek dan dikoreksi pengguna sebelum disimpan
- **Beranda** – untung/rugi bulan ini, uang di kas & bank, grafik uang masuk/keluar, dan hal yang perlu diperhatikan
- **Cermat AI** – tanya jawab soal keuangan usaha dengan bahasa sehari-hari
- **Utang piutang** – catatan per pelanggan/supplier dan pengingat tagihan lewat WhatsApp
- **Stok barang** – stok berkurang/bertambah otomatis dari jualan dan belanja
- **Laporan** – buku kas, laba rugi, utang piutang, dan penjualan per barang, bisa diunduh PDF
- **Akun** – daftar/masuk dengan email, login cepat (simulasi Google), dan mode demo dengan data contoh

## Menjalankan di komputer

Butuh [Node.js](https://nodejs.org) 18 atau lebih baru.

```bash
npm install
cp .env.example .env
npm run dev
```

Buka `http://localhost:5173`. Pilih **"Coba dulu tanpa daftar"** untuk langsung mencoba dengan data contoh Warung Bu Sri.

### Menghubungkan Cermat AI ke Gemini

1. Buat API key gratis di [Google AI Studio](https://aistudio.google.com/apikey).
2. Isi di file `.env`:
   ```
   GEMINI_API_KEY="api-key-anda"
   ```
3. Jalankan ulang `npm run dev`.

Tanpa API key, Cermat AI tetap bisa dipakai dalam **mode demo** (jawaban disusun dari template).

API key hanya dibaca oleh server (`server/ai.js`) dan tidak pernah dikirim ke browser. Variabel lain yang bisa diisi:

- `GEMINI_MODEL` – model pilihan; bawaannya `gemini-flash-latest` dengan cadangan `gemini-flash-lite-latest`
- `AI_RATE_LIMIT` – batas pertanyaan per pengunjung per 10 menit (bawaan 20)

## Online di Vercel (gratis)

1. Masuk ke [vercel.com](https://vercel.com) dengan akun GitHub.
2. **Add New → Project**, pilih repo `CermatUsaha`, lalu **Import**. Pengaturan build sudah terbaca dari `vercel.json`.
3. Di **Environment Variables**, tambahkan `GEMINI_API_KEY` berisi API key Gemini.
4. Klik **Deploy**.

Setiap push ke branch `main` akan otomatis memperbarui versi online. Cermat AI berjalan sebagai Vercel Function (`api/ai.js`).

## Struktur folder

```
api/ai.js             Vercel Function untuk /api/ai
server/ai.js          proxy ke Gemini (dipakai Vercel dan dev server Vite)
src/main.js           titik masuk, daftar halaman, navigasi
src/pages/            halaman: beranda, riwayat, AI, menu, utang piutang, stok, laporan, masuk/daftar
src/components/       form, lembar (sheet), scan struk, tutorial, toast
src/data/             penyimpanan, akun, perhitungan, laporan, konteks untuk AI
src/utils/            format rupiah, PDF, OCR, terbilang
src/styles/           CSS per bagian
```

## Catatan prototype

- Data dan akun disimpan di browser (localStorage) pada perangkat masing-masing, belum ada server database.
- Login Google masih simulasi.
- Endpoint Cermat AI berjalan di Vercel, `npm run dev`, atau `npm run preview`. Jika di-hosting sebagai situs statis biasa, Cermat AI otomatis berjalan dalam mode demo.

## Teknologi

Vite, JavaScript, Chart.js, jsPDF, Tesseract.js, Google Gemini API, Vercel.
