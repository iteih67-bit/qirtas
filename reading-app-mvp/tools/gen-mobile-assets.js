// Zero-dependency mobile asset generator: 1024 icon + 2732 splash for Capacitor.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- PNG encoder (same as gen-icons.js) ----------
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
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- drawing ----------
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }
function roundedRectDist(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(dx, 0), ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) - r;
}
function cover(dist, edge = 1.5) { return Math.min(1, Math.max(0, 0.5 - dist / edge)); }

function renderIcon(S) {
  const img = Buffer.alloc(S * S * 4);
  const cx = S / 2, cy = S / 2;
  const cornerR = S * 0.215;
  const gradA = [16, 145, 130], gradB = [13, 74, 90];
  const paper = [253, 251, 245], inkTeal = [13, 100, 94], amber = [245, 158, 11];
  const bookHW = 0.235 * S, bookHH = 0.21 * S, bookR = 0.045 * S;
  const bookCx = cx, bookCy = cy + 0.015 * S;
  const by0 = bookCy - bookHH;
  const lines = [
    { y: bookCy - 0.075 * S, x0: bookCx - 0.15 * S, x1: bookCx + 0.15 * S, h: 0.023 * S },
    { y: bookCy - 0.02 * S,  x0: bookCx - 0.15 * S, x1: bookCx + 0.15 * S, h: 0.023 * S },
    { y: bookCy + 0.035 * S, x0: bookCx - 0.15 * S, x1: bookCx + 0.06 * S,  h: 0.023 * S },
  ];
  const rbX0 = bookCx + 0.085 * S, rbX1 = bookCx + 0.165 * S;
  const rbTop = by0, rbBottom = by0 + 0.135 * S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5, py = y + 0.5;
      let [r, g, b, a] = [0, 0, 0, 0];
      const bgCov = cover(roundedRectDist(px, py, cx, cy, S / 2 - 2, S / 2 - 2, cornerR));
      if (bgCov > 0) {
        const t = (px + py) / (2 * S);
        const col = mix(gradA, gradB, t);
        r = col[0]; g = col[1]; b = col[2]; a = 255 * bgCov;
      }
      const bookCov = cover(roundedRectDist(px, py, bookCx, bookCy, bookHW, bookHH, bookR));
      if (bookCov > 0) {
        r = lerp(r, paper[0], bookCov); g = lerp(g, paper[1], bookCov); b = lerp(b, paper[2], bookCov);
        a = Math.max(a, 255 * bookCov);
      }
      let rib = 0;
      if (px >= rbX0 && px <= rbX1 && py >= rbTop && py <= rbBottom) {
        const depth = (py - (rbBottom - 0.045 * S)) / (0.045 * S);
        rib = depth <= 0 ? 1 : (Math.abs(px - (rbX0 + rbX1) / 2) < ((rbX1 - rbX0) / 2) * (1 - depth) ? 1 : 0);
      }
      if (rib) { r = lerp(r, amber[0], rib); g = lerp(g, amber[1], rib); b = lerp(b, amber[2], rib); }
      for (const L of lines) {
        if (px >= L.x0 && px <= L.x1 && py >= L.y - L.h / 2 && py <= L.y + L.h / 2) {
          if (!(rib && py >= rbTop && py <= rbBottom)) {
            const cov = cover(Math.abs(py - L.y) - L.h / 2);
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

function downscale(img, S, target) {
  const out = Buffer.alloc(target * target * 4);
  const f = S / target;
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const y0 = Math.floor(y * f), y1 = Math.min(S, Math.floor((y + 1) * f));
      const x0 = Math.floor(x * f), x1 = Math.min(S, Math.floor((x + 1) * f));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * S + xx) * 4;
        r += img[i]; g += img[i + 1]; b += img[i + 2]; a += img[i + 3]; n++;
      }
      const o = (y * target + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

const ROOT = path.join(__dirname, '..', 'assets');
fs.mkdirSync(ROOT, { recursive: true });

// 1) icon.png 1024×1024
const S1 = 2048;
const iconBuf = downscale(renderIcon(S1), S1, 1024);
fs.writeFileSync(path.join(ROOT, 'icon.png'), encodePNG(1024, 1024, iconBuf));
console.log('assets/icon.png (1024) written');

// 2) splash.png 2732×2732 — dark teal gradient + centered icon
const SP = 2732;
const splash = Buffer.alloc(SP * SP * 4);
const gA = [12, 46, 41], gB = [19, 78, 74];
for (let y = 0; y < SP; y++) {
  for (let x = 0; x < SP; x++) {
    const t = (x + y) / (2 * SP);
    const col = mix(gA, gB, t);
    const i = (y * SP + x) * 4;
    splash[i] = col[0]; splash[i + 1] = col[1]; splash[i + 2] = col[2]; splash[i + 3] = 255;
  }
}
const iconSize = 760;
const small = downscale(renderIcon(iconSize * 2), iconSize * 2, iconSize);
const off = Math.floor((SP - iconSize) / 2);
for (let y = 0; y < iconSize; y++) {
  for (let x = 0; x < iconSize; x++) {
    const si = (y * iconSize + x) * 4;
    const a = small[si + 3] / 255;
    if (a <= 0) continue;
    const di = ((off + y) * SP + (off + x)) * 4;
    splash[di] = Math.round(lerp(splash[di], small[si], a));
    splash[di + 1] = Math.round(lerp(splash[di + 1], small[si + 1], a));
    splash[di + 2] = Math.round(lerp(splash[di + 2], small[si + 2], a));
    splash[di + 3] = 255;
  }
}
fs.writeFileSync(path.join(ROOT, 'splash.png'), encodePNG(SP, SP, splash));
console.log('assets/splash.png (2732) written');
