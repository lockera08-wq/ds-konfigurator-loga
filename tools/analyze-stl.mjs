// Rychlá analýza STL: rozměry, plochy podle směru normály, profil v ose Y (žebrování), šířka pásu.
// Spuštění: node tools/analyze-stl.mjs <soubor.stl>
import { readFile } from "node:fs/promises";

const file = process.argv[2];
const buf = await readFile(file);
const n = buf.readUInt32LE(80);

let areaX = 0, areaY = 0, areaZ = 0, areaOther = 0, total = 0;
const yHist = new Map(); // zaokrouhlená y hodnota -> plocha s normálou ±Y
const xzAtZ0 = [];
for (let i = 0; i < n; i++) {
  const o = 84 + i * 50;
  const ax = buf.readFloatLE(o + 12), ay = buf.readFloatLE(o + 16), az = buf.readFloatLE(o + 20);
  const bx = buf.readFloatLE(o + 24), by = buf.readFloatLE(o + 28), bz = buf.readFloatLE(o + 32);
  const cx = buf.readFloatLE(o + 36), cy = buf.readFloatLE(o + 40), cz = buf.readFloatLE(o + 44);
  const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
  let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const len = Math.hypot(nx, ny, nz);
  if (!len) continue;
  const area = len / 2;
  nx /= len; ny /= len; nz /= len;
  total += area;
  if (Math.abs(ny) > 0.98) {
    areaY += area;
    const y = Math.round(((ay + by + cy) / 3) * 10) / 10;
    yHist.set(y, (yHist.get(y) || 0) + area);
  } else if (Math.abs(nx) > 0.98) areaX += area;
  else if (Math.abs(nz) > 0.98) areaZ += area;
  else areaOther += area;
  // body blízko z=0 pro šířku pásu
  for (const [px, py, pz] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) if (Math.abs(pz) < 0.15) xzAtZ0.push([px, py]);
}
console.log(`Trojúhelníků: ${n}, celková plocha ${total.toFixed(0)} mm²`);
console.log(`Plocha s normálou ±Y (rovné boky S): ${areaY.toFixed(0)} mm² (${((areaY / total) * 100).toFixed(1)} %)`);
console.log(`Plocha ±X: ${areaX.toFixed(0)}, ±Z: ${areaZ.toFixed(0)}, ostatní (zakřivené): ${areaOther.toFixed(0)} mm²`);
console.log("Rovné plochy ±Y podle výšky y (mm -> mm²):");
for (const [y, a] of [...yHist.entries()].sort((p, q) => p[0] - q[0])) if (a > 5) console.log(`  y=${y.toFixed(1)}: ${a.toFixed(0)} mm²`);
const xs = xzAtZ0.map((p) => p[0]);
console.log(`Body v rovině z≈0: x od ${Math.min(...xs).toFixed(2)} do ${Math.max(...xs).toFixed(2)}`);
// rozsahy x (segmenty) v z≈0 – šířka pásu S
const sorted = [...new Set(xs.map((x) => Math.round(x * 10) / 10))].sort((a, b) => a - b);
let segs = [], start = sorted[0], prev = sorted[0];
for (const x of sorted.slice(1)) { if (x - prev > 0.6) { segs.push([start, prev]); start = x; } prev = x; }
segs.push([start, prev]);
console.log("Segmenty x v z≈0 (šířka pásu):", segs.map(([a, b]) => `${a}…${b} (${(b - a).toFixed(1)} mm)`).join(", "));
