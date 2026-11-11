// Načítání STL / 3MF, ukázkový model, informace o modelu.
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { parse3mf } from "./threemf.js";

export const MODEL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x9aa7c2,
  metalness: 0.05,
  roughness: 0.55,
  side: THREE.DoubleSide,
});

/**
 * Načte STL nebo 3MF ze souboru (File).
 * Vrací { parts, note }: parts = [{ name, instances, numTri, geometry }] (u STL jeden díl).
 * Geometrie dílů jsou „syrové“ (původní souřadnice); před použitím zavolej prepareGeometry().
 */
export async function loadModelFile(file) {
  const buffer = await file.arrayBuffer();
  if (/\.3mf$/i.test(file.name)) {
    const { meshes } = parse3mf(buffer);
    if (meshes.length === 0) throw new Error("3MF neobsahuje žádnou síť");
    const parts = meshes.map((m) => ({
      name: m.name,
      instances: m.instances,
      numTri: m.geometry.index.count / 3,
      geometry: m.geometry,
    }));
    const notes = [];
    if (parts[0].instances > 1) notes.push(`sada ${parts[0].instances} ks, načten 1 kus`);
    if (parts.length > 1) notes.push(`${parts.length} různých dílů v souboru – vyber díl v seznamu`);
    return { parts, note: notes.join("; ") };
  }
  const geometry = new STLLoader().parse(buffer);
  return { parts: [{ name: file.name, instances: 1, numTri: geometry.attributes.position.count / 3, geometry }], note: "" };
}

/** Ukázkový model: krabička se zaoblenými rohy, 60×40×25 mm. */
export function createDemoGeometry() {
  const shape = new THREE.Shape();
  const w = 60, h = 40, r = 6;
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 25, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 4, curveSegments: 16,
  });
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/**
 * Připraví geometrii pro aplikaci: neindexovaná kopie, vycentrovaná do XY, položená na Z=0, s normálami.
 * Do userData.originalOffset uloží posun zpět do původních souřadnic (pro export 1:1).
 */
export function prepareGeometry(source) {
  const geometry = (source.index ? source.toNonIndexed() : source.clone());
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const center = box.getCenter(new THREE.Vector3());
  const minZ = box.min.z; // translate() přepočítá boundingBox, proto uložit předem
  geometry.translate(-center.x, -center.y, -minZ);
  geometry.userData.originalOffset = [center.x, center.y, minZ];
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function describeGeometry(geometry) {
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const tris = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
  return {
    dims: `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`,
    tris: tris.toLocaleString("cs-CZ"),
    size,
  };
}
