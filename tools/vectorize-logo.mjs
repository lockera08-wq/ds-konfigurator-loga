// Vektorizace loga DS: rastr (webp) -> vyčištěná černobílá PNG -> SVG (potrace)
// Spuštění: npm run logo:vectorize
import sharp from "sharp";
import potrace from "potrace";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "logo", "DS-logo-original.webp");
const OUT_DIR = path.join(ROOT, "logo");
const PUBLIC_DIR = path.join(ROOT, "public");

const SCALE = 3; // zvětšení před trasováním = hladší křivky
const THRESHOLD = 128;

await mkdir(OUT_DIR, { recursive: true });
await mkdir(PUBLIC_DIR, { recursive: true });

// 1) Rastr: zvětšit, převést na stupně šedi, lehce rozmazat (potlačí texturu pozadí), prahovat.
//    Logo je bílé na tmavém pozadí -> po prahování je logo bílé (255), pozadí černé (0).
const meta = await sharp(SRC).metadata();
const bwPath = path.join(OUT_DIR, "DS-logo-bw.png");
await sharp(SRC)
  .resize(meta.width * SCALE, meta.height * SCALE, { kernel: "lanczos3" })
  .grayscale()
  .blur(1.2)
  .threshold(THRESHOLD)
  .png()
  .toFile(bwPath);

// 2) Trasování. potrace trasuje tmavé plochy; logo je světlé, proto blackOnWhite: false.
const trace = promisify(potrace.trace);
const svgRaw = await trace(bwPath, {
  blackOnWhite: false,
  threshold: THRESHOLD,
  turdSize: 40, // odstraní drobné šumové ostrůvky
  optTolerance: 0.3, // 0 = věrně, 1 = hodně zjednodušeno
  alphaMax: 1.0, // hladkost rohů (1 = standard potrace)
  color: "#ffffff",
  background: "#0b1a3a",
});

// 3) Vyčistit SVG: nechat jen cestu, nastavit viewBox v mm (šířka loga = 100 mm jako referenční měřítko)
const pathMatch = svgRaw.match(/<path[^>]*d="([^"]+)"/);
if (!pathMatch) throw new Error("potrace nevrátil cestu");
const d = pathMatch[1];
const W = meta.width * SCALE;
const H = meta.height * SCALE;

const svgClean = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <path id="ds-logo" fill="#000000" fill-rule="evenodd" d="${d}"/>
</svg>
`;
await writeFile(path.join(OUT_DIR, "DS-logo.svg"), svgClean, "utf8");
await writeFile(path.join(PUBLIC_DIR, "DS-logo.svg"), svgClean, "utf8");

// 4) Náhled pro porovnání: originál | vektor (vyrenderovaný), vedle sebe
const previewW = meta.width;
const previewH = meta.height;
const vecPng = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${previewW}" height="${previewH}">
      <rect width="100%" height="100%" fill="#0b1a3a"/>
      <path fill="#ffffff" fill-rule="evenodd" d="${d}"/>
    </svg>`
  )
).png().toBuffer();
const origPng = await sharp(SRC).resize(previewW, previewH).png().toBuffer();
await sharp({
  create: { width: previewW * 2 + 20, height: previewH, channels: 3, background: "#ffffff" },
})
  .composite([
    { input: origPng, left: 0, top: 0 },
    { input: vecPng, left: previewW + 20, top: 0 },
  ])
  .png()
  .toFile(path.join(OUT_DIR, "DS-logo-porovnani.png"));

// 5) Statistika
const nodes = (d.match(/[MLCQZmlcqz]/g) || []).length;
console.log(`Hotovo. Rozměr trasování ${W}x${H}px, počet příkazů cesty: ${nodes}`);
console.log(`SVG: ${path.join(OUT_DIR, "DS-logo.svg")}`);
console.log(`Porovnání: ${path.join(OUT_DIR, "DS-logo-porovnani.png")}`);
