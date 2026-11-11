// Měření: (1) šířka pásu S háčku v řezech, (2) nejtenčí tah a nejužší mezera v logu.
import { readFile } from "node:fs/promises";
import sharp from "sharp";

// ---------- (1) Háček ----------
const buf = await readFile("produkty/DS-007-hacek-S.stl");
const n = buf.readUInt32LE(80);
function segments(values, gap = 0.6) {
  const s = [...new Set(values.map((v) => Math.round(v * 10) / 10))].sort((a, b) => a - b);
  if (!s.length) return [];
  const out = []; let start = s[0], prev = s[0];
  for (const v of s.slice(1)) { if (v - prev > gap) { out.push([start, prev]); start = v; } prev = v; }
  out.push([start, prev]);
  return out.map(([a, b]) => `${a}…${b} (${(b - a).toFixed(1)} mm)`);
}
const zAtX0 = [], xAtZ15 = [], xAtZm15 = [], xAtZ0 = [];
for (let i = 0; i < n; i++) {
  const o = 84 + i * 50;
  for (let k = 0; k < 3; k++) {
    const x = buf.readFloatLE(o + 12 + k * 12), y = buf.readFloatLE(o + 16 + k * 12), z = buf.readFloatLE(o + 20 + k * 12);
    if (Math.abs(y - 4.7) > 0.05) continue; // jen rovný bok S
    if (Math.abs(x) < 0.3) zAtX0.push(z);
    if (Math.abs(z - 15) < 0.3) xAtZ15.push(x);
    if (Math.abs(z + 15) < 0.3) xAtZm15.push(x);
    if (Math.abs(z) < 0.6) xAtZ0.push(x);
  }
}
console.log("Bok S (y=4.7) – řez x≈0, segmenty z:", segments(zAtX0).join(" | "));
console.log("Bok S – řez z≈15, segmenty x:", segments(xAtZ15).join(" | "));
console.log("Bok S – řez z≈-15, segmenty x:", segments(xAtZm15).join(" | "));
console.log("Bok S – řez z≈0, segmenty x:", segments(xAtZ0).join(" | "));

// ---------- (2) Logo ----------
const img = sharp("logo/DS-logo-bw.png").raw().toColorspace("b-w");
const { data, info } = await img.toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const at = (x, y) => data[y * W + x] > 127;
// Šířka loga v px (bbox bílé)
let minX = W, maxX = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y)) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
const logoW = maxX - minX + 1;
// Nejkratší bílé a černé běhy (vodorovně i svisle), černé jen pokud jsou mezi bílými
let minWhite = Infinity, minBlack = Infinity;
const scan = (len, get) => {
  let run = 0, cur = get(0), seenWhite = false;
  for (let i = 1; i <= len; i++) {
    const v = i < len ? get(i) : null;
    if (v === cur) { run++; continue; }
    run++;
    if (cur) { minWhite = Math.min(minWhite, run); seenWhite = true; }
    else if (seenWhite && v === true) minBlack = Math.min(minBlack, run);
    cur = v; run = 0;
  }
};
for (let y = 0; y < H; y++) scan(W, (x) => at(x, y));
for (let x = 0; x < W; x++) scan(H, (y) => at(x, y));
// ignorovat extrémně krátké běhy (šum / šikmé hrany): vezmeme 1. percentil přes řádky místo absolutního minima
const whites = [], blacks = [];
const collect = (len, get) => {
  let run = 0, cur = get(0), seenWhite = false;
  for (let i = 1; i <= len; i++) {
    const v = i < len ? get(i) : null;
    if (v === cur) { run++; continue; }
    run++;
    if (cur) { whites.push(run); seenWhite = true; } else if (seenWhite && v === true) blacks.push(run);
    cur = v; run = 0;
  }
};
for (let y = 0; y < H; y += 2) collect(W, (x) => at(x, y));
for (let x = 0; x < W; x += 2) collect(H, (y) => at(x, y));
whites.sort((a, b) => a - b); blacks.sort((a, b) => a - b);
const pct = (arr, p) => arr[Math.floor(arr.length * p)];
console.log(`Logo: šířka ${logoW} px`);
console.log(`Tah (bílá): min ${minWhite}px, 2. percentil ${pct(whites, 0.02)}px = ${(pct(whites, 0.02) / logoW * 100).toFixed(2)} % šířky loga`);
console.log(`Tah percentily: 10 % = ${(pct(whites, 0.10) / logoW * 100).toFixed(1)} %, 25 % = ${(pct(whites, 0.25) / logoW * 100).toFixed(1)} %, medián = ${(pct(whites, 0.5) / logoW * 100).toFixed(1)} % šířky loga`);
console.log(`Mezera (černá uvnitř): min ${minBlack}px, 2. percentil ${pct(blacks, 0.02)}px = ${(pct(blacks, 0.02) / logoW * 100).toFixed(2)} % šířky loga`);
for (const w of [6, 8, 10, 12, 15, 20, 30, 40]) {
  console.log(`  logo ${w} mm: nejtenčí tah ≈ ${(pct(whites, 0.02) / logoW * w).toFixed(2)} mm, nejužší mezera ≈ ${(pct(blacks, 0.02) / logoW * w).toFixed(2)} mm`);
}
