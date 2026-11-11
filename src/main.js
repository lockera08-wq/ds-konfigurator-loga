import * as THREE from "three";
import { createViewer } from "./viewer.js";
import { loadModelFile, createDemoGeometry, prepareGeometry, describeGeometry, MODEL_MATERIAL } from "./model.js";
import { loadLogo, LOGO_MATERIAL } from "./logo.js";
import { LogoStamp, DEFAULT_PARAMS, PRESETS } from "./placement.js";
import { setupInteraction, prepareForRaycast } from "./interaction.js";
import { rimCoverage } from "./stamp-math.js";
import { CsgEngine, geometryFromMeshData } from "./csg.js";
import { outputName } from "./export.js";
import { History } from "./history.js";

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const viewer = createViewer(canvas);
const csg = new CsgEngine();
const history = new History();
const STORAGE_PREFIX = "konfigurator-loga:";
const CONFIG_VERSION = 1;

const state = {
  modelMesh: null, // originál (pro raycasting), při zobrazení výsledku skrytý
  modelName: "model",
  modelParts: [], // díly z 3MF
  modelPositions: null, // vrcholy sloučené sítě pro dorovnání
  resultMesh: null,
  resultLogo: null,
  stamps: [], // LogoStamp[]
  activeIndex: -1,
  pendingNew: false, // další klik vytvoří nové logo
  logoShapes: null,
  logoPolygons: null,
  modelReady: false,
  computing: false,
  dirty: false,
  cutTimer: null,
};

// ---------- pomocné ----------
function setStatus(text, isError = false) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("err", isError);
}
function setCsgStatus(text, isError = false) {
  const el = $("csg-status");
  el.textContent = text;
  el.style.color = isError ? "var(--err)" : "";
}
function setExportStatus(text, isError = false) {
  const el = $("export-status");
  el.textContent = text;
  el.style.color = isError ? "var(--err)" : "";
}
const active = () => state.stamps[state.activeIndex] ?? null;

// ---------- model ----------
async function setModel(rawGeometry, name, parts = null) {
  clearResult();
  clearStamps();
  if (state.modelMesh) {
    viewer.scene.remove(state.modelMesh);
    state.modelMesh.geometry.dispose();
  }
  const geometry = prepareGeometry(rawGeometry);
  prepareForRaycast(geometry);
  const mesh = new THREE.Mesh(geometry, MODEL_MATERIAL.clone());
  mesh.material.wireframe = $("chk-wire").checked;
  mesh.name = "model";
  viewer.scene.add(mesh);
  state.modelMesh = mesh;
  state.modelName = name;
  if (parts) state.modelParts = parts;

  const info = describeGeometry(geometry);
  $("info-name").textContent = name;
  $("info-dims").textContent = info.dims;
  $("info-tris").textContent = info.tris;
  $("model-info").classList.remove("hidden");
  viewer.fitTo(mesh);
  setStatus(`Načteno: ${name} (${info.dims}). Klikni na model pro umístění loga.`);

  // Model do workeru (Manifold), s pokusem o opravu
  state.modelReady = false;
  state.modelPositions = null;
  $("csg-model").textContent = "kontroluji…";
  setCsgStatus("připravuji model…");
  try {
    const { info: mInfo, merged, repair } = await csg.setModel(geometry);
    if (mInfo.status === "NoError") {
      state.modelReady = true;
      state.modelPositions = new Float32Array(merged.attributes.position.array);
      merged.dispose();
      for (const s of state.stamps) s.setModelPositions(state.modelPositions);
      const partsNote = mInfo.parts > 1 ? `, ${mInfo.parts} oddělených těles` : "";
      $("csg-model").textContent = (repair ? `opraveno: ${repair}` : "uzavřená, v pořádku") + partsNote;
      $("csg-model").style.color = repair ? "var(--warn)" : "var(--ok)";
      setCsgStatus("připraveno");
      restoreAutosave();
    } else {
      $("csg-model").textContent = `chyba ${mInfo.status}`;
      $("csg-model").style.color = "var(--err)";
      setCsgStatus("model není uzavřený (vodotěsný) ani po pokusu o opravu – oprav ho v Bambu Studiu (pravý klik na model → Opravit) nebo v PrusaSliceru a nahraj znovu", true);
    }
  } catch (err) {
    console.error(err);
    setCsgStatus(`chyba: ${err.message}`, true);
  }
}

async function handleFile(file) {
  if (!file) return;
  if (!/\.(stl|3mf)$/i.test(file.name)) {
    setStatus("Podporuji soubory .stl a .3mf", true);
    return;
  }
  setStatus(`Načítám ${file.name}…`);
  try {
    const { parts, note } = await loadModelFile(file);
    fillPartSelect(parts);
    await setModel(parts[0].geometry, file.name, parts);
    if (note) setStatus(`${$("status").textContent} – ${note}`);
  } catch (err) {
    console.error(err);
    setStatus(`Nepodařilo se načíst model: ${err.message}`, true);
  }
}

function fillPartSelect(parts) {
  const row = $("part-row");
  const sel = $("part-select");
  sel.innerHTML = "";
  if (parts.length <= 1) { row.classList.add("hidden"); return; }
  parts.forEach((p, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = `${p.name} – ${p.numTri.toLocaleString("cs-CZ")} trojúh.${p.instances > 1 ? `, ${p.instances}×` : ""}`;
    sel.appendChild(o);
  });
  sel.value = "0";
  row.classList.remove("hidden");
}
$("part-select").addEventListener("change", (e) => {
  const part = state.modelParts[Number(e.target.value)];
  if (part) setModel(part.geometry, `${state.modelName.replace(/ · .*$/, "")} · ${part.name}`, state.modelParts);
});

$("file-stl").addEventListener("change", (e) => { handleFile(e.target.files[0]); e.target.value = ""; });
$("btn-demo").addEventListener("click", () => { fillPartSelect([]); setModel(createDemoGeometry(), "Ukázková krabička 60×40×25"); });

const dropHint = $("drop-hint");
window.addEventListener("dragover", (e) => { e.preventDefault(); dropHint.classList.remove("hidden"); });
window.addEventListener("dragleave", (e) => { if (e.relatedTarget === null) dropHint.classList.add("hidden"); });
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dropHint.classList.add("hidden");
  const f = e.dataTransfer.files[0];
  if (f && /\.json$/i.test(f.name)) loadConfigFile(f);
  else handleFile(f);
});

// ---------- loga (razítka) ----------
function clearStamps() {
  for (const s of state.stamps) s.dispose();
  state.stamps = [];
  state.activeIndex = -1;
  state.pendingNew = false;
  history.reset({ stamps: [], active: -1 });
  renderStampList();
  updateStampInfo();
}

function addStamp(params = null) {
  const base = active();
  const s = new LogoStamp(state.logoShapes, params ?? (base ? { ...base.params } : {}));
  s.setModelPositions(state.modelPositions);
  viewer.scene.add(s.group);
  state.stamps.push(s);
  setActive(state.stamps.length - 1);
  return s;
}

function removeActive() {
  const s = active();
  if (!s) return;
  s.dispose();
  state.stamps.splice(state.activeIndex, 1);
  setActive(Math.min(state.activeIndex, state.stamps.length - 1));
  state.pendingNew = false;
  commit();
  if (state.stamps.length === 0) clearResult(); else scheduleCut();
  setStatus(state.stamps.length ? "Logo odebráno." : "Logo odebráno. Klikni na model pro nové umístění.");
}

function setActive(i) {
  state.activeIndex = i;
  state.stamps.forEach((s, k) => s.setActive(k === i));
  syncParamsUI();
  renderStampList();
  updateStampInfo();
}

function renderStampList() {
  const el = $("stamp-list");
  el.innerHTML = "";
  state.stamps.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "chip" + (i === state.activeIndex ? " active" : "") + (s.placed ? "" : " pending");
    b.textContent = `Logo ${i + 1}` + (s.placed ? ` · ${s.params.diameter} mm` : " · klikni na model");
    b.addEventListener("click", () => { state.pendingNew = false; setActive(i); });
    el.appendChild(b);
  });
  $("place-hint").textContent = state.pendingNew || !state.stamps.length
    ? "Klikni na model: nové logo se připne do místa kliku."
    : "Klik na model přemístí aktivní logo. Chyť logo myší a táhni po povrchu. Delete = odebrat.";
}

function updateStampInfo() {
  const s = active();
  const placed = !!s?.placed;
  $("stamp-info").classList.toggle("hidden", !placed);
  $("btn-remove").classList.toggle("hidden", !s);
  $("btn-zoom-logo").classList.toggle("hidden", !placed);
  $("btn-undo").disabled = !history.canUndo;
  $("btn-redo").disabled = !history.canRedo;
  if (!placed) { $("print-warning").classList.add("hidden"); $("edge-warning").classList.add("hidden"); return; }
  const d = s.describe();
  $("info-point").textContent = d.point;
  $("info-logo-w").textContent = `${d.logoWidth} mm`;
  $("info-ref").textContent = `+${d.refOffset} mm (na hřbety)`;
  $("info-logo-top").textContent = `${d.logoTop} mm vůči bodu kliku`;
  updatePrintWarning(s);
  updateEdgeWarning(s);
}

function updatePrintWarning(s) {
  const el = $("print-warning");
  const w = (s.params.diameter * s.params.logoPct) / 100;
  const typical = 0.14 * w;
  const thin = 0.03 * w;
  const msgs = [];
  if (typical < 0.8) msgs.push(`Typický tah písmen ≈ ${typical.toFixed(2)} mm, pod 0,8 mm (2 linky trysky 0,4): logo bude hrubé.`);
  if (thin < s.params.minStroke && s.params.minStroke > 0) msgs.push(`Nejtenčí místa (≈ ${thin.toFixed(2)} mm) jsou pod min. tahem ${s.params.minStroke} mm: špičky S se zaoblí, klín mezi D a S se spojí.`);
  if (s.params.relief > 0 && s.params.relief < 0.24) msgs.push(`Reliéf ${s.params.relief} mm je méně než 2 vrstvy při 0,12 mm.`);
  el.innerHTML = msgs.join("<br>");
  el.classList.toggle("hidden", msgs.length === 0);
}

function updateEdgeWarning(s) {
  const el = $("edge-warning");
  if (!state.modelMesh) { el.classList.add("hidden"); return; }
  const cov = rimCoverage(state.modelMesh, s.group, s.params.diameter / 2);
  if (cov < 0.995) {
    el.textContent = `Kruh přesahuje přes hranu modelu: ${Math.round((1 - cov) * 100)} % obvodu nemá pod sebou povrch. Posuň logo nebo zmenši průměr.`;
    el.classList.remove("hidden");
  } else el.classList.add("hidden");
}

$("btn-add").addEventListener("click", () => {
  state.pendingNew = true;
  renderStampList();
  setStatus("Klikni na model, kam má přijít nové logo.");
});
$("btn-remove").addEventListener("click", removeActive);
$("btn-zoom-logo").addEventListener("click", () => {
  const s = active();
  if (!s?.placed) return;
  const r = Math.max(s.params.diameter, 6);
  viewer.fitTo(new THREE.Box3().setFromCenterAndSize(s.group.position, new THREE.Vector3(r, r, r)), s.normal);
});

// ---------- parametry ----------
const PARAM_FORMAT = {
  diameter: (v) => `${v} mm`,
  recess: (v) => `${v} mm`,
  relief: (v) => `${v} mm`,
  logoPct: (v) => `${v} %`,
  rotation: (v) => `${v}°`,
  offset: (v) => `${v} mm`,
  minStroke: (v) => (v > 0 ? `${v} mm` : "vypnuto"),
};
const uiParams = { ...DEFAULT_PARAMS }; // parametry pro nové logo, když žádné není aktivní

function syncParamsUI() {
  const p = active()?.params ?? uiParams;
  for (const key of Object.keys(PARAM_FORMAT)) {
    $(`p-${key}`).value = p[key];
    $(`o-${key}`).textContent = PARAM_FORMAT[key](p[key]);
  }
  $("p-mirror").checked = !!p.mirror;
  $("p-fill").checked = !!p.fill;
  const preset = Object.entries(PRESETS).find(([, v]) => Object.entries(v.params).every(([k, val]) => p[k] === val));
  $("preset-select").value = preset ? preset[0] : "";
}

function applyParam(partial) {
  const s = active();
  if (s) { s.setParams(partial); updateStampInfo(); showPreview(); scheduleCut(); }
  else Object.assign(uiParams, partial);
  renderStampList();
}

for (const key of Object.keys(PARAM_FORMAT)) {
  const input = $(`p-${key}`);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    $(`o-${key}`).textContent = PARAM_FORMAT[key](v);
    applyParam({ [key]: v });
    $("preset-select").value = "";
  });
  input.addEventListener("change", commit);
}
$("p-mirror").addEventListener("change", (e) => { applyParam({ mirror: e.target.checked }); commit(); });
$("p-fill").addEventListener("change", (e) => { applyParam({ fill: e.target.checked }); commit(); });
$("preset-select").addEventListener("change", (e) => {
  const preset = PRESETS[e.target.value];
  if (!preset) return;
  applyParam({ ...preset.params });
  syncParamsUI();
  commit();
});

// ---------- historie a ukládání ----------
function snapshot() {
  return { stamps: state.stamps.filter((s) => s.placed).map((s) => s.toJSON()), active: state.activeIndex };
}

/** Uloží aktuální stav do historie a do prohlížeče. */
function commit() {
  if (history.push(snapshot())) autosave();
  $("btn-undo").disabled = !history.canUndo;
  $("btn-redo").disabled = !history.canRedo;
}

function restore(snap) {
  for (const s of state.stamps) s.dispose();
  state.stamps = [];
  state.pendingNew = false;
  for (const d of snap.stamps) {
    const s = LogoStamp.fromJSON(state.logoShapes, d, state.modelPositions);
    viewer.scene.add(s.group);
    state.stamps.push(s);
  }
  setActive(Math.min(snap.active ?? state.stamps.length - 1, state.stamps.length - 1));
  showPreview();
  if (state.stamps.length) scheduleCut(); else clearResult();
}

function undo() { const s = history.undo(); if (s) { restore(s); autosave(); } updateStampInfo(); }
function redo() { const s = history.redo(); if (s) { restore(s); autosave(); } updateStampInfo(); }
$("btn-undo").addEventListener("click", undo);
$("btn-redo").addEventListener("click", redo);
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.ctrlKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
  else if (e.ctrlKey && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
  else if (e.key === "Delete" && active()) removeActive();
});

function configObject() {
  return { version: CONFIG_VERSION, app: "Konfigurátor loga DS", model: state.modelName, savedAt: new Date().toISOString(), ...snapshot() };
}

function autosave() {
  try { localStorage.setItem(STORAGE_PREFIX + state.modelName, JSON.stringify(configObject())); } catch {}
}

function restoreAutosave() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + state.modelName)); } catch {}
  if (!saved?.stamps?.length) return;
  restore(saved);
  history.reset(snapshot());
  setStatus(`Obnoveno uložené rozmístění (${saved.stamps.length} log). Zpět = Odebrat / Ctrl+Z nic nevrátí, nahraj model znovu pro čistý start.`);
}

$("btn-save").addEventListener("click", () => {
  if (!snapshot().stamps.length) { setExportStatus("nejdřív umísti logo", true); return; }
  download(new TextEncoder().encode(JSON.stringify(configObject(), null, 2)), outputName(state.modelName, "json"), "application/json");
  setExportStatus(`nastavení uloženo: ${outputName(state.modelName, "json")}`);
});
$("file-config").addEventListener("change", (e) => { loadConfigFile(e.target.files[0]); e.target.value = ""; });

async function loadConfigFile(file) {
  if (!file) return;
  try {
    const cfg = JSON.parse(await file.text());
    if (!Array.isArray(cfg.stamps)) throw new Error("soubor neobsahuje seznam log");
    if (!state.modelMesh) throw new Error("nejdřív nahraj model");
    restore(cfg);
    commit();
    setStatus(`Načteno nastavení: ${cfg.stamps.length} log${cfg.model && cfg.model !== state.modelName ? ` (uloženo pro model „${cfg.model}“)` : ""}.`);
  } catch (err) {
    setStatus(`Nepodařilo se načíst nastavení: ${err.message}`, true);
  }
}

// ---------- vyřezání (CSG) ----------
function clearResult() {
  for (const key of ["resultMesh", "resultLogo"]) {
    if (state[key]) { viewer.scene.remove(state[key]); state[key].geometry.dispose(); state[key] = null; }
  }
  if (state.modelMesh) state.modelMesh.visible = true;
  for (const s of state.stamps) s.setPreviewVisible(true);
}

function showPreview() {
  if (state.resultMesh) { state.resultMesh.visible = false; state.resultLogo.visible = false; }
  if (state.modelMesh) state.modelMesh.visible = true;
  for (const s of state.stamps) s.setPreviewVisible(true);
}

function showResult() {
  if (!state.resultMesh) return;
  const show = $("chk-show-result").checked;
  state.resultMesh.visible = show;
  state.resultLogo.visible = show;
  if (state.modelMesh) state.modelMesh.visible = !show;
  for (const s of state.stamps) s.setPreviewVisible(!show);
}

function scheduleCut() {
  if (!$("chk-auto").checked) return;
  clearTimeout(state.cutTimer);
  state.cutTimer = setTimeout(runCut, 350);
}

function jobPayload() {
  return { stamps: state.stamps.filter((s) => s.placed).map((s) => s.job()), logoPolygons: state.logoPolygons };
}

async function runCut() {
  const job = jobPayload();
  if (!job.stamps.length || !state.modelReady) return;
  if (state.computing) { state.dirty = true; return; }
  state.computing = true;
  setCsgStatus("počítám…");
  try {
    const res = await csg.cut(job);
    for (const key of ["resultMesh", "resultLogo"]) {
      if (state[key]) { viewer.scene.remove(state[key]); state[key].geometry.dispose(); state[key] = null; }
    }
    const cutMesh = new THREE.Mesh(geometryFromMeshData(res.cut), MODEL_MATERIAL.clone());
    cutMesh.material.wireframe = $("chk-wire").checked;
    cutMesh.name = "resultModel";
    const logoMesh = new THREE.Mesh(geometryFromMeshData(res.logo), LOGO_MATERIAL);
    logoMesh.name = "resultLogo";
    viewer.scene.add(cutMesh, logoMesh);
    state.resultMesh = cutMesh;
    state.resultLogo = logoMesh;
    showResult();
    setCsgStatus(`hotovo za ${res.ms} ms (${res.cut.numTri.toLocaleString("cs-CZ")} + ${res.logo.numTri.toLocaleString("cs-CZ")} trojúhelníků, ${job.stamps.length} log)`);
  } catch (err) {
    console.error(err);
    setCsgStatus(`chyba: ${err.message}`, true);
  } finally {
    state.computing = false;
    if (state.dirty) { state.dirty = false; runCut(); }
  }
}
$("btn-cut").addEventListener("click", runCut);
$("chk-show-result").addEventListener("change", showResult);

// ---------- export ----------
function download(bytes, filename, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function runExport(format) {
  const job = jobPayload();
  if (!job.stamps.length) { setExportStatus("nejdřív umísti logo", true); return; }
  if (!state.modelReady) { setExportStatus("model není připraven (uzavřená síť)", true); return; }
  setExportStatus(`připravuji ${format.toUpperCase()}…`);
  try {
    const { bytes, check, ms } = await csg.exportFile({
      job, format,
      name: state.modelName.replace(/\.(stl|3mf)$/i, ""),
      offset: state.modelMesh.geometry.userData.originalOffset ?? [0, 0, 0],
    });
    const filename = outputName(state.modelName, format);
    const closed = check.status === "NoError" && (check.logoStatus ?? "NoError") === "NoError";
    download(bytes, filename, format === "stl" ? "model/stl" : "model/3mf");
    const size = (bytes.byteLength / 1024 / 1024).toFixed(1);
    setExportStatus(
      `${filename} (${size} MB, ${check.numTri.toLocaleString("cs-CZ")} trojúhelníků, ${ms} ms)` + (closed ? " – těleso je uzavřené" : ` – POZOR: ${check.status}`),
      !closed
    );
  } catch (err) {
    console.error(err);
    setExportStatus(`chyba: ${err.message}`, true);
  }
}
$("btn-export-stl").addEventListener("click", () => runExport("stl"));
$("btn-export-3mf").addEventListener("click", () => runExport("3mf"));

// ---------- zobrazení ----------
$("chk-grid").addEventListener("change", (e) => { viewer.grid.visible = e.target.checked; });
$("chk-wire").addEventListener("change", (e) => {
  for (const m of [state.modelMesh, state.resultMesh]) if (m) m.material.wireframe = e.target.checked;
});
$("btn-fit").addEventListener("click", () => { if (state.modelMesh) viewer.fitTo(state.modelMesh); });

// ---------- start ----------
(async () => {
  try {
    const { shapes, polygons } = await loadLogo();
    state.logoShapes = shapes;
    state.logoPolygons = polygons;
    syncParamsUI();
    setupInteraction({
      canvas,
      camera: viewer.camera,
      controls: viewer.controls,
      getModelMesh: () => state.modelMesh,
      getStamps: () => state.stamps,
      getActive: active,
      onPick: (stamp) => { state.pendingNew = false; setActive(state.stamps.indexOf(stamp)); },
      onPlace: (hit) => {
        let s = active();
        if (!s || state.pendingNew) { s = addStamp(state.pendingNew ? null : { ...uiParams }); state.pendingNew = false; }
        s.setPose(hit.point, hit.normal);
        renderStampList();
        updateStampInfo();
        showPreview();
        setStatus(`Logo ${state.activeIndex + 1} umístěno. Táhni ho po povrchu nebo uprav parametry.`);
      },
      onDrag: (hit) => {
        const s = active();
        if (!s) return;
        s.setPose(hit.point, hit.normal);
        updateStampInfo();
        showPreview();
      },
      onReleased: () => { commit(); scheduleCut(); },
    });
    setStatus("Logo načteno. Nahraj STL / 3MF nebo načti ukázkový model.");
    window.__konfigurator = { state, csg, history, snapshot, restore };
  } catch (err) {
    console.error(err);
    setStatus(`Nepodařilo se načíst logo: ${err.message}`, true);
  }
})();
