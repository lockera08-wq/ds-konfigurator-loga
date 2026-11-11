# Konfigurátor loga DS

Webová aplikace pro umístění zapuštěného loga DS na libovolný 3D model (STL) a export pro 3D tisk.
Plán a schválená rozhodnutí: [PLAN.md](PLAN.md).

## Spuštění

```bash
npm install
```

```bash
npm run dev
```

Pak otevři http://localhost:5173 v prohlížeči.

## Co je jen lokálně (není v repozitáři)

Složky `produkty/`, `vystup/` a `test-modely/` jsou v `.gitignore`: obsahují produktové soubory a výstupy.
Testovací modely jde kdykoli znovu vyrobit: `node tools/make-test-models.mjs`.

## Nasazení na web

Viz [NASAZENI.md](NASAZENI.md). GitHub Pages: push do větve `main` → GitHub Actions sestaví a nasadí. Alternativa Cloudflare: `npm run deploy`.

## Struktura

| Cesta | Obsah |
|---|---|
| `index.html`, `src/` | aplikace (Vite + Three.js) |
| `src/viewer.js` | scéna, kamera, světla, mřížka |
| `src/model.js` | načítání STL, ukázkový model |
| `src/logo.js` | načtení SVG loga a jeho vytažení do 3D |
| `src/placement.js` | „razítko“ loga na povrchu: orientace, náhled kruhu + loga, obrys |
| `src/interaction.js` | myš: klik = umístit, tažení loga po povrchu, rychlý raycasting (three-mesh-bvh), vyhlazená normála |
| `src/csg.js`, `src/csg.worker.js` | vyřezání kruhu + loga přes Manifold (WASM) ve Web Workeru; výplň drážek; zesílení tenkých míst |
| `vite.config.js` | nastavení Vite (manifold-3d mimo předbalení, worker jako ES modul) |
| `public/DS-logo.svg` | vektorové logo (ikona v panelu) |
| `public/DS-logo-polygons.json` | obrys loga jako polygony (šířka 1, střed 0,0) – používá aplikace i CLI; vzniká z SVG přes `npm run logo:polygons` |
| `src/csg-core.js` | jádro vyřezání (sdílené workerem i CLI) |
| `src/export.js` | zapisovače STL (binární) a 3MF (model + logo jako dvě části) |
| `src/stamp-math.js` | orientace razítka, referenční výšky v kruhu, vyhlazená normála (sdílené) |
| `tools/apply-logo.mjs` | CLI: `npm run apply -- --model produkty/DS-007-hacek-S.stl --point 6.23,-1.80,28.19 [--diameter 8 …]` nebo `--config nastaveni.json` (více log, soubor z aplikace) → `vystup/` |
| `src/history.js` | zpět / vpřed |
| `tools/make-broken-model.mjs` | vyrobí děravou desku `test-modely/deska-derava.stl` pro test hlášení o neuzavřené síti |
| `vystup/` | hotové soubory s logem (STL, 3MF, JSON s použitým nastavením) |
| `tools/debug-*.mjs` | ladicí skripty (krokování Manifoldu, vykreslení obrysu loga) |
| `logo/` | originál loga, vektorizace, porovnání |
| `tools/vectorize-logo.mjs` | převod loga z rastru do SVG (`npm run logo:vectorize`) |
| `tools/make-test-models.mjs` | generování testovacích STL do `test-modely/` |
| `test-modely/` | kelímek, deska, koule pro zkoušení |
| `produkty/` | skutečné produkty: háček DS-007 (3MF sada + vytažený 1 kus jako STL) |
| `src/threemf.js` | načítání 3MF včetně Bambu Studio projektů (sítě v 3D/Objects) |
| `tools/extract-3mf.mjs` | vytažení sítí z 3MF do STL: `node tools/extract-3mf.mjs soubor.3mf složka` |
| `tools/analyze-stl.mjs`, `tools/measure.mjs` | měření geometrie (rovné plochy, šířka pásu, tloušťky tahů loga) |
