// Obálka Web Workeru s Manifoldem: posílání modelu (s pokusem o opravu), výpočet vyřezání, export.
import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

export class CsgEngine {
  constructor() {
    this.worker = new Worker(new URL("./csg.worker.js", import.meta.url), { type: "module" });
    this.pending = new Map();
    this.nextId = 1;
    this.worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      ok ? p.resolve(result) : p.reject(new Error(error));
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || "Chyba workeru"));
      this.pending.clear();
    };
  }

  request(type, payload, transfer = []) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload }, transfer);
    });
  }

  /**
   * Pošle model do workeru. Pokud síť není uzavřená, zkusí ji opravit (sloučení vrcholů s rostoucí tolerancí,
   * odstranění degenerovaných trojúhelníků). Vrací { info, merged, repair } – repair popisuje, co zabralo.
   */
  async setModel(geometry) {
    const attempts = [
      { tol: 1e-4, label: null },
      { tol: 1e-3, label: "sloučení vrcholů (tolerance 0,001 mm)" },
      { tol: 5e-3, label: "sloučení vrcholů (tolerance 0,005 mm)" },
      { tol: 2e-2, label: "sloučení vrcholů (tolerance 0,02 mm)" },
    ];
    let last = null;
    for (const a of attempts) {
      const merged = removeDegenerate(BufferGeometryUtils.mergeVertices(geometry, a.tol));
      const positions = new Float32Array(merged.attributes.position.array);
      const index = new Uint32Array(merged.index.array);
      const info = await this.request("setModel", { positions, index }, [positions.buffer, index.buffer]);
      if (info.status === "NoError") return { info, merged, repair: a.label };
      last = { info, merged };
      merged.dispose();
    }
    return { info: last.info, merged: null, repair: null };
  }

  cut(payload) {
    return this.request("cut", payload);
  }

  /** Vrací { bytes: Uint8Array, check: {status,...}, ms }. */
  exportFile(payload) {
    return this.request("export", payload);
  }
}

/** Odstraní trojúhelníky s opakovaným indexem (vznikají po sloučení vrcholů). */
function removeDegenerate(geometry) {
  const idx = geometry.index.array;
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a !== b && b !== c && a !== c) keep.push(a, b, c);
  }
  if (keep.length !== idx.length) geometry.setIndex(keep);
  return geometry;
}

/** Z dat workeru (positions, index) vytvoří Three.js geometrii s normálami. */
export function geometryFromMeshData({ positions, index }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  flat.computeBoundingBox();
  flat.computeBoundingSphere();
  g.dispose();
  return flat;
}
