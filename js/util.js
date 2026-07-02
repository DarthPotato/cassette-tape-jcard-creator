export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** seconds -> "m:ss"; null/NaN -> '' */
export function mmss(sec) {
  if (sec == null || !isFinite(sec) || sec <= 0) return '';
  sec = Math.round(sec);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** "m:ss" or "mm:ss" or plain seconds -> seconds (or null) */
export function parseDuration(text) {
  text = String(text || '').trim();
  if (!text) return null;
  const m = text.match(/^(\d+):([0-5]?\d)$/);
  if (m) return (+m[1]) * 60 + (+m[2]);
  const n = Number(text);
  return isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

let toastTimer;
export function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function uid() { return Math.random().toString(36).slice(2, 10); }

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** safe filename fragment */
export function slug(s) {
  return String(s || 'jcard').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'jcard';
}
