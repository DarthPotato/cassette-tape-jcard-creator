// PNG / print / JSON export.
//
// PNG path: render the card SVG with fonts embedded as data-URL @font-face
// rules (an SVG drawn to a canvas is an isolated document — it can't see the
// page's fonts), rasterize at the requested DPI, then patch a pHYs chunk into
// the PNG so image editors and print dialogs know its true physical size.

import { renderJCard, CARD } from './jcard.js';
import { FONTS } from './state.js';
import { download, slug, toast } from './util.js';

/* ---------- font embedding ---------- */

const fontCache = new Map(); // filename -> base64 data URL

async function fontFileAsDataUrl(file) {
  if (fontCache.has(file)) return fontCache.get(file);
  const res = await fetch(`fonts/${file}`);
  if (!res.ok) throw new Error(`font fetch failed: ${file}`);
  const buf = await res.arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const url = `data:font/woff2;base64,${btoa(bin)}`;
  fontCache.set(file, url);
  return url;
}

async function embeddedFontCSS(fontKey) {
  const font = FONTS[fontKey];
  if (!font || !font.files.length) return ''; // system font — nothing to embed
  const family = font.css.match(/'([^']+)'/)?.[1];
  if (!family) return '';
  const rules = await Promise.all(font.files.map(async file => {
    const weight = file.includes('-700-') ? 700 : 400;
    const src = await fontFileAsDataUrl(file);
    return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;src:url('${src}') format('woff2');}`;
  }));
  return rules.join('');
}

/* ---------- PNG DPI (pHYs chunk) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** insert a pHYs chunk right after IHDR so the PNG carries its physical size */
function withDpi(pngBuffer, dpi) {
  const src = new Uint8Array(pngBuffer);
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21); // 4 len + 4 type + 9 data + 4 crc
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));

  const ihdrEnd = 33; // 8 sig + 25 IHDR
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, ihdrEnd));
  out.set(chunk, ihdrEnd);
  out.set(src.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

/* ---------- PNG export ---------- */

export async function exportPNG(state, { dpi = 300, cropMarks = false } = {}) {
  const margin = cropMarks ? 3 : 0;
  const mmW = CARD.W + margin * 2;
  const mmH = CARD.H + margin * 2;
  const pxW = Math.round((mmW / 25.4) * dpi);
  const pxH = Math.round((mmH / 25.4) * dpi);

  let fontCSS = '';
  try {
    fontCSS = await embeddedFontCSS(state.design.font);
  } catch {
    toast('Could not embed the font — exporting with a fallback typeface.');
  }

  const svg = renderJCard(state, {
    pxWidth: pxW, pxHeight: pxH, margin, fontCSS,
    placeholders: false, idPrefix: 'jx',
  });

  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('SVG rasterization failed'));
      im.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.drawImage(img, 0, 0, pxW, pxH);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
    const withMeta = withDpi(await blob.arrayBuffer(), dpi);
    download(new Blob([withMeta], { type: 'image/png' }), `${slug(state.album || state.artist)}-jcard-${dpi}dpi.png`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/* ---------- print ---------- */

export function printCard(state) {
  const area = document.getElementById('print-area');
  area.innerHTML = renderJCard(state, { placeholders: false, idPrefix: 'jp' });
  const cleanup = () => { area.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

/* ---------- design file save/load ---------- */

export function saveDesign(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  download(blob, `${slug(state.album || state.artist)}-jcard-design.json`);
}

export function readDesignFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try { resolve(JSON.parse(fr.result)); }
      catch { reject(new Error('That file is not a valid design JSON.')); }
    };
    fr.onerror = () => reject(new Error('Could not read the file.'));
    fr.readAsText(file);
  });
}
