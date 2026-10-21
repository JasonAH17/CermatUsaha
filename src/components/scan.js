import '../styles/form.css';
import '../styles/scan.css';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { setupPihakPicker, KATEGORI } from './forms.js';
import { add } from '../data/store.js';
import { rupiah, toDateKey } from '../utils/format.js';
import { readReceipt, sampleReceipt } from '../utils/ocr.js';
import {
  esc, parseMoney, setMoney, invalid, bindFields,
  moneyField, textField, dateField, optionsField, akunField, pihakField, moreFields, submitButton,
} from './fields.js';

const badge = (ok, label) => `<span class="read-badge ${ok ? 'ok' : 'manual'}">
  <span class="icon">${ok ? 'check' : 'edit'}</span>${label}</span>`;

const itemRow = (it = { nama: '', harga: 0 }) => `
  <div class="scan-line">
    <input class="input" data-nama placeholder="Nama barang" value="${esc(it.nama)}" aria-label="Nama barang">
    <input class="input" data-harga inputmode="numeric" placeholder="0" value="${it.harga ? it.harga.toLocaleString('id-ID') : ''}" aria-label="Harga">
    <button type="button" class="icon-btn sm" data-del-line aria-label="Hapus baris"><span class="icon">close</span></button>
  </div>`;

export function openScan() {
  openSheet({
    title: 'Scan Struk',
    body: '<div class="scan"></div>',
    onMount(body, close) {
      const root = body.querySelector('.scan');
      let photoUrl = null;

      // ===== Langkah 1: pilih foto =====
      const showPick = () => {
        root.innerHTML = `
          <div class="scan-hero">
            <span class="row-icon lg tone-brand"><span class="icon">document_scanner</span></span>
            <strong>Foto struk atau nota belanja</strong>
            <p>Total, tanggal, dan barangnya dibaca otomatis. Anda cek dulu sebelum disimpan.</p>
          </div>
          <div class="scan-actions">
            <button type="button" class="btn btn-primary" data-camera><span class="icon">photo_camera</span>Ambil Foto</button>
            <button type="button" class="btn btn-plain" data-gallery><span class="icon">image</span>Pilih dari Galeri</button>
            <button type="button" class="btn-link scan-sample" data-sample><span class="icon">receipt_long</span>Belum ada struk? Coba pakai contoh</button>
          </div>
          <ul class="scan-tips">
            <li><span class="icon">light_mode</span>Cari tempat terang, jangan sampai buram</li>
            <li><span class="icon">crop_free</span>Pastikan seluruh struk masuk foto</li>
            <li><span class="icon">straighten</span>Letakkan struk lurus di permukaan rata</li>
          </ul>
          <input type="file" accept="image/*" capture="environment" data-cam-input hidden>
          <input type="file" accept="image/*" data-file-input hidden>`;
      };

      // ===== Langkah 2: membaca =====
      const run = async (source, url) => {
        photoUrl = url;
        root.innerHTML = `
          <div class="scan-reading">
            <div class="scan-photo"><img src="${url}" alt="Foto struk"><span class="scan-beam"></span></div>
            <div class="scan-progress"><span data-bar></span></div>
            <p data-status>Menyiapkan pembaca struk...</p>
          </div>`;
        const bar = root.querySelector('[data-bar]');
        const status = root.querySelector('[data-status]');

        try {
          const hasil = await readReceipt(source, (p, label) => {
            bar.style.transform = `scaleX(${p})`;
            status.textContent = label;
          });
          if (!root.isConnected) return;
          showVerify(hasil);
        } catch (err) {
          console.error(err);
          if (!root.isConnected) return;
          toast('Struk gagal dibaca, silakan isi manual', 'error');
          showVerify({ toko: '', tanggal: null, total: null, items: [], raw: '' });
        }
      };

      // ===== Langkah 3: cek & ubah sebelum disimpan =====
      const showVerify = (h) => {
        const terbaca = !!(h.total || h.items.length);
        root.innerHTML = `
          <div class="verify-banner ${terbaca ? '' : 'warn'}">
            <span class="icon">${terbaca ? 'fact_check' : 'edit_note'}</span>
            <div>
              <strong>${terbaca ? 'Cek dulu, sudah sesuai?' : 'Struk belum terbaca jelas'}</strong>
              <p>${terbaca
                ? 'Data di bawah <b>belum disimpan</b>. Cocokkan dengan struk dan ubah kalau ada yang salah.'
                : 'Silakan isi manual dengan melihat foto, atau foto ulang di tempat yang lebih terang.'}</p>
            </div>
          </div>

          <form class="form" novalidate>
            <button type="button" class="scan-thumb" data-zoom>
              <img src="${photoUrl}" alt="Foto struk">
              <span class="grow"><strong>Foto struk</strong><small>Ketuk untuk memperbesar</small></span>
              <span class="icon">zoom_in</span>
            </button>

            <div class="field-badged">
              ${moneyField('total', 'Total di struk')}
              ${badge(h.total && h.totalPasti, h.total ? (h.totalPasti ? 'Terbaca' : 'Perkiraan, cek lagi') : 'Isi manual')}
            </div>

            <div class="row2">
              <div class="field-badged">
                ${textField('toko', 'Nama toko', { placeholder: 'Contoh: Toko Makmur' })}
                ${badge(!!h.toko, h.toko ? 'Terbaca' : 'Isi manual')}
              </div>
              <div class="field-badged">
                ${dateField('tanggal', 'Tanggal', h.tanggal || toDateKey())}
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
              <div class="scan-lines">${h.items.map(itemRow).join('')}</div>
              <button type="button" class="add-line" data-add-line><span class="icon">add</span>Tambah baris</button>
              <div class="hint" data-selisih hidden></div>
            </div>

            <div data-status-wrap>
              ${optionsField('status', 'Sudah dibayar?', [
                { value: 'lunas', label: 'Sudah lunas' },
                { value: 'belum', label: 'Belum (utang)' },
              ], 'lunas')}
            </div>
            <div data-pihak-wrap hidden>${pihakField('Supplier', false)}</div>

            ${moreFields(`${akunField()}${textField('catatan', 'Catatan', { textarea: true })}`)}

            ${h.raw ? `
              <details class="scan-raw">
                <summary>Lihat teks asli yang terbaca</summary>
                <pre>${esc(h.raw)}</pre>
              </details>` : ''}

            ${submitButton('Ya, sudah sesuai · Simpan')}
            <button type="button" class="btn btn-plain" data-retake><span class="icon">photo_camera</span>Foto ulang</button>
          </form>`;

        const form = root.querySelector('form');
        const f = form.elements;
        const linesEl = form.querySelector('.scan-lines');
        const selisihEl = form.querySelector('[data-selisih]');

        f.toko.value = h.toko || '';
        setMoney(f.total, h.total || 0);
        bindFields(form);
        setupPihakPicker(form, 'pemasok', 'pembelian');

        const lines = () => [...linesEl.querySelectorAll('.scan-line')]
          .map((el) => ({ nama: el.querySelector('[data-nama]').value.trim(), harga: parseMoney(el.querySelector('[data-harga]').value) }))
          .filter((l) => l.nama || l.harga);

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
          form.querySelector('[data-status-wrap]').hidden = biaya;
          form.querySelector('[data-pihak-wrap]').hidden = biaya || f.status.value === 'lunas';
        };

        f.jenis.addEventListener('change', syncJenis);
        f.status.addEventListener('change', syncJenis);
        form.addEventListener('input', cekSelisih);

        linesEl.addEventListener('input', (e) => {
          const input = e.target.closest('[data-harga]');
          if (input) setMoney(input, parseMoney(input.value));
        });

        form.addEventListener('click', (e) => {
          if (e.target.closest('[data-add-line]')) {
            linesEl.insertAdjacentHTML('beforeend', itemRow());
            linesEl.lastElementChild.querySelector('input').focus();
          }
          const del = e.target.closest('[data-del-line]');
          if (del) { del.parentElement.remove(); cekSelisih(); }

          const pakai = e.target.closest('[data-pakai]');
          if (pakai) { setMoney(f.total, +pakai.dataset.pakai); cekSelisih(); }

          if (e.target.closest('[data-zoom]')) form.querySelector('.scan-thumb').classList.toggle('zoom');
          if (e.target.closest('[data-retake]')) showPick();
        });

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const total = parseMoney(f.total.value);
          if (!total) return invalid(f.total, 'Isi total sesuai yang tertulis di struk.');

          const biaya = f.jenis.value === 'pengeluaran';
          const utang = !biaya && f.status.value === 'belum';
          if (utang && !f.pihakId.value) {
            return invalid(form.querySelector('[data-pihak-picker]'), 'Pilih supplier supaya utangnya tercatat.');
          }

          const toko = f.toko.value.trim();
          add('transaksi', {
            jenis: biaya ? 'pengeluaran' : 'pembelian',
            kategori: biaya ? f.kategori.value : undefined,
            pihakId: utang ? f.pihakId.value : undefined,
            toko: toko || undefined,
            items: lines().filter((l) => l.nama).map((l) => ({ itemId: null, nama: l.nama, qty: 1, harga: l.harga })),
            total,
            dibayar: utang ? 0 : total,
            akunId: f.akunId.value,
            tanggal: f.tanggal.value,
            catatan: f.catatan.value.trim() || (toko ? `Nota ${toko}` : ''),
            struk: true,
          });
          close();
          toast(`Struk ${rupiah(total)} tersimpan`, 'check_circle');
        });

        syncJenis();
        cekSelisih();
      };

      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-camera]')) root.querySelector('[data-cam-input]').click();
        if (e.target.closest('[data-gallery]')) root.querySelector('[data-file-input]').click();
        if (e.target.closest('[data-sample]')) {
          const c = sampleReceipt();
          run(c, c.toDataURL('image/png'));
        }
      });

      root.addEventListener('change', (e) => {
        const input = e.target.closest('[data-cam-input],[data-file-input]');
        const file = input?.files[0];
        if (file) run(file, URL.createObjectURL(file));
      });

      showPick();
    },
  });
}
