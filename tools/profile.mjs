// Profil žebrování: body háčku v řezu |x| < 0.25 u vrcholu horního oblouku (z > 57), vypsané jako (y, z) po y.
import { readFile } from "node:fs/promises";
const buf = await readFile("produkty/DS-007-hacek-S.stl");
const n = buf.readUInt32LE(80);
const pts = new Map();
for (let i = 0; i < n; i++) {
  const o = 84 + i * 50;
  for (let k = 0; k < 3; k++) {
    const x = buf.readFloatLE(o + 12 + k * 12), y = buf.readFloatLE(o + 16 + k * 12), z = buf.readFloatLE(o + 20 + k * 12);
    if (Math.abs(x) < 0.25 && z > 20) {
      const key = (Math.round(y * 10) / 10).toFixed(1);
      const cur = pts.get(key) ?? { min: Infinity, max: -Infinity, zs: new Set() };
      cur.min = Math.min(cur.min, z); cur.max = Math.max(cur.max, z);
      cur.zs.add(Math.round(z * 10) / 10);
      pts.set(key, cur);
    }
  }
}
const rows = [...pts.entries()].sort((a, b) => a[0] - b[0]);
console.log("y [mm] -> z hodnoty v řezu x≈0, z>20 (originální souřadnice)");
for (const [y, v] of rows) console.log(`${y.padStart(6)}  min ${v.min.toFixed(2)}  max ${v.max.toFixed(2)}  z: ${[...v.zs].sort((a, b) => a - b).join(" ")}`);
