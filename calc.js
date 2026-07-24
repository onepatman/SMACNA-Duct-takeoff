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

  // ---- Formula reference (drives the "Formula Reference" tab) ----
  // Manual-engineering format: formula in plain math notation, every
  // variable defined with units, one worked example (600×400mm × 10m run,
  // carried through every line so results cross-check against each other),
  // and a source tier matching the Gauge & References tab categorization.
  const formulaRef = [
    { name: "PERIMETER", formula: "Perimeter (m) = 2 × (Width ÷ 1000 + Depth ÷ 1000)",
      variables: "Width, Depth = duct cross-section (mm)",
      example: "Width 600mm, Depth 400mm → Perimeter = 2 × (0.60 + 0.40) = 2.00 m",
      note: "Converts mm inputs to meters and finds the outer perimeter.", source: "assumption" },
    { name: "AREA", formula: "Area (sq m) = Perimeter × Length",
      variables: "Perimeter (m) from above; Length = duct run length (m)",
      example: "Perimeter 2.00 m, Length 10 m → Area = 2.00 × 10 = 20.00 sq m",
      note: "Outer surface area; basis for every material quantity below.", source: "assumption" },
    { name: "GAUGE ASSIGNMENT", formula: "Gauge = bracket of Table 1-7 containing MAX(Width, Depth)",
      variables: "Table 1-7 brackets: ga26 ≤300mm, ga24 301–450mm, ga22 451–1350mm, ga20 1351–2100mm, ga18 2101–3050mm, ga16 >3050mm",
      example: "MAX(600, 400) = 600mm → falls in 451–1350mm bracket → ga 22; the run's full 20.00 sq m Area is assigned to the ga 22 column",
      note: "ga 16 (>3050mm) column wired in this version — the original source workbook defined the bracket but never connected a takeoff column to it.", source: "existing" },
    { name: "INSULATION", formula: "Insulation (sq m) = Area × 1.0",
      variables: "Area (sq m) from above",
      example: "20.00 × 1.0 = 20.00 sq m",
      note: "External blanket insulation covers the same sq m as the duct surface (1:1 ratio).", source: "assumption" },
    { name: "SEALANT", formula: "Sealant (gal) = Area ÷ A-01",
      variables: "A-01 = sealant coverage rate (35 sq m/gal)",
      example: "20.00 ÷ 35 = 0.57 gal",
      note: "A-01 is an existing app reference (SMACNA Class A mastic coverage) — reduce for Class B/C sealant.", source: "existing" },
    { name: "ADHESIVE", formula: "Adhesive (gal) = Area ÷ A-02",
      variables: "A-02 = insulation adhesive coverage rate (typical 25 sq m/gal, range 20–30)",
      example: "20.00 ÷ 25 = 0.80 gal",
      note: "A-02 is an estimating assumption — confirm against actual product TDS.", source: "assumption" },
    { name: "DUCT PINS", formula: "Duct Pins (pcs) = CEILING(Area × A-03)",
      variables: "A-03 = pin density (typical 4 pcs/sq m, range 3–5)",
      example: "CEILING(20.00 × 4) = 80 pcs",
      note: "Rounded up to whole pieces; A-03 is an estimating assumption.", source: "assumption" },
    { name: "DUCT TAPE", formula: "Duct Tape (rolls) = CEILING(Perimeter × (Length ÷ A-04) ÷ A-05)",
      variables: "A-04 = joint spacing (1.2 m); A-05 = tape roll length (18.29 m = 20 yd)",
      example: "Joints = 10 ÷ 1.2 = 8.33; CEILING(2.00 × 8.33 ÷ 18.29) = CEILING(0.91) = 1 roll",
      note: "Each joint needs one perimeter-length of tape; A-04 existing app reference, A-05 general product constant.", source: "existing" },
    { name: "STRAP", formula: "Strap (rolls) = CEILING((Length ÷ A-06) × (Perimeter + 0.3) ÷ A-07)",
      variables: "A-06 = strap spacing (typical 1.5 m, range 1.0–1.8); A-07 = strap roll length (18.29 m = 20 yd)",
      example: "CEILING((10 ÷ 1.5) × 2.30 ÷ 18.29) = CEILING(0.84) = 1 roll",
      note: "Each band = Perimeter + 0.3m overlap; A-06 is an estimating assumption, A-07 a general product constant.", source: "assumption" },
    { name: "CORNER TRIM", formula: "Corner (sq m) = Area × A-08",
      variables: "A-08 = corner area factor (typical 0.10, range 0.05–0.15)",
      example: "20.00 × 0.10 = 2.00 sq m",
      note: "Estimating allowance for external corner bead/angle trim, not a SMACNA-tabulated quantity.", source: "assumption" },
    { name: "HANGER COUNT", formula: "Hangers = ROUNDUP(Length ÷ A-09 + 1)",
      variables: "A-09 = hanger spacing (2.4 m, existing app reference for Low Pressure ≤2400mm side)",
      example: "ROUNDUP(10 ÷ 2.4 + 1) = ROUNDUP(5.17) = 6 hangers",
      note: "Reduce A-09 to 1.5 m in Tab 1 if any run side exceeds 2400 mm (see Table 4-1).", source: "existing" },
    { name: "ANGLE (TRAPEZE)", formula: "Angle (m) = Hangers × (Width ÷ 1000 + 0.4)",
      variables: "Hangers from above; Width (mm); 0.4 = clearance allowance (0.2 m each side)",
      example: "6 × (0.60 + 0.40) = 6 × 1.00 = 6.00 m",
      note: "Each trapeze angle spans duct width plus a clearance allowance — estimating methodology, not a cited SMACNA angle-length table.", source: "assumption" },
    { name: "THREADED ROD", formula: "Rod (m) = Hangers × A-11 × A-10",
      variables: "A-11 = rods per hanger (2, existing app reference); A-10 = rod drop length (typical 0.6 m, range 0.3–3.0 — measure from as-built ceiling/slab clearance)",
      example: "6 × 2 × 0.6 = 7.20 m",
      note: "Total rod length = hanger count × 2 rods × drop length.", source: "assumption" },
    { name: "CONCRETE INSERTS", formula: "Inserts (pcs) = Hangers × A-11",
      variables: "A-11 = rods per hanger (2)",
      example: "6 × 2 = 12 pcs",
      note: "One concrete insert per rod.", source: "existing" },
    { name: "NUTS", formula: "Nuts (pcs) = Hangers × A-11 × 2",
      variables: "A-11 = rods per hanger (2)",
      example: "6 × 2 × 2 = 24 pcs",
      note: "2 nuts per rod: one bearing nut, one lock nut.", source: "existing" },
    { name: "WASHERS", formula: "Washers (pcs) = Hangers × A-11 × 2",
      variables: "A-11 = rods per hanger (2)",
      example: "6 × 2 × 2 = 24 pcs",
      note: "2 washers per rod: one under the bearing nut, one at the angle bracket.", source: "existing" },
    { name: "EST. SHEET METAL WEIGHT", formula: "Weight (kg) = Area(assigned gauge) × Gauge Unit Weight",
      variables: "Gauge Unit Weight from Table 1-7 (kg/sq m), e.g. ga 22 = 6.70 kg/sq m",
      example: "20.00 × 6.70 = 134.00 kg",
      note: "Added in this fillable version for quick steel-order weight estimates; not part of the original source workbook.", source: "existing" },
    { name: "WASTE / CONTINGENCY ALLOWANCE", formula: "Allowance = Net Quantity × A-15",
      variables: "A-15 = waste/contingency factor (typical 0.20 = 20%, range 0.10–0.30)",
      example: "Net Insulation 20.00 sq m × 0.20 = 4.00 sq m allowance",
      note: "Same factor applied to every column; labeled 'Waste' for area/length/consumable items (cutting loss) and 'Contingency' for discrete hardware counts (spares for damaged/lost pieces) — see Tab 2 Grand Totals.", source: "assumption" },
    { name: "FINAL TAKEOFF QUANTITY", formula: "Final = Net Quantity × (1 + A-15)",
      variables: "A-15 = waste/contingency factor",
      example: "Net Insulation 20.00 sq m × 1.20 = 24.00 sq m — the actual procurement quantity",
      note: "This is the number to order/build from, not the Net total.", source: "assumption" },
    { name: "EST. NO. OF SHEETS", formula: "Sheets = CEILING(Final Gauge Area ÷ (A-12.width × A-12.height))",
      variables: "Final Gauge Area (sq m, post-allowance) for one gauge; A-12 = sheet size (typical 1219 × 2438 mm = 2.972 sq m/sheet)",
      example: "Final ga 22 area 91.20 sq m ÷ 2.972 sq m/sheet = 30.69 → CEILING → 31 sheets",
      note: "A-12 is an estimating assumption — confirm your actual supplier sheet size before ordering.", source: "assumption" }
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
