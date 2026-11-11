// Web Worker: booleovské operace přes Manifold (WASM). Hlavní vlákno pošle model jednou,
// pak opakovaně parametry razítka; worker vrací vyřezaný model, těleso loga nebo hotové soubory.
import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { createCore } from "./csg-core.js";
import { writeStl, write3mf } from "./export.js";

let wasm = null;
let core = null;
let modelManifold = null;
let modelInfo = null;

async function init() {
  if (wasm) return;
  wasm = await Module({ locateFile: () => wasmUrl });
  wasm.setup();
  core = createCore(wasm);
}

function requireModel() {
  if (!modelManifold || modelInfo.status !== "NoError") {
    throw new Error(`Model není uzavřená síť (${modelInfo?.status ?? "nenačten"})`);
  }
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    await init();
    if (type === "setModel") {
      modelManifold?.delete();
      modelManifold = null;
      try {
        modelManifold = core.manifoldFromData(payload);
      } catch (err) {
        // Manifold u neuzavřené sítě vyhodí výjimku místo stavu
        modelInfo = { status: String(err?.message ?? err).replace(/^Error:\s*/, "") || "NotManifold", numTri: 0, genus: null, parts: null };
        self.postMessage({ id, ok: true, result: modelInfo });
        return;
      }
      const status = modelManifold.status();
      modelInfo = {
        status,
        numTri: status === "NoError" ? modelManifold.numTri() : 0,
        genus: status === "NoError" ? modelManifold.genus() : null,
        parts: status === "NoError" ? modelManifold.decompose().length : null,
      };
      self.postMessage({ id, ok: true, result: modelInfo });
      return;
    }
    if (type === "cut") {
      // payload: { stamps: [{params, matrix}], logoPolygons }
      requireModel();
      const t0 = performance.now();
      const { cut, logo } = core.cut(modelManifold, payload);
      const cutData = core.meshToData(cut);
      const logoData = core.meshToData(logo);
      cut.delete(); logo.delete();
      self.postMessage(
        { id, ok: true, result: { cut: cutData, logo: logoData, ms: Math.round(performance.now() - t0) } },
        [cutData.positions.buffer, cutData.index.buffer, logoData.positions.buffer, logoData.index.buffer]
      );
      return;
    }
    if (type === "export") {
      // payload: { job: {stamps, logoPolygons}, format: "stl" | "3mf", name, offset }
      requireModel();
      const t0 = performance.now();
      const { job, format, name, offset } = payload;
      let bytes, check;
      if (format === "stl") {
        const result = core.union(modelManifold, job);
        check = { status: result.status(), numTri: result.numTri(), genus: result.genus() };
        bytes = writeStl(core.meshToData(result), offset, `Konfigurator loga DS - ${name}`);
        result.delete();
      } else {
        const { cut, logo } = core.cut(modelManifold, job);
        check = { status: cut.status(), numTri: cut.numTri() + logo.numTri(), genus: cut.genus(), logoStatus: logo.status() };
        bytes = write3mf({ model: core.meshToData(cut), logo: core.meshToData(logo) }, { name, offset });
        cut.delete(); logo.delete();
      }
      self.postMessage({ id, ok: true, result: { bytes, check, ms: Math.round(performance.now() - t0) } }, [bytes.buffer]);
      return;
    }
    throw new Error(`Neznámý požadavek ${type}`);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message ?? String(err) });
  }
};
