import '../styles/form.css';
import '../styles/item.css';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';
import { setupPihakPicker } from './forms.js';
import { add, update, getAll, getById } from '../data/store.js';
import { removeWithUndo } from './safety.js';
import { stokItem } from '../data/selectors.js';
import { rupiah, rupiahSingkat, toDateKey } from '../utils/format.js';
import {
  esc, parseMoney, setMoney, invalid, bindFields,
  moneyField, numberField, textField, dateField, optionsField, akunField, pihakField, moreFields, submitButton,
} from './fields.js';

const SATUAN = ['pcs', 'kg', 'pack', 'botol', 'kotak', 'porsi'];
const focusLater = (el) => setTimeout(() => el.focus({ preventScroll: true }), 380);

// ===== Helper tampilan barang =====
export function itemAvatar(item, size = '') {
  return `<span class="item-avatar ${size}">${esc(item.nama.slice(0, 2).toUpperCase())}</span>`;
}

export function stokStatus(item) {
  const s = stokItem(item.id);
  if (s <= 0) return { s, cls: 'habis', label: 'Habis' };
  if (s <= (item.stokMin || 0)) return { s, cls: 'tipis', label: 'Menipis' };
  return { s, cls: 'aman', label: 'Aman' };
}

// Peringatan kalau jumlah jual melebihi stok yang tercatat (tidak memblokir, stok bisa saja belum dicatat)
function stokWarning(jenis, line) {
  if (jenis !== 'penjualan' || !line.itemId) return '';
  const stok = stokItem(line.itemId);
  if (line.qty <= stok) return '';
  return `<small class="field-warn line-warn"><span class="icon">warning</span>Stok tercatat tinggal ${Math.max(stok, 0)} ${esc(line.satuan)}. Pastikan jumlahnya benar.</small>`;
}

// ===== Tambah / Edit Item =====
export function openItemForm(item = null, onSaved) {
  const edit = !!item;
  openSheet({
    title: edit ? 'Ubah Barang' : 'Tambah Barang',
    body: `
      <form class="form" novalidate>
        ${textField('nama', 'Nama barang', { placeholder: 'Contoh: Nasi Kotak' })}
        <small class="field-warn" data-dupe hidden></small>
        ${optionsField('satuan', 'Satuan', SATUAN.map((s) => ({ value: s, label: s })), item?.satuan || 'pcs')}
        <div class="row2">
          ${moneyField('hargaBeli', 'Harga beli', true)}
          ${moneyField('hargaJual', 'Harga jual', true)}
        </div>
        <div class="hint margin-hint" hidden></div>
        <div class="row2">
          ${edit ? '' : numberField('stokAwal', 'Stok sekarang')}
          ${numberField('stokMin', 'Ingatkan kalau sisa')}
        </div>
        ${submitButton(edit ? 'Simpan Perubahan' : 'Simpan Barang')}
        ${edit ? `<button type="button" class="btn btn-ghost-danger pressable" data-delete><span class="icon">delete</span>Hapus barang</button>` : ''}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      const hint = form.querySelector('.margin-hint');
      bindFields(form);

      if (edit) {
        f.nama.value = item.nama;
        setMoney(f.hargaBeli, item.hargaBeli);
        setMoney(f.hargaJual, item.hargaJual);
        f.stokMin.value = item.stokMin || '';
      } else {
        focusLater(f.nama);
      }

      const updateMargin = () => {
        const beli = parseMoney(f.hargaBeli.value);
        const jual = parseMoney(f.hargaJual.value);
        if (!beli || !jual) { hint.hidden = true; return; }
        const untung = jual - beli;
        hint.hidden = false;
        hint.innerHTML = untung < 0
          ? `<span><span class="icon sm">warning</span> Harga jual di bawah modal, Anda <b>rugi ${rupiah(-untung)}</b> per ${f.satuan.value}</span>`
          : `<span>Untung per ${f.satuan.value}</span>
             <strong class="amount-in">${rupiah(untung)} · ${Math.round((untung / jual) * 100)}%</strong>`;
        hint.classList.toggle('warn', untung < 0);
      };
      form.addEventListener('input', updateMargin);
      form.addEventListener('click', updateMargin);
      updateMargin();

      // Peringatan halus kalau nama barang sudah ada
      const dupe = form.querySelector('[data-dupe]');
      f.nama.addEventListener('input', () => {
        const nama = f.nama.value.trim().toLowerCase();
        const ada = nama && getAll('item').find((it) => it.id !== item?.id && it.nama.trim().toLowerCase() === nama);
        dupe.hidden = !ada;
        if (ada) dupe.innerHTML = `<span class="icon">warning</span>Barang bernama ${esc(ada.nama)} sudah ada di daftar.`;
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nama = f.nama.value.trim();
        if (!nama) return invalid(f.nama, 'Isi nama barangnya dulu.');

        const data = {
          nama,
          satuan: f.satuan.value,
          hargaBeli: parseMoney(f.hargaBeli.value),
          hargaJual: parseMoney(f.hargaJual.value),
          stokMin: +f.stokMin.value || 0,
        };
        if (!data.hargaJual) return invalid(f.hargaJual, 'Isi harga jualnya.');

        const saved = edit
          ? update('item', item.id, data)
          : add('item', { ...data, stokAwal: +f.stokAwal.value || 0 });

        close();
        toast(`${nama} ${edit ? 'diperbarui' : 'ditambahkan'}`, 'check_circle');
        onSaved?.(saved);
      });

      form.querySelector('[data-delete]')?.addEventListener('click', () => {
        const dipakai = getAll('transaksi').filter((t) => t.items?.some((li) => li.itemId === item.id)).length;
        if (dipakai) {
          return toast(`${item.nama} sudah dipakai di ${dipakai} transaksi, jadi tidak bisa dihapus supaya laporan tetap benar`, 'info');
        }
        close();
        removeWithUndo('item', item.id, `${item.nama} dihapus`);
      });
    },
  });
}

// ===== Pemilih Item =====
export function openItemPicker({ jenis, onPick }) {
  const harga = (it) => (jenis === 'pembelian' ? it.hargaBeli : it.hargaJual);

  openSheet({
    title: 'Pilih Barang',
    body: `
      <div class="form">
        <input class="input" type="search" placeholder="Cari barang..." data-search>
        <button type="button" class="list-item" data-new>
          <span class="avatar"><span class="icon">add</span></span>
          <span class="grow"><strong>Tambah barang baru</strong></span>
        </button>
        <div class="pick-list"></div>
      </div>`,
    onMount(body, close) {
      const listEl = body.querySelector('.pick-list');

      const renderList = (q = '') => {
        const rows = getAll('item')
          .filter((i) => i.nama.toLowerCase().includes(q.toLowerCase()))
          .sort((a, b) => a.nama.localeCompare(b.nama));

        listEl.innerHTML = rows.length
          ? rows.map((it) => {
              const st = stokStatus(it);
              return `
                <button type="button" class="list-item" data-id="${it.id}">
                  ${itemAvatar(it)}
                  <span class="grow"><strong>${esc(it.nama)}</strong><small>${rupiah(harga(it))} / ${esc(it.satuan)}</small></span>
                  <span class="stok-badge ${st.cls}">${st.s} ${esc(it.satuan)}</span>
                </button>`;
            }).join('')
          : `<p class="list-empty">Belum ada barang</p>`;
      };

      renderList();
      body.querySelector('[data-search]').addEventListener('input', (e) => renderList(e.target.value));

      listEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (!b) return;
        onPick(getById('item', b.dataset.id));
        close();
      });

      body.querySelector('[data-new]').addEventListener('click', () =>
        openItemForm(null, (it) => { onPick(it); close(); })
      );
    },
  });
}

// ===== Faktur Penjualan / Pembelian =====
const FAKTUR = {
  penjualan: { title: 'Jualan per Barang', pihakLabel: 'Pelanggan', pihakJenis: 'pelanggan', harga: 'hargaJual', sisa: 'piutang' },
  pembelian: { title: 'Belanja per Barang', pihakLabel: 'Supplier', pihakJenis: 'pemasok', harga: 'hargaBeli', sisa: 'utang' },
};

export function openFakturForm(jenis) {
  const cfg = FAKTUR[jenis];
  const lines = []; // { itemId, nama, satuan, qty, harga }

  openSheet({
    title: cfg.title,
    body: `
      <form class="form" novalidate>
        <div class="field">
          <span class="field-label">Barang</span>
          <div class="lines"></div>
          <button type="button" class="add-line pressable" data-add-line>
            <span class="icon">add</span>Tambah barang
          </button>
        </div>
        <div class="total-box"><span>Total</span><strong data-total>Rp 0</strong></div>
        ${optionsField('status', 'Sudah dibayar?', [
          { value: 'lunas', label: 'Lunas' },
          { value: 'sebagian', label: 'Sebagian' },
          { value: 'belum', label: 'Belum dibayar' },
        ], 'lunas')}
        ${pihakField(cfg.pihakLabel)}
        <div class="bayar-extra form" hidden>
          <div data-dibayar-wrap>${moneyField('dibayar', 'Yang sudah dibayar', true)}</div>
          ${dateField('jatuhTempo', 'Janji bayar tanggal', toDateKey(new Date(Date.now() + 7 * 864e5)), { min: toDateKey() })}
        </div>
        ${moreFields(`${akunField()}${dateField()}${textField('catatan', 'Catatan', { textarea: true })}`)}
        ${submitButton('Simpan')}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      const linesEl = form.querySelector('.lines');
      const extra = form.querySelector('.bayar-extra');
      const dibayarWrap = form.querySelector('[data-dibayar-wrap]');
      const addBtn = form.querySelector('[data-add-line]');

      bindFields(form);
      setupPihakPicker(form, cfg.pihakJenis, jenis);

      const total = () => lines.reduce((s, l) => s + l.qty * l.harga, 0);

      const updateTotal = () => {
        form.querySelector('[data-total]').textContent = rupiah(total());
        linesEl.querySelectorAll('.line').forEach((el) => {
          const l = lines[+el.dataset.i];
          el.querySelector('.line-sub').textContent = rupiah(l.qty * l.harga);
        });
      };

      const renderLines = () => {
        linesEl.innerHTML = lines.map((l, i) => `
          <div class="line" data-i="${i}">
            <div class="line-top">
              <strong>${esc(l.nama)}</strong>
              <span class="line-sub"></span>
            </div>
            <div class="line-bottom">
              <label class="line-price">Rp
                <input inputmode="numeric" value="${l.harga.toLocaleString('id-ID')}" data-price="${i}">
                / ${esc(l.satuan)}
              </label>
              <div class="stepper">
                <button type="button" data-dec="${i}"><span class="icon">${l.qty === 1 ? 'delete' : 'remove'}</span></button>
                <span>${l.qty}</span>
                <button type="button" data-inc="${i}"><span class="icon">add</span></button>
              </div>
            </div>
            ${stokWarning(jenis, l)}
          </div>`).join('');
        updateTotal();
      };

      linesEl.addEventListener('click', (e) => {
        const inc = e.target.closest('[data-inc]');
        const dec = e.target.closest('[data-dec]');
        if (inc) lines[+inc.dataset.inc].qty++;
        if (dec) {
          const i = +dec.dataset.dec;
          if (lines[i].qty > 1) lines[i].qty--;
          else lines.splice(i, 1);
        }
        if (inc || dec) renderLines();
      });

      linesEl.addEventListener('input', (e) => {
        const input = e.target.closest('[data-price]');
        if (!input) return;
        const n = parseMoney(input.value);
        lines[+input.dataset.price].harga = n;
        input.value = n ? n.toLocaleString('id-ID') : '';
        updateTotal();
      });

      addBtn.addEventListener('click', () =>
        openItemPicker({
          jenis,
          onPick: (it) => {
            const ada = lines.find((l) => l.itemId === it.id);
            if (ada) ada.qty++;
            else lines.push({ itemId: it.id, nama: it.nama, satuan: it.satuan, qty: 1, harga: it[cfg.harga] || 0 });
            renderLines();
          },
        })
      );

      form.querySelector('[data-options="status"]').addEventListener('click', () => {
        extra.hidden = f.status.value === 'lunas';
        dibayarWrap.hidden = f.status.value !== 'sebagian';
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!lines.length) return invalid(addBtn, 'Tambahkan minimal satu barang.');

        const t = total();
        if (!t) return invalid(addBtn, 'Total masih Rp 0. Periksa harga barangnya.');
        const status = f.status.value;
        const bayarSebagian = parseMoney(f.dibayar.value);
        if (status === 'sebagian' && !bayarSebagian) return invalid(f.dibayar, 'Isi berapa yang sudah dibayar.');
        if (status === 'sebagian' && bayarSebagian >= t) {
          return invalid(f.dibayar, `Harus kurang dari total ${rupiah(t)}. Kalau sudah dibayar penuh, pilih "Lunas".`);
        }
        const dibayar = status === 'lunas' ? t : status === 'belum' ? 0 : bayarSebagian;
        if (dibayar < t && !f.pihakId.value) {
          return invalid(form.querySelector('[data-pihak-picker]'), `Pilih ${cfg.pihakLabel.toLowerCase()} supaya ${cfg.sisa}nya tercatat.`);
        }

        add('transaksi', {
          jenis,
          pihakId: f.pihakId.value || undefined,
          items: lines.map(({ itemId, nama, qty, harga }) => ({ itemId, nama, qty, harga })),
          total: t,
          dibayar,
          jatuhTempo: dibayar < t ? f.jatuhTempo.value : null,
          akunId: f.akunId.value,
          tanggal: f.tanggal.value,
          catatan: f.catatan.value.trim(),
        });
        close();
        toast(`${cfg.title} ${rupiah(t)} tersimpan`, 'check_circle');
      });

      renderLines();
    },
  });
}

// ===== POS Cepat =====
export function openPOS() {
  const cart = new Map(); // itemId -> qty

  openSheet({
    title: 'Kasir',
    body: `
      <div class="pos">
        <input class="input" type="search" placeholder="Cari barang..." data-search>
        <div class="pos-grid"></div>
      </div>
      <div class="pos-bar" hidden>
        <button type="button" class="pos-cart pressable" data-checkout>
          <span class="pos-count" data-count>0</span>
          <span class="grow"><small>Total</small><strong data-sum>Rp 0</strong></span>
          <span class="pos-pay">Bayar <span class="icon">arrow_forward</span></span>
        </button>
      </div>`,
    onMount(body) {
      const grid = body.querySelector('.pos-grid');
      const bar = body.querySelector('.pos-bar');
      let query = '';

      const renderGrid = () => {
        const rows = getAll('item')
          .filter((i) => i.nama.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => a.nama.localeCompare(b.nama));

        grid.innerHTML = rows.length
          ? rows.map((it) => {
              const st = stokStatus(it);
              const qty = cart.get(it.id) || 0;
              return `
                <button type="button" class="pos-tile pressable ${qty ? 'in-cart' : ''}" data-id="${it.id}">
                  ${itemAvatar(it, 'lg')}
                  <strong>${esc(it.nama)}</strong>
                  <small>${rupiah(it.hargaJual)}</small>
                  <span class="stok-badge ${st.cls}">Stok ${st.s}</span>
                  ${qty ? `<span class="pos-qty">${qty}</span>` : ''}
                </button>`;
            }).join('')
          : `<p class="list-empty">Belum ada barang. Tambahkan dulu lewat Menu → Stok Barang.</p>`;
      };

      const updateBar = () => {
        let count = 0;
        let sum = 0;
        cart.forEach((qty, id) => {
          count += qty;
          sum += qty * (getById('item', id)?.hargaJual || 0);
        });
        bar.hidden = !count;
        body.querySelector('[data-count]').textContent = count;
        body.querySelector('[data-sum]').textContent = rupiah(sum);
      };

      grid.addEventListener('click', (e) => {
        const tile = e.target.closest('[data-id]');
        if (!tile) return;
        const id = tile.dataset.id;
        const qty = (cart.get(id) || 0) + 1;
        cart.set(id, qty);

        tile.classList.add('in-cart');
        let badge = tile.querySelector('.pos-qty');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'pos-qty';
          tile.appendChild(badge);
        }
        badge.textContent = qty;
        badge.classList.remove('pop');
        void badge.offsetWidth;
        badge.classList.add('pop');
        updateBar();
      });

      body.querySelector('[data-search]').addEventListener('input', (e) => {
        query = e.target.value;
        renderGrid();
      });

      body.querySelector('[data-checkout]').addEventListener('click', () =>
        openCheckout(cart, {
          onChange: () => { renderGrid(); updateBar(); },
          onDone: (hasil) => {
            cart.clear();
            renderGrid();
            updateBar();
            showSuccess(hasil);
          },
        })
      );

      renderGrid();
    },
  });
}

function quickCash(t) {
  return [...new Set([t, Math.ceil(t / 10000) * 10000, Math.ceil(t / 50000) * 50000, Math.ceil(t / 100000) * 100000])];
}

function openCheckout(cart, { onChange, onDone }) {
  const lines = () =>
    [...cart].map(([id, qty]) => {
      const it = getById('item', id);
      return { itemId: id, nama: it.nama, satuan: it.satuan, qty, harga: it.hargaJual };
    });
  const total = () => lines().reduce((s, l) => s + l.qty * l.harga, 0);

  openSheet({
    title: 'Pembayaran',
    body: `
      <form class="form" novalidate>
        <div class="lines"></div>
        <div class="total-box"><span>Total</span><strong data-total>Rp 0</strong></div>
        ${moneyField('diterima', 'Uang dari pembeli')}
        <div class="options quick-cash"></div>
        <div class="hint"><span data-change-label>Kembalian</span><strong data-change>Rp 0</strong></div>
        ${akunField()}
        ${submitButton('Selesai')}
      </form>`,
    onMount(body, close) {
      const form = body.querySelector('form');
      const f = form.elements;
      const linesEl = form.querySelector('.lines');
      const quickEl = form.querySelector('.quick-cash');
      bindFields(form);

      const updateChange = () => {
        const diterima = parseMoney(f.diterima.value) || total();
        const selisih = diterima - total();
        form.querySelector('[data-change-label]').textContent = selisih < 0 ? 'Kurang' : 'Kembalian';
        const el = form.querySelector('[data-change]');
        el.textContent = rupiah(Math.abs(selisih));
        el.className = selisih < 0 ? 'amount-out' : 'amount-in';
      };

      const render = () => {
        const ls = lines();
        if (!ls.length) { close(); return; }

        linesEl.innerHTML = ls.map((l) => `
          <div class="line">
            <div class="line-top">
              <strong>${esc(l.nama)}</strong>
              <span class="line-sub">${rupiah(l.qty * l.harga)}</span>
            </div>
            <div class="line-bottom">
              <span class="line-unit">${rupiah(l.harga)} / ${esc(l.satuan)}</span>
              <div class="stepper">
                <button type="button" data-dec="${l.itemId}"><span class="icon">${l.qty === 1 ? 'delete' : 'remove'}</span></button>
                <span>${l.qty}</span>
                <button type="button" data-inc="${l.itemId}"><span class="icon">add</span></button>
              </div>
            </div>
            ${stokWarning('penjualan', l)}
          </div>`).join('');

        const t = total();
        form.querySelector('[data-total]').textContent = rupiah(t);
        quickEl.innerHTML = quickCash(t).map((v, i) => `
          <button type="button" class="opt" data-cash="${v}">${i === 0 ? 'Uang pas' : 'Rp ' + rupiahSingkat(v)}</button>
        `).join('');
        updateChange();
      };

      linesEl.addEventListener('click', (e) => {
        const inc = e.target.closest('[data-inc]');
        const dec = e.target.closest('[data-dec]');
        if (inc) cart.set(inc.dataset.inc, cart.get(inc.dataset.inc) + 1);
        if (dec) {
          const id = dec.dataset.dec;
          const q = cart.get(id) - 1;
          q > 0 ? cart.set(id, q) : cart.delete(id);
        }
        if (inc || dec) { render(); onChange(); }
      });

      quickEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cash]');
        if (!b) return;
        quickEl.querySelectorAll('.opt').forEach((o) => o.classList.toggle('active', o === b));
        setMoney(f.diterima, +b.dataset.cash);
        updateChange();
      });

      f.diterima.addEventListener('input', () => {
        quickEl.querySelectorAll('.opt').forEach((o) => o.classList.remove('active'));
        updateChange();
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const t = total();
        const diterima = parseMoney(f.diterima.value) || t;
        if (diterima < t) return invalid(f.diterima, `Uangnya kurang ${rupiah(t - diterima)}. Total belanja ${rupiah(t)}.`);

        add('transaksi', {
          jenis: 'penjualan',
          items: lines().map(({ itemId, nama, qty, harga }) => ({ itemId, nama, qty, harga })),
          total: t,
          dibayar: t,
          akunId: f.akunId.value,
          tanggal: toDateKey(),
          catatan: 'POS',
        });
        close();
        onDone({ total: t, kembalian: diterima - t });
      });

      render();
    },
  });
}

function showSuccess({ total, kembalian }) {
  openSheet({
    title: '',
    body: `
      <div class="success">
        <div class="success-check">
          <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg>
        </div>
        <h3>Jualan tersimpan</h3>
        <p>${rupiah(total)}</p>
        ${kembalian ? `<div class="hint"><span>Kembalian</span><strong class="amount-in">${rupiah(kembalian)}</strong></div>` : ''}
        <button class="btn btn-primary pressable" data-ok>Jualan Baru</button>
      </div>`,
    onMount(body, close) {
      body.querySelector('[data-ok]').addEventListener('click', close);
    },
  });
}