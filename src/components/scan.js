import '../styles/form.css';
import '../styles/scan.css';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { KATEGORI } from './forms.js';
import { add, getAll, catatAktivitasAI } from '../data/store.js';
import { rupiah, toDateKey } from '../utils/format.js';
import { readReceipt, sampleReceipt } from '../utils/ocr.js';
import { readNota } from '../utils/ai.js';
import { siapkanLampiran, ACCEPT_NOTA } from '../utils/attachment.js';
import {
  esc, parseMoney, setMoney, invalid, bindFields,
  moneyField, textField, dateField, optionsField, moreFields, submitButton,
} from './fields.js';

const badge = (ok, label) => `<span class="read-badge ${ok ? 'ok' : 'manual'}">
  <span class="icon">${ok ? 'check' : 'edit'}</span>${label}</span>`;

const itemRow = (it = { nama: '', qty: 1, harga: 0 }) => `
  <div class="scan-line">
    <input class="input" data-nama placeholder="Nama barang" value="${esc(it.nama)}" aria-label="Nama barang">
    <input class="input" data-qty inputmode="numeric" value="${it.qty || 1}" aria-label="Jumlah">
    <input class="input" data-harga inputmode="numeric" placeholder="0" value="${it.harga ? it.harga.toLocaleString('id-ID') : ''}" aria-label="Harga total baris">
    <button type="button" class="icon-btn sm" data-del-line aria-label="Hapus baris"><span class="icon">close</span></button>
    <small class="scan-match" data-match></small>
  </div>`;

// Cocokkan nama barang di nota dengan daftar stok ("GULA PASIR 1KG" ~ "Gula 1kg")
const normal = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export function cocokBarang(nama) {
  const n = normal(nama);
  if (n.length < 3) return null;
  const items = getAll('item');
  const kata = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  // Semua kata di nama yang lebih pendek ada di nama lainnya: "Gula 1kg" cocok dengan "Gula Pasir 1kg"
  const bagian = (a, b) => a.length >= 2 && a.every((w) => b.includes(w));
  const k = kata(nama);
  return items.find((it) => normal(it.nama) === n)
    || items.find((it) => {
      const m = normal(it.nama);
      return m.length >= 4 && (n.includes(m) || m.includes(n));
    })
    || items.find((it) => bagian(kata(it.nama), k) || bagian(k, kata(it.nama)))
    || null;
}

export function openScan() {
  openSheet({
    title: 'Scan / Upload Nota',
    body: '<div class="scan"></div>',
    onMount(body, close) {
      const root = body.querySelector('.scan');
      let preview = null; // { url, pdf, nama }

      // ===== Langkah 1: pilih foto atau PDF =====
      const showPick = () => {
        root.innerHTML = `
          <div class="scan-hero">
            <span class="row-icon lg tone-brand"><span class="icon">document_scanner</span></span>
            <strong>Foto atau upload nota belanja</strong>
            <p>Cermat AI membaca total, tanggal, dan barangnya. Anda cek dulu sebelum disimpan.</p>
          </div>
          <div class="scan-actions">
            <button type="button" class="btn btn-primary" data-camera><span class="icon">photo_camera</span>Ambil Foto</button>
            <button type="button" class="btn btn-plain" data-gallery><span class="icon">upload_file</span>Pilih Foto atau PDF</button>
            <button type="button" class="btn-link scan-sample" data-sample><span class="icon">receipt_long</span>Belum ada nota? Coba pakai contoh</button>
          </div>
          <ul class="scan-tips">
            <li><span class="icon">light_mode</span>Cari tempat terang, jangan sampai buram</li>
            <li><span class="icon">crop_free</span>Pastikan seluruh nota masuk foto</li>
            <li><span class="icon">picture_as_pdf</span>Nota dari WhatsApp/email bisa langsung dipilih (PDF)</li>
          </ul>
          <input type="file" accept="image/*" capture="environment" data-cam-input hidden>
          <input type="file" accept="${ACCEPT_NOTA}" data-file-input hidden>`;
      };

      const previewHtml = () => (preview.pdf
        ? `<div class="scan-pdf"><span class="icon">picture_as_pdf</span><strong>${esc(preview.nama)}</strong></div>`
        : `<img src="${preview.url}" alt="Foto nota">`);

      // ===== Langkah 2: membaca (Cermat AI, cadangan OCR di perangkat untuk foto) =====
      const run = async (source, prev) => {
        preview = prev;
        root.innerHTML = `
          <div class="scan-reading">
            <div class="scan-photo">${previewHtml()}<span class="scan-beam"></span></div>
            <div class="scan-progress indeterminate"><span data-bar></span></div>
            <p data-status>Cermat AI sedang membaca nota...</p>
          </div>`;
        const bar = root.querySelector('[data-bar]');
        const status = root.querySelector('[data-status]');

        try {
          const lampiran = await siapkanLampiran(source, { hanya: ['foto', 'pdf'] });
          const nota = await readNota(lampiran);
          if (!root.isConnected) return;
          return showVerify({ ...nota, totalPasti: !!nota.total, sumber: 'ai' });
        } catch (err) {
          if (!root.isConnected) return;
          if (err.status === 422 || err.status === 415 || err.status === 413) {
            toast(err.message, 'error');
            return showPick();
          }
          if (preview.pdf) {
            toast('PDF belum bisa dibaca sekarang, silakan isi manual', 'error');
            return showVerify({ toko: '', tanggal: '', total: 0, items: [], sumber: 'manual' });
          }
        }

        // Cadangan: OCR di perangkat (tanpa internet ke AI)
        root.querySelector('.scan-progress').classList.remove('indeterminate');
        try {
          const hasil = await readReceipt(source, (p, label) => {
            bar.style.transform = `scaleX(${p})`;
            status.textContent = label;
          });
          if (!root.isConnected) return;
          showVerify({ ...hasil, items: hasil.items.map((it) => ({ ...it, qty: 1 })), sumber: 'ocr' });
        } catch (err) {
          console.error(err);
          if (!root.isConnected) return;
          toast('Nota gagal dibaca, silakan isi manual', 'error');
          showVerify({ toko: '', tanggal: '', total: 0, items: [], sumber: 'manual' });
        }
      };

      // ===== Langkah 3: cek & ubah sebelum disimpan =====
      const showVerify = (h) => {
        const terbaca = !!(h.total || h.items.length);
        const olehAI = h.sumber === 'ai';
        root.innerHTML = `
          <div class="verify-banner ${terbaca ? '' : 'warn'}">
            <span class="icon">${terbaca ? 'fact_check' : 'edit_note'}</span>
            <div>
              <strong>${terbaca ? 'Cek dulu, sudah sesuai?' : 'Nota belum terbaca jelas'}</strong>
              <p>${terbaca
                ? `${olehAI ? 'Dibaca oleh Cermat AI. ' : ''}Data di bawah <b>belum disimpan</b>. Cocokkan dengan nota dan ubah kalau ada yang salah.`
                : 'Silakan isi manual dengan melihat nota, atau foto ulang di tempat yang lebih terang.'}</p>
            </div>
          </div>

          <form class="form" novalidate>
            <button type="button" class="scan-thumb" data-zoom>
              ${preview.pdf ? '<span class="row-icon tone-brand"><span class="icon">picture_as_pdf</span></span>' : `<img src="${preview.url}" alt="Foto nota">`}
              <span class="grow"><strong>${preview.pdf ? esc(preview.nama) : 'Foto nota'}</strong><small>${preview.pdf ? 'Ketuk untuk membuka PDF' : 'Ketuk untuk memperbesar'}</small></span>
              <span class="icon">${preview.pdf ? 'open_in_new' : 'zoom_in'}</span>
            </button>

            <div class="field-badged">
              ${moneyField('total', 'Total di nota')}
              ${badge(h.total && h.totalPasti, h.total ? (h.totalPasti ? 'Terbaca' : 'Perkiraan, cek lagi') : 'Isi manual')}
            </div>

            <div class="row2">
              <div class="field-badged">
                ${textField('toko', 'Nama toko', { placeholder: 'Contoh: Toko Makmur' })}
                ${badge(!!h.toko, h.toko ? 'Terbaca' : 'Isi manual')}
              </div>
              <div class="field-badged">
                ${dateField('tanggal', 'Tanggal', h.tanggal && h.tanggal <= toDateKey() ? h.tanggal : toDateKey())}
                ${badge(!!h.tanggal, h.tanggal ? 'Terbaca' : 'Hari ini')}
              </div>
            </div>

            ${optionsField('jenis', 'Dicatat sebagai', [
              { value: 'pembelian', label: 'Belanja Stok' },
              { value: 'pengeluaran', label: 'Biaya Usaha' },
            ], 'pembelian')}
            <div data-kategori hidden>
              ${optionsField('kategori', 'Untuk apa?', KATEGORI.map((k) => ({ value: k, label: k })), KATEGORI[0])}
            </div>

            <div class="field">
              <span class="field-label">Barang yang terbaca <em>(${h.items.length})</em></span>
              <div class="scan-head"><span>Nama</span><span>Jml</span><span>Harga total</span></div>
              <div class="scan-lines">${h.items.map(itemRow).join('')}</div>
              <button type="button" class="add-line" data-add-line><span class="icon">add</span>Tambah baris</button>
              <div class="hint" data-selisih hidden></div>
              <label class="scan-stok" data-stok-wrap>
                <input type="checkbox" name="masukStok" checked>
                <span><strong>Tambahkan ke stok barang</strong><small>Barang yang cocok stoknya bertambah; yang belum ada dibuat baru.</small></span>
              </label>
            </div>

            ${moreFields(textField('catatan', 'Catatan', { textarea: true }), { title: 'Catatan', sub: 'Boleh dikosongkan' })}

            ${h.raw ? `
              <details class="scan-raw">
                <summary>Lihat teks asli yang terbaca</summary>
                <pre>${esc(h.raw)}</pre>
              </details>` : ''}

            ${submitButton('Ya, sudah sesuai · Simpan')}
            <button type="button" class="btn btn-plain" data-retake><span class="icon">photo_camera</span>Ganti nota</button>
          </form>`;

        const form = root.querySelector('form');
        const f = form.elements;
        const linesEl = form.querySelector('.scan-lines');
        const selisihEl = form.querySelector('[data-selisih]');

        f.toko.value = h.toko || '';
        setMoney(f.total, h.total || 0);
        bindFields(form);

        const lines = () => [...linesEl.querySelectorAll('.scan-line')]
          .map((el) => ({
            nama: el.querySelector('[data-nama]').value.trim(),
            qty: Math.max(1, parseMoney(el.querySelector('[data-qty]').value)),
            harga: parseMoney(el.querySelector('[data-harga]').value),
          }))
          .filter((l) => l.nama || l.harga);

        // Tampilkan ke barang stok mana setiap baris akan masuk
        const syncMatch = () => {
          const stokOn = f.jenis.value === 'pembelian' && f.masukStok.checked;
          linesEl.querySelectorAll('.scan-line').forEach((el) => {
            const out = el.querySelector('[data-match]');
            const nama = el.querySelector('[data-nama]').value.trim();
            const it = stokOn && nama ? cocokBarang(nama) : null;
            out.hidden = !stokOn || !nama;
            out.innerHTML = it
              ? `<span class="icon">inventory_2</span>Masuk ke stok <b>${esc(it.nama)}</b>`
              : '<span class="icon">add_box</span>Barang baru di stok';
            out.classList.toggle('baru', !it);
          });
        };

        // Bandingkan jumlah barang dengan total supaya salah baca cepat ketahuan
        const cekSelisih = () => {
          const jumlah = lines().reduce((s, l) => s + l.harga, 0);
          const total = parseMoney(f.total.value);
          const beda = total - jumlah;
          selisihEl.hidden = !jumlah || !total || beda === 0;
          selisihEl.innerHTML = `
            <span>Jumlah barang ${rupiah(jumlah)}, beda <strong>${rupiah(Math.abs(beda))}</strong> dari total</span>
            <button type="button" data-pakai="${jumlah}">Pakai ini</button>`;
        };

        const syncJenis = () => {
          const biaya = f.jenis.value === 'pengeluaran';
          form.querySelector('[data-kategori]').hidden = !biaya;
          form.querySelector('[data-stok-wrap]').hidden = biaya;
          syncMatch();
        };

        f.jenis.addEventListener('change', syncJenis);
        f.masukStok.addEventListener('change', syncMatch);
        form.addEventListener('input', () => { cekSelisih(); syncMatch(); });

        linesEl.addEventListener('input', (e) => {
          const input = e.target.closest('[data-harga]');
          if (input) setMoney(input, parseMoney(input.value));
        });

        form.addEventListener('click', (e) => {
          if (e.target.closest('[data-add-line]')) {
            linesEl.insertAdjacentHTML('beforeend', itemRow());
            linesEl.lastElementChild.querySelector('input').focus();
            syncMatch();
          }
          const del = e.target.closest('[data-del-line]');
          if (del) { del.parentElement.remove(); cekSelisih(); }

          const pakai = e.target.closest('[data-pakai]');
          if (pakai) { setMoney(f.total, +pakai.dataset.pakai); cekSelisih(); }

          if (e.target.closest('[data-zoom]')) {
            if (preview.pdf) window.open(preview.url, '_blank');
            else form.querySelector('.scan-thumb').classList.toggle('zoom');
          }
          if (e.target.closest('[data-retake]')) showPick();
        });

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const total = parseMoney(f.total.value);
          if (!total) return invalid(f.total, 'Isi total sesuai yang tertulis di nota.');

          const biaya = f.jenis.value === 'pengeluaran';
          const keStok = !biaya && f.masukStok.checked;
          const baris = lines().filter((l) => l.nama);
          let baru = 0;

          const items = baris.map((l) => {
            const satuan = Math.round(l.harga / l.qty);
            if (!keStok) return { itemId: null, nama: l.nama, qty: l.qty, harga: satuan };
            let it = cocokBarang(l.nama);
            if (!it) {
              it = add('item', { nama: l.nama, satuan: 'pcs', hargaBeli: satuan, hargaJual: 0, stokAwal: 0, stokMin: 0 });
              baru++;
            }
            return { itemId: it.id, nama: it.nama, qty: l.qty, harga: satuan };
          });

          const toko = f.toko.value.trim();
          const trx = add('transaksi', {
            jenis: biaya ? 'pengeluaran' : 'pembelian',
            kategori: biaya ? f.kategori.value : undefined,
            toko: toko || undefined,
            items,
            total,
            dibayar: total,
            akunId: 'kas',
            tanggal: f.tanggal.value,
            catatan: f.catatan.value.trim() || (toko ? `Nota ${toko}` : ''),
            struk: true,
          });

          if (olehAI) {
            catatAktivitasAI({
              jenis: 'nota',
              transaksiId: trx.id,
              ringkasan: `Membaca nota ${toko || 'belanja'} · ${items.length} barang · ${rupiah(total)}${keStok ? ` · stok diperbarui${baru ? `, ${baru} barang baru` : ''}` : ''}`,
            });
          }
          close();
          toast(keStok && items.length ? `Nota tersimpan · stok ${items.length} barang bertambah` : `Nota ${rupiah(total)} tersimpan`, 'check_circle');
        });

        syncJenis();
        cekSelisih();
      };

      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-camera]')) root.querySelector('[data-cam-input]').click();
        if (e.target.closest('[data-gallery]')) root.querySelector('[data-file-input]').click();
        if (e.target.closest('[data-sample]')) {
          const c = sampleReceipt();
          run(c, { url: c.toDataURL('image/png'), pdf: false, nama: 'struk-contoh.png' });
        }
      });

      root.addEventListener('change', (e) => {
        const input = e.target.closest('[data-cam-input],[data-file-input]');
        const file = input?.files[0];
        if (!file) return;
        const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        run(file, { url: URL.createObjectURL(file), pdf, nama: file.name });
      });

      showPick();
    },
  });
}
