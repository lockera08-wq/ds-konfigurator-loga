// Zapisovače výstupních souborů: binární STL a 3MF (jeden objekt, dvě části: model + logo).
// Bez DOM – použitelné v prohlížeči i v Node.
import { zipSync, strToU8 } from "three/examples/jsm/libs/fflate.module.js";

/**
 * Binární STL z indexované sítě.
 * @param {{positions: Float32Array, index: Uint32Array}} mesh
 * @param {[number,number,number]} offset posun přičtený ke každému vrcholu (návrat do původních souřadnic)
 * @returns {Uint8Array}
 */
export function writeStl(mesh, offset = [0, 0, 0], header = "Konfigurator loga DS") {
  const { positions: P, index: I } = mesh;
  const nTri = I.length / 3;
  const buf = new ArrayBuffer(84 + nTri * 50);
  const dv = new DataView(buf);
  const h = new TextEncoder().encode(header.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(h);
  dv.setUint32(80, nTri, true);
  let o = 84;
  const [ox, oy, oz] = offset;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / len, true); dv.setFloat32(o + 4, ny / len, true); dv.setFloat32(o + 8, nz / len, true);
    let q = o + 12;
    for (const i of [a, b, c]) {
      dv.setFloat32(q, P[i] + ox, true); dv.setFloat32(q + 4, P[i + 1] + oy, true); dv.setFloat32(q + 8, P[i + 2] + oz, true);
      q += 12;
    }
    dv.setUint16(o + 48, 0, true);
    o += 50;
  }
  return new Uint8Array(buf);
}

function meshXml(id, name, mesh, offset) {
  const { positions: P, index: I } = mesh;
  const [ox, oy, oz] = offset;
  const parts = [`  <object id="${id}" name="${escapeXml(name)}" type="model">\n   <mesh>\n    <vertices>\n`];
  const v = new Array(P.length / 3);
  for (let i = 0, k = 0; i < P.length; i += 3, k++) {
    v[k] = `     <vertex x="${fmt(P[i] + ox)}" y="${fmt(P[i + 1] + oy)}" z="${fmt(P[i + 2] + oz)}"/>`;
  }
  parts.push(v.join("\n"), "\n    </vertices>\n    <triangles>\n");
  const t = new Array(I.length / 3);
  for (let i = 0, k = 0; i < I.length; i += 3, k++) {
    t[k] = `     <triangle v1="${I[i]}" v2="${I[i + 1]}" v3="${I[i + 2]}"/>`;
  }
  parts.push(t.join("\n"), "\n    </triangles>\n   </mesh>\n  </object>\n");
  return parts.join("");
}

const fmt = (x) => (Math.abs(x) < 1e-7 ? "0" : x.toFixed(5).replace(/\.?0+$/, ""));
const escapeXml = (s) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

/**
 * 3MF: objekt „model“ (id 1) + objekt „Logo DS“ (id 2) složené do jednoho objektu (id 3) jako dvě části.
 * Bambu Studio / PrusaSlicer to načtou jako jeden objekt se dvěma díly, každému jde přiřadit filament.
 * @returns {Uint8Array} obsah .3mf (zip)
 */
export function write3mf({ model, logo }, { name = "Model", offset = [0, 0, 0] } = {}) {
  const modelXml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n` +
    ` <metadata name="Application">Konfigurator loga DS</metadata>\n` +
    ` <metadata name="Title">${escapeXml(name)}</metadata>\n` +
    ` <resources>\n` +
    meshXml(1, name, model, offset) +
    meshXml(2, "Logo DS", logo, offset) +
    `  <object id="3" name="${escapeXml(name)}" type="model">\n` +
    `   <components>\n` +
    `    <component objectid="1"/>\n` +
    `    <component objectid="2"/>\n` +
    `   </components>\n` +
    `  </object>\n` +
    ` </resources>\n` +
    ` <build>\n  <item objectid="3"/>\n </build>\n` +
    `</model>\n`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
    ` <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
    ` <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n` +
    `</Types>\n`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
    ` <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n` +
    `</Relationships>\n`;

  return zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(rels),
      "3D/3dmodel.model": strToU8(modelXml),
    },
    { level: 6 }
  );
}

/** Název výstupu: původní název bez přípony + "-logo-DS" + přípona. */
export function outputName(originalName, ext) {
  const base = originalName.replace(/\.(stl|3mf)$/i, "").replace(/-logo-DS$/i, "");
  return `${base}-logo-DS.${ext}`;
}
