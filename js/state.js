import { uid } from './util.js';

export const FONTS = {
  'inter':            { label: 'Inter (clean sans)',        css: `'Inter', sans-serif`,            files: ['inter-latin-400-normal.woff2', 'inter-latin-700-normal.woff2'] },
  'space-grotesk':    { label: 'Space Grotesk (modern)',    css: `'Space Grotesk', sans-serif`,    files: ['space-grotesk-latin-400-normal.woff2', 'space-grotesk-latin-700-normal.woff2'] },
  'oswald':           { label: 'Oswald (tall & condensed)', css: `'Oswald', sans-serif`,           files: ['oswald-latin-400-normal.woff2', 'oswald-latin-700-normal.woff2'] },
  'playfair-display': { label: 'Playfair Display (serif)',  css: `'Playfair Display', serif`,      files: ['playfair-display-latin-400-normal.woff2', 'playfair-display-latin-700-normal.woff2'] },
  'special-elite':    { label: 'Special Elite (typewriter)',css: `'Special Elite', cursive`,       files: ['special-elite-latin-400-normal.woff2'], noBold: true },
  'permanent-marker': { label: 'Permanent Marker (mixtape)',css: `'Permanent Marker', cursive`,    files: ['permanent-marker-latin-400-normal.woff2'], noBold: true },
  'courier-prime':    { label: 'Courier Prime (mono)',      css: `'Courier Prime', monospace`,     files: ['courier-prime-latin-400-normal.woff2', 'courier-prime-latin-700-normal.woff2'] },
  'helvetica':        { label: 'Helvetica / Arial (system)',css: `Helvetica, Arial, sans-serif`,   files: [] },
  'georgia':          { label: 'Georgia (system serif)',    css: `Georgia, 'Times New Roman', serif`, files: [] },
};

export const PRESETS = [
  { name: 'Cream',   bg: '#f6efdf', text: '#221f1a', accent: '#d64524' },
  { name: 'Chrome',  bg: '#141519', text: '#f2f0eb', accent: '#e33b3b' },
  { name: 'Ocean',   bg: '#0d3b4f', text: '#f4f1e8', accent: '#e8b93c' },
  { name: 'Sunset',  bg: '#2b1a3a', text: '#ffe9d6', accent: '#ff7a4d' },
  { name: 'Kraft',   bg: '#cfa96f', text: '#33241a', accent: '#8a2f1d' },
  { name: 'Mint',    bg: '#e2f0e5', text: '#173326', accent: '#2f8f5b' },
  { name: 'Salt',    bg: '#f4f4f2', text: '#1c1c1c', accent: '#3567c4' },
  { name: 'Noir',    bg: '#161210', text: '#e8e2d6', accent: '#c9a227' },
];

export function defaultState() {
  return {
    album: '',
    artist: '',
    year: '',
    noteLine: '',
    spineText: '',
    barcode: '', // EAN/UPC digits; blank = deterministic fake generated from artist+album
    tracks: [], // {id, title, duration(sec|null), side:'A'|'B'}
    cover: { dataUrl: null, srcUrl: null, w: 0, h: 0, zoom: 1, x: 0.5, y: 0.5, rot: 0 },
    // replica-mode scan layers: {id, dataUrl, srcUrl, w, h, region, zoom, x, y, rot}
    scans: [],
    design: {
      layout: 'classic',        // classic | fullbleed | minimal
      font: 'inter',
      bg: '#f6efdf',
      text: '#221f1a',
      accent: '#d64524',
      spineInvert: true,
      stripes: true,
      showBarcode: true,
      uppercase: false,
      showDurations: true,
      showFoldLines: true,
      showSideLabels: true,
    },
  };
}

const LS_KEY = 'jcard-creator-v1';

export function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return mergeState(JSON.parse(raw));
  } catch { return null; }
}

export function save(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
}

export function clearSaved() {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}

/** merge a parsed (possibly partial / older / foreign) object onto fresh defaults */
export function mergeState(obj) {
  const s = defaultState();
  if (!obj || typeof obj !== 'object') return s;
  for (const k of ['album', 'artist', 'year', 'noteLine', 'spineText', 'barcode']) {
    if (typeof obj[k] === 'string') s[k] = obj[k];
  }
  if (Array.isArray(obj.tracks)) {
    s.tracks = obj.tracks
      .filter(t => t && typeof t.title === 'string')
      .map(t => ({
        id: typeof t.id === 'string' ? t.id : uid(),
        title: t.title,
        duration: (isFinite(t.duration) && t.duration > 0) ? Math.round(t.duration) : null,
        side: t.side === 'B' ? 'B' : 'A',
      }));
  }
  const mergeArt = (target, c) => {
    if (typeof c.dataUrl === 'string' && c.dataUrl.startsWith('data:image/')) target.dataUrl = c.dataUrl;
    if (typeof c.srcUrl === 'string') target.srcUrl = c.srcUrl;
    if (isFinite(c.w)) target.w = c.w;
    if (isFinite(c.h)) target.h = c.h;
    if (isFinite(c.zoom)) target.zoom = Math.min(4, Math.max(0.25, c.zoom));
    if (isFinite(c.x)) target.x = Math.min(1, Math.max(0, c.x));
    if (isFinite(c.y)) target.y = Math.min(1, Math.max(0, c.y));
    if ([0, 90, 180, 270].includes(c.rot)) target.rot = c.rot;
    return target;
  };
  if (obj.cover && typeof obj.cover === 'object') mergeArt(s.cover, obj.cover);
  if (Array.isArray(obj.scans)) {
    s.scans = obj.scans
      .filter(sc => sc && typeof sc === 'object' && (typeof sc.dataUrl === 'string' || typeof sc.srcUrl === 'string'))
      .slice(0, 8)
      .map(sc => {
        const layer = mergeArt({ id: typeof sc.id === 'string' ? sc.id : uid(),
          dataUrl: null, srcUrl: null, w: 0, h: 0, zoom: 1, x: 0.5, y: 0.5, rot: 0, region: 'card' }, sc);
        if (['card', 'front', 'spine', 'back'].includes(sc.region)) layer.region = sc.region;
        return layer;
      });
  }
  if (obj.design && typeof obj.design === 'object') {
    const d = obj.design;
    if (['classic', 'fullbleed', 'minimal', 'replica'].includes(d.layout)) s.design.layout = d.layout;
    if (typeof d.font === 'string' && FONTS[d.font]) s.design.font = d.font;
    for (const k of ['bg', 'text', 'accent']) {
      if (typeof d[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(d[k])) s.design[k] = d[k].toLowerCase();
    }
    for (const k of ['spineInvert', 'stripes', 'showBarcode', 'uppercase', 'showDurations', 'showFoldLines', 'showSideLabels']) {
      if (typeof d[k] === 'boolean') s.design[k] = d[k];
    }
  }
  return s;
}

/** greedy in-order split of tracks across sides so runtimes balance */
export function autoBalance(state) {
  const tracks = state.tracks;
  if (!tracks.length) return;
  const haveDur = tracks.every(t => t.duration != null);
  if (!haveDur) {
    // fall back to a count split
    const half = Math.ceil(tracks.length / 2);
    tracks.forEach((t, i) => { t.side = i < half ? 'A' : 'B'; });
    return;
  }
  const total = tracks.reduce((a, t) => a + t.duration, 0);
  let best = { idx: tracks.length, diff: Infinity };
  let run = 0;
  for (let i = 0; i <= tracks.length; i++) {
    const diff = Math.abs(run - (total - run));
    if (diff < best.diff) best = { idx: i, diff };
    if (i < tracks.length) run += tracks[i].duration;
  }
  tracks.forEach((t, i) => { t.side = i < best.idx ? 'A' : 'B'; });
}

export function sideTracks(state, side) {
  return state.tracks.filter(t => t.side === side);
}

export function sideSeconds(state, side) {
  let sum = 0, missing = false;
  for (const t of sideTracks(state, side)) {
    if (t.duration == null) missing = true;
    else sum += t.duration;
  }
  return { sum, missing };
}
