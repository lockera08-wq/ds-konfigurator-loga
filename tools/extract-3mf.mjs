// Vytáhne jednotlivé sítě z 3MF (včetně Bambu Studio formátu s 3D/Objects/*.model) a uloží je jako STL.
// Spuštění: node tools/extract-3mf.mjs <soubor.3mf> <výstupní složka>
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "three/examples/jsm/libs/fflate.module.js";

const [, , input, outDir = "test-modely"] = process.argv;
if (!input) {
  console.error("Použití: node tools/extract-3mf.mjs <soubor.3mf> [výstupní složka]");
  process.exit(1);
}

const zip = unzipSync(new Uint8Array(await readFile(input)));
await mkdir(outDir, { recursive: true });

const meshFiles = Object.keys(zip).filter((n) => /^3D\/.*\.model$/i.test(n));
let count = 0;
for (const name of meshFiles) {
  const xml = strFromU8(zip[name]);
  // Může obsahovat více <object> s <mesh>
  const objRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
  let m;
  while ((m = objRe.exec(xml))) {
    const attrs = m[1];
    const body = m[2];
    if (!body.includes("<mesh>")) continue;
    const id = /\bid="(\d+)"/.exec(attrs)?.[1] ?? "?";
    const verts = [];
    const vRe = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g;
    let v;
    while ((v = vRe.exec(body))) verts.push(+v[1], +v[2], +v[3]);
    const tris = [];
    const tRe = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g;
    let t;
    while ((t = tRe.exec(body))) tris.push(+t[1], +t[2], +t[3]);

    // Bounding box
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < verts.length; i += 3)
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], verts[i + k]); max[k] = Math.max(max[k], verts[i + k]); }

    // Binární STL
    const nTri = tris.length / 3;
    const buf = Buffer.alloc(84 + nTri * 50);
    buf.write(`3MF ${path.basename(name)} object ${id}`, 0, 80, "ascii");
    buf.writeUInt32LE(nTri, 80);
    let off = 84;
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i] * 3, b = tris[i + 1] * 3, c = tris[i + 2] * 3;
      const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
      const wx = verts[c] - verts[a], wy = verts[c + 1] - verts[a + 1], wz = verts[c + 2] - verts[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      buf.writeFloatLE(nx, off); buf.writeFloatLE(ny, off + 4); buf.writeFloatLE(nz, off + 8);
      for (const [j, idx] of [a, b, c].entries()) {
        buf.writeFloatLE(verts[idx], off + 12 + j * 12);
        buf.writeFloatLE(verts[idx + 1], off + 16 + j * 12);
        buf.writeFloatLE(verts[idx + 2], off + 20 + j * 12);
      }
      buf.writeUInt16LE(0, off + 48);
      off += 50;
    }
    const base = path.basename(input, path.extname(input)).replace(/[^\w\-]+/g, "_");
    const outName = `${base}__${path.basename(name, ".model")}_obj${id}.stl`;
    await writeFile(path.join(outDir, outName), buf);
    count++;
    console.log(
      `${outName}: ${nTri.toLocaleString("cs-CZ")} trojúhelníků, rozměry ` +
        `${(max[0] - min[0]).toFixed(2)} × ${(max[1] - min[1]).toFixed(2)} × ${(max[2] - min[2]).toFixed(2)} mm ` +
        `(min ${min.map((x) => x.toFixed(2)).join(", ")}; max ${max.map((x) => x.toFixed(2)).join(", ")})`
    );
  }
}
console.log(`Hotovo, ${count} síť/sítě.`);
