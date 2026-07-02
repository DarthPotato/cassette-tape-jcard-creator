// A built-in demo album so people (and offline users) can try the whole
// pipeline — including cover art and PNG export — without hitting any API.

import { uid } from './util.js';

const DEMO_TRACKS = [
  ['Ignition Overture', 254], ['Neon Boulevard', 221], ['Rearview Ghosts', 198],
  ['FM Static Love', 243], ['Chrome Hearts', 187], ['Midnight Drive', 302],
  ['Tape Hiss Lullaby', 176], ['Dashboard Sunset', 234], ['Analog Girl', 205],
  ['Motorway Mirage', 267], ['Last Exit Home', 224], ['Side B Forever', 289],
];

/** paint a synthwave-ish cover on a canvas so no network or asset is needed */
function makeDemoCover() {
  const S = 800;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, S * 0.72);
  sky.addColorStop(0, '#1a1038');
  sky.addColorStop(0.55, '#4b1d5e');
  sky.addColorStop(1, '#c23a5a');
  g.fillStyle = sky;
  g.fillRect(0, 0, S, S * 0.72);

  // sun
  const sun = g.createLinearGradient(0, S * 0.22, 0, S * 0.72);
  sun.addColorStop(0, '#ffd97a');
  sun.addColorStop(1, '#ff5e5e');
  g.fillStyle = sun;
  g.beginPath();
  g.arc(S / 2, S * 0.52, S * 0.23, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1a1038';
  for (let i = 0; i < 5; i++) {
    g.fillRect(0, S * (0.46 + i * 0.055), S, S * (0.008 + i * 0.006));
  }

  // ground + perspective grid
  g.fillStyle = '#120a24';
  g.fillRect(0, S * 0.72, S, S * 0.28);
  g.strokeStyle = 'rgba(64, 224, 208, .75)';
  g.lineWidth = 2;
  for (let i = -8; i <= 8; i++) {
    g.beginPath();
    g.moveTo(S / 2 + i * S * 0.055, S * 0.72);
    g.lineTo(S / 2 + i * S * 0.28, S);
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const y = S * 0.72 + Math.pow(i / 5, 1.8) * S * 0.28;
    g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
  }

  // title
  g.fillStyle = '#ffe9d6';
  g.textAlign = 'center';
  g.font = `700 ${S * 0.085}px 'Space Grotesk', sans-serif`;
  g.fillText('MIDNIGHT DRIVE', S / 2, S * 0.16);
  g.font = `400 ${S * 0.04}px 'Space Grotesk', sans-serif`;
  g.fillStyle = 'rgba(255,233,214,.85)';
  g.fillText('THE CASSETTE CLUB', S / 2, S * 0.225);

  return { dataUrl: c.toDataURL('image/jpeg', 0.9), w: S, h: S };
}

export function demoState(base) {
  const s = base;
  s.album = 'Midnight Drive';
  s.artist = 'The Cassette Club';
  s.year = '1986';
  s.noteLine = 'Stereo · Dolby B NR · Chrome Type II';
  s.spineText = '';
  s.tracks = DEMO_TRACKS.map(([title, duration], i) => ({
    id: uid(), title, duration, side: i < 6 ? 'A' : 'B',
  }));
  const cover = makeDemoCover();
  s.cover = { dataUrl: cover.dataUrl, srcUrl: null, w: cover.w, h: cover.h, zoom: 1, x: 0.5, y: 0.5 };
  s.design.layout = 'classic';
  s.design.bg = '#1c1233';
  s.design.text = '#ffe9d6';
  s.design.accent = '#ff5e5e';
  return s;
}
