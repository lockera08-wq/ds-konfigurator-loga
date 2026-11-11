// Převod vektorového loga (SVG z potrace: jedna cesta M/C/L) na polygony pro aplikaci i CLI.
// Výstup: public/DS-logo-polygons.json – pole obrysů [[x,y],...], normalizované: šířka 1, střed (0,0), Y nahoru.
// Spuštění: node tools/svg-to-polygons.mjs [logo/DS-logo.svg]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const src = process.argv[2] ?? path.join(ROOT, "logo", "DS-logo.svg");
const svg = await readFile(src, "utf8");
const d = /\sd="([^"]+)"/.exec(svg)?.[1];
if (!d) throw new Error("V SVG není atribut d");

// --- tokenizace: příkazy M, C, L (absolutní – potrace je tak emituje) ---
const tokens = d.match(/[MCLZmclz]|-?\d*\.?\d+(?:e-?\d+)?/g);
const contours = [];
let cur = null;
let pos = [0, 0];
let i = 0;
const num = () => Number(tokens[i++]);
const SEG = 8; // vzorků na jednu Bézierovu křivku (potrace má krátké segmenty)

function cubic(p0, p1, p2, p3, out) {
  // adaptivně podle délky řídicího polygonu
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const n = Math.max(2, Math.min(SEG, Math.ceil(len / 6)));
  for (let k = 1; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

let lastCmd = null;
while (i < tokens.length) {
  let t = tokens[i++];
  if (/^[MCLZmclz]$/.test(t)) lastCmd = t;
  else {
    // číslo bez příkazu = opakování posledního příkazu (M -> L podle SVG normy)
    i--;
    t = lastCmd === "M" ? "L" : lastCmd === "m" ? "l" : lastCmd;
    if (!t) throw new Error(`Číslo bez příkazu na pozici ${i}`);
  }
  if (t === "M" || t === "m") {
    pos = t === "M" ? [num(), num()] : [pos[0] + num(), pos[1] + num()];
    cur = [pos];
    contours.push(cur);
  } else if (t === "L" || t === "l") {
    // rovný segment (potrace: roh „L p1 p2“ = dvě úsečky; druhá dvojice přijde jako opakování příkazu)
    pos = t === "L" ? [num(), num()] : [pos[0] + num(), pos[1] + num()];
    if (!cur) { cur = [pos]; contours.push(cur); } else cur.push(pos);
  } else if (t === "C" || t === "c") {
    const rel = t === "c";
    const p1 = rel ? [pos[0] + num(), pos[1] + num()] : [num(), num()];
    const p2 = rel ? [pos[0] + num(), pos[1] + num()] : [num(), num()];
    const p3 = rel ? [pos[0] + num(), pos[1] + num()] : [num(), num()];
    cubic(pos, p1, p2, p3, cur);
    pos = p3;
  } else if (t === "Z" || t === "z") {
    cur = null;
  } else {
    throw new Error(`Neočekávaný token ${t} na pozici ${i}`);
  }
}

// --- vyčištění: odstranit duplicitní koncový bod, zahodit prázdné ---
const cleaned = contours
  .map((c) => {
    const out = [];
    for (const p of c) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) out.push(p);
    }
    const first = out[0], last = out[out.length - 1];
    if (out.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) out.pop();
    return out;
  })
  .filter((c) => c.length >= 3);

// --- normalizace: střed (0,0), šířka 1, Y nahoru ---
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const c of cleaned) for (const [x, y] of c) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
const w = maxX - minX, h = maxY - minY;
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
const polygons = cleaned.map((c) => c.map(([x, y]) => [round((x - cx) / w), round(-(y - cy) / w)]));
function round(v) { return Math.round(v * 1e5) / 1e5; }

const area = (c) => { let a = 0; for (let k = 0; k < c.length; k++) { const [x1, y1] = c[k], [x2, y2] = c[(k + 1) % c.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
const info = polygons.map((c) => ({ points: c.length, area: round(area(c)) }));

const out = { source: path.basename(src), aspect: round(h / w), polygons };
await writeFile(path.join(ROOT, "public", "DS-logo-polygons.json"), JSON.stringify(out));
console.log(`Obrysů: ${polygons.length}, poměr stran ${out.aspect}`);
for (const [k, s] of info.entries()) console.log(`  obrys ${k + 1}: ${s.points} bodů, plocha ${s.area} (${s.area > 0 ? "proti směru" : "po směru"} hodinových ručiček)`);
console.log(`Uloženo: public/DS-logo-polygons.json`);
