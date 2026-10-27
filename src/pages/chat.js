import '../styles/ai.css';
import { getProfil, getById, add, update } from '../data/store.js';
import { buildContext } from '../data/aiContext.js';
import { askAI, aiStatus } from '../utils/ai.js';
import { siapkanLampiran, ACCEPT_LAMPIRAN } from '../utils/attachment.js';
import { esc } from '../components/fields.js';
import { toast } from '../components/toast.js';

const SUGGESTIONS = [
  { icon: 'monitoring', q: 'Bagaimana kondisi keuangan usaha saya bulan ini?' },
  { icon: 'trending_down', q: 'Kenapa untung saya terasa tipis?' },
  { icon: 'inventory', q: 'Stok apa yang perlu dibeli lagi?' },
  { icon: 'star', q: 'Barang mana yang paling menguntungkan?' },
];

const IKON_FILE = { foto: 'image', pdf: 'picture_as_pdf', excel: 'table_view', word: 'description' };
const TANYA_FILE = 'Tolong ringkas isi file ini dan beri saran untuk usaha saya.';

let aktifId = null; // percakapan yang sedang dibuka, diingat saat pindah halaman
let pendingQuestion = null;

export const askLater = (q) => { pendingQuestion = q; aktifId = null; };

function md(text) {
  const inline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])[*_](?!\s)([^*_]+?)[*_](?=[\s.,!?)]|$)/g, '$1<em>$2</em>');
  let html = '';
  let list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };

  esc(text).split('\n').forEach((raw) => {
    const line = raw.trim();
    const ul = line.match(/^[-*•]\s+(.*)/);
    const ol = line.match(/^\d+[.)]\s+(.*)/);

    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (list !== tag) { closeList(); html += `<${tag}>`; list = tag; }
      html += `<li>${inline((ul || ol)[1])}</li>`;
      return;
    }

    closeList();
    if (!line) return;
    const h = line.match(/^#{1,4}\s+(.*)/);
    html += h ? `<p class="md-h">${inline(h[1])}</p>` : `<p>${inline(line)}</p>`;
  });

  closeList();
  return html;
}

const AVATAR = '<span class="ai-avatar sm"><span class="icon fill">auto_awesome</span></span>';

const filePill = (l) => `<span class="file-pill"><span class="icon">${IKON_FILE[l.jenis] || 'attach_file'}</span>${esc(l.nama)}</span>`;

function bubble(m) {
  if (m.role === 'user') {
    return `<div class="msg user"><div class="bubble">${m.lampiran ? filePill(m.lampiran) : ''}${esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
  }
  if (m.error) {
    return `
      <div class="msg ai">
        ${AVATAR}
        <div class="bubble error">
          <p>${esc(m.content)}</p>
          <button type="button" class="retry" data-retry>Coba lagi</button>
        </div>
      </div>`;
  }
  return `<div class="msg ai">${AVATAR}<div class="bubble md">${md(m.content)}</div></div>`;
}

const NOTE = {
  live: 'Jawaban dibuat oleh Gemini (Google) dari ringkasan catatan usaha Anda. Cek lagi angka penting sebelum mengambil keputusan.',
  demo: 'Mode demo: jawaban disusun otomatis dari data di perangkat ini. Cek lagi angka penting sebelum mengambil keputusan.',
};

function welcome() {
  return `
    <div class="welcome">
      <span class="ai-avatar lg"><span class="icon fill">auto_awesome</span></span>
      <h2>Halo, ${esc(getProfil().namaUsaha)}!</h2>
      <p>Saya Cermat AI. Tanya soal untung, uang kas, atau stok barang Anda. Bisa juga kirim file laporan (PDF, Excel, Word, atau foto) lewat tombol <span class="icon sm">attach_file</span>.</p>
      <div class="suggest">
        <small>Coba tanyakan:</small>
        ${SUGGESTIONS.map((s) => `
          <button type="button" class="suggest-chip" data-q="${esc(s.q)}">
            <span class="icon">${s.icon}</span><span>${esc(s.q)}</span>
          </button>`).join('')}
      </div>
      <p class="chat-note"><span class="icon sm">info</span><span data-ai-note>${NOTE.demo}</span></p>
    </div>`;
}

export const chat = {
  render() {
    return `
      <header class="page-header ai-top">
        <span class="ai-avatar"><span class="icon fill">auto_awesome</span></span>
        <span class="titles">
          <h1>Cermat AI</h1>
          <small><span class="ai-dot"></span><span data-ai-mode>Konsultan keuangan usaha Anda</span></small>
        </span>
        <a class="icon-btn sm pressable" href="#/riwayat/ai" aria-label="Riwayat percakapan"><span class="icon">history</span></a>
        <button class="icon-btn sm pressable" data-clear aria-label="Percakapan baru"><span class="icon">edit_square</span></button>
      </header>

      <div class="chat"></div>

      <form class="chat-dock" novalidate>
        <div class="attach-chip" hidden></div>
        <div class="dock-row">
          <button type="button" class="attach-btn" data-attach aria-label="Lampirkan file"><span class="icon">attach_file</span></button>
          <textarea rows="1" maxlength="1000" placeholder="Tulis pertanyaan Anda..." data-input aria-label="Pertanyaan untuk Cermat AI"></textarea>
          <button type="submit" class="send pressable" aria-label="Kirim" disabled><span class="icon">arrow_upward</span></button>
        </div>
        <input type="file" accept="${ACCEPT_LAMPIRAN}" data-file hidden>
      </form>
    `;
  },

  mount(view, { id } = {}) {
    if (id === 'baru') {
      aktifId = null;
      history.replaceState(null, '', '#/chat'); // supaya Back tidak membuka percakapan kosong lagi
    } else if (id) {
      aktifId = getById('percakapan', id) ? id : null;
    }

    const chatEl = view.querySelector('.chat');
    const form = view.querySelector('.chat-dock');
    const input = view.querySelector('[data-input]');
    const sendBtn = form.querySelector('.send');
    const chip = form.querySelector('.attach-chip');
    const fileInput = form.querySelector('[data-file]');
    const pesan = [...(getById('percakapan', aktifId)?.pesan || [])]; // + gelembung error sementara
    let lampiran = null; // file siap kirim
    let busy = false;
    let menyiapkan = false;

    const scrollBottom = () =>
      requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

    // Status Cermat AI: Gemini atau mode demo
    const showMode = ({ ready }) => {
      view.querySelector('[data-ai-mode]').textContent = ready ? 'Konsultan keuangan · online' : 'Konsultan keuangan · mode demo';
      view.querySelector('.ai-dot').classList.toggle('demo', !ready);
      const note = view.querySelector('[data-ai-note]');
      if (note) note.textContent = ready ? NOTE.live : NOTE.demo;
    };

    const renderAll = () => {
      chatEl.innerHTML = pesan.length ? pesan.map(bubble).join('') : welcome();
      if (pesan.length) scrollBottom();
      aiStatus().then(showMode);
    };

    const append = (m) => {
      chatEl.insertAdjacentHTML('beforeend', bubble(m));
      scrollBottom();
    };
    const showTyping = () => {
      chatEl.insertAdjacentHTML('beforeend',
        `<div class="msg ai" data-typing>${AVATAR}<div class="bubble typing"><span></span><span></span><span></span></div></div>`);
      scrollBottom();
    };
    const hideTyping = () => chatEl.querySelector('[data-typing]')?.remove();

    const autosize = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    };
    // Tombol kirim aktif kalau ada pertanyaan atau file, dan Cermat AI sedang tidak menjawab
    const syncSend = () => { sendBtn.disabled = busy || menyiapkan || (!input.value.trim() && !lampiran); };

    const showChip = () => {
      chip.hidden = !lampiran && !menyiapkan;
      chip.innerHTML = menyiapkan
        ? '<span class="icon">hourglass_top</span><span class="grow">Menyiapkan file...</span>'
        : lampiran
          ? `<span class="icon">${IKON_FILE[lampiran.jenis]}</span><span class="grow">${esc(lampiran.nama)}</span>
             <button type="button" data-unattach aria-label="Batalkan lampiran"><span class="icon">close</span></button>`
          : '';
      syncSend();
    };

    // Simpan percakapan (tanpa gelembung error dan tanpa isi file)
    const simpan = () => {
      const bersih = pesan.filter((m) => !m.error).map(({ role, content, lampiran: l }) => (l ? { role, content, lampiran: l } : { role, content }));
      const now = new Date().toISOString();
      if (aktifId && getById('percakapan', aktifId)) {
        update('percakapan', aktifId, { pesan: bersih, diubah: now });
      } else {
        const pertama = bersih.find((m) => m.role === 'user');
        const judul = pertama?.content === TANYA_FILE && pertama.lampiran ? `File: ${pertama.lampiran.nama}` : pertama?.content || 'Percakapan';
        aktifId = add('percakapan', { judul: judul.length > 60 ? `${judul.slice(0, 57)}...` : judul, pesan: bersih, dibuat: now, diubah: now }).id;
      }
    };

    async function send(text, file = lampiran) {
      const q = text.trim() || (file ? TANYA_FILE : '');
      if (!q || busy) return;
      if (!pesan.length) chatEl.innerHTML = '';

      const userMsg = { role: 'user', content: q, ...(file ? { lampiran: { nama: file.nama, jenis: file.jenis } } : {}) };
      pesan.push(userMsg);
      append(userMsg);

      input.value = '';
      lampiran = null;
      autosize();
      showChip();
      busy = true;
      syncSend();
      showTyping();

      try {
        const messages = pesan.filter((m) => !m.error).slice(-8).map(({ role, content }) => ({ role, content }));
        while (messages.length && messages[0].role !== 'user') messages.shift();

        const answer = await askAI({ context: buildContext(), messages, attachment: file });
        hideTyping();
        const m = { role: 'assistant', content: answer || 'Maaf, saya belum bisa menjawab. Coba ulangi pertanyaannya.' };
        pesan.push(m);
        append(m);
        simpan();
      } catch (err) {
        hideTyping();
        const m = { role: 'assistant', error: true, content: err.message || 'Gagal terhubung ke AI.', ulang: file };
        pesan.push(m);
        append(m);
      } finally {
        busy = false;
        syncSend();
      }
    }

    view.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (q) return send(q.dataset.q, null);

      if (e.target.closest('[data-retry]')) {
        const gagal = pesan.pop();
        const lastUser = pesan.pop();
        chatEl.lastElementChild?.remove();
        chatEl.lastElementChild?.remove();
        if (lastUser) send(lastUser.content, gagal?.ulang || null);
        return;
      }

      if (e.target.closest('[data-clear]')) {
        if (busy) return;
        aktifId = null;
        pesan.length = 0;
        lampiran = null;
        showChip();
        renderAll();
      }

      if (e.target.closest('[data-attach]') && !busy) fileInput.click();
      if (e.target.closest('[data-unattach]')) { lampiran = null; showChip(); }
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      menyiapkan = true;
      showChip();
      try {
        lampiran = await siapkanLampiran(file);
        input.focus();
      } catch (err) {
        lampiran = null;
        toast(err.message || 'File tidak bisa dibaca', 'error');
      } finally {
        menyiapkan = false;
        showChip();
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      send(input.value);
    });

    input.addEventListener('input', () => { autosize(); syncSend(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(input.value);
      }
    });

    renderAll();

    if (pendingQuestion) {
      const pq = pendingQuestion;
      pendingQuestion = null;
      send(pq, null);
    }
  },
};

