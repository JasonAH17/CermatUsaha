const routes = [];
let cleanup = null;
let depth = 0; // jumlah perpindahan halaman di dalam aplikasi

export function route(path, page) {
  const keys = [];
  const pattern = path.replace(/:(\w+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  routes.push({ re: new RegExp(`^${pattern}$`), keys, page });
}

export const navigate = (path) => { location.hash = path; };
export const isKnownRoute = (path) => routes.some((r) => r.re.test(path));

// Kembali ke halaman sebelumnya; kalau halaman dibuka langsung, ke halaman cadangan
export function goBack(fallback = '/beranda') {
  if (depth > 0) history.back();
  else navigate(fallback);
}

function match(path) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { page: r.page, params };
    }
  }
  return { page: routes[0].page, params: {} };
}

let rerender = null;
export const refresh = () => rerender?.();

// guard(path) boleh mengembalikan path lain, misalnya ke halaman Masuk bila belum login
export function startRouter(outlet, onChange, guard) {
  const render = () => {
    cleanup?.();
    cleanup = null;

    let path = location.hash.slice(1) || '/beranda';
    const redirect = guard?.(path);
    if (redirect && redirect !== path) {
      path = redirect;
      history.replaceState(null, '', `#${path}`);
    }
    const { page, params } = match(path);

    const view = document.createElement('section');
    view.className = 'view enter';
    view.innerHTML = page.render(params);

    outlet.replaceChildren(view);
    const result = page.mount?.(view, params);
    if (typeof result === 'function') cleanup = result;

    window.scrollTo(0, 0);
    onChange?.(path);
  };

  rerender = render;
  window.addEventListener('hashchange', () => { depth++; render(); });
  render();
}
