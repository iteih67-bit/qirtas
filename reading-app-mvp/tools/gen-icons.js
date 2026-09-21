// Zero-dependency PNG icon generator for the Qirtas PWA.
// Renders at 2x and downsamples for smooth antialiased edges.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- minimal PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- drawing helpers ----------
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
function roundedRectDist(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(dx, 0), ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) - r;
}
// signed coverage: 1 inside, 0 outside, smooth 1.5px edge
function cover(dist, edge = 1.5) {
  return Math.min(1, Math.max(0, 0.5 - dist / edge));
}

function renderIcon(S) {
  const img = Buffer.alloc(S * S * 4);
  const cx = S / 2, cy = S / 2;
  const cornerR = S * 0.215;
  const gradA = [16, 145, 130];  // teal-600ish
  const gradB = [13, 74, 90];    // deep blue-teal
  const paper = [253, 251, 245];
  const inkTeal = [13, 100, 94];
  const amber = [245, 158, 11];

  // book geometry (fractions of S)
  const bookHW = 0.235 * S, bookHH = 0.21 * S, bookR = 0.045 * S;
  const bookCx = cx, bookCy = cy + 0.015 * S;
  const bx0 = bookCx - bookHW, bx1 = bookCx + bookHW;
  const by0 = bookCy - bookHH, by1 = bookCy + bookHH;

  const lines = [
    { y: bookCy - 0.075 * S, x0: bookCx - 0.15 * S, x1: bookCx + 0.15 * S, h: 0.023 * S },
    { y: bookCy - 0.02 * S,  x0: bookCx - 0.15 * S, x1: bookCx + 0.15 * S, h: 0.023 * S },
    { y: bookCy + 0.035 * S, x0: bookCx - 0.15 * S, x1: bookCx + 0.06 * S,  h: 0.023 * S },
  ];
  // bookmark ribbon hangs from the book's top edge, right side
  const rbX0 = bookCx + 0.085 * S, rbX1 = bookCx + 0.165 * S;
  const rbTop = by0, rbBottom = by0 + 0.135 * S;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5, py = y + 0.5;
      let [r, g, b, a] = [0, 0, 0, 0];
      // rounded-square background with diagonal gradient
      const bgCov = cover(roundedRectDist(px, py, cx, cy, S / 2 - 2, S / 2 - 2, cornerR));
      if (bgCov > 0) {
        const t = (px + py) / (2 * S);
        let col = mix(gradA, gradB, t);
        // soft highlight circle top-left
        const hd = Math.hypot(px - S * 0.3, py - S * 0.25) / (S * 0.75);
        col = mix([255, 255, 255], col, Math.min(1, 0.18 * Math.max(0, 1 - hd) + 1));
        r = col[0]; g = col[1]; b = col[2]; a = 255 * bgCov;
      }
      // bookmark ribbon (drawn under the paper book? no—over bg, under lines but above book: draw first, book will cover)
      const ribCov = Math.min(1, cover(Math.max(px - rbX1, rbX0 - px)) * (py >= rbTop - 1 ? 1 : 0));
      let rib = 0;
      if (px >= rbX0 && px <= rbX1 && py >= rbTop - 1 && py <= rbBottom) {
        const depth = (py - (rbBottom - 0.045 * S)) / (0.045 * S); // 0..1 near bottom
        if (depth <= 0) rib = 1;
        else {
          const halfW = (rbX1 - rbX0) / 2 * (1 - depth * 0) ; // full width, V notch from bottom center
          const notchX = (rbX0 + rbX1) / 2;
          rib = Math.abs(px - notchX) < (rbX1 - rbX0) / 2 * (1 - depth) ? 1 : 0;
        }
      }
      if (rib && py >= rbTop && py <= rbBottom) {
        // ribbon visible only below book top edge inside book bounds is fine—draw after book
      }
      // paper book
      const bookCov = cover(roundedRectDist(px, py, bookCx, bookCy, bookHW, bookHH, bookR));
      if (bookCov > 0) {
        r = lerp(r, paper[0], bookCov);
        g = lerp(g, paper[1], bookCov);
        b = lerp(b, paper[2], bookCov);
        a = Math.max(a, 255 * bookCov);
      }
      // ribbon over paper
      if (rib && py >= rbTop) {
        r = lerp(r, amber[0], rib);
        g = lerp(g, amber[1], rib);
        b = lerp(b, amber[2], rib);
      }
      // text lines (skip where ribbon overlaps)
      for (const L of lines) {
        if (px >= L.x0 && px <= L.x1 && py >= L.y - L.h / 2 && py <= L.y + L.h / 2) {
          if (!(rib && py >= rbTop && py <= rbBottom && px >= rbX0 && px <= rbX1)) {
            const lr = L.h / 2;
            const dTop = Math.abs(py - L.y) - lr;
            const cov = cover(dTop);
            r = lerp(r, inkTeal[0], cov); g = lerp(g, inkTeal[1], cov); b = lerp(b, inkTeal[2], cov);
          }
        }
      }
      const i = (y * S + x) * 4;
      img[i] = Math.round(r); img[i + 1] = Math.round(g); img[i + 2] = Math.round(b); img[i + 3] = Math.round(a);
    }
  }
  return img;
}

function saveIcon(size, file) {
  const S = size * 2; // supersample
  const img = renderIcon(S);
  // downsample 2x by averaging
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let c = 0; c < 4; c++) {
        const v = (img[((y * 2) * S + x * 2) * 4 + c] + img[((y * 2) * S + x * 2 + 1) * 4 + c] +
                   img[((y * 2 + 1) * S + x * 2) * 4 + c] + img[((y * 2 + 1) * S + x * 2 + 1) * 4 + c]) / 4;
        out[(y * size + x) * 4 + c] = Math.round(v);
      }
    }
  }
  const png = encodePNG(size, size, out);
  fs.writeFileSync(path.join(__dirname, '..', 'icons', file), png);
  console.log('wrote icons/' + file, png.length, 'bytes');
}

saveIcon(192, 'icon-192.png');
saveIcon(512, 'icon-512.png');
saveIcon(180, 'apple-touch-icon.png');
saveIcon(32, 'favicon-32.png');
console.log('done');
