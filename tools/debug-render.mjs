// Ladění: vykreslí polygony loga (JSON) a výsledek Manifold CrossSection do PNG pro vizuální kontrolu.
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import Module from "manifold-3d";

const ROOT = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await readFile(path.join(ROOT, "public", "DS-logo-polygons.json"), "utf8"));
const wasm = await Module();
wasm.setup();
const { CrossSection } = wasm;

const W = 1200, H = 700, S = 1000; // měřítko: šířka loga 1 -> 1000 px
const toPath = (polys) => polys.map((c) => "M" + c.map(([x, y]) => `${(W / 2 + x * S).toFixed(1)},${(H / 2 - y * S).toFixed(1)}`).join("L") + "Z").join(" ");
const colors = ["#ff8a1f", "#4cd964", "#5ac8fa", "#ff5b5b", "#ffcc00", "#c678dd", "#ffffff", "#ff9ff3", "#48dbfb"];

function svgFor(polys, title, fillRule) {
  const outlines = polys.map((c, i) => `<path d="${toPath([c])}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="2"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#0b1a3a"/>
    <path d="${toPath(polys)}" fill="#ffffff" fill-opacity="0.35" fill-rule="${fillRule}"/>${outlines}
    <text x="10" y="30" fill="#fff" font-size="24" font-family="sans-serif">${title}</text></svg>`;
}

const cs = new CrossSection(data.polygons, "EvenOdd");
const after = cs.toPolygons();
console.log("raw:", data.polygons.length, "obrysů; po EvenOdd:", after.length, "obrysů, plocha", cs.area().toFixed(4));
for (const [i, c] of data.polygons.entries()) {
  const f = c[0], l = c[c.length - 1];
  console.log(`  raw ${i + 1}: ${c.length} bodů, první (${f[0]}, ${f[1]}) poslední (${l[0]}, ${l[1]})`);
}
await sharp(Buffer.from(svgFor(data.polygons, "raw polygons (evenodd)", "evenodd"))).png().toFile(path.join(ROOT, "logo", "debug-raw.png"));
await sharp(Buffer.from(svgFor(after, "Manifold CrossSection", "nonzero"))).png().toFile(path.join(ROOT, "logo", "debug-manifold.png"));
console.log("Uloženo logo/debug-raw.png, logo/debug-manifold.png");
