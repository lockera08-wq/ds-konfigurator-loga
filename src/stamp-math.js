// Matematika razítka (bez DOM): orientace na povrchu, referenční výšky v kruhu, vyhlazená normála.
// Sdílí ji aplikace (placement.js, interaction.js) i skript pro příkazovou řádku (tools/apply-logo.mjs).
import * as THREE from "three";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/** Orientace razítka: lokální Z = normála, lokální Y = „nahoru“ (světová Z promítnutá do roviny) + otočení. */
export function stampQuaternion(normal, rotationDeg = 0) {
  const z = normal.clone().normalize();
  let up = new THREE.Vector3(0, 0, 1);
  if (Math.abs(z.dot(up)) > 0.98) up = new THREE.Vector3(0, -1, 0);
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(rotationDeg));
  return q.multiply(spin);
}

/** Světová matice razítka: bod + posun podél normály (lift = vysunutí + dorovnání). */
export function stampMatrix(point, normal, rotationDeg = 0, lift = 0) {
  const q = stampQuaternion(normal, rotationDeg);
  const pos = point.clone().addScaledVector(normal.clone().normalize(), lift);
  return new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
}

/**
 * Nejvyšší a nejnižší bod modelu uvnitř válce (osa = normála, poloměr r, výška ±r) kolem bodu.
 * @param {Float32Array} positions vrcholy xyz
 * @returns {{max:number, min:number}} výšky vůči rovině bodu
 */
export function refHeights(positions, point, normal, r) {
  const r2 = r * r;
  const n = normal, c = point;
  let max = 0, min = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - c.x, dy = positions[i + 1] - c.y, dz = positions[i + 2] - c.z;
    const h = dx * n.x + dy * n.y + dz * n.z;
    if (h > r || h < -r) continue;
    const d2 = dx * dx + dy * dy + dz * dz - h * h;
    if (d2 > r2) continue;
    if (h > max) max = h;
    if (h < min) min = h;
  }
  return { max, min };
}

const _sphere = new THREE.Sphere();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();

/**
 * Plošně vážený průměr normál trojúhelníků v kouli (radius) kolem bodu; potlačí žebrování a drobné fasety.
 * Trojúhelníky odvrácené od referenční normály se vynechají. Vyžaduje mesh.geometry.boundsTree.
 */
export function smoothNormalAt(mesh, worldPoint, radius, refNormal) {
  const bvh = mesh.geometry.boundsTree;
  if (!bvh) return null;
  const localPoint = mesh.worldToLocal(worldPoint.clone());
  _sphere.set(localPoint, radius);
  const sum = new THREE.Vector3();
  const refLocal = refNormal.clone().transformDirection(mesh.matrixWorld.clone().invert());
  bvh.shapecast({
    intersectsBounds: (box) => box.intersectsSphere(_sphere),
    intersectsTriangle: (tri) => {
      tri.getNormal(_n);
      if (_n.dot(refLocal) < 0.2) return false;
      _a.copy(tri.a).add(tri.b).add(tri.c).multiplyScalar(1 / 3);
      if (_a.distanceToSquared(localPoint) > radius * radius) return false;
      _b.subVectors(tri.b, tri.a);
      _c.subVectors(tri.c, tri.a);
      sum.addScaledVector(_n, _b.cross(_c).length() * 0.5);
      return false;
    },
  });
  if (sum.lengthSq() < 1e-12) return null;
  return sum.normalize().transformDirection(mesh.matrixWorld).normalize();
}

const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3(), _dir = new THREE.Vector3(), _rim = new THREE.Vector3();

/**
 * Podíl obvodu kruhu, pod kterým je povrch modelu (0–1). Z bodů na obvodu se střílí paprsek
 * proti normále; kde model nic nezachytí do hloubky 2r, kruh přečnívá přes hranu.
 * @param mesh model (s BVH), stampGroup = group razítka (lokální XY = rovina kruhu, Z = normála)
 */
export function rimCoverage(mesh, stampGroup, radius, samples = 32) {
  _ray.firstHitOnly = true;
  _ray.far = radius * 2 + 1;
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(stampGroup.getWorldQuaternion(new THREE.Quaternion()));
  let hits = 0;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    _rim.set(Math.cos(a) * radius * 0.98, Math.sin(a) * radius * 0.98, 0);
    stampGroup.localToWorld(_rim);
    _origin.copy(_rim).addScaledVector(normal, radius); // start nad povrchem
    _dir.copy(normal).negate();
    _ray.set(_origin, _dir);
    if (_ray.intersectObject(mesh, false).length > 0) hits++;
  }
  return hits / samples;
}

/** Připraví BVH pro rychlý raycasting / hledání nejbližšího bodu. */
export function prepareForRaycast(geometry) {
  if (geometry.boundsTree) geometry.disposeBoundsTree();
  geometry.computeBoundsTree();
}
