// Vytvoří testovací STL modely do složky test-modely/ (pro zkoušení nahrávání a umístění loga).
// Spuštění: node tools/make-test-models.mjs
import * as THREE from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "..", "test-modely");
await mkdir(OUT, { recursive: true });
const exporter = new STLExporter();

function save(name, geometry) {
  const mesh = new THREE.Mesh(geometry);
  const data = exporter.parse(mesh, { binary: true });
  return writeFile(path.join(OUT, name), Buffer.from(data.buffer)).then(() =>
    console.log(`${name}: ${(data.byteLength / 1024).toFixed(0)} kB`)
  );
}

// 1) Hrnek/kelímek: válec s dnem, průměr 70, výška 80, stěna 3 mm (rotačně symetrický – test zakřiveného povrchu)
{
  const pts = [];
  const R = 35, r = 32, H = 80, t = 3;
  pts.push(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(R, 0));
  pts.push(new THREE.Vector2(R, H));
  pts.push(new THREE.Vector2(r, H));
  pts.push(new THREE.Vector2(r, t));
  pts.push(new THREE.Vector2(0, t));
  const g = new THREE.LatheGeometry(pts, 96);
  g.rotateX(Math.PI / 2); // osa lathe je Y -> otočit na Z
  g.rotateX(Math.PI); // dno dolů
  g.translate(0, 0, H);
  await save("kelimek-70x80.stl", g.toNonIndexed());
}

// 2) Deska s rovnou plochou 100×60×8
await save("deska-100x60x8.stl", new THREE.BoxGeometry(100, 60, 8).toNonIndexed());

// 3) Koule průměr 50 (test silně zakřiveného povrchu)
await save("koule-50.stl", new THREE.SphereGeometry(25, 64, 48).toNonIndexed());
