import { $, $$, esc, mmss, parseDuration, toast, debounce, uid, clamp } from './util.js';
import { defaultState, loadSaved, save, clearSaved, mergeState, autoBalance, sideSeconds, FONTS, PRESETS } from './state.js';
import { renderJCard } from './jcard.js';
import { searchAlbums, getAlbumTracks, loadBestArt, loadUpload } from './api.js';
import { exportPNG, printCard, saveDesign, readDesignFile } from './export.js';
import { extractPalette, contrastText } from './palette.js';
import { demoState } from './demo.js';

let state = loadSaved() || defaultState();

/* ================= preview ================= */

const cardHolder = $('#card-holder');
let renderQueued = false;

function renderPreview() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    cardHolder.innerHTML = renderJCard(state, { placeholders: true, idPrefix: 'jc' });
  });
}

const persist = debounce(() => save(state), 400);

function changed({ tracksDom = false, form = false } = {}) {
  if (form) syncFormFromState();
  if (tracksDom) buildTrackLists();
  updateSideTotals();
  renderPreview();
  persist();
}

/* ================= form <-> state ================= */

const fields = {
  '#f-album': ['album'], '#f-artist': ['artist'], '#f-year': ['year'],
  '#f-note': ['noteLine'], '#f-spine': ['spineText'], '#f-barcodenum': ['barcode'],
};

function syncFormFromState() {
  for (const [sel, [key]] of Object.entries(fields)) $(sel).value = state[key];
  $('#c-bg').value = state.design.bg;
  $('#c-text').value = state.design.text;
  $('#c-accent').value = state.design.accent;
  $('#f-font').value = state.design.font;
  $$('input[name="layout"]').forEach(r => { r.checked = r.value === state.design.layout; });
  $('#f-durations').checked = state.design.showDurations;
  $('#f-spineinvert').checked = state.design.spineInvert;
  $('#f-stripes').checked = state.design.stripes;
  $('#f-barcode').checked = state.design.showBarcode;
  $('#f-uppercase').checked = state.design.uppercase;
  $('#f-sidelabels').checked = state.design.showSideLabels;
  $('#f-foldlines').checked = state.design.showFoldLines;
  $('#art-zoom').value = state.cover.zoom;
  $('#art-x').value = state.cover.x;
  $('#art-y').value = state.cover.y;
  updateArtThumb();
}

for (const [sel, [key]] of Object.entries(fields)) {
  $(sel).addEventListener('input', e => { state[key] = e.target.value; changed(); });
}

/* ================= design controls ================= */

const fontSelect = $('#f-font');
for (const [key, f] of Object.entries(FONTS)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = f.label;
  fontSelect.appendChild(opt);
}
fontSelect.addEventListener('change', async e => {
  state.design.font = e.target.value;
  await ensureFontLoaded(state.design.font);
  changed();
});

/** make sure a webfont is actually loaded before we measure/wrap text with it */
async function ensureFontLoaded(key) {
  const f = FONTS[key];
  const family = f?.css.match(/'([^']+)'/)?.[1];
  if (!family || !document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`400 16px "${family}"`),
      document.fonts.load(`700 16px "${family}"`),
    ]);
  } catch { /* fall back to whatever is available */ }
}

const presetRow = $('#preset-row');
for (const p of PRESETS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'preset';
  btn.title = p.name;
  btn.setAttribute('aria-label', `Color preset: ${p.name}`);
  btn.innerHTML = `<svg viewBox="0 0 54 34"><rect width="54" height="34" fill="${p.bg}"/><rect y="24" width="54" height="10" fill="${p.accent}"/><rect x="6" y="7" width="30" height="4" rx="2" fill="${p.text}"/><rect x="6" y="14" width="20" height="3" rx="1.5" fill="${p.text}" opacity=".6"/></svg>`;
  btn.addEventListener('click', () => {
    Object.assign(state.design, { bg: p.bg, text: p.text, accent: p.accent });
    changed({ form: true });
  });
  presetRow.appendChild(btn);
}

$('#c-bg').addEventListener('input', e => { state.design.bg = e.target.value; changed(); });
$('#c-text').addEventListener('input', e => { state.design.text = e.target.value; changed(); });
$('#c-accent').addEventListener('input', e => { state.design.accent = e.target.value; changed(); });

$$('input[name="layout"]').forEach(r =>
  r.addEventListener('change', () => { if (r.checked) { state.design.layout = r.value; changed(); } }));

const toggleMap = {
  '#f-durations': 'showDurations', '#f-spineinvert': 'spineInvert', '#f-stripes': 'stripes',
  '#f-barcode': 'showBarcode', '#f-uppercase': 'uppercase',
  '#f-sidelabels': 'showSideLabels', '#f-foldlines': 'showFoldLines',
};
for (const [sel, key] of Object.entries(toggleMap)) {
  $(sel).addEventListener('change', e => { state.design[key] = e.target.checked; changed(); });
}

/* ================= tracks ================= */

function trackRow(t, i) {
  const li = document.createElement('li');
  li.dataset.id = t.id;
  li.innerHTML = `
    <span class="t-num">${i + 1}.</span>
    <input class="t-title" type="text" value="${esc(t.title)}" aria-label="Track title">
    <input class="t-dur" type="text" value="${esc(mmss(t.duration))}" placeholder="m:ss" aria-label="Track length">
    <span class="t-btns">
      <button type="button" data-act="up" title="Move up">▲</button>
      <button type="button" data-act="down" title="Move down">▼</button>
      <button type="button" data-act="flip" title="Move to the other side">⇄</button>
      <button type="button" data-act="del" title="Remove">✕</button>
    </span>`;
  return li;
}

function buildTrackLists() {
  for (const side of ['A', 'B']) {
    const ul = $(`#side${side}-list`);
    ul.innerHTML = '';
    const tracks = state.tracks.filter(t => t.side === side);
    if (!tracks.length) {
      ul.innerHTML = `<li class="empty-side">no tracks yet</li>`;
      continue;
    }
    tracks.forEach((t, i) => ul.appendChild(trackRow(t, i)));
  }
}

function updateSideTotals() {
  for (const side of ['A', 'B']) {
    const { sum, missing } = sideSeconds(state, side);
    const n = state.tracks.filter(t => t.side === side).length;
    $(`#side${side}-total`).textContent = n
      ? `— ${n} track${n === 1 ? '' : 's'}${sum ? ` · ${mmss(sum)}${missing ? '+' : ''}` : ''}`
      : '';
  }
}

function findTrack(li) {
  return state.tracks.find(t => t.id === li.dataset.id);
}

for (const ul of $$('.track-list')) {
  ul.addEventListener('input', e => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const t = findTrack(li);
    if (!t) return;
    if (e.target.classList.contains('t-title')) t.title = e.target.value;
    if (e.target.classList.contains('t-dur')) t.duration = parseDuration(e.target.value);
    changed();
  });
  ul.addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const li = btn.closest('li[data-id]');
    const t = findTrack(li);
    if (!t) return;
    const idx = state.tracks.indexOf(t);
    const act = btn.dataset.act;
    if (act === 'del') state.tracks.splice(idx, 1);
    if (act === 'flip') t.side = t.side === 'A' ? 'B' : 'A';
    if (act === 'up' || act === 'down') {
      // swap with the neighbour on the same side
      const dir = act === 'up' ? -1 : 1;
      const sameSide = state.tracks.filter(x => t.side === x.side);
      const pos = sameSide.indexOf(t);
      const other = sameSide[pos + dir];
      if (other) {
        const j = state.tracks.indexOf(other);
        [state.tracks[idx], state.tracks[j]] = [state.tracks[j], state.tracks[idx]];
      }
    }
    changed({ tracksDom: true });
  });
}

for (const form of $$('.add-track')) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title) return;
    state.tracks.push({ id: uid(), title, duration: null, side: form.dataset.side });
    input.value = '';
    changed({ tracksDom: true });
  });
}

$('#autobalance-btn').addEventListener('click', () => {
  if (!state.tracks.length) { toast('Add some tracks first.'); return; }
  autoBalance(state);
  changed({ tracksDom: true });
  toast('Sides balanced by running time.');
});

/* ================= search ================= */

const searchInput = $('#search-input');
const searchStatus = $('#search-status');
const resultsList = $('#search-results');

function setStatus(msg) {
  searchStatus.hidden = !msg;
  searchStatus.textContent = msg || '';
}

async function runSearch() {
  const q = searchInput.value.trim();
  if (!q) { searchInput.focus(); return; }
  resultsList.hidden = true;
  resultsList.innerHTML = '';
  const cassetteOnly = $('#f-cassonly').checked;
  setStatus(cassetteOnly ? 'Searching MusicBrainz for cassette editions…' : 'Searching iTunes & MusicBrainz…');
  try {
    const results = await searchAlbums(q, { cassetteOnly });
    if (!results.length) {
      setStatus(cassetteOnly
        ? 'No cassette editions found — try fewer words, or untick “cassette editions only”.'
        : 'No albums found — try adding the artist name.');
      return;
    }
    setStatus('');
    for (const r of results) {
      const li = document.createElement('li');
      const sub = [r.artist, r.year, r.trackCount ? `${r.trackCount} tracks` : null,
        r.isCassette ? `Cassette${r.country ? ` · ${r.country}` : ''}` : null].filter(Boolean).join(' · ');
      li.innerHTML = `<button type="button">
        ${r.thumb ? `<img src="${esc(r.thumb)}" alt="" loading="lazy">` : '<span class="noart"></span>'}
        <span class="meta"><span class="r-title">${r.isCassette ? '&#128252; ' : ''}${esc(r.title)}</span><span class="r-sub">${esc(sub)}</span></span>
        <span class="src">${r.source === 'itunes' ? 'itunes' : 'mbrainz'}</span>
      </button>`;
      const img = li.querySelector('img');
      if (img && r.thumbMayFail) img.addEventListener('error', () => img.replaceWith(Object.assign(document.createElement('span'), { className: 'noart' })));
      li.querySelector('button').addEventListener('click', () => pickAlbum(r));
      resultsList.appendChild(li);
    }
    resultsList.hidden = false;
  } catch (err) {
    setStatus(`Search failed: ${err.message}`);
  }
}

$('#search-btn').addEventListener('click', runSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

async function pickAlbum(r) {
  setStatus(`Loading “${r.title}”…`);
  resultsList.hidden = true;
  try {
    const info = await getAlbumTracks(r);
    state.album = r.title;
    state.artist = r.artist;
    state.year = r.year || '';
    state.barcode = info.barcode || '';
    state.tracks = info.tracks.map(t => ({ id: uid(), title: t.title, duration: t.duration, side: t.side || 'A' }));
    if (!info.hasSides) autoBalance(state);
    changed({ tracksDom: true, form: true });
    setStatus('');
    toast(info.hasSides
      ? `Loaded ${info.tracks.length} tracks with the release’s real Side A/B split.`
      : `Loaded ${info.tracks.length} tracks from “${r.title}”.`);

    const artUrls = r.artUrls || (r.artUrl ? [r.artUrl] : []);
    if (artUrls.length) {
      // art failures must never look like the whole release failed
      try {
        setStatus(r.source === 'mb'
          ? 'Fetching cover art (the Cover Art Archive can take a little while)…'
          : 'Fetching cover art…');
        const art = await loadBestArt(artUrls);
        if (art.dataUrl || art.srcUrl) {
          state.cover = { ...state.cover, ...art, zoom: 1, x: 0.5, y: 0.5 };
          updateArtThumb();
          changed();
        }
        if (!art.dataUrl) toast('Cover art is preview-only (its host blocked the download) — it may be missing from PNG export. Try uploading the image instead.', 6000);
      } catch {
        toast('No cover art found for this release — you can upload an image instead.', 5000);
      }
      setStatus('');
    }
  } catch (err) {
    setStatus(`Couldn’t load that release: ${err.message}`);
  }
}

$('#demo-btn').addEventListener('click', () => {
  state = demoState(state);
  changed({ tracksDom: true, form: true });
  toast('Demo album loaded — everything is editable.');
});

/* ================= cover art ================= */

function updateArtThumb() {
  const holder = $('#art-thumb');
  const src = state.cover.dataUrl || state.cover.srcUrl;
  holder.innerHTML = src ? `<img src="${esc(src)}" alt="cover art">` : '<span>no art</span>';
}

$('#art-upload').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const art = await loadUpload(file);
    state.cover = { ...state.cover, ...art, srcUrl: null, zoom: 1, x: 0.5, y: 0.5 };
    updateArtThumb();
    changed({ form: true });
  } catch {
    toast('Could not read that image file.');
  }
});

$('#art-remove-btn').addEventListener('click', () => {
  state.cover = { dataUrl: null, srcUrl: null, w: 0, h: 0, zoom: 1, x: 0.5, y: 0.5 };
  updateArtThumb();
  changed({ form: true });
});

$('#art-palette-btn').addEventListener('click', async () => {
  const src = state.cover.dataUrl || state.cover.srcUrl;
  if (!src) { toast('Load or upload cover art first.'); return; }
  try {
    const pal = await extractPalette(src);
    Object.assign(state.design, pal);
    changed({ form: true });
    toast('Colors matched to the cover.');
  } catch {
    toast('Could not read colors from this image.');
  }
});

for (const [sel, key] of [['#art-zoom', 'zoom'], ['#art-x', 'x'], ['#art-y', 'y']]) {
  $(sel).addEventListener('input', e => {
    state.cover[key] = clamp(parseFloat(e.target.value) || 0, key === 'zoom' ? 1 : 0, key === 'zoom' ? 4 : 1);
    changed();
  });
}

/* ================= export ================= */

$('#export-png').addEventListener('click', () => doExport(300));
$('#export-png-hi').addEventListener('click', () => doExport(600));

async function doExport(dpi) {
  toast(`Rendering ${dpi} dpi PNG…`, 1500);
  try {
    await exportPNG(state, { dpi, cropMarks: $('#f-cropmarks').checked });
  } catch (err) {
    toast(`Export failed: ${err.message}`);
  }
}

$('#print-btn').addEventListener('click', () => printCard(state));
window.addEventListener('beforeprint', () => {
  const area = $('#print-area');
  if (!area.innerHTML) area.innerHTML = renderJCard(state, { placeholders: false, idPrefix: 'jp' });
});
window.addEventListener('afterprint', () => { $('#print-area').innerHTML = ''; });

$('#save-json').addEventListener('click', () => saveDesign(state));

$('#load-json').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    state = mergeState(await readDesignFile(file));
    changed({ tracksDom: true, form: true });
    toast('Design loaded.');
  } catch (err) {
    toast(err.message);
  }
});

$('#reset-btn').addEventListener('click', () => {
  if (!confirm('Reset everything? This clears the current design.')) return;
  state = defaultState();
  clearSaved();
  changed({ tracksDom: true, form: true });
});

/* ================= preview toolbar ================= */

$('#rotate-btn').addEventListener('click', () => {
  $('#card-stage').classList.toggle('rotated');
});

/* ================= init ================= */

syncFormFromState();
buildTrackLists();
updateSideTotals();
renderPreview();

// text metrics change once the webfonts arrive — re-render with correct wrapping
if (document.fonts?.ready) document.fonts.ready.then(renderPreview);
