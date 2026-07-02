// Renders the J-card as an SVG string. All coordinates are millimetres:
// the SVG user unit == 1mm, so the exported card is dimensionally exact.
//
// Standard J-card, flat (top to bottom): back flap 25.4, spine 12.7, front 65.0.

import { FONTS } from './state.js';
import { esc, mmss, clamp } from './util.js';
import { contrastText, mix } from './palette.js';

export const CARD = { W: 101.6, BACK: 25.4, SPINE: 12.7, FRONT: 65.0, H: 103.1 };

/* ---------- text measurement (canvas-based, in mm) ---------- */

const K = 10; // measurement scale: px per mm
let _ctx = null;
function ctx() {
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
  return _ctx;
}

function measure(text, fs, family, weight = 400) {
  const c = ctx();
  c.font = `${weight} ${fs * K}px ${family}`;
  return c.measureText(text).width / K;
}

function truncate(text, fs, family, weight, maxW) {
  if (measure(text, fs, family, weight) <= maxW) return text;
  let t = String(text);
  while (t.length > 1 && measure(t.trimEnd() + '…', fs, family, weight) > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function wrap(text, fs, family, weight, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    if (!cur || measure(cand, fs, family, weight) <= maxW) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = truncate(lines.slice(maxLines - 1).join(' '), fs, family, weight, maxW);
    return { lines: kept, overflow: true };
  }
  return { lines: lines.length ? lines : [''], overflow: false };
}

/** shrink font size until the text wraps within maxLines */
function fitWrap(text, startFs, minFs, family, weight, maxW, maxLines) {
  let fs = startFs;
  while (fs > minFs) {
    const w = wrap(text, fs, family, weight, maxW, maxLines);
    if (!w.overflow) return { fs, lines: w.lines };
    fs -= 0.25;
  }
  return { fs: minFs, lines: wrap(text, minFs, family, weight, maxW, maxLines).lines };
}

/* ---------- small pieces ---------- */

function textEl(x, y, str, fs, opts = {}) {
  const a = [`x="${x.toFixed(2)}"`, `y="${y.toFixed(2)}"`, `font-size="${fs.toFixed(2)}"`];
  if (opts.weight && opts.weight !== 400) a.push(`font-weight="${opts.weight}"`);
  if (opts.fill) a.push(`fill="${opts.fill}"`);
  if (opts.anchor) a.push(`text-anchor="${opts.anchor}"`);
  if (opts.opacity != null) a.push(`opacity="${opts.opacity}"`);
  if (opts.spacing) a.push(`letter-spacing="${opts.spacing}"`);
  if (opts.italic) a.push(`font-style="italic"`);
  return `<text ${a.join(' ')}>${esc(str)}</text>`;
}

function artImage(cover, box, clipId) {
  const href = cover.dataUrl || cover.srcUrl;
  if (!href) return null;
  const iw = cover.w || 1000, ih = cover.h || 1000;
  const scale = Math.max(box.w / iw, box.h / ih) * (cover.zoom || 1);
  const dw = iw * scale, dh = ih * scale;
  const dx = box.x - (dw - box.w) * (cover.x ?? 0.5);
  const dy = box.y - (dh - box.h) * (cover.y ?? 0.5);
  return {
    defs: `<clipPath id="${clipId}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}"/></clipPath>`,
    body: `<image href="${esc(href)}" x="${dx.toFixed(2)}" y="${dy.toFixed(2)}" width="${dw.toFixed(2)}" height="${dh.toFixed(2)}" preserveAspectRatio="none" clip-path="url(#${clipId})"/>`,
  };
}

/** decorative cassette glyph used when there is no cover art */
function cassetteGlyph(x, y, w, color, bgColor) {
  const h = w * 0.64;
  const win = { x: x + w * 0.18, y: y + h * 0.28, w: w * 0.64, h: h * 0.3 };
  const r = win.h * 0.32;
  return `<g stroke="${color}" fill="none" stroke-width="${(w * 0.022).toFixed(2)}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.045}"/>
    <rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="${win.h / 2}"/>
    <circle cx="${win.x + win.w * 0.24}" cy="${win.y + win.h / 2}" r="${r}"/>
    <circle cx="${win.x + win.w * 0.76}" cy="${win.y + win.h / 2}" r="${r}"/>
    <path d="M ${x + w * 0.16} ${y + h} l ${w * 0.07} ${-h * 0.16} h ${w * 0.54} l ${w * 0.07} ${h * 0.16}" fill="${bgColor}"/>
  </g>`;
}

/* ---------- panels ---------- */

function renderBackFlap(state, o) {
  const { W, BACK } = CARD;
  const d = state.design;
  let out = `<rect x="0" y="0" width="${W}" height="${BACK}" fill="${d.bg}"/>`;

  const padX = 4, padTop = 2.6, padBottom = 2.0, gap = 6;
  const headerH = d.showSideLabels ? 3.6 : 0;
  const colW = (W - padX * 2 - gap) / 2;
  const avail = BACK - padTop - padBottom - headerH;
  const yTop = padTop + headerH;

  const A = state.tracks.filter(t => t.side === 'A');
  const B = state.tracks.filter(t => t.side === 'B');

  if (!A.length && !B.length) {
    if (o.placeholders) {
      out += textEl(W / 2, BACK / 2 + 1, 'track list appears here', 2.6, {
        fill: d.text, anchor: 'middle', opacity: 0.4, italic: true,
      });
    }
    return out;
  }

  const cols = [
    { tracks: A, x: padX, label: 'SIDE A' },
    { tracks: B, x: padX + colW + gap, label: 'SIDE B' },
  ];

  out += `<g clip-path="url(#${o.id}-backclip)">`;
  for (const col of cols) {
    if (d.showSideLabels) {
      out += textEl(col.x, padTop + 2.2, o.up(col.label), 2.2, {
        fill: d.accent, weight: o.bold, spacing: 0.18,
      });
    }
    const n = col.tracks.length;
    if (!n) continue;
    const lineH = clamp(avail / n, 1.9, 3.3);
    const fs = Math.min(2.5, lineH * 0.78);
    const numW = fs * (n >= 10 ? 1.9 : 1.3);
    col.tracks.forEach((t, i) => {
      const y = yTop + lineH * i + fs * 0.9;
      const durTxt = d.showDurations ? mmss(t.duration) : '';
      const durW = durTxt ? measure(durTxt, fs * 0.92, o.family) + 1.2 : 0;
      const titleMax = colW - numW - durW - 0.8;
      const title = truncate(t.title, fs, o.family, 400, titleMax);
      out += textEl(col.x + numW, y, `${i + 1}.`, fs * 0.92, { fill: d.text, anchor: 'end', opacity: 0.55 });
      out += textEl(col.x + numW + 0.9, y, title, fs, { fill: d.text });
      if (durTxt) out += textEl(col.x + colW, y, durTxt, fs * 0.92, { fill: d.text, anchor: 'end', opacity: 0.7 });
    });
  }
  out += `</g>`;
  return out;
}

function renderSpine(state, o) {
  const { W, BACK, SPINE } = CARD;
  const d = state.design;
  const y0 = BACK;
  const spineBg = d.spineInvert ? d.accent : d.bg;
  const spineText = d.spineInvert ? contrastText(d.accent) : d.text;

  let out = `<rect x="0" y="${y0}" width="${W}" height="${SPINE}" fill="${spineBg}"/>`;

  let x0 = 4;
  if (d.stripes) {
    const bars = [[0, 1.5, 0.95], [2.4, 1.5, 0.6], [4.8, 1.5, 0.3]];
    for (const [bx, bw, op] of bars) {
      out += `<rect x="${bx}" y="${y0}" width="${bw}" height="${SPINE}" fill="${spineText}" opacity="${op}"/>`;
    }
    x0 = 8.6;
  }

  const yearTxt = String(state.year || '').trim();
  const yearFs = 2.6;
  const yearW = yearTxt ? measure(yearTxt, yearFs, o.family, o.bold) + 2.5 : 0;

  let main = state.spineText.trim() ||
    [state.artist.trim(), state.album.trim()].filter(Boolean).join(' — ');
  if (!main && o.placeholders) main = 'spine · artist — album';
  main = o.up(main);

  const maxW = W - x0 - 4 - yearW;
  let fs = 3.7;
  while (fs > 2.1 && measure(main, fs, o.family, o.bold) > maxW) fs -= 0.15;
  main = truncate(main, fs, o.family, o.bold, maxW);

  const cy = y0 + SPINE / 2;
  out += textEl(x0, cy + fs * 0.36, main, fs, {
    fill: spineText, weight: o.bold, opacity: state.spineText || state.artist || state.album ? 1 : 0.45,
  });
  if (yearTxt) {
    out += textEl(W - 4, cy + yearFs * 0.36, yearTxt, yearFs, { fill: spineText, anchor: 'end', opacity: 0.85 });
  }
  return out;
}

function infoLine(state) {
  const bits = [];
  if (state.year.trim()) bits.push(state.year.trim());
  const n = state.tracks.length;
  if (n) bits.push(`${n} track${n === 1 ? '' : 's'}`);
  const secs = state.tracks.reduce((a, t) => a + (t.duration || 0), 0);
  if (secs > 0) bits.push(`${Math.round(secs / 60)} min`);
  return bits.join(' · ');
}

function renderFront(state, o) {
  const { W, FRONT, H } = CARD;
  const d = state.design;
  const y0 = CARD.BACK + CARD.SPINE;
  let out = '';
  let defs = '';

  const title = o.up(state.album.trim() || (o.placeholders ? 'Album Title' : ''));
  const artist = o.up(state.artist.trim() || (o.placeholders ? 'Artist' : ''));
  const ghost = !state.album.trim() && !state.artist.trim();
  const note = state.noteLine.trim();
  const info = infoLine(state);

  /* ----- full bleed ----- */
  if (d.layout === 'fullbleed') {
    const hasArt = !!(state.cover.dataUrl || state.cover.srcUrl);
    if (hasArt) {
      out += `<rect x="0" y="${y0}" width="${W}" height="${FRONT}" fill="${d.bg}"/>`;
      const img = artImage(state.cover, { x: 0, y: y0, w: W, h: FRONT }, `${o.id}-frontart`);
      defs += img.defs;
      out += img.body;
      defs += `<linearGradient id="${o.id}-scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.82"/>
      </linearGradient>`;
      out += `<rect x="0" y="${H - 30}" width="${W}" height="30" fill="url(#${o.id}-scrim)"/>`;
    } else {
      out += `<rect x="0" y="${y0}" width="${W}" height="${FRONT}" fill="${d.accent}"/>`;
      out += cassetteGlyph(W / 2 - 14, y0 + 12, 28, `${contrastText(d.accent)}`, 'none');
    }
    const fg = hasArt ? '#ffffff' : contrastText(d.accent);
    const pad = 5;
    const t = fitWrap(title, 5.6, 3.4, o.family, o.bold, W - pad * 2, 3);
    const artistFs = 3.3;
    const artistLine = [artist, state.year.trim()].filter(Boolean).join(' · ');
    let y = H - pad - (artistLine ? artistFs + 1.6 : 0) - (note ? 2.4 + 1.2 : 0);
    // title lines, stacked upward from y
    const titleBlockH = t.lines.length * t.fs * 1.12;
    let ty = y - titleBlockH + t.fs;
    for (const line of t.lines) {
      out += textEl(pad, ty, line, t.fs, { fill: fg, weight: o.bold, opacity: ghost ? 0.5 : 1 });
      ty += t.fs * 1.12;
    }
    if (artistLine) out += textEl(pad, y + artistFs, artistLine, artistFs, { fill: fg, opacity: ghost ? 0.5 : 0.92 });
    if (note) out += textEl(pad, H - pad + 1.2, note, 2.4, { fill: fg, opacity: 0.75 });
    return { body: out, defs };
  }

  /* ----- shared front background ----- */
  out += `<rect x="0" y="${y0}" width="${W}" height="${FRONT}" fill="${d.bg}"/>`;
  let bandOffset = 0;
  if (d.stripes) {
    const bars = [[0, 1.1, 1], [1.1, 1.1, 0.55], [2.2, 1.1, 0.25]];
    for (const [by, bh, op] of bars) {
      out += `<rect x="0" y="${y0 + by}" width="${W}" height="${bh}" fill="${d.accent}" opacity="${op}"/>`;
    }
    bandOffset = 4.2;
  }

  /* ----- minimal ----- */
  if (d.layout === 'minimal') {
    const cx = W / 2;
    const maxW = W - 16;
    const t = fitWrap(title, 6.4, 3.6, o.family, o.bold, maxW, 4);
    const blockH = t.lines.length * t.fs * 1.16;
    let ty = y0 + bandOffset + (FRONT - bandOffset) * 0.42 - blockH / 2 + t.fs * 0.8;
    for (const line of t.lines) {
      out += textEl(cx, ty, line, t.fs, { fill: d.text, weight: o.bold, anchor: 'middle', opacity: ghost ? 0.4 : 1 });
      ty += t.fs * 1.16;
    }
    // accent rule
    out += `<rect x="${cx - 9}" y="${(ty - t.fs * 0.4).toFixed(2)}" width="18" height="0.9" fill="${d.accent}"/>`;
    if (artist) {
      out += textEl(cx, ty + 4.4, artist, 3.7, { fill: d.text, anchor: 'middle', opacity: ghost ? 0.4 : 0.9 });
    }
    if (info) out += textEl(cx, ty + 9.2, info, 2.5, { fill: d.text, anchor: 'middle', opacity: 0.6 });
    if (note) out += textEl(cx, H - 4.4, note, 2.5, { fill: d.text, anchor: 'middle', opacity: 0.65 });
    return { body: out, defs };
  }

  /* ----- classic: square art left, text right ----- */
  const pad = 4.5;
  const artY = y0 + bandOffset + pad;
  const artSize = Math.min(53, H - 4.5 - artY);
  const box = { x: pad, y: artY, w: artSize, h: artSize };
  const hasArt = !!(state.cover.dataUrl || state.cover.srcUrl);
  if (hasArt) {
    const img = artImage(state.cover, box, `${o.id}-frontart`);
    defs += img.defs;
    out += img.body;
    out += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="${d.text}" stroke-opacity="0.25" stroke-width="0.25"/>`;
  } else {
    out += `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${mix(d.accent, d.bg, 0.85)}" stroke="${d.accent}" stroke-width="0.35"/>`;
    out += cassetteGlyph(box.x + box.w * 0.2, box.y + box.h * 0.3, box.w * 0.6, d.accent, 'none');
  }

  const tx = pad + artSize + 4.5;
  const tw = W - tx - pad;
  const t = fitWrap(title, 5.0, 3.0, o.family, o.bold, tw, 4);
  let ty = artY + 1.2 + t.fs;
  for (const line of t.lines) {
    out += textEl(tx, ty, line, t.fs, { fill: d.text, weight: o.bold, opacity: ghost ? 0.4 : 1 });
    ty += t.fs * 1.14;
  }
  if (artist) {
    const a = fitWrap(artist, 3.4, 2.4, o.family, 400, tw, 2);
    ty += 0.6;
    for (const line of a.lines) {
      out += textEl(tx, ty, line, a.fs, { fill: d.accent, weight: o.bold, opacity: ghost ? 0.5 : 1 });
      ty += a.fs * 1.2;
    }
  }
  // bottom-anchored small print
  let by = box.y + box.h - 0.6;
  if (note) {
    out += textEl(tx, by, truncate(note, 2.4, o.family, 400, tw), 2.4, { fill: d.text, opacity: 0.65 });
    by -= 3.4;
  }
  if (info) {
    out += textEl(tx, by, truncate(info, 2.4, o.family, 400, tw), 2.4, { fill: d.text, opacity: 0.65 });
  }
  return { body: out, defs };
}

/* ---------- main ---------- */

/**
 * @param {object} state  app state
 * @param {object} opts   { pxWidth, pxHeight, margin (mm), fontCSS, placeholders, idPrefix }
 */
export function renderJCard(state, opts = {}) {
  const { W, H, BACK, SPINE } = CARD;
  const d = state.design;
  const font = FONTS[d.font] || FONTS.inter;
  const o = {
    id: opts.idPrefix || 'jc',
    family: font.css,
    bold: font.noBold ? 400 : 700,
    up: s => (d.uppercase ? String(s).toUpperCase() : s),
    placeholders: opts.placeholders !== false,
  };

  const m = opts.margin || 0;
  let defs = `<clipPath id="${o.id}-backclip"><rect x="0" y="0" width="${W}" height="${BACK}"/></clipPath>
    <clipPath id="${o.id}-cardclip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>`;

  let body = renderBackFlap(state, o);
  body += renderSpine(state, o);
  const front = renderFront(state, o);
  body += front.body;
  defs += front.defs;

  if (d.showFoldLines) {
    const stroke = mix(d.text, d.bg, 0.45);
    for (const y of [BACK, BACK + SPINE]) {
      body += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${stroke}" stroke-width="0.16" stroke-dasharray="1.7 1.2" opacity="0.85"/>`;
    }
  }

  // hairline card edge so light backgrounds read on screen & guide scissors in print
  body += `<rect x="0.08" y="0.08" width="${W - 0.16}" height="${H - 0.16}" fill="none" stroke="${mix(d.text, d.bg, 0.35)}" stroke-width="0.16" opacity="0.9"/>`;

  let marks = '';
  if (m > 0) {
    const mk = (x1, y1, x2, y2) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="0.2"/>`;
    const g = 0.8; // gap between mark and trim edge
    marks =
      // corner crop marks
      mk(-m, 0, -g, 0) + mk(0, -m, 0, -g) +
      mk(W + g, 0, W + m, 0) + mk(W, -m, W, -g) +
      mk(-m, H, -g, H) + mk(0, H + g, 0, H + m) +
      mk(W + g, H, W + m, H) + mk(W, H + g, W, H + m) +
      // fold ticks
      mk(-m, BACK, -g, BACK) + mk(W + g, BACK, W + m, BACK) +
      mk(-m, BACK + SPINE, -g, BACK + SPINE) + mk(W + g, BACK + SPINE, W + m, BACK + SPINE);
  }

  const sizeAttrs = opts.pxWidth
    ? `width="${opts.pxWidth}" height="${opts.pxHeight}"`
    : '';
  const styleTag = opts.fontCSS ? `<style>${opts.fontCSS}</style>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${W + 2 * m} ${H + 2 * m}" ${sizeAttrs} font-family="${esc(o.family)}" text-rendering="optimizeLegibility">
  ${styleTag}
  <defs>${defs}</defs>
  ${m > 0 ? `<rect x="${-m}" y="${-m}" width="${W + 2 * m}" height="${H + 2 * m}" fill="#ffffff"/>` : ''}
  <g clip-path="url(#${o.id}-cardclip)">${body}</g>
  ${marks}
</svg>`;
}
