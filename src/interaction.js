// Myš: klik na model = umístit / přemístit logo, tažení loga = klouzání po povrchu, jinak otáčení kamery.
import * as THREE from "three";
import { smoothNormalAt, prepareForRaycast } from "./stamp-math.js";

export { prepareForRaycast };

const CLICK_PX = 4;

/**
 * @param getStamps () => LogoStamp[] (všechna umístěná razítka)
 * @param getActive () => LogoStamp | null
 * @param onPick (stamp) => void – uživatel chytil razítko (stane se aktivním)
 * @param onPlace ({point, normal}) => void – klik na model (umístit / přemístit)
 * @param onDrag ({point, normal}) => void – tažení aktivního razítka
 * @param onReleased () => void – po puštění myši (spustí přepočet)
 */
export function setupInteraction({ canvas, camera, controls, getModelMesh, getStamps, getActive, onPick, onPlace, onDrag, onReleased, onHover }) {
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  const ndc = new THREE.Vector2();
  let down = null; // { x, y, dragging }
  let hoverOnStamp = false;

  function toNdc(e) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  /** Paprsek na model; vrací { point, normal } ve světových souřadnicích nebo null. */
  function hitModel(e) {
    const mesh = getModelMesh();
    if (!mesh) return null;
    toNdc(e);
    const hits = raycaster.intersectObject(mesh, false);
    if (!hits.length) return null;
    const h = hits[0];
    const faceN = h.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
    if (faceN.dot(raycaster.ray.direction) > 0) faceN.negate();
    const active = getActive();
    const radius = Math.max(1.5, (active?.params.diameter ?? 8) / 2);
    const smooth = smoothNormalAt(mesh, h.point, radius, faceN) ?? faceN;
    return { point: h.point.clone(), normal: smooth };
  }

  /** Vrací razítko pod kurzorem nebo null. */
  function hitStamp(e) {
    const stamps = getStamps().filter((s) => s.placed);
    if (!stamps.length) return null;
    toNdc(e);
    let best = null, bestDist = Infinity;
    for (const s of stamps) {
      const hits = raycaster.intersectObjects(s.pickables, false);
      if (hits.length && hits[0].distance < bestDist) { best = s; bestDist = hits[0].distance; }
    }
    return best;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const stamp = hitStamp(e);
    down = { x: e.clientX, y: e.clientY, dragging: !!stamp };
    if (stamp) {
      onPick?.(stamp);
      controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (down?.dragging) {
      const hit = hitModel(e);
      if (hit) onDrag?.(hit);
      return;
    }
    const over = !down && !!hitStamp(e);
    if (over !== hoverOnStamp) {
      hoverOnStamp = over;
      canvas.style.cursor = over ? "grab" : "";
      onHover?.(over);
    }
  });

  const finish = (e) => {
    if (!down) return;
    const wasDrag = down.dragging;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_PX;
    down = null;
    controls.enabled = true;
    if (wasDrag) {
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      onReleased?.();
      return;
    }
    if (!moved) {
      const hit = hitModel(e);
      if (hit) { onPlace?.(hit); onReleased?.(); }
    }
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
}
