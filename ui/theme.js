// Theme colours, read from the CSS custom properties in style.css.
// `T` is a live object: call readTheme() again when the OS theme changes.

export const T = {};
const KEYS = ['ink', 'ink-2', 'muted', 'grid', 'axis', 'surface', 'surface-2',
  's1', 's2', 's3', 's4', 's5', 'serious', 'band', 'fuselage'];

/** Colour slot used by each of the 4 pinned runs. */
export const PIN_SLOTS = ['s2', 's3', 's4', 's5'];

export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of KEYS) T[k] = cs.getPropertyValue('--' + k).trim();
}

export function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function onThemeChange(fn) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); fn(); });
}
