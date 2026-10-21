export function countUp(el, to, format = (n) => n, duration = 900) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(Math.round(to * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}