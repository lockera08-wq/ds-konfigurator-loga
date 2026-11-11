// Ladění: krok po kroku zkusí postavit logo v Manifoldu a vypíše, kde to selže.
import { readFile } from "node:fs/promises";
import path from "node:path";
import Module from "manifold-3d";

const wasm = await Module();
wasm.setup();
console.log("manifold init OK");
const { CrossSection, Manifold } = wasm;

const step = (name, fn) => {
  try { const r = fn(); console.log("OK", name); return r; }
  catch (e) {
    let msg = e;
    try { if (typeof e === "number" && wasm.getExceptionMessage) msg = wasm.getExceptionMessage(e); } catch {}
    console.log("FAIL", name, msg?.message ?? msg);
    process.exit(1);
  }
};

const data = JSON.parse(await readFile(path.resolve(import.meta.dirname, "..", "public", "DS-logo-polygons.json"), "utf8"));
console.log("polygons", data.polygons.length, data.polygons.map((p) => p.length));
let cs = step("CrossSection", () => new CrossSection(data.polygons, "EvenOdd"));
console.log("  area", cs.area(), "contours", cs.numContour());
cs = step("scale", () => cs.scale([6, 6]));
const d = 0.25;
let cs2 = step("offset -", () => cs.offset(-d, "Round"));
console.log("  area", cs2.area(), "contours", cs2.numContour());
cs2 = step("offset +", () => cs2.offset(d, "Round"));
cs2 = step("simplify", () => cs2.simplify(0.003));
console.log("  area", cs2.area(), "contours", cs2.numContour());
const logo = step("extrude", () => Manifold.extrude(cs2, 0.7));
console.log("  logo tris", logo.numTri(), "status", logo.status());
const cyl = step("cylinder", () => Manifold.cylinder(3.4, 4, 4, 96));
console.log("  cyl", cyl.numTri());
