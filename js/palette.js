// Color helpers + "match colors from the cover art" extraction.

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** black or white, whichever reads better on the given color */
export function contrastText(hex) {
  return luminance(hex) > 0.35 ? '#181512' : '#f6f2ea';
}

export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}

function saturation([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Extract a {bg, text, accent} palette from an image data-URL.
 * Down-samples the image, buckets colors, picks the most common as background
 * and the most vivid distinct color as accent.
 */
export function extractPalette(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = new Map(); // key -> {count, r,g,b sums}
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          let bkt = buckets.get(key);
          if (!bkt) buckets.set(key, bkt = { n: 0, r: 0, g: 0, b: 0 });
          bkt.n++; bkt.r += r; bkt.g += g; bkt.b += b;
        }
        const list = [...buckets.values()]
          .map(b => ({ n: b.n, rgb: [b.r / b.n, b.g / b.n, b.b / b.n] }))
          .sort((a, b) => b.n - a.n);
        if (!list.length) throw new Error('empty image');

        const bg = rgbToHex(list[0].rgb);

        // accent: among the most common buckets, maximize vividness × presence,
        // and insist on some distance from the background color.
        const bgRgb = list[0].rgb;
        const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        let accent = null, bestScore = -1;
        for (const c of list.slice(0, 24)) {
          const d = dist(c.rgb, bgRgb);
          if (d < 60) continue;
          const score = saturation(c.rgb) * Math.sqrt(c.n) * (0.5 + d / 441);
          if (score > bestScore) { bestScore = score; accent = c.rgb; }
        }
        const accentHex = accent ? rgbToHex(accent) : contrastText(bg);

        resolve({ bg, text: contrastText(bg), accent: accentHex });
      } catch (err) { reject(err); }
    };
    img.onerror = () => reject(new Error('could not load image'));
    img.src = dataUrl;
  });
}
