/* ============================================================
   SMACNA Duct Takeoff — Calculation Engine
   Ported unchanged from the source calculator. This module has
   no DOM references so it can be unit-tested independently of
   the UI (per migration requirement: keep calc logic decoupled).
   ============================================================ */
const SMACNA = (function () {
  "use strict";

  // ---- SMACNA Table 1-7 gauge brackets (Low Pressure Class) ----
  const gaugeInfo = [
    { label: "ga 26", min: 0,    max: 300,    thickness: 0.55, weight: 4.34,  ref: "SMACNA T1-7" },
    { label: "ga 24", min: 301,  max: 450,    thickness: 0.70, weight: 5.52,  ref: "SMACNA T1-7" },
    { label: "ga 22", min: 451,  max: 1350,   thickness: 0.85, weight: 6.70,  ref: "SMACNA T1-7" },
    { label: "ga 20", min: 1351, max: 2100,   thickness: 1.00, weight: 7.88,  ref: "SMACNA T1-7" },
    { label: "ga 18", min: 2101, max: 3050,   thickness: 1.30, weight: 10.24, ref: "SMACNA T1-7" },
    { label: "ga 16", min: 3051, max: 999999, thickness: 1.60, weight: 12.60, ref: "SMACNA T1-7" }
  ];

  // ---- Material coverage assumptions (A-01 ... A-15) ----
  // tier: which of the four Gauge & References categories this belongs to.
  // "existing" = carried over from the app's pre-existing source workbook,
  //   not independently re-verified against a primary SMACNA document here.
  // "assumption" = engineering/estimating judgment, project-adjustable.
  // "secondary" = aggregated from published secondary sources (see the
  //   "Sources consulted" list this session used), not the primary manual.
  const assumptionsMeta = [
    { ref: "A-01", field: "A01", unit: "sq m / gal",   label: "Sealant coverage (duct mastic, SMACNA Class A sealing)", def: 35,    source: "Existing app reference — inherited from original source workbook, not independently re-verified", locked: true, tier: "existing" },
    { ref: "A-02", field: "A02", unit: "sq m / gal",   label: "Insulation adhesive coverage",                            def: 25,    min: 20, max: 30, typical: 25, guidance: "Use actual manufacturer/product TDS where available.", source: "Estimating assumption — manufacturer typical", locked: false, tier: "assumption" },
    { ref: "A-03", field: "A03", unit: "pcs / sq m",   label: "Duct pin density (external insulation attachment)",       def: 4,     min: 3, max: 5, typical: 4, guidance: "Varies with insulation thickness and pin manufacturer spacing recommendation.", source: "Estimating assumption — Philippine MEPF contractor practice", locked: false, tier: "assumption" },
    { ref: "A-04", field: "A04", unit: "m",            label: "Duct section joint spacing (for duct tape calc.)",        def: 1.2,   source: "Existing app reference — inherited from original source workbook, not independently re-verified", locked: true, tier: "existing" },
    { ref: "A-05", field: "A05", unit: "m / roll",     label: "Duct tape roll length (20 yards per roll)",               def: 18.29, source: "General reference — standard roll = 20 yd = 18.29 m (aluminum foil tape)", locked: true, tier: "general" },
    { ref: "A-06", field: "A06", unit: "m",            label: "Strap spacing along duct length (insulation banding)",    def: 1.5,   min: 1.0, max: 1.8, typical: 1.5, guidance: "Tighter spacing for larger/heavier duct sections.", source: "Estimating assumption — Philippine MEPF contractor practice", locked: false, tier: "assumption" },
    { ref: "A-07", field: "A07", unit: "m / roll",     label: "Strap roll length (20 yards per roll)",                   def: 18.29, source: "General reference — standard roll = 20 yd = 18.29 m (metal banding strap)", locked: true, tier: "general" },
    { ref: "A-08", field: "A08", unit: "factor (–)",   label: "Corner area factor (% of total duct area)",              def: 0.1,   min: 0.05, max: 0.15, typical: 0.1, guidance: "Higher for duct runs with many corners/transitions relative to length.", source: "Estimating assumption — corner bead / angle trim", locked: false, tier: "assumption" },
    { ref: "A-09", field: "A09", unit: "m",            label: "Hanger spacing — max for rectangular duct (low press.)", def: 2.4,   source: "Existing app reference — inherited from original source workbook, not independently re-verified", locked: true, tier: "existing" },
    { ref: "A-10", field: "A10", unit: "m",            label: "Threaded rod length per rod (ceiling drop / slab clearance)", def: 0.6, min: 0.3, max: 3.0, typical: 0.6, guidance: "Measure from as-built ceiling/slab clearance — no universal value applies.", source: "Estimating assumption — project-specific", locked: false, tier: "assumption" },
    { ref: "A-11", field: "A11", unit: "pcs / hanger", label: "Number of threaded rods per hanger (trapeze type)",      def: 2,     source: "Existing app reference — inherited from original source workbook, not independently re-verified", locked: true, tier: "existing" },
    { ref: "A-12", field: "A12", unit: "mm × mm",      label: "Sheet size (for Est. No. of Sheets in Summary)",          def: { w: 1219, h: 2438 }, type: "dual", source: "Estimating assumption — confirm actual supplier sheet size", locked: false, tier: "assumption" },
    { ref: "A-13", field: "A13", unit: "rod diameter", label: "Hanger rod diameter",                                     def: "3/8\" (9.5 mm)", type: "select", options: ["3/8\" (9.5 mm)", "1/2\" (12.7 mm)", "5/8\" (16 mm)"],
      guidance: "Rule of thumb from published secondary references (not the primary SMACNA manual, which I could not access in this session): 3/8\" rod typically sufficient up to ~1219mm duct half-perimeter, 1/2\" beyond. Confirm against your SMACNA 3rd Ed. manual before fabrication.",
      source: "Secondary-sourced guidance — verify against SMACNA manual", locked: false, tier: "secondary" },
    { ref: "A-14", field: "A14", unit: "angle size",   label: "Trapeze angle size",                                      def: "1\"×1\"×1/8\"", type: "select", options: ["1\"×1\"×1/8\"", "1-1/2\"×1-1/2\"×1/8\"", "2\"×2\"×3/16\""],
      guidance: "Rule of thumb from published secondary references: angle size scales with duct size/pressure class, commonly 1\"×1\"×1/8\" up to 2\"×2\"×3/16\" for larger/higher-pressure duct. Confirm against your SMACNA 3rd Ed. manual before fabrication.",
      source: "Secondary-sourced guidance — verify against SMACNA manual", locked: false, tier: "secondary" },
    { ref: "A-15", field: "A15", unit: "factor (–)",   label: "Waste / contingency factor (applied to all takeoff quantities)", def: 0.20, min: 0.10, max: 0.30, typical: 0.20, guidance: "20% is a common estimating default; adjust per project procurement/cutting-waste history.", source: "Estimating assumption — project contingency/waste allowance", locked: false, tier: "assumption" }
  ];

  // Columns where the A-15 allowance means "spare pieces for damaged/lost
  // hardware" (contingency) rather than "material lost to cutting" (waste) —
  // same factor, different physical justification. Used only for UI labeling.
  const contingencyFields = ["pins", "insert", "nuts", "washers"];

  // ---- Human-readable formula reference (drives the "Formula Reference" tab) ----
  const formulaRef = [
    { name: "PERIMETER", col: "F", formula: "2 × (Width ÷ 1000 + Depth ÷ 1000)", note: "Converts mm inputs → meters." },
    { name: "AREA", col: "G", formula: "Perimeter × Length", note: "sq m of duct outer surface; basis for all material calcs." },
    { name: "GAUGE ASSIGNMENT", col: "H–M", formula: "IF MAX(Width,Depth) within a SMACNA T1-7 bracket → assign Area to that gauge column", note: "ga 16 (>3050mm) column added in this fillable version — the source workbook defined the row in its gauge table but never wired a takeoff column to it." },
    { name: "INSULATION", col: "N", formula: "Area × 1.0", note: "External blanket insulation covers the same sq m as duct surface (1:1 ratio)." },
    { name: "SEALANT", col: "O", formula: "ROUND(Area ÷ A-01, 2)", note: "A-01 = 35 sq m/gal — SMACNA Class A mastic; reduce for Class B/C." },
    { name: "ADHESIVE", col: "P", formula: "ROUND(Area ÷ A-02, 2)", note: "A-02 = 25 sq m/gal — insulation contact adhesive; confirm with product TDS." },
    { name: "DUCT PINS", col: "Q", formula: "CEILING(Area × A-03, 1)", note: "A-03 = 4 pcs/sq m; rounded up to whole pieces." },
    { name: "DUCT TAPE", col: "R", formula: "CEILING(Perimeter × (Length ÷ A-04) ÷ A-05, 1)", note: "Joints = Length ÷ 1.2m; tape seals each joint perimeter; roll = 18.29m = 20yd." },
    { name: "STRAP", col: "S", formula: "CEILING((Length ÷ A-06) × (Perimeter + 0.3) ÷ A-07, 1)", note: "Bands every 1.5m; each loop = Perimeter + 0.3m overlap; roll = 18.29m." },
    { name: "CORNER", col: "T", formula: "ROUND(Area × A-08, 2)", note: "A-08 = 0.10 — 10% of area for external corner trim / angle bead." },
    { name: "HANGER COUNT", col: "—", formula: "ROUNDUP(Length ÷ A-09 + 1, 0)", note: "A-09 = 2.4m spacing (low pressure, ≤2400mm side per SMACNA T4-1)." },
    { name: "ANGLE", col: "V", formula: "Hangers × (Width ÷ 1000 + 0.4)", note: "Each L-angle trapeze = duct width + 200mm each side." },
    { name: "ROD", col: "W", formula: "Hangers × A-11 × A-10", note: "Total rod length = hanger count × 2 rods × drop length (A-10)." },
    { name: "CNC INSERT", col: "X", formula: "Hangers × A-11", note: "1 concrete insert per rod; 2 per trapeze hanger." },
    { name: "NUTS", col: "Y", formula: "Hangers × A-11 × 2", note: "2 nuts per rod: 1 bearing + 1 lock nut per threaded rod end." },
    { name: "WASHERS", col: "Z", formula: "Hangers × A-11 × 2", note: "2 washers per rod: 1 under bearing nut, 1 at angle bracket." },
    { name: "EST. WEIGHT (bonus)", col: "AA", formula: "Area(assigned gauge) × Gauge Unit Weight (kg/sq m)", note: "Added in this fillable version for quick steel-order weight estimates; not in the source workbook." }
  ];

  const decimalCols = ["ga26", "ga24", "ga22", "ga20", "ga18", "ga16", "insulation", "sealant", "adhesive", "corner", "angle", "rod", "weight"];
  const gaFields = ["ga26", "ga24", "ga22", "ga20", "ga18", "ga16"];

  function defaultAssumptions() {
    const a = {};
    assumptionsMeta.forEach((m) => (a[m.field] = m.type === "dual" ? { ...m.def } : m.def));
    return a;
  }

  function gaugeIndex(longerSide) {
    for (let i = 0; i < gaugeInfo.length; i++) {
      if (longerSide >= gaugeInfo[i].min && longerSide <= gaugeInfo[i].max) return i;
    }
    return gaugeInfo.length - 1;
  }

  /**
   * Compute one duct run. Returns null (incomplete) if W/D/L are missing or <= 0.
   * NOTE: preserved exactly from source, including rounding order.
   */
  function computeRow(w, d, l, assumptions) {
    if (!w || !d || !l || w <= 0 || d <= 0 || l <= 0) return null;

    const perimeter = 2 * (w / 1000 + d / 1000);
    const area = perimeter * l;
    const longer = Math.max(w, d);
    const gi = gaugeIndex(longer);

    const insulation = area;
    const sealant = Math.round((area / assumptions.A01) * 100) / 100;
    const adhesive = Math.round((area / assumptions.A02) * 100) / 100;
    const pins = Math.ceil(area * assumptions.A03);
    const tape = Math.ceil((perimeter * (l / assumptions.A04)) / assumptions.A05);
    const strap = Math.ceil(((l / assumptions.A06) * (perimeter + 0.3)) / assumptions.A07);
    const corner = Math.round(area * assumptions.A08 * 100) / 100;
    const hangerCount = Math.ceil(l / assumptions.A09 + 1);
    const angle = hangerCount * (w / 1000 + 0.4);
    const rod = hangerCount * assumptions.A11 * assumptions.A10;
    const insert = hangerCount * assumptions.A11; // NOTE: see flagged item — this is rod-insert count, not hanger count
    const nuts = insert * 2;
    const washers = insert * 2;
    const weight = area * gaugeInfo[gi].weight;

    const byGauge = {};
    gaFields.forEach((f, i) => (byGauge[f] = i === gi ? area : null));

    return {
      perimeter, area, gaugeIndex: gi, byGauge,
      insulation, sealant, adhesive, pins, tape, strap, corner,
      hangerCount, angle, rod, insert, nuts, washers, weight
    };
  }

  function sumRows(results, field) {
    let total = 0;
    results.forEach((r) => {
      if (r && r[field] != null) total += r[field];
    });
    return total;
  }

  function sumGauge(results, gaField) {
    let total = 0;
    results.forEach((r) => {
      if (r && r.byGauge[gaField] != null) total += r.byGauge[gaField];
    });
    return total;
  }

  return {
    gaugeInfo, assumptionsMeta, formulaRef, decimalCols, gaFields, contingencyFields,
    defaultAssumptions, gaugeIndex, computeRow, sumRows, sumGauge
  };
})();
