// Album metadata + cover art, all from free key-less sources:
//   - iTunes Search API (JSONP, so CORS never matters)
//   - MusicBrainz + Cover Art Archive (CORS-enabled JSON APIs)
//   - wsrv.nl as an image proxy fallback for hosts without CORS headers,
//     so cover art can be embedded into the exported PNG.

const JSONP_TIMEOUT = 12000;

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__jcard_cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('request timed out')); }, JSONP_TIMEOUT);
    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    }
    window[cb] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('network error')); };
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cb}`;
    document.head.appendChild(script);
  });
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ---------------- search ---------------- */

async function searchItunes(q) {
  const data = await jsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=album&limit=12`);
  return (data.results || []).map(r => ({
    source: 'itunes',
    id: String(r.collectionId),
    title: r.collectionName || '',
    artist: r.artistName || '',
    year: (r.releaseDate || '').slice(0, 4),
    trackCount: r.trackCount || null,
    thumb: r.artworkUrl100 || null,
    artUrl: r.artworkUrl100 ? r.artworkUrl100.replace(/100x100bb/, '1200x1200bb') : null,
  }));
}

async function searchMusicBrainz(q, cassetteOnly = false) {
  const query = cassetteOnly ? `(${q}) AND format:cassette` : q;
  const data = await getJSON(`https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=12`);
  return (data.releases || []).map(r => {
    const formats = [...new Set((r.media || []).map(m => m.format).filter(Boolean))];
    return {
      source: 'mb',
      id: r.id,
      title: r.title || '',
      artist: (r['artist-credit'] || []).map(c => (c.name || '') + (c.joinphrase || '')).join('') || 'Unknown artist',
      year: (r.date || '').slice(0, 4),
      trackCount: r['track-count'] || null,
      country: r.country || '',
      formats,
      isCassette: formats.some(f => /cassette/i.test(f)),
      thumb: `https://coverartarchive.org/release/${r.id}/front-250`,
      artUrl: `https://coverartarchive.org/release/${r.id}/front-1200`,
      // older CAA uploads sometimes lack the 1200px thumbnail
      artUrls: [
        `https://coverartarchive.org/release/${r.id}/front-1200`,
        `https://coverartarchive.org/release/${r.id}/front-500`,
      ],
      thumbMayFail: true,
    };
  });
}

/**
 * Search both sources in parallel and merge (iTunes first — it has inline
 * artwork and durations — then MusicBrainz results not already covered).
 * With cassetteOnly, only MusicBrainz is searched: it catalogs physical
 * editions, so the artwork is the real tape J-card where a scan exists.
 */
export async function searchAlbums(q, { cassetteOnly = false } = {}) {
  if (cassetteOnly) return searchMusicBrainz(q, true);
  const [it, mb] = await Promise.allSettled([searchItunes(q), searchMusicBrainz(q)]);
  const results = [];
  const seen = new Set();
  const keyOf = r => `${r.title}::${r.artist}`.toLowerCase().replace(/\s+/g, ' ');
  for (const r of it.status === 'fulfilled' ? it.value : []) {
    results.push(r); seen.add(keyOf(r));
  }
  for (const r of mb.status === 'fulfilled' ? mb.value : []) {
    if (!seen.has(keyOf(r))) { results.push(r); seen.add(keyOf(r)); }
  }
  if (!results.length && it.status === 'rejected' && mb.status === 'rejected') {
    throw new Error('Both music databases were unreachable. Check your connection and try again.');
  }
  return results;
}

/* ---------------- album details ---------------- */

async function itunesTracks(id) {
  const data = await jsonp(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song&limit=200`);
  const tracks = (data.results || [])
    .filter(r => r.wrapperType === 'track' && r.kind === 'song')
    .sort((a, b) => (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber))
    .map(r => ({
      title: r.trackName || 'Untitled',
      duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
    }));
  return { tracks, hasSides: false, barcode: '' };
}

async function musicBrainzTracks(id) {
  const data = await getJSON(`https://musicbrainz.org/ws/2/release/${encodeURIComponent(id)}?inc=recordings&fmt=json`);
  const media = (data.media || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  // A two-media sided release (cassette / vinyl) carries the real A/B split.
  const hasSides = media.length === 2 &&
    media.every(m => /cassette|vinyl|lp|\b7"|10"|12"|reel/i.test(m.format || ''));
  const tracks = [];
  media.forEach((medium, mi) => {
    for (const t of medium.tracks || []) {
      tracks.push({
        title: t.title || t.recording?.title || 'Untitled',
        duration: t.length ? Math.round(t.length / 1000) : (t.recording?.length ? Math.round(t.recording.length / 1000) : null),
        side: hasSides ? (mi === 0 ? 'A' : 'B') : undefined,
      });
    }
  });
  return { tracks, hasSides, barcode: (data.barcode || '').trim() };
}

/** result item from searchAlbums() -> {tracks[], hasSides, barcode} */
export async function getAlbumTracks(result) {
  const info = result.source === 'itunes'
    ? await itunesTracks(result.id)
    : await musicBrainzTracks(result.id);
  if (!info.tracks.length) throw new Error('No tracks found for that release.');
  return info;
}

/* ---------------- cover art ---------------- */

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('could not read image'));
    fr.readAsDataURL(blob);
  });
}

function imageDims(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('bad image'));
    img.src = dataUrl;
  });
}

async function fetchImage(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('not an image');
  return blobToDataUrl(blob);
}

/**
 * Load remote art as a data URL (needed so PNG export isn't blocked by
 * canvas tainting). Tries a direct CORS fetch, then the wsrv.nl proxy.
 * Resolves {dataUrl, w, h} or, as a last resort, {srcUrl} (preview only).
 */
export async function loadArt(url) {
  let dataUrl = null;
  try {
    dataUrl = await fetchImage(url);
  } catch {
    try {
      dataUrl = await fetchImage(`https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1400&h=1400&fit=inside&output=jpg&q=88`);
    } catch { /* fall through */ }
  }
  if (!dataUrl) return { srcUrl: url, dataUrl: null, w: 0, h: 0 };
  try {
    let { w, h } = await imageDims(dataUrl);
    // full-resolution CAA scans can be huge; 2200px ≈ 540 dpi on a J-card,
    // plenty for print while keeping localStorage happy
    const MAX = 2200;
    if (Math.max(w, h) > MAX) {
      const scale = MAX / Math.max(w, h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(await loadImg(dataUrl), 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      w = canvas.width; h = canvas.height;
    }
    return { dataUrl, srcUrl: url, w, h };
  } catch {
    // undecodable payload — fall back to preview-by-URL
    return { srcUrl: url, dataUrl: null, w: 0, h: 0 };
  }
}

/**
 * All artwork the Cover Art Archive holds for a release (front, back, spine,
 * booklet scans…), each with a thumbnail and a best-first list of fetch URLs.
 * The full original scan is preferred: replica printing wants resolution.
 */
export async function getReleaseImages(mbid) {
  const data = await getJSON(`https://coverartarchive.org/release/${encodeURIComponent(mbid)}`);
  const https = u => (u ? u.replace(/^http:/, 'https:') : null);
  return (data.images || []).map(img => {
    const t = img.thumbnails || {};
    return {
      label: (img.types || []).join(' + ') || 'Image',
      front: !!img.front,
      thumb: https(t['250'] || t.small || t['500'] || t.large),
      urls: [...new Set([https(img.image), https(t['1200'] || t.large), https(t['500'])].filter(Boolean))],
    };
  }).filter(im => im.urls.length);
}

/** try several candidate URLs (best first); first one that embeds wins */
export async function loadBestArt(urls) {
  for (const url of urls) {
    const art = await loadArt(url);
    if (art.dataUrl) return art;
  }
  return { srcUrl: urls[0] || null, dataUrl: null, w: 0, h: 0 };
}

/** an uploaded File -> {dataUrl, w, h}, downscaled to keep localStorage happy */
export async function loadUpload(file) {
  const rawUrl = await blobToDataUrl(file);
  const { w, h } = await imageDims(rawUrl);
  const MAX = 1600;
  if (Math.max(w, h) <= MAX) return { dataUrl: rawUrl, w, h };
  const scale = MAX / Math.max(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(await loadImg(rawUrl), 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), w: canvas.width, h: canvas.height };
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('bad image'));
    img.src = src;
  });
}
