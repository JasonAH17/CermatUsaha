export function BottomNav(items) {
  return `
    <nav class="bottom-nav" aria-label="Navigasi utama">
      ${items.map((i) => i.action
        ? `
        <button type="button" class="nav-item nav-add" data-nav-action="${i.action}" aria-label="${i.label}">
          <span class="icon">${i.icon}</span>
          <span>${i.label}</span>
        </button>`
        : `
        <a href="#${i.path}" class="nav-item" data-match="${[i.path, ...(i.also || [])].join(' ')}">
          <span class="icon">${i.icon}</span>
          <span>${i.label}</span>
        </a>`).join('')}
    </nav>
  `;
}

export function setActiveNav(path) {
  document.querySelectorAll('.nav-item[data-match]').forEach((a) => {
    const active = a.dataset.match.split(' ').some((p) => path === p || path.startsWith(`${p}/`));
    a.classList.toggle('active', active);
    a.toggleAttribute('aria-current', active);
  });
}
