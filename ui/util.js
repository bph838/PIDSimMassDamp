// Small DOM and formatting helpers shared by the UI modules.

export const $ = (id) => document.getElementById(id);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Number with a real minus sign, e.g. −5.0 */
export const signed = (v, digits = 1) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(digits);
