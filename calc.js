/* ============================================================
   SMACNA Duct Takeoff — Calculation Engine
   Ported unchanged from the source calculator. This module has
   no DOM references so it can be unit-tested independently of
   the UI (per migration requirement: keep calc logic decoupled).
   ============================================================ */
const SMACNA = (function () {
  "use strict";

  // ---- Gauge → thickness/weight reference chart ----
  // Existing app reference (thickness mm / weight kg per sq m per gauge
  // number) — inherited from the app's original source workbook, not
  // independently re-verified against a primary SMACNA document. This is
  // now purely a label → thickness/weight lookup; WHICH gauge applies to a
  // given duct dimension is decided by RECT_GAUGE_TABLES below (SMACNA
  // Table 6-1 / 6-2), not by this array.
  const gaugeInfo = [
    { label: "ga 26", thickness: 0.55, weight: 4.34,  ref: "Existing app reference" },
    { label: "ga 24", thickness: 0.70, weight: 5.52,  ref: "Existing app reference" },
    { label: "ga 22", thickness: 0.85, weight: 6.70,  ref: "Existing app reference" },
    { label: "ga 20", thickness: 1.00, weight: 7.88,  ref: "Existing app reference" },
    { label: "ga 18", thickness: 1.30, weight: 10.24, ref: "Existing app reference" },
    { label: "ga 16", thickness: 1.60, weight: 12.60, ref: "Existing app reference" }
  ];

  // ---- SMACNA Table 6-1 / 6-2 — rectangular duct minimum gauge + transverse
  // reinforcement, 2" w.g. static pressure (positive or negative), by
  // standard duct section length. Provided directly by the user from
  // scanned pages of SMACNA HVAC Duct Construction Standards — Metal and
  // Flexible, 2nd Edition (transcribed 2026-07-24). This is genuine
  // primary-source data — not an estimate or secondary aggregation — but
  // it was transcribed from a photograph, so spot-check any bracket that
  // materially affects fabrication/procurement against your own copy.
  // Duct Dim. is the manual's native inch bracket; maxMm is that same
  // upper bound converted to millimeters (1 in = 25.4 mm) since this app's
  // inputs are metric. Reinf. Spacing / Reinf. Code Grade are carried for
  // reference only — this app does not yet compute a transverse/
  // intermediate reinforcement material quantity from them (Table 6-1/6-2
  // columns 5–12, the actual slip/standing-seam/angle/zee sizes, were not
  // transcribed in this pass).
  const RECT_GAUGE_TABLES = {
    "4ft": {
      label: "4 ft duct lengths",
      tableRef: "SMACNA Table 6-1",
      brackets: [
        { ductDim: "10\" dn",   maxMm: 254,  gauge: "ga 26", reinfSpacing: "None", reinfCode: "—" },
        { ductDim: "11\"–20\"", maxMm: 508,  gauge: "ga 26", reinfSpacing: "4\"",  reinfCode: "C" },
        { ductDim: "21\"–28\"", maxMm: 711,  gauge: "ga 26", reinfSpacing: "4\"",  reinfCode: "D" },
        { ductDim: "29\"–30\"", maxMm: 762,  gauge: "ga 26", reinfSpacing: "4\"",  reinfCode: "E" },
        { ductDim: "31\"–42\"", maxMm: 1067, gauge: "ga 24", reinfSpacing: "4\"",  reinfCode: "F" },
        { ductDim: "43\"–48\"", maxMm: 1219, gauge: "ga 22", reinfSpacing: "4\"",  reinfCode: "G" },
        { ductDim: "49\"–60\"", maxMm: 1524, gauge: "ga 24", reinfSpacing: "2\"",  reinfCode: "F" },
        { ductDim: "61\"–72\"", maxMm: 1829, gauge: "ga 24", reinfSpacing: "2\"",  reinfCode: "H" },
        { ductDim: "73\"–84\"", maxMm: 2134, gauge: "ga 22", reinfSpacing: "2\"",  reinfCode: "I" },
        { ductDim: "85\"–96\"", maxMm: 2438, gauge: "ga 22", reinfSpacing: "2\"",  reinfCode: "I" }
      ]
    },
    "5ft": {
      label: "5 ft duct lengths",
      tableRef: "SMACNA Table 6-2",
      brackets: [
        { ductDim: "10\" dn",   maxMm: 254,  gauge: "ga 26", reinfSpacing: "None",   reinfCode: "—" },
        { ductDim: "11\"–20\"", maxMm: 508,  gauge: "ga 26", reinfSpacing: "5'",     reinfCode: "C" },
        { ductDim: "21\"–26\"", maxMm: 660,  gauge: "ga 26", reinfSpacing: "5'",     reinfCode: "D" },
        { ductDim: "27\"–30\"", maxMm: 762,  gauge: "ga 24", reinfSpacing: "5'",     reinfCode: "E" },
        { ductDim: "31\"–38\"", maxMm: 965,  gauge: "ga 22", reinfSpacing: "5'",     reinfCode: "F" },
        { ductDim: "39\"–54\"", maxMm: 1372, gauge: "ga 24", reinfSpacing: "2-1/2'", reinfCode: "F" },
        { ductDim: "55\"–60\"", maxMm: 1524, gauge: "ga 24", reinfSpacing: "2-1/2'", reinfCode: "G" },
        { ductDim: "61\"–72\"", maxMm: 1829, gauge: "ga 22", reinfSpacing: "2-1/2'", reinfCode: "H" },
        { ductDim: "73\"–84\"", maxMm: 2134, gauge: "ga 22", reinfSpacing: "2-1/2'", reinfCode: "I" },
        { ductDim: "85\"–96\"", maxMm: 2438, gauge: "ga 20", reinfSpacing: "2-1/2'", reinfCode: "I" }
      ]
    }
  };

  // ---- SMACNA Table 6-7, Section C (Horizontal Ducts – Trapeze-Type
  // Supports) — same source/provenance as RECT_GAUGE_TABLES above. Governs
  // A-13 (hanger rod diameter) / A-14 (trapeze angle size) below. Each
  // bracket also allows a fixed 1"×1"×1/8" angle as an alternative to the
  // round-rod hanger (not modeled separately — A-13's options are the
  // round-rod path).
  const DUCT_SUPPORT_TABLE = {
    tableRef: "SMACNA Table 6-7, Section C (Horizontal Ducts – Trapeze-Type Supports)",
    altHangerNote: "Each bracket also allows a fixed 1\"×1\"×1/8\" angle as an alternative to the round-rod hanger shown.",
    brackets: [
      { maxDim: "36\"", maxMm: 914,  angle: "1-1/2\"×1-1/2\"×1/8\"", rod: "1/4\" round rod" },
      { maxDim: "48\"", maxMm: 1219, angle: "2\"×2\"×1/8\"",         rod: "1/4\" round rod" },
      { maxDim: "60\"", maxMm: 1524, angle: "2\"×2\"×1/8\"",         rod: "5/16\" round rod" },
      { maxDim: "84\"", maxMm: 2134, angle: "2\"×2\"×1/8\"",         rod: "3/8\" round rod" }
    ]
  };

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
    { ref: "A-13", field: "A13", unit: "rod diameter", label: "Hanger rod diameter",                                     def: "3/8\" (9.5 mm)", type: "select", options: ["1/4\" (6.4 mm)", "5/16\" (7.9 mm)", "3/8\" (9.5 mm)"],
      guidance: "SMACNA Table 6-7, Section C (Horizontal Ducts – Trapeze-Type Supports): 1/4\" rod for duct up to 48\", 5/16\" up to 60\", 3/8\" up to 84\" (largest side/diameter of the duct). This is one project-wide choice, not auto-varied per run — match it to your project's largest duct run, or pick conservatively.",
      source: "SMACNA Table 6-7, Section C — provided directly by user from source pages, transcribed 2026-07-24", locked: false, tier: "primary" },
    { ref: "A-14", field: "A14", unit: "angle size",   label: "Trapeze angle size",                                      def: "2\"×2\"×1/8\" (51×51×3.2 mm)", type: "select", options: ["1-1/2\"×1-1/2\"×1/8\" (38×38×3.2 mm)", "2\"×2\"×1/8\" (51×51×3.2 mm)"],
      guidance: "SMACNA Table 6-7, Section C (Horizontal Ducts – Trapeze-Type Supports): 1-1/2\"×1-1/2\"×1/8\" angle for duct up to 36\", 2\"×2\"×1/8\" for 37\"–84\". This is one project-wide choice, not auto-varied per run — match it to your project's largest duct run.",
      source: "SMACNA Table 6-7, Section C — provided directly by user from source pages, transcribed 2026-07-24", locked: false, tier: "primary" },
    { ref: "A-15", field: "A15", unit: "factor (–)",   label: "Waste / contingency factor (applied to all takeoff quantities)", def: 0.20, min: 0.10, max: 0.30, typical: 0.20, guidance: "20% is a common estimating default; adjust per project procurement/cutting-waste history.", source: "Estimating assumption — project contingency/waste allowance", locked: false, tier: "assumption" },
    { ref: "A-16", field: "A16", unit: "× diameter",   label: "Round duct fitting equivalent length factor (for Fittings & Accessories surface-area estimate)", def: 1.5, min: 1.0, max: 3.0, typical: 1.5, guidance: "Rough estimating shortcut only — NOT a verified SMACNA fitting-dimension source. Approximates each fitting's developed surface area as Circumference × (A-16 × Diameter), so it can feed into Insulation/Sealant/Adhesive/Duct Pin totals automatically instead of being a pure ordering-quantity line. Actual fitting geometry (gore count, taper length) varies by manufacturer — verify against actual fabrication drawings before procurement.", source: "Estimating assumption — rough approximation, verify against fabrication drawings", locked: false, tier: "assumption" }
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
    { name: "GAUGE ASSIGNMENT", formula: "Gauge = bracket of SMACNA Table 6-1 (4 ft) or 6-2 (5 ft) containing MAX(Width, Depth), by Tab 1's Standard Duct Section Length",
      variables: "Table 6-1 (4 ft, 2\" w.g.): ga26 ≤30\", ga24 31\"–42\", ga22 43\"–48\", ga24 49\"–72\", ga22 73\"–96\". Table 6-2 (5 ft, 2\" w.g.): ga26 ≤26\", ga24 27\"–30\", ga22 31\"–38\", ga24 39\"–60\", ga22 61\"–84\", ga20 85\"–96\". See Tab 3, Verified Primary tier, for the full bracket-by-bracket breakdown including reinforcement spacing/code.",
      example: "MAX(600, 400) = 600mm ≈ 23.6\" → Table 6-1 bracket 21\"–28\" → ga 26; the run's full 20.00 sq m Area is assigned to the ga 26 column",
      note: "Gauge assignment is now sourced from real SMACNA Table 6-1/6-2 (provided directly by the user, transcribed 2026-07-24), replacing the app's earlier unverified single bracket table. Both tables stop at 96\" (2438mm) — a run exceeding that falls back to the largest documented bracket's gauge with a warning, not a verified value; use the manual gauge override for anything past 96\".", source: "primary" },
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
      variables: "Gauge Unit Weight from the gauge thickness/weight chart (existing app reference, kg/sq m), e.g. ga 22 = 6.70 kg/sq m",
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

  /**
   * Looks up the SMACNA Table 6-1/6-2 bracket for a given longer-side
   * dimension (mm). Returns the matched bracket plus an outOfRange flag —
   * both tables stop at 96" (2438mm); anything beyond that falls back to
   * the largest documented bracket's gauge, flagged as extrapolated rather
   * than presented as a verified value (nothing past 96" was in the
   * source pages provided).
   */
  function gaugeBracket(longerSide, sectionLength) {
    const table = RECT_GAUGE_TABLES[sectionLength] || RECT_GAUGE_TABLES["4ft"];
    for (let i = 0; i < table.brackets.length; i++) {
      if (longerSide <= table.brackets[i].maxMm) {
        return { bracket: table.brackets[i], outOfRange: false, tableRef: table.tableRef };
      }
    }
    const last = table.brackets[table.brackets.length - 1];
    return { bracket: last, outOfRange: true, tableRef: table.tableRef };
  }

  function gaugeIndex(longerSide, sectionLength) {
    const { bracket } = gaugeBracket(longerSide, sectionLength || "4ft");
    const idx = gaugeInfo.findIndex((g) => g.label === bracket.gauge);
    return idx >= 0 ? idx : 0;
  }

  /**
   * Compute one duct run. Returns null (incomplete) if W/D/L are missing or <= 0.
   * NOTE: preserved exactly from source, including rounding order.
   * gaugeOverride (optional): index into gaugeInfo, from the per-row manual
   * override used for Medium/High/Custom pressure class runs — Table 6-1/6-2
   * automation is verified only for Low Pressure (2" w.g.), so anything else
   * must be a user-confirmed manual choice rather than a false auto-lookup.
   * sectionLength: "4ft" (Table 6-1) or "5ft" (Table 6-2) — Tab 1 project setting.
   */
  function computeRow(w, d, l, assumptions, gaugeOverride, sectionLength) {
    if (!w || !d || !l || w <= 0 || d <= 0 || l <= 0) return null;

    const perimeter = 2 * (w / 1000 + d / 1000);
    const area = perimeter * l;
    const longer = Math.max(w, d);
    const { outOfRange, tableRef } = gaugeBracket(longer, sectionLength || "4ft");
    const gi = gaugeOverride != null ? gaugeOverride : gaugeIndex(longer, sectionLength);
    const gaugeOutOfRange = gaugeOverride == null && outOfRange;

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
      perimeter, area, gaugeIndex: gi, byGauge, gaugeOutOfRange, gaugeTableRef: tableRef,
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
    gaugeInfo, RECT_GAUGE_TABLES, DUCT_SUPPORT_TABLE, assumptionsMeta, formulaRef, decimalCols, gaFields, contingencyFields,
    defaultAssumptions, gaugeIndex, gaugeBracket, computeRow, sumRows, sumGauge
  };
})();

/* ============================================================
   SMACNA Round Duct — Calculation Engine
   Deliberately separate from the SMACNA (rectangular) module above —
   round duct geometry/material takeoff must not share formulas with
   rectangular, per explicit review requirement. Round duct minimum
   gauge is NOT auto-looked-up here (see Gauge & References tab,
   Secondary-Sourced Guidance tier) — gauge is a manual per-run
   selection, reusing SMACNA.gaugeInfo's thickness/weight-per-sqm
   values since those are generic steel material properties
   independent of duct shape.
   ============================================================ */
const SMACNA_ROUND = (function () {
  "use strict";

  const fittingTypes = ["Elbow 90°", "Elbow 45°", "Tee", "Reducer", "Transition", "Collar", "End Cap", "Damper — Volume", "Damper — Fire", "Damper — Balancing"];

  const formulaRef = [
    { name: "CIRCUMFERENCE", formula: "Circumference (m) = π × Diameter ÷ 1000",
      variables: "Diameter = round duct outer diameter (mm)",
      example: "Diameter 300mm → Circumference = π × 0.300 = 0.942 m",
      note: "Converts mm diameter to meters and finds the outer circumference.", source: "assumption" },
    { name: "AREA", formula: "Area (sq m) = Circumference × Length × Quantity",
      variables: "Circumference (m) from above; Length = length per piece (m); Quantity = number of identical pieces in this run",
      example: "Circumference 0.942 m, Length 5 m, Qty 1 → Area = 0.942 × 5 × 1 = 4.71 sq m",
      note: "Outer surface area; basis for every material quantity below.", source: "assumption" },
    { name: "GAUGE — MANUAL SELECTION", formula: "(no formula — gauge is picked manually per run)",
      variables: "—",
      example: "e.g. select \"ga 22\" from the dropdown for a 300mm diameter run",
      note: "Round duct minimum-gauge breakpoints (spiral vs. longitudinal seam, by diameter) were not verified against a primary SMACNA document in this session — automating this lookup would risk asserting an unverified structural requirement. See Gauge & References tab, Secondary-Sourced Guidance tier, for cited rule-of-thumb figures to inform your manual choice.", source: "secondary" },
    { name: "INSULATION / SEALANT / ADHESIVE / DUCT PINS", formula: "Same rate-based formulas as rectangular: Area×1.0, Area÷A-01, Area÷A-02, CEILING(Area×A-03)",
      variables: "A-01/A-02/A-03 — same assumptions as rectangular (Tab 1)",
      example: "Area 4.71 sq m → Insulation 4.71 sq m, Sealant 0.13 gal, Adhesive 0.19 gal, Pins 19 pcs",
      note: "Coverage rates are material properties independent of duct shape, so the same assumptions apply.", source: "assumption" },
    { name: "JOINTS / TAPE", formula: "Tape (rolls) = CEILING(Circumference × Qty × CEILING(Length ÷ A-04) ÷ A-05)",
      variables: "A-04 = joint spacing (m); A-05 = tape roll length (m)",
      example: "CEILING(Length÷A-04) joints per piece × Qty pieces, sealed around the Circumference, consumed from A-05-length rolls",
      note: "Direct analog of rectangular's tape formula, substituting Circumference for Perimeter.", source: "assumption" },
    { name: "FLANGES", formula: "(no formula — manual quantity per run)",
      variables: "—",
      example: "User enters e.g. 2 flanges for an equipment-connection run",
      note: "Flange locations depend on system design (equipment tie-ins), not on diameter/length alone — not computable from geometry, so it's a fillable count defaulting to 0.", source: "assumption" },
    { name: "HANGER COUNT / ANGLE / ROD / INSERTS / NUTS / WASHERS", formula: "Same spacing-based formulas as rectangular, substituting Diameter for Width",
      variables: "A-09/A-10/A-11/A-13/A-14 — same global assumptions as rectangular",
      example: "Angle (m) = Hangers × (Diameter÷1000 + 0.4) — same clearance-allowance methodology as rectangular's angle formula",
      note: "Same fixed-spec hanger assumptions as rectangular (A-13/A-14 rod/angle size now come from SMACNA Table 6-7, Section C — but as one project-wide manual pick, not auto-varied per run diameter).", source: "assumption" },
    { name: "FITTINGS & ACCESSORIES — ESTIMATED SURFACE AREA", formula: "Fitting Area (sq m) = Circumference × (A-16 × Diameter÷1000) × Quantity",
      variables: "A-16 = fitting equivalent-length factor (typical 1.5× diameter, range 1.0–3.0); Circumference = π × Diameter÷1000",
      example: "Elbow 90°, 300mm diameter, qty 1 → Circumference 0.942 m × (1.5 × 0.300) = 0.942 × 0.45 = 0.42 sq m",
      note: "A rough estimating shortcut, NOT a verified SMACNA fitting-dimension source — real fitting geometry (gore count, taper length) varies by manufacturer. This estimated area feeds into Insulation/Sealant/Adhesive/Duct Pins only (not weight/gauge, since fitting gauge/material isn't tracked here) — verify against actual fabrication drawings before procurement.", source: "assumption" }
  ];

  function defaultRoundAssumptions() {
    return {}; // round duct reuses the shared rectangular assumptions object (A-01..A-15); no round-specific assumptions yet
  }

  /**
   * Compute one round duct run. Returns null (incomplete) if inputs missing/invalid.
   * gaugeLabel: manual selection, e.g. "ga 22" — matched against SMACNA.gaugeInfo.
   */
  function computeRow(diameter, length, qty, gaugeLabel, assumptions) {
    if (!diameter || !length || !qty || diameter <= 0 || length <= 0 || qty <= 0) return null;

    const circumference = Math.PI * (diameter / 1000);
    const areaPerPiece = circumference * length;
    const area = areaPerPiece * qty;

    const insulation = area;
    const sealant = Math.round((area / assumptions.A01) * 100) / 100;
    const adhesive = Math.round((area / assumptions.A02) * 100) / 100;
    const pins = Math.ceil(area * assumptions.A03);

    const jointsPerPiece = Math.ceil(length / assumptions.A04);
    const totalJoints = jointsPerPiece * qty;
    const tape = Math.ceil((circumference * totalJoints) / assumptions.A05);
    const strap = Math.ceil(((length / assumptions.A06) * (circumference + 0.3) * qty) / assumptions.A07);

    const hangerCountPerPiece = Math.ceil(length / assumptions.A09 + 1);
    const hangerCount = hangerCountPerPiece * qty;
    const angle = hangerCount * (diameter / 1000 + 0.4);
    const rod = hangerCount * assumptions.A11 * assumptions.A10;
    const insert = hangerCount * assumptions.A11;
    const nuts = insert * 2;
    const washers = insert * 2;

    const gaugeMatch = SMACNA.gaugeInfo.find((g) => g.label === gaugeLabel) || SMACNA.gaugeInfo[0];
    const weight = area * gaugeMatch.weight;

    return {
      circumference, areaPerPiece, area, gaugeLabel,
      insulation, sealant, adhesive, pins, tape, strap,
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

  /**
   * Estimated surface area for one Fittings & Accessories schedule line.
   * Rough estimating shortcut (A-16), not a verified SMACNA fitting-dimension
   * source — see the FITTINGS & ACCESSORIES formula reference entry.
   * Returns 0 for incomplete/invalid input rather than null, since this
   * contributes to a running sum, not a standalone row result.
   */
  function computeFittingArea(sizeMm, qty, assumptions) {
    if (!sizeMm || !qty || sizeMm <= 0 || qty <= 0) return 0;
    const circumference = Math.PI * (sizeMm / 1000);
    const equivalentLength = assumptions.A16 * (sizeMm / 1000);
    return circumference * equivalentLength * qty;
  }

  return { fittingTypes, formulaRef, defaultRoundAssumptions, computeRow, sumRows, computeFittingArea };
})();
