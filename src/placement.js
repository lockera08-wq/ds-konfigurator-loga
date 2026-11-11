// „Razítko“ loga na povrchu modelu: pozice, orientace, náhledová geometrie (kruh + logo + obrys), serializace.
import * as THREE from "three";
import { buildLogoGeometry, LOGO_MATERIAL } from "./logo.js";
import { stampQuaternion, refHeights } from "./stamp-math.js";

export const DEFAULT_PARAMS = {
  diameter: 8, // průměr kruhu [mm]
  recess: 0.4, // hloubka zapuštění kruhu [mm]
  relief: 0.4, // výška reliéfu loga ode dna kruhu [mm]
  logoPct: 75, // šířka loga v % průměru
  rotation: 0, // otočení [°]
  offset: 0, // vysunutí (+) / zasunutí (−) celé sestavy podél normály [mm]
  mirror: false,
  minStroke: 0.5, // minimální tloušťka tahu loga pro tisk [mm]; 0 = bez úprav
  fill: true, // vyplnit drážky / zakřivení pod kruhem do roviny dna (medailon)
};

export const PRESETS = {
  hacek: { label: "Háček 8 mm", params: { diameter: 8, recess: 0.4, relief: 0.4, logoPct: 75, minStroke: 0.5 } },
  stredni: { label: "Střední 20 mm", params: { diameter: 20, recess: 1.0, relief: 0.8, logoPct: 75, minStroke: 0.5 } },
  velke: { label: "Velké 40 mm", params: { diameter: 40, recess: 1.0, relief: 1.0, logoPct: 75, minStroke: 0.4 } },
};

const DISC_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x2b3550, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
const LOGO_INACTIVE_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xc98a4a, metalness: 0.1, roughness: 0.5 });
const mkLine = (color, opacity) => new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity });
const OUTLINE_ACTIVE = mkLine(0xff8a1f, 0.95);
const OUTLINE_ACTIVE_DIM = mkLine(0xff8a1f, 0.35);
const OUTLINE_INACTIVE = mkLine(0x8fa3c8, 0.7);
const OUTLINE_INACTIVE_DIM = mkLine(0x8fa3c8, 0.25);

let nextId = 1;

export class LogoStamp {
  constructor(logoShapes, params = {}) {
    this.id = nextId++;
    this.logoShapes = logoShapes;
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.point = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 0, 1);
    this.placed = false;
    this.active = true;
    this.refOffset = 0; // dorovnání na nejvyšší bod v kruhu (hřbety) [mm]
    this.refMin = 0; // nejnižší bod v kruhu [mm]
    this.refPositions = null; // Float32Array pozic vrcholů modelu

    this.group = new THREE.Group();
    this.group.name = `logoStamp-${this.id}`;
    this.group.visible = false;

    this.disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64), DISC_MATERIAL);
    this.disc.rotation.x = Math.PI / 2;
    this.group.add(this.disc);

    this.logoMesh = new THREE.Mesh(new THREE.BufferGeometry(), LOGO_MATERIAL);
    this.group.add(this.logoMesh);

    const circlePts = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      circlePts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    this.outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePts), OUTLINE_ACTIVE);
    this.outline.renderOrder = 999;
    this.group.add(this.outline);

    const crossGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.3, 0, 0), new THREE.Vector3(1.3, 0, 0),
      new THREE.Vector3(0, -1.3, 0), new THREE.Vector3(0, 1.3, 0),
    ]);
    this.cross = new THREE.LineSegments(crossGeo, OUTLINE_ACTIVE_DIM);
    this.cross.renderOrder = 999;
    this.group.add(this.cross);

    const nGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)]);
    this.normalLine = new THREE.Line(nGeo, OUTLINE_ACTIVE_DIM);
    this.normalLine.renderOrder = 999;
    this.group.add(this.normalLine);

    this.rebuild();
  }

  /** Objekty, na které lze kliknout pro tažení / výběr. */
  get pickables() {
    return [this.disc, this.logoMesh];
  }

  setActive(active) {
    this.active = active;
    this.outline.material = active ? OUTLINE_ACTIVE : OUTLINE_INACTIVE;
    this.cross.material = active ? OUTLINE_ACTIVE_DIM : OUTLINE_INACTIVE_DIM;
    this.normalLine.material = active ? OUTLINE_ACTIVE_DIM : OUTLINE_INACTIVE_DIM;
    this.logoMesh.material = active ? LOGO_MATERIAL : LOGO_INACTIVE_MATERIAL;
  }

  /** Umístí razítko do bodu s normálou (světové souřadnice). */
  setPose(point, normal) {
    this.point.copy(point);
    this.normal.copy(normal).normalize();
    this.placed = true;
    this.group.visible = true;
    this.computeRefOffset();
    this.updateTransform();
  }

  setParams(partial) {
    Object.assign(this.params, partial);
    this.rebuild();
    if ("diameter" in partial) this.computeRefOffset();
    this.updateTransform();
  }

  /** Vrcholy modelu (světové souřadnice, Float32Array xyz) pro dorovnání na hřbety. */
  setModelPositions(positions) {
    this.refPositions = positions;
    if (this.placed) { this.computeRefOffset(); this.updateTransform(); }
  }

  computeRefOffset() {
    this.refOffset = 0;
    this.refMin = 0;
    if (!this.refPositions) return;
    const { max, min } = refHeights(this.refPositions, this.point, this.normal, this.params.diameter / 2);
    this.refOffset = max;
    this.refMin = min;
  }

  /** Spodek výplně (medailonu) v lokálních souřadnicích razítka: pod nejnižší bod v kruhu. */
  padBottom() {
    return this.refMin - this.refOffset - 0.3;
  }

  /** Světová matice razítka pro CSG. */
  worldMatrix() {
    this.group.updateMatrixWorld(true);
    return Array.from(this.group.matrixWorld.elements);
  }

  /** Zadání pro CSG jádro. */
  job() {
    return { params: { ...this.params, padBottom: this.padBottom() }, matrix: this.worldMatrix() };
  }

  /** Přepíná mezi náhledem (kruh + logo) a režimem „výsledek spočítán“ (jen obrys). */
  setPreviewVisible(v) {
    this.disc.visible = v;
    this.logoMesh.visible = v;
  }

  remove() {
    this.placed = false;
    this.group.visible = false;
  }

  dispose() {
    this.group.removeFromParent();
    this.logoMesh.geometry.dispose();
    this.disc.geometry.dispose();
    this.outline.geometry.dispose();
    this.cross.geometry.dispose();
    this.normalLine.geometry.dispose();
  }

  updateTransform() {
    this.group.quaternion.copy(stampQuaternion(this.normal, this.params.rotation));
    this.group.position.copy(this.point).addScaledVector(this.normal, this.params.offset + this.refOffset);
  }

  /** Přestaví náhledovou geometrii podle parametrů. */
  rebuild() {
    const p = this.params;
    const r = p.diameter / 2;
    const discH = p.recess + 0.02;
    this.disc.scale.set(r, discH, r);
    this.disc.position.z = -p.recess + discH / 2;

    const logoW = (p.diameter * p.logoPct) / 100;
    this.logoMesh.geometry.dispose();
    this.logoMesh.geometry = buildLogoGeometry(this.logoShapes, logoW, p.relief);
    this.logoMesh.position.z = -p.recess;
    this.logoMesh.scale.x = p.mirror ? -1 : 1;

    this.outline.scale.set(r, r, 1);
    this.outline.position.z = 0.05;
    const crossS = Math.max(0.6, r * 0.25);
    this.cross.scale.set(crossS, crossS, 1);
    this.cross.position.z = 0.05;
    this.normalLine.scale.z = Math.max(2, r * 0.6);
  }

  describe() {
    const p = this.params;
    return {
      point: `${this.point.x.toFixed(1)}, ${this.point.y.toFixed(1)}, ${this.point.z.toFixed(1)}`,
      logoWidth: ((p.diameter * p.logoPct) / 100).toFixed(1),
      logoTop: (-p.recess + p.relief + p.offset + this.refOffset).toFixed(2),
      refOffset: this.refOffset.toFixed(2),
    };
  }

  // ---------- serializace ----------
  toJSON() {
    const r = (v) => Math.round(v * 1e4) / 1e4;
    return {
      point: this.point.toArray().map(r),
      normal: this.normal.toArray().map((v) => Math.round(v * 1e6) / 1e6),
      params: { ...this.params },
    };
  }

  static fromJSON(logoShapes, data, refPositions) {
    const s = new LogoStamp(logoShapes, data.params);
    s.refPositions = refPositions;
    s.setPose(new THREE.Vector3().fromArray(data.point), new THREE.Vector3().fromArray(data.normal));
    return s;
  }
}
