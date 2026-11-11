// Three.js scéna: kamera, světla, mřížka, ovládání, vykreslovací smyčka.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1420);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  camera.position.set(120, 90, 120);
  // Z nahoru jako u 3D tisku (slicery). Three.js má výchozí Y nahoru -> přepneme.
  camera.up.set(0, 0, 1);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;

  // Světla
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(100, -80, 160);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffe0c0, 0.5);
  fill.position.set(-120, 100, 60);
  scene.add(fill);

  // Mřížka v rovině XY (podložka tiskárny), 10 mm rastr
  const grid = new THREE.GridHelper(400, 40, 0x3a4664, 0x242d44);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);
  const axes = new THREE.AxesHelper(20);
  scene.add(axes);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function animate() {
    resize();
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  /** Nastaví kameru tak, aby byl objekt (nebo box) celý vidět. */
  function fitTo(object3dOrBox, viewDir = null) {
    const box = object3dOrBox.isBox3 ? object3dOrBox : new THREE.Box3().setFromObject(object3dOrBox);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = size.length() / 2;
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15;
    // viewDir = směr, ze kterého se díváme (např. normála loga); mírně nakloněný, aby byl vidět reliéf
    const dir = viewDir
      ? viewDir.clone().normalize().add(new THREE.Vector3(0.25, -0.25, 0.35)).normalize()
      : new THREE.Vector3(1, -1, 0.8).normalize();
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = Math.max(0.1, dist / 100);
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  }

  return { renderer, scene, camera, controls, grid, fitTo };
}
