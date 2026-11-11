// Příkazová řádka: dosadí logo DS na model bez prohlížeče (stejné jádro jako aplikace).
//
// Použití (jedno logo):
//   node tools/apply-logo.mjs --model produkty/DS-007-hacek-S.stl --point 6.23,-1.80,28.19 [--normal nx,ny,nz]
//        [--diameter 8] [--recess 0.4] [--relief 0.4] [--logoPct 75] [--rotation 0] [--offset 0]
//        [--minStroke 0.5] [--mirror] [--noFill] [--out vystup]
// Použití (více log, soubor z aplikace „Uložit nastavení“ nebo z předchozího běhu):
//   node tools/apply-logo.mjs --model produkty/DS-007-hacek-S.stl --config vystup/DS-007-hacek-S-logo-DS.json
//
// Body jsou v původních souřadnicích modelu (nejbližší bod povrchu se dohledá automaticky).
// Pozn.: aplikace ukládá body v souřadnicích posunutých na podložku (model vycentrovaný v XY, dno na Z=0);
// skript to pozná podle pole "originalOffset" v JSON a přepočítá.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import Module from "manifold-3d";
import { createCore } from "../src/csg-core.js";
import { writeStl, write3mf, outputName } from "../src/export.js";
import { stampMatrix, refHeights, smoothNormalAt, prepareForRaycast } from "../src/stamp-math.js";
import { parse3mf } from "../src/threemf.js";

// ---------- argumenty ----------
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) continue;
  const key = a.slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith("--")) args[key] = true;
  else { args[key] = next; i++; }
}
if (!args.model || (!args.point && !args.config)) {
  console.error("Použití: node tools/apply-logo.mjs --model <soubor.stl|3mf> (--point x,y,z | --config soubor.json) [volby]");
  process.exit(1);
}
const num = (k, d) => (args[k] !== undefined ? Number(args[k]) : d);
const vec = (s) => { const v = s.split(",").map(Number); if (v.length !== 3 || v.some(Number.isNaN)) throw new Error(`Špatný vektor: ${s}`); return new THREE.Vector3(...v); };
const DEFAULTS = { diameter: 8, recess: 0.4, relief: 0.4, logoPct: 75, rotation: 0, offset: 0, minStroke: 0.5, mirror: false, fill: true };
const outDir = args.out ?? "vystup";

// ---------- model ----------
const modelPath = args.model;
const raw = await readFile(modelPath);
const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
let geometry;
if (/\.3mf$/i.test(modelPath)) {
  const { meshes } = parse3mf(ab);
  const pick = args.part !== undefined ? Number(args.part) : 0;
  geometry = meshes[pick].geometry.toNonIndexed();
  if (meshes.length > 1) console.log(`3MF: ${meshes.length} různých dílů, použit díl ${pick} (${meshes[pick].name}); jiný: --part N`);
  if (meshes[pick].instances > 1) console.log(`3MF: sada ${meshes[pick].instances} ks, použit 1 kus`);
} else {
  geometry = new STLLoader().parse(ab);
}
geometry.computeBoundingBox();
const bbox = geometry.boundingBox;
const size = bbox.getSize(new THREE.Vector3());
const center = bbox.getCenter(new THREE.Vector3());
const appOffset = [center.x, center.y, bbox.min.z]; // posun, který aplikace odečítá
console.log(`Model: ${path.basename(modelPath)}, ${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`);

const merged = BufferGeometryUtils.mergeVertices(geometry, 1e-4);
prepareForRaycast(merged);
const mesh = new THREE.Mesh(merged);
mesh.updateMatrixWorld(true);
const pos = merged.attributes.position;
const idx = merged.index;

// ---------- zadání log ----------
let requests; // [{ point: Vector3, normal: Vector3|null, params }]
let fromApp = false;
if (args.config) {
  const cfg = JSON.parse(await readFile(args.config, "utf8"));
  if (!Array.isArray(cfg.stamps)) throw new Error("JSON neobsahuje pole stamps");
  fromApp = !cfg.originalCoordinates; // soubor z aplikace = souřadnice posunuté na podložku
  requests = cfg.stamps.map((s) => ({
    point: new THREE.Vector3().fromArray(s.point).add(fromApp ? new THREE.Vector3(...appOffset) : new THREE.Vector3()),
    normal: s.normal ? new THREE.Vector3().fromArray(s.normal) : null,
    params: { ...DEFAULTS, ...s.params },
  }));
  console.log(`Nastavení: ${requests.length} log z ${args.config}${fromApp ? " (souřadnice z aplikace přepočteny)" : ""}`);
} else {
  requests = [{
    point: vec(args.point),
    normal: args.normal ? vec(args.normal) : null,
    params: {
      ...DEFAULTS,
      diameter: num("diameter", DEFAULTS.diameter), recess: num("recess", DEFAULTS.recess), relief: num("relief", DEFAULTS.relief),
      logoPct: num("logoPct", DEFAULTS.logoPct), rotation: num("rotation", DEFAULTS.rotation), offset: num("offset", DEFAULTS.offset),
      minStroke: num("minStroke", DEFAULTS.minStroke), mirror: !!args.mirror, fill: !args.noFill,
    },
  }];
}

// ---------- umístění každého loga ----------
const stamps = [];
const saved = [];
for (const [k, req] of requests.entries()) {
  const hit = merged.boundsTree.closestPointToPoint(req.point);
  if (!hit) throw new Error("Nenalezen bod na povrchu");
  const point = hit.point.clone();
  const tri = new THREE.Triangle(
    new THREE.Vector3().fromBufferAttribute(pos, idx.getX(hit.faceIndex * 3)),
    new THREE.Vector3().fromBufferAttribute(pos, idx.getX(hit.faceIndex * 3 + 1)),
    new THREE.Vector3().fromBufferAttribute(pos, idx.getX(hit.faceIndex * 3 + 2))
  );
  const faceN = tri.getNormal(new THREE.Vector3());
  let normal = req.normal ? req.normal.clone().normalize() : smoothNormalAt(mesh, point, Math.max(1.5, req.params.diameter / 2), faceN) ?? faceN;
  const { max: refOffset, min: refMin } = refHeights(pos.array, point, normal, req.params.diameter / 2);
  const padBottom = refMin - refOffset - 0.3;
  const matrix = Array.from(stampMatrix(point, normal, req.params.rotation, req.params.offset + refOffset).elements);
  stamps.push({ params: { ...req.params, padBottom }, matrix });
  saved.push({ point: point.toArray(), normal: normal.toArray(), params: req.params });
  console.log(`Logo ${k + 1}: bod ${point.toArray().map((v) => v.toFixed(2)).join(", ")} (odchylka ${hit.distance.toFixed(2)} mm), ` +
    `normála ${normal.toArray().map((v) => v.toFixed(3)).join(", ")}, dorovnání +${refOffset.toFixed(2)} mm, kruh ${req.params.diameter} mm`);
}

// ---------- logo ----------
const logoPolygons = JSON.parse(await readFile(path.resolve(import.meta.dirname, "..", "public", "DS-logo-polygons.json"), "utf8")).polygons;

// ---------- CSG ----------
const wasm = await Module();
wasm.setup();
const core = createCore(wasm);
const model = core.manifoldFromData({ positions: new Float32Array(pos.array), index: new Uint32Array(idx.array) });
const status = model.status();
if (status !== "NoError") throw new Error(`Model není uzavřená síť: ${status}. Oprav ho v Bambu Studiu / PrusaSliceru.`);

const job = { stamps, logoPolygons };
const t0 = performance.now();
const union = core.union(model, job);
const { cut, logo } = core.cut(model, job);
const ms = Math.round(performance.now() - t0);
const parts = union.decompose().length;
console.log(`Vyřezáno za ${ms} ms. Sloučené těleso: ${union.numTri().toLocaleString("cs-CZ")} trojúhelníků, stav ${union.status()}, samostatných kusů: ${parts}`);

// ---------- zápis ----------
await mkdir(outDir, { recursive: true });
const base = path.basename(modelPath);
const stlName = outputName(base, "stl");
const mfName = outputName(base, "3mf");
await writeFile(path.join(outDir, stlName), writeStl(core.meshToData(union), [0, 0, 0], `Konfigurator loga DS - ${base}`));
await writeFile(path.join(outDir, mfName), write3mf({ model: core.meshToData(cut), logo: core.meshToData(logo) }, { name: base.replace(/\.(stl|3mf)$/i, "") }));
await writeFile(
  path.join(outDir, outputName(base, "json")),
  JSON.stringify({ version: 1, app: "Konfigurátor loga DS (CLI)", model: modelPath, originalCoordinates: true, savedAt: new Date().toISOString(), stamps: saved }, null, 2)
);
console.log(`Uloženo: ${path.join(outDir, stlName)}`);
console.log(`Uloženo: ${path.join(outDir, mfName)}`);
console.log(`Uloženo: ${path.join(outDir, outputName(base, "json"))}`);
union.delete(); cut.delete(); logo.delete(); model.delete();
