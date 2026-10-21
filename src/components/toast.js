let timer;

// toast('Pesan', 'icon', { action: { label: 'Urungkan', onClick }, duration })
export function toast(message, icon = 'info', { action, duration } = {}) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="icon">${icon}</span><span class="toast-msg"></span>`;
  el.querySelector('.toast-msg').textContent = message;

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      clearTimeout(timer);
      el.classList.remove('show');
      action.onClick();
    }, { once: true });
    el.appendChild(btn);
  }
  el.classList.toggle('has-action', !!action);

  el.classList.remove('show');
  void el.offsetWidth; // restart animasi
  el.classList.add('show');

  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), duration ?? (action ? 6000 : 2200));
}
