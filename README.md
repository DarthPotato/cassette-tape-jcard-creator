# 📼 J-Card Creator

Free, printable cassette tape J-cards in your browser. Search any album, get the
track list and cover art filled in automatically, tweak the design, and print —
**no account, no watermark, no paywall, no API keys.**

Inspired by tools like vhs.texs.org, but 100% free and self-hostable.


## Available at: https://tapes.yilmazk.com


## Features

- **Album search with auto-fill** — type an album or artist and the track list,
  running times, release year and cover art are filled in automatically.
  Metadata comes from the **iTunes Search API** and **MusicBrainz** /
  **Cover Art Archive** — all free, key-less, called directly from the browser.
- **Real cassette editions** — tick “cassette editions only” to search actual
  tape releases on MusicBrainz. Where the Cover Art Archive has a scan you get
  the **original J-card artwork**, plus the **factory Side A/B split** (tape
  releases are stored as two-sided media) and the release's real barcode.
- **Replica layout** — the original scan *becomes* the whole printable card:
  full-card cassette scans are detected automatically, loaded at the archive's
  full original resolution, laid across all three panels, and the design
  colors are matched to the scan. A scan picker lists every image the archive
  holds for the release (front, back, spine…) so you can print the real thing.
- **Scan layers** — in Replica mode, stack multiple scans on one card: assign
  each to a region (full card, front panel, spine, back flap) with its own
  zoom, pan and 90° rotation. Rebuild a J-card from separate front/spine/back
  scans exactly like the original.
- **Zoom out & rotate** — every image control zooms below 1:1 (letterboxing
  instead of force-cropping oversized scans) and rotates in 90° steps for
  sideways scans.
- **Barcode** — a toggleable, spec-correct EAN-13 barcode on the back flap:
  the release's real EAN/UPC when known (auto-filled from MusicBrainz, or
  type your own), otherwise a stable checksum-valid code generated from the
  artist + album.
- **Real J-card dimensions** — the card is exactly 4″ × 4 1/16″
  (101.6 × 103.1 mm): 1″ back flap, ½″ spine, 2 9/16″ front panel.
  What you see is what prints.
- **Auto side balancing** — tracks are split across Side A / Side B so both
  sides run about the same length (just like planning a real dub). Reorder,
  retitle, retime or flip any track manually.
- **Three layouts** — Classic (square art + text), Full bleed (art fills the
  front), and Minimal (type only).
- **Design controls** — 9 typefaces (self-hosted, OFL-licensed), 8 color
  presets plus full custom background/text/accent pickers, accent spine,
  retro tape-brand stripes, uppercase mode, fold guides.
- **“Match colors”** — extracts a palette from the cover art with one click.
- **Cover art tools** — fetched automatically, or upload your own; zoom and
  pan to crop.
- **Print & export**
  - PNG at 300 or 600 dpi with correct DPI metadata baked in, optional
    crop + fold marks with a 3 mm margin.
  - Direct print / save-as-PDF at exact physical size (print at 100% scale).
  - Save/load designs as JSON files; work-in-progress autosaves to the browser.
- **Demo album** built in — try everything offline.
- **Privacy-friendly** — everything runs client-side. The only network
  requests are the metadata/art lookups you trigger.

## Hosting

It's a plain static site — no build step, no backend, no environment variables.

```bash
# local preview
python3 -m http.server 8000
# then open http://localhost:8000
```

To deploy, upload the folder (or point GitHub Pages / Netlify / Cloudflare
Pages / any web server at it). That's it.

> Note: open it over HTTP(S), not `file://` — ES modules and font embedding
> need a real origin.

## API keys

None needed. The data sources are:

| Source | Used for | Auth |
|---|---|---|
| iTunes Search API | album search, track lists, durations, artwork | none (JSONP) |
| MusicBrainz | album search, track lists (great for obscure/regional releases) | none |
| Cover Art Archive | artwork/scans for MusicBrainz releases | none |
| Discogs | cassette-edition search, multi-image scans (front/back/inside), side splits, barcodes | none* |
| wsrv.nl | image proxy fallback so artwork can be embedded in PNG exports | none |

\* Discogs works without any token. Pasting a free personal token (Search
panel → "Optional: Discogs token") adds thumbnails in search results and
raises the rate limit from 25 to 60 requests/min. The token is stored only in
the visitor's own browser (localStorage) — safe for a static host like GitHub
Pages, because each visitor brings their own.

If you ever want to add Discogs/Last.fm/Spotify as extra sources, `js/api.js`
is the only file to touch — each source is a small function that returns
`{title, artist, year, tracks[], artUrl}`.

## Printing tips

- Print at **100% / actual size** (disable "fit to page").
- Card stock in the 65–80 lb (176–216 gsm) range folds and stands up nicely.
- Enable **crop & fold marks** in the export panel for easier cutting.
- Fold on the dashed lines: back flap ↑, spine ↑, done.

## Project layout

```
index.html          app shell / all controls
css/style.css       UI styling
css/fonts.css       self-hosted @font-face rules
fonts/              woff2 files (via fontsource, SIL OFL licensed)
js/app.js           wiring: state <-> controls <-> preview
js/jcard.js         the J-card SVG renderer (1 SVG unit = 1 mm)
js/api.js           iTunes / MusicBrainz / Cover Art Archive clients
js/export.js        PNG (with DPI metadata), print, JSON save/load
js/state.js         state model, presets, autosave, side balancing
js/palette.js       color helpers + cover-art palette extraction
js/demo.js          built-in demo album (works offline)
js/util.js          small shared helpers
```

## License notes

Fonts are from the [Fontsource](https://fontsource.org) builds of Google Fonts
and are licensed under the SIL Open Font License. Album metadata and artwork
are fetched from third-party services at the user's request and are for
personal use.
