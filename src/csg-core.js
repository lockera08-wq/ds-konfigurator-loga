// Jádro vyřezání loga nad Manifoldem. Bez závislosti na DOM – používá ho Web Worker i skript pro Node.
// Souřadnice: razítko má lokální Z = normála povrchu, počátek = referenční výška (nejvyšší bod v kruhu).
// Vstup pro vyřezání: { stamps: [{ params, matrix }], logoPolygons }

export function createCore(wasm) {
  const { CrossSection, Manifold, Mesh } = wasm;

  /** Z indexovaných dat (Float32Array xyz, Uint32Array) vytvoří Manifold. */
  function manifoldFromData({ positions, index }) {
    const mesh = new Mesh({ numProp: 3, vertProperties: positions, triVerts: index });
    mesh.merge();
    return new Manifold(mesh);
  }

  function meshToData(manifold) {
    const mesh = manifold.getMesh();
    return { positions: mesh.vertProperties, index: mesh.triVerts, numTri: mesh.triVerts.length / 3 };
  }

  /**
   * Postaví tělesa jednoho razítka ve světových souřadnicích.
   * @param params {diameter, recess, relief, logoPct, mirror, minStroke, fill, padBottom}
   * @param matrix světová matice razítka (16 čísel, column-major)
   * @param logoPolygons normalizované kontury loga (šířka 1), [[x,y],...][]
   */
  function buildStamp({ params: p, matrix }, logoPolygons) {
    const r = p.diameter / 2;
    const logoW = (p.diameter * p.logoPct) / 100;

    let cs = new CrossSection(logoPolygons, "EvenOdd").scale([p.mirror ? -logoW : logoW, logoW]);
    if (p.minStroke > 0) {
      const d = p.minStroke / 2;
      cs = cs.offset(-d, "Round").offset(d, "Round").simplify(0.003);
    }
    // Logo začíná kousek pod dnem (překryv do výplně / modelu), aby se při sloučení spojilo v jedno těleso
    const overlap = Math.min(0.3, Math.max(p.relief, 0.1));
    let logo = Manifold.extrude(cs, Math.max(p.relief, 0.01) + overlap).translate([0, 0, -p.recess - overlap]);

    const cutAbove = Math.max(2, r * 0.75);
    let disc = Manifold.cylinder(p.recess + cutAbove, r, r, 96).translate([0, 0, -p.recess]);

    let pad = null;
    if (p.fill && typeof p.padBottom === "number" && p.padBottom < -p.recess - 0.01) {
      pad = Manifold.cylinder(-p.recess - p.padBottom, r, r, 96).translate([0, 0, p.padBottom]);
    }

    logo = logo.transform(matrix);
    disc = disc.transform(matrix);
    if (pad) pad = pad.transform(matrix);
    cs.delete();
    return { logo, disc, pad };
  }

  function unionAll(list) {
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];
    const u = Manifold.union(list);
    for (const m of list) m.delete();
    return u;
  }

  /** Vrací { cut, logo }: model se zapuštěnými kruhy (+ výplně) a sloučené těleso všech log. Volající maže. */
  function cut(model, { stamps, logoPolygons }) {
    const logos = [], discs = [], pads = [];
    for (const s of stamps) {
      const { logo, disc, pad } = buildStamp(s, logoPolygons);
      logos.push(logo); discs.push(disc); if (pad) pads.push(pad);
    }
    const disc = unionAll(discs);
    const pad = unionAll(pads);
    const logo = unionAll(logos);
    let result = model.subtract(disc);
    disc.delete();
    if (pad) {
      const withPad = result.add(pad);
      result.delete(); pad.delete();
      result = withPad;
    }
    return { cut: result, logo };
  }

  /** Jedno těleso (model + loga). */
  function union(model, payload) {
    const { cut: c, logo } = cut(model, payload);
    const result = c.add(logo);
    c.delete(); logo.delete();
    return result;
  }

  return { manifoldFromData, meshToData, buildStamp, cut, union };
}
