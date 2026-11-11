// Jednoduchý načítač 3MF (včetně Bambu Studio / OrcaSlicer projektů, kde jsou sítě v 3D/Objects/*.model).
// Vrací seznam unikátních sítí a počet jejich výskytů na podložce.
import * as THREE from "three";
import { unzipSync, strFromU8 } from "three/examples/jsm/libs/fflate.module.js";

/**
 * @param {ArrayBuffer} buffer obsah .3mf
 * @returns {{ meshes: {name:string, geometry:THREE.BufferGeometry, instances:number}[] }}
 */
export function parse3mf(buffer) {
  const zip = unzipSync(new Uint8Array(buffer));
  const modelFiles = Object.keys(zip).filter((n) => /^3D\/.*\.model$/i.test(n));
  if (modelFiles.length === 0) throw new Error("3MF neobsahuje žádný model (3D/*.model)");

  // 1) Všechny sítě: klíč = "/cesta#objectid"
  const meshes = new Map();
  const xmlByFile = new Map();
  for (const name of modelFiles) {
    const xml = strFromU8(zip[name]);
    xmlByFile.set("/" + name, xml);
    const objRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
    let m;
    while ((m = objRe.exec(xml))) {
      const id = /\bid="(\d+)"/.exec(m[1])?.[1];
      const body = m[2];
      if (!id || !body.includes("<mesh>")) continue;
      meshes.set(`/${name}#${id}`, { name: `${name.replace(/^3D\//, "")} #${id}`, body, instances: 0 });
    }
  }

  // 2) Spočítat výskyty: build items -> objekty -> komponenty (s p:path) -> sítě
  const main = xmlByFile.get("/3D/3dmodel.model") ?? xmlByFile.values().next().value;
  const mainName = xmlByFile.get("/3D/3dmodel.model") ? "/3D/3dmodel.model" : "/" + modelFiles[0];
  const resolve = (file, id, depth = 0) => {
    if (depth > 8) return [];
    const key = `${file}#${id}`;
    if (meshes.has(key)) return [key];
    const xml = xmlByFile.get(file);
    if (!xml) return [];
    const objRe = new RegExp(`<object\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/object>`);
    const body = objRe.exec(xml)?.[1];
    if (!body) return [];
    const out = [];
    const compRe = /<component\b([^>]*)\/?>/g;
    let c;
    while ((c = compRe.exec(body))) {
      const cid = /\bobjectid="(\d+)"/.exec(c[1])?.[1];
      const cpath = /\bp:path="([^"]+)"/.exec(c[1])?.[1] ?? file;
      if (cid) out.push(...resolve(cpath, cid, depth + 1));
    }
    return out;
  };
  const itemRe = /<item\b([^>]*)\/?>/g;
  let it;
  let anyItem = false;
  while ((it = itemRe.exec(main))) {
    anyItem = true;
    const oid = /\bobjectid="(\d+)"/.exec(it[1])?.[1];
    const ipath = /\bp:path="([^"]+)"/.exec(it[1])?.[1] ?? mainName;
    if (oid) for (const k of resolve(ipath, oid)) meshes.get(k).instances++;
  }
  if (!anyItem) for (const m of meshes.values()) m.instances = 1;

  // 3) Převést na geometrie
  const result = [];
  for (const m of meshes.values()) {
    const verts = [];
    const vRe = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g;
    let v;
    while ((v = vRe.exec(m.body))) verts.push(+v[1], +v[2], +v[3]);
    const idx = [];
    const tRe = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g;
    let t;
    while ((t = tRe.exec(m.body))) idx.push(+t[1], +t[2], +t[3]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geometry.setIndex(idx);
    result.push({ name: m.name, geometry, instances: Math.max(1, m.instances) });
  }
  result.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
  return { meshes: result };
}
