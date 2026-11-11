// Logo DS: načtení polygonů (public/DS-logo-polygons.json, normalizované na šířku 1) a vytažení do 3D.
import * as THREE from "three";

export const LOGO_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xff8a1f,
  metalness: 0.1,
  roughness: 0.45,
});

let cached = null;

/**
 * Načte polygony loga. Vrací { polygons, shapes, aspect }:
 *  - polygons: [[x,y],...][] pro Manifold (CrossSection, EvenOdd)
 *  - shapes: THREE.Shape[] pro náhled (díry určené podle obsažení v jiném obrysu)
 */
export async function loadLogo(url = `${import.meta.env.BASE_URL}DS-logo-polygons.json`) {
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nelze načíst ${url} (${res.status})`);
  const data = await res.json();
  cached = { polygons: data.polygons, aspect: data.aspect, shapes: shapesFromPolygons(data.polygons) };
  return cached;
}

/** Bod uvnitř polygonu (even-odd). */
function pointInPolygon([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Z obrysů udělá Shape[] – obrys obsažený v lichém počtu jiných obrysů je díra nejbližšího vnějšího. */
export function shapesFromPolygons(polygons) {
  const depth = polygons.map((c, k) => polygons.reduce((n, other, j) => (j !== k && pointInPolygon(c[0], other) ? n + 1 : n), 0));
  const shapes = [];
  const outerIndex = new Map();
  polygons.forEach((c, k) => {
    if (depth[k] % 2 === 0) {
      const s = new THREE.Shape(c.map(([x, y]) => new THREE.Vector2(x, y)));
      outerIndex.set(k, shapes.length);
      shapes.push(s);
    }
  });
  polygons.forEach((c, k) => {
    if (depth[k] % 2 === 1) {
      // Najít nejmenší vnější obrys, který ho obsahuje
      let best = -1, bestArea = Infinity;
      polygons.forEach((o, j) => {
        if (depth[j] % 2 === 0 && pointInPolygon(c[0], o)) {
          const a = Math.abs(area(o));
          if (a < bestArea) { bestArea = a; best = j; }
        }
      });
      if (best >= 0) shapes[outerIndex.get(best)].holes.push(new THREE.Path(c.map(([x, y]) => new THREE.Vector2(x, y))));
    }
  });
  return shapes;
}

function area(c) {
  let a = 0;
  for (let k = 0; k < c.length; k++) {
    const [x1, y1] = c[k], [x2, y2] = c[(k + 1) % c.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * 3D geometrie loga pro náhled.
 * @param {THREE.Shape[]} shapes normalizované tvary (šířka 1)
 * @param {number} widthMm šířka loga v mm
 * @param {number} heightMm výška reliéfu v mm (extruze v ose Z, od 0 do heightMm)
 */
export function buildLogoGeometry(shapes, widthMm, heightMm) {
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth: heightMm, bevelEnabled: false, curveSegments: 1 });
  geometry.scale(widthMm, widthMm, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
