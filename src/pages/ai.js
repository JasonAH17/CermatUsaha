import '../styles/ai.css';
import { getProfil } from '../data/store.js';
import { SYSTEM_PROMPT, buildContext } from '../data/aiContext.js';
import { askAI, aiStatus } from '../utils/ai.js';
import { esc } from '../components/fields.js';

const SUGGESTIONS = [
  { icon: 'monitoring', q: 'Bagaimana kondisi keuangan usaha saya bulan ini?' },
  { icon: 'trending_down', q: 'Kenapa untung saya terasa tipis?' },
  { icon: 'person_alert', q: 'Siapa pelanggan yang perlu segera ditagih?' },
  { icon: 'star', q: 'Barang mana yang paling menguntungkan?' },
  { icon: 'inventory', q: 'Stok apa yang perlu dibeli lagi?' },
];

const history = [];
let pendingQuestion = null;

export const askLater = (q) => { pendingQuestion = q; };

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

function bubble(m) {
  if (m.role === 'user') {
    return `<div class="msg user"><div class="bubble">${esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
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

function welcome() {
  return `
    <div class="welcome">
      <span class="ai-avatar lg"><span class="icon fill">auto_awesome</span></span>
      <h2>Halo, ${esc(getProfil().namaUsaha)}!</h2>
      <p>Saya Cermat AI. Saya membaca catatan usaha Anda dan membantu menjawab soal untung, uang kas, stok, dan tagihan. Tanya saja pakai bahasa sehari-hari.</p>
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

const NOTE = {
  live: 'Jawaban dibuat oleh Gemini (Google) dari ringkasan catatan usaha Anda. Cek lagi angka penting sebelum mengambil keputusan.',
  demo: 'Mode demo: jawaban disusun otomatis dari data di perangkat ini. Cek lagi angka penting sebelum mengambil keputusan.',
};

export const ai = {
  render() {
    return `
      <header class="page-header ai-top">
        <span class="ai-avatar"><span class="icon fill">auto_awesome</span></span>
        <span class="titles">
          <h1>Cermat AI</h1>
          <small><span class="ai-dot"></span><span data-ai-mode>Konsultan keuangan usaha Anda</span></small>
        </span>
        <button class="icon-btn sm pressable" data-clear aria-label="Mulai percakapan baru">
          <span class="icon">edit_square</span>
        </button>
      </header>

      <div class="chat"></div>

      <form class="chat-dock" novalidate>
        <textarea rows="1" maxlength="1000" placeholder="Tulis pertanyaan Anda..." data-input aria-label="Pertanyaan untuk Cermat AI"></textarea>
        <button type="submit" class="send pressable" aria-label="Kirim" disabled><span class="icon">arrow_upward</span></button>
      </form>
    `;
  },

  mount(view) {
    const chat = view.querySelector('.chat');
    const form = view.querySelector('.chat-dock');
    const input = view.querySelector('[data-input]');
    const sendBtn = form.querySelector('.send');
    let busy = false;

    const scrollBottom = () =>
      requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

    // Tampilkan apakah Cermat AI sedang memakai Gemini atau mode demo
    const showMode = ({ ready }) => {
      view.querySelector('[data-ai-mode]').textContent = ready ? 'Konsultan keuangan · online' : 'Konsultan keuangan · mode demo';
      view.querySelector('.ai-dot').classList.toggle('demo', !ready);
      const note = view.querySelector('[data-ai-note]');
      if (note) note.textContent = ready ? NOTE.live : NOTE.demo;
    };

    const renderAll = () => {
      chat.innerHTML = history.length ? history.map(bubble).join('') : welcome();
      if (history.length) scrollBottom();
      aiStatus().then(showMode);
    };

    const append = (m) => {
      chat.insertAdjacentHTML('beforeend', bubble(m));
      scrollBottom();
    };

    const showTyping = () => {
      chat.insertAdjacentHTML('beforeend',
        `<div class="msg ai" data-typing>${AVATAR}<div class="bubble typing"><span></span><span></span><span></span></div></div>`);
      scrollBottom();
    };
    const hideTyping = () => chat.querySelector('[data-typing]')?.remove();

    const autosize = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    };

    async function send(text) {
      const q = text.trim();
      if (!q || busy) return;

      if (!history.length) chat.innerHTML = '';

      const userMsg = { role: 'user', content: q };
      history.push(userMsg);
      append(userMsg);

      input.value = '';
      autosize();
      busy = true;
      sendBtn.disabled = true;
      showTyping();

      try {
        const messages = history.filter((m) => !m.error).slice(-8).map(({ role, content }) => ({ role, content }));
        while (messages.length && messages[0].role !== 'user') messages.shift();

        const answer = await askAI({
          system: `${SYSTEM_PROMPT}\n\nDATA USAHA:\n${buildContext()}`,
          messages,
        });

        hideTyping();
        const m = { role: 'assistant', content: answer || 'Maaf, saya belum bisa menjawab. Coba ulangi pertanyaannya.' };
        history.push(m);
        append(m);
      } catch (err) {
        hideTyping();
        const m = { role: 'assistant', error: true, content: err.message || 'Gagal terhubung ke AI.' };
        history.push(m);
        append(m);
      } finally {
        busy = false;
        syncSend();
      }
    }

    view.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-q]');
      if (chip) return send(chip.dataset.q);

      if (e.target.closest('[data-retry]')) {
        history.pop();
        const lastUser = history.pop();
        chat.lastElementChild?.remove();
        chat.lastElementChild?.remove();
        if (lastUser) send(lastUser.content);
        return;
      }

      if (e.target.closest('[data-clear]')) {
        if (busy) return;
        history.length = 0;
        renderAll();
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      send(input.value);
    });

    // Tombol kirim hanya aktif kalau ada pertanyaan dan Cermat AI sedang tidak menjawab
    const syncSend = () => { sendBtn.disabled = busy || !input.value.trim(); };
    input.addEventListener('input', () => { autosize(); syncSend(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(input.value);
      }
    });

    renderAll();

    if (pendingQuestion) {
      const q = pendingQuestion;
      pendingQuestion = null;
      send(q);
    }
  },
};