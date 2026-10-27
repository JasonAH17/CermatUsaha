# CermatUsaha

Aplikasi pencatatan keuangan untuk UMKM yang dibuat sesederhana mungkin untuk pemilik usaha yang tidak terbiasa dengan pembukuan. Upload nota, catat jualan dan biaya, pantau stok, lalu tanyakan kondisi usaha ke **Cermat AI**, konsultan keuangan berbasis Google Gemini yang menjawab dari data usaha Anda sendiri.

Project mata kuliah Venture Creation, BINUS University.

## Fitur

Aplikasi hanya punya lima halaman: **Beranda · Riwayat · + Tambah · Chat · Pengaturan**.

- **Beranda** – saran Cermat AI dari data stok (diperbarui sekali sehari atau lewat tombol "Perbarui"), angka stok utama (jumlah barang, nilai stok, perlu dibeli, habis, paling laku), dan kartu kecil "Untung bulan ini"
- **+ Tambah** – Scan / Upload Nota, Jualan, Terima Uang, Biaya Usaha, Belanja Stok, dan Bayar Uang
- **Scan / Upload Nota** – foto atau file PDF nota dibaca Cermat AI, lalu dicek dan dikoreksi pengguna sebelum disimpan. Barang di nota dicocokkan ke stok yang sudah ada, dan barang baru dibuat otomatis. Kalau AI tidak tersedia, foto dibaca dengan OCR di perangkat.
- **Riwayat** – tab **Uang** (uang masuk/keluar per bulan), **Stok** (alur keluar-masuk tiap barang), dan **AI** (percakapan dan kegiatan Cermat AI)
- **Chat** – tanya jawab soal keuangan usaha dengan bahasa sehari-hari, bisa melampirkan foto, PDF, Excel, atau Word (maks. 3 MB). Percakapan tersimpan dan bisa dilanjutkan.
- **Pengaturan** – profil usaha, Laporan Keuangan (buku kas, laba rugi, penjualan per barang, unduh PDF), panduan, dan keluar
- **Akun** – daftar/masuk dengan email, login cepat (simulasi Google), dan mode demo dengan data contoh

Kartu "Untung bulan ini" di Beranda bisa dimatikan lewat `ringkasanUang` di `src/config.js`.

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
- `AI_TOPIC_GUARD` – isi `on` untuk menambah penjaga topik terpisah sebelum model utama (lebih ketat, tapi 2 panggilan Gemini per pertanyaan)

Cermat AI hanya menjawab seputar keuangan dan usaha. Instruksi dan batas topiknya ada di `server/prompt.js` (tidak bisa diubah dari browser); pertanyaan di luar topik dibalas dengan penolakan yang sama.

Endpoint `/api/ai` punya tiga tugas: `chat` (tanya jawab + lampiran), `nota` (membaca nota jadi data terstruktur), dan `insight` (saran stok untuk Beranda). Paket gratis Gemini dibatasi sekitar 15 permintaan per menit.

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
src/config.js         saklar fitur (mis. kartu untung di Beranda)
src/pages/            halaman: beranda, riwayat, chat, pengaturan, laporan, masuk/daftar
src/components/       form, lembar (sheet), scan/upload nota, tutorial, toast
src/data/             penyimpanan, akun, perhitungan, laporan, konteks untuk AI
src/utils/            format rupiah, PDF, OCR, lampiran file, terbilang
src/styles/           CSS per bagian
```

## Catatan prototype

- Data dan akun disimpan di browser (localStorage) pada perangkat masing-masing, belum ada server database.
- Login Google masih simulasi.
- Isi file lampiran chat tidak disimpan, hanya nama filenya. Data lama dari versi sebelumnya (kontak, utang piutang, rekening) tetap tersimpan tapi tidak ditampilkan.
- Endpoint Cermat AI berjalan di Vercel, `npm run dev`, atau `npm run preview`. Jika di-hosting sebagai situs statis biasa, Cermat AI otomatis berjalan dalam mode demo.

## Teknologi

Vite, JavaScript, jsPDF, Tesseract.js, SheetJS, mammoth, Google Gemini API, Vercel.
