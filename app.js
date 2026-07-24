(function () {
  "use strict";

  let assumptions = SMACNA.defaultAssumptions();
  let rowCounter = 0;
  const rowResults = new Map(); // id -> computeRow() result (or null if incomplete)

  // Shared across the Gauge & References tab, the Formula Reference tab, and
  // the print report — one definition of what each source tier means and how
  // it's badged, so the three surfaces never drift out of sync.
  const TIER_LABELS = {
    primary: { badge: "✅ Verified Primary SMACNA Reference", note: "Provided directly by the user from scanned pages of SMACNA HVAC Duct Construction Standards — Metal and Flexible, 2nd Edition (transcribed 2026-07-24). Genuine primary-source data, not an estimate or secondary aggregation — but transcription from a photograph can still miss a digit, so spot-check any figure that materially affects fabrication/procurement against your own copy." },
    existing: { badge: "🗂️ Existing App/Workbook Reference", note: "Inherited from the app's original source workbook — not independently re-verified against a primary SMACNA document in this session." },
    secondary: { badge: "🔎 Secondary-Sourced Guidance", note: "Aggregated from published secondary sources, not the primary SMACNA manual — confirm exact values against your SMACNA 3rd Ed. before use." },
    assumption: { badge: "📐 Engineering/Estimating Assumption", note: "Project-adjustable estimating judgment, not code-mandated." },
    general: { badge: "📖 General Material/Industry Reference", note: "Common physical/product constant, not a SMACNA-specific citation." }
  };

  // ---------------- Tabs ----------------
  window.showTab = function (i) {
    document.querySelectorAll(".tab-content").forEach((el, idx) => el.classList.toggle("active", idx === i));
    document.querySelectorAll(".tab-btn").forEach((el, idx) => el.classList.toggle("active", idx === i));
  };

  // ---------------- Duct mode: Rectangular / Round ----------------
  let ductMode = "rect";
  window.showDuctMode = function (mode) {
    ductMode = mode;
    document.getElementById("rect-calc-section").style.display = mode === "rect" ? "" : "none";
    document.getElementById("round-calc-section").style.display = mode === "round" ? "" : "none";
    document.getElementById("mode-rect-btn").classList.toggle("active", mode === "rect");
    document.getElementById("mode-round-btn").classList.toggle("active", mode === "round");
    const title = document.getElementById("app-title");
    if (title) {
      title.innerHTML = (mode === "rect" ? "RECTANGULAR" : "ROUND") + ' DUCT MATERIAL TAKEOFF <span class="offline-pill">OFFLINE</span>';
      updateOnlineStatus();
    }
  };

  // ---------------- Pressure class ----------------
  window.onPressureClassChange = function () {
    const cls = document.getElementById("p-pressure-class").value;
    document.getElementById("pressure-class-warning").style.display = cls === "Low" ? "none" : "block";
  };

  // ---------------- Standard duct section length (SMACNA Table 6-1 vs 6-2) ----------------
  function sectionLength() {
    const el = document.getElementById("p-section-length");
    return el ? el.value : "4ft";
  }
  window.onSectionLengthChange = function () {
    recalcAllRows(); // gauge assignment depends on which table (6-1/6-2) is selected
  };

  // ---------------- Duct material (Steel vs Aluminum, SMACNA Table 6-3) ----------------
  function ductMaterial() {
    const el = document.getElementById("p-duct-material");
    return el ? el.value : "steel";
  }
  window.onDuctMaterialChange = function () {
    recalcAllRows();
    recalcAllRoundRows();
    recalcRoundTotals();
  };

  // ---------------- Assumptions tab ----------------
  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function rateCellHtml(a) {
    if (a.type === "dual") {
      const v = assumptions[a.field];
      return `<input type="number" step="1" id="assump-${a.field}-w" value="${v.w}" style="width:70px;display:inline-block"> ×
              <input type="number" step="1" id="assump-${a.field}-h" value="${v.h}" style="width:70px;display:inline-block">`;
    }
    if (a.type === "select") {
      return `<select id="assump-${a.field}">${a.options
        .map((o) => `<option value="${escapeAttr(o)}"${o === assumptions[a.field] ? " selected" : ""}>${o}</option>`)
        .join("")}</select>`;
    }
    return `<input type="number" step="any" id="assump-${a.field}" value="${assumptions[a.field]}"${
      a.locked ? " readonly title=\"Fixed value — not editable, see Code/Source\"" : ""
    }>`;
  }

  // Assumptions table shows terse engineering shorthand ("m", "sq m / gal")
  // in the data itself (calc.js) so formulas/labels stay compact — this
  // expands that shorthand to a full descriptive name for display only.
  // Unrecognized units fall through unchanged, so new assumptionsMeta
  // entries never break rendering.
  const UNIT_LABELS = {
    "m": "Meter (m)",
    "m / roll": "Meter per Roll (m / roll)",
    "sq m / gal": "Square Meter per Gallon (sq m / gal)",
    "pcs / sq m": "Pieces per Square Meter (pcs / sq m)",
    "pcs / hanger": "Pieces per Hanger (pcs / hanger)",
    "factor (–)": "Multiplier Factor — Dimensionless (factor)",
    "mm × mm": "Millimeter × Millimeter (mm × mm)",
    "rod diameter": "Nominal Rod Diameter — Selectable (rod diameter)",
    "angle size": "Nominal Angle Size — Selectable (angle size)",
    "× diameter": "Multiple of Duct Diameter (× diameter)"
  };
  function unitLabel(u) {
    return UNIT_LABELS[u] || u;
  }

  function renderAssumptions() {
    const body = document.getElementById("assump-body");
    body.innerHTML = SMACNA.assumptionsMeta
      .map((a) => {
        const rangeLine =
          a.min != null
            ? `<div style="font-size:.68rem;color:#607D8B;margin-top:3px;text-align:center">Typical: ${a.typical} &nbsp;|&nbsp; Range: ${a.min}–${a.max} ${a.unit}</div>`
            : "";
        const guidanceLine = a.guidance
          ? `<div style="font-size:.68rem;color:#607D8B;font-style:italic;margin-top:3px">${a.guidance}</div>`
          : "";
        const rowClass = a.locked ? "locked-row" : a.tier === "secondary" ? "secondary-row" : "";
        return `
      <tr class="${rowClass}">
        <td data-label="Ref.">${a.ref}</td>
        <td class="rate-cell" data-label="Rate Value">${rateCellHtml(a)}${rangeLine}</td>
        <td data-label="Unit">${unitLabel(a.unit)}</td>
        <td data-label="Description" style="text-align:left">${a.label}${guidanceLine}</td>
        <td data-label="Code / Source" style="text-align:left;font-size:.72rem;color:#555">${a.locked ? "🔒 " : ""}${a.source}</td>
      </tr>`;
      })
      .join("");
    body.querySelectorAll("input:not([readonly]), select").forEach((inp) => inp.addEventListener("input", onAssumptionChange));
  }

  function onAssumptionChange() {
    SMACNA.assumptionsMeta.forEach((a) => {
      if (a.locked) return;
      if (a.type === "dual") {
        const w = parseFloat(document.getElementById("assump-" + a.field + "-w").value);
        const h = parseFloat(document.getElementById("assump-" + a.field + "-h").value);
        assumptions[a.field] = { w: isNaN(w) ? a.def.w : w, h: isNaN(h) ? a.def.h : h };
        return;
      }
      if (a.type === "select") {
        assumptions[a.field] = document.getElementById("assump-" + a.field).value;
        return;
      }
      const v = parseFloat(document.getElementById("assump-" + a.field).value);
      assumptions[a.field] = isNaN(v) ? a.def : v;
    });
    renderReferenceTiers();
    recalcAllRows();
    recalcAllRoundRows();
    recalcRoundTotals(); // also refreshes the Fittings & Accessories (A-16) contribution even with zero round duct rows
  }

  // ---------------- Formula reference tab ----------------
  function renderFormulaRef() {
    document.getElementById("formula-ref-list").innerHTML = SMACNA.formulaRef
      .map(
        (f) => `
      <div class="formula-item">
        <div class="fname">${f.name}</div>
        <div class="formula-box" style="margin:4px 0">${f.formula}</div>
        <div style="font-size:.78rem;color:#3C4B57"><b>Variables:</b> ${f.variables}</div>
        <div style="font-size:.78rem;color:#1565C0;margin-top:3px"><b>Example:</b> ${f.example}</div>
        <div style="font-size:.78rem;color:#3C4B57;margin-top:3px">${f.note}</div>
        <div style="font-size:.68rem;color:#8FA3AF;margin-top:4px">${TIER_LABELS[f.source].badge}</div>
      </div>`
      )
      .join("");
  }

  function renderFormulaRefRound() {
    const el = document.getElementById("formula-ref-round-list");
    if (!el) return;
    el.innerHTML = SMACNA_ROUND.formulaRef
      .map(
        (f) => `
      <div class="formula-item">
        <div class="fname">${f.name}</div>
        <div class="formula-box" style="margin:4px 0">${f.formula}</div>
        <div style="font-size:.78rem;color:#3C4B57"><b>Variables:</b> ${f.variables}</div>
        <div style="font-size:.78rem;color:#1565C0;margin-top:3px"><b>Example:</b> ${f.example}</div>
        <div style="font-size:.78rem;color:#3C4B57;margin-top:3px">${f.note}</div>
        <div style="font-size:.68rem;color:#8FA3AF;margin-top:4px">${TIER_LABELS[f.source].badge}</div>
      </div>`
      )
      .join("");
  }

  // ---------------- Gauge reference tab ----------------
  // Renders both SMACNA Table 6-1 (4 ft) and 6-2 (5 ft) bracket tables in
  // full, regardless of which one Tab 1's Standard Duct Section Length
  // selector currently uses for live calculation — this is the reference
  // view, so both should be visible for comparison/audit.
  function renderGaugeTable() {
    const body = document.getElementById("gauge-ref-body");
    if (!body) return;
    const sections = ["4ft", "5ft"].map((key) => {
      const table = SMACNA.RECT_GAUGE_TABLES[key];
      const rows = table.brackets
        .map(
          (b) =>
            `<tr><td>${b.ductDim}</td><td>${b.gauge}</td><td>${b.reinfSpacing}</td><td>${b.reinfCode}</td></tr>`
        )
        .join("");
      return `<div class="subsection-header">${table.tableRef} — ${table.label}, 2" w.g. static</div>
        <table class="ref-table"><tr><th>Duct Dim.</th><th>Duct Ga. (min)</th><th>Reinf. Spacing (max)</th><th>Reinf. Code Grade</th></tr>${rows}</table>`;
    });
    body.innerHTML = sections.join("") +
      `<div class="ref-tier-note" style="border-top:1px solid var(--border)">Reinf. Spacing/Code Grade are shown for reference only — this app does not yet compute a reinforcement-angle/bar material quantity from them. Both tables stop at 96" (2438mm); a run exceeding that is flagged in the Results table rather than silently extrapolated.</div>
      <div class="subsection-header">Gauge thickness / weight chart (existing app reference, applies to any gauge above)</div>
      <table class="ref-table"><tr><th>Gauge</th><th>Thickness (mm)</th><th>Weight (kg/m²)</th></tr>${SMACNA.gaugeInfo
        .map((g) => `<tr><td>${g.label}</td><td>${g.thickness}</td><td>${g.weight}</td></tr>`)
        .join("")}</table>`;
  }

  function renderDuctSupportTable() {
    const body = document.getElementById("duct-support-ref-body");
    if (!body) return;
    const t = SMACNA.DUCT_SUPPORT_TABLE;
    const rows = t.brackets
      .map((b) => `<tr><td>${b.maxDim}</td><td>${b.angle}</td><td>${b.rod}</td></tr>`)
      .join("");
    body.innerHTML = `<table class="ref-table"><tr><th>Max. Duct Side/Diameter</th><th>Horizontal Support Angle</th><th>Hanger (round rod)</th></tr>${rows}</table>
      <div class="ref-tier-note">${t.altHangerNote} Drives A-13 (rod) / A-14 (angle) options in Tab 1 — see guidance text there for which bracket applies to your project's largest duct run.</div>`;
  }

  function renderRoundGaugeTable() {
    const body = document.getElementById("round-gauge-ref-body");
    if (!body) return;
    const t = SMACNA_ROUND.ROUND_GAUGE_TABLE;
    const rows = t.brackets
      .map((b) => `<tr><td>${b.maxDim}</td><td>${b.gauge}</td><td>${b.aluminumGauge}</td></tr>`)
      .join("");
    body.innerHTML = `<table class="ref-table"><tr><th>Duct Diameter (max. width)</th><th>Steel Ga. (min, &lt;2" w.g.)</th><th>Aluminum B.&amp;S. Gage (reference)</th></tr>${rows}</table>
      <div class="ref-tier-note">Aluminum B.&amp;S. Gage is shown for reference only — it is not the same equivalency system as Table 6-3 (below), which is what actually drives this app's Aluminum weight calculation. Steel Ga. drives the Round Duct calculator's "Auto" gauge lookup in Tab 2 regardless of Duct Material.</div>`;
  }

  function renderAluminumTable() {
    const body = document.getElementById("aluminum-ref-body");
    if (!body) return;
    const t = SMACNA.ALUMINUM_THICKNESS_TABLE;
    const rows = Object.keys(t.byGauge)
      .map((label) => {
        const g = t.byGauge[label];
        return `<tr><td>${label}</td><td>${g.minEquivMm} mm</td><td>${g.commercialMm} mm</td></tr>`;
      })
      .join("");
    body.innerHTML = `<table class="ref-table"><tr><th>Steel-Equivalent Gauge</th><th>Min. Aluminum Equivalent</th><th>Commercial Size (used for weight)</th></tr>${rows}</table>
      <div class="ref-tier-note">This app uses the Commercial Size (the stock thickness you'd actually order) for the Aluminum weight calculation — Min. Equivalent is the bare structural minimum, shown for reference. Aluminum density used: ${SMACNA.ALUMINUM_DENSITY_KG_M3} kg/m³ (general physical constant, not SMACNA-tabulated).</div>`;
  }

  // ---------------- Gauge & References tab: five-tier breakdown ----------------
  function renderReferenceTiers() {
    const rowsFor = (tier) => SMACNA.assumptionsMeta.filter((a) => a.tier === tier);

    const primaryBody = document.getElementById("ref-primary-body");
    if (primaryBody) {
      primaryBody.innerHTML = rowsFor("primary")
        .map((a) => `<tr><td>${a.ref}</td><td>${fmtAssumpValue(a)}</td><td style="text-align:left">${a.label}</td><td style="text-align:left;font-size:.7rem">${a.guidance || ""}</td></tr>`)
        .join("");
    }

    const existingBody = document.getElementById("ref-existing-body");
    if (existingBody) {
      existingBody.innerHTML = rowsFor("existing")
        .map((a) => `<tr><td>${a.ref}</td><td>${fmtAssumpValue(a)}</td><td style="text-align:left">${a.label}</td></tr>`)
        .join("");
    }

    const secondaryBody = document.getElementById("ref-secondary-body");
    if (secondaryBody) {
      secondaryBody.innerHTML = rowsFor("secondary")
        .map((a) => `<tr><td>${a.ref}</td><td>${fmtAssumpValue(a)}</td><td style="text-align:left">${a.label}</td><td style="text-align:left;font-size:.7rem">${a.guidance || ""}</td></tr>`)
        .join("");
    }

    const assumptionBody = document.getElementById("ref-assumption-body");
    if (assumptionBody) {
      assumptionBody.innerHTML = rowsFor("assumption")
        .map(
          (a) =>
            `<tr><td>${a.ref}</td><td>${fmtAssumpValue(a)}</td><td style="text-align:left">${a.label}</td><td>${
              a.min != null ? `${a.min}–${a.max} ${a.unit}` : "—"
            }</td></tr>`
        )
        .join("");
    }

    const generalBody = document.getElementById("ref-general-body");
    if (generalBody) {
      generalBody.innerHTML = rowsFor("general")
        .map((a) => `<tr><td>${a.ref}</td><td>${fmtAssumpValue(a)}</td><td style="text-align:left">${a.label}</td></tr>`)
        .join("");
    }
  }

  // ---------------- Duct rows ----------------
  function inputRowHtml(id, run, type, width, depth, length) {
    const types = ["SA", "RA", "EA", "OA", "TA"];
    return `
    <tr class="data-row" id="row-${id}" data-id="${id}">
      <td><input type="text" id="run-${id}" value="${run}"></td>
      <td><select id="type-${id}">${types.map((t) => `<option value="${t}" ${t === type ? "selected" : ""}>${t}</option>`).join("")}</select></td>
      <td><input type="number" min="0" id="w-${id}" value="${width}"></td>
      <td><input type="number" min="0" id="d-${id}" value="${depth}"></td>
      <td><input type="number" min="0" step="0.1" id="l-${id}" value="${length}"></td>
      <td class="no-print"><button class="del-btn" onclick="removeRow(${id})">✕</button></td>
    </tr>`;
  }

  function resultsRowHtml(id, run) {
    const gaugeOverrideOptions = ["Auto"].concat(SMACNA.gaugeInfo.map((g) => g.label));
    return `
    <tr class="data-row" id="res-${id}" data-id="${id}">
      <td class="computed" id="runref-${id}">${run}</td>
      <td class="computed" id="perim-${id}">—</td>
      <td class="computed" id="area-${id}">—</td>
      <td><select id="gaugeover-${id}" title="Manual gauge override — for Medium/High/Custom pressure class runs, since Table 6-1/6-2 automation is verified only for Low Pressure">${gaugeOverrideOptions
        .map((o) => `<option value="${o}">${o}</option>`)
        .join("")}</select></td>
      <td class="computed" id="ga26-${id}">—</td><td class="computed" id="ga24-${id}">—</td>
      <td class="computed" id="ga22-${id}">—</td><td class="computed" id="ga20-${id}">—</td>
      <td class="computed" id="ga18-${id}">—</td><td class="computed" id="ga16-${id}">—</td>
      <td class="computed" id="ins-${id}">—</td><td class="computed" id="seal-${id}">—</td>
      <td class="computed" id="adh-${id}">—</td><td class="computed" id="pin-${id}">—</td>
      <td class="computed" id="tape-${id}">—</td><td class="computed" id="strap-${id}">—</td>
      <td class="computed" id="corner-${id}">—</td>
      <td class="computed" id="angle-${id}">—</td><td class="computed" id="rod-${id}">—</td>
      <td class="computed" id="insert-${id}">—</td><td class="computed" id="nuts-${id}">—</td><td class="computed" id="wash-${id}">—</td>
      <td class="computed" id="weight-${id}">—</td>
    </tr>`;
  }

  window.addRow = function (run, type, width, depth, length) {
    rowCounter++;
    const id = rowCounter;
    const runName = run || "R-" + String(id).padStart(2, "0");
    document.getElementById("input-body").insertAdjacentHTML(
      "beforeend",
      inputRowHtml(id, runName, type || "SA", width || "", depth || "", length || "")
    );
    document.getElementById("results-body").insertAdjacentHTML("beforeend", resultsRowHtml(id, runName));
    ["run", "type", "w", "d", "l"].forEach((p) => {
      document.getElementById(p + "-" + id).addEventListener("input", () => recalcRow(id));
    });
    document.getElementById("gaugeover-" + id).addEventListener("change", () => recalcRow(id));
    recalcRow(id);
  };

  window.removeRow = function (id) {
    const inEl = document.getElementById("row-" + id);
    const resEl = document.getElementById("res-" + id);
    if (inEl) inEl.remove();
    if (resEl) resEl.remove();
    rowResults.delete(id);
    recalcTotals();
  };

  window.clearAllRows = function () {
    document.getElementById("input-body").innerHTML = "";
    document.getElementById("results-body").innerHTML = "";
    rowResults.clear();
    recalcTotals();
  };

  function recalcAllRows() {
    document.querySelectorAll("#input-body tr.data-row").forEach((tr) => recalcRow(parseInt(tr.dataset.id, 10)));
  }

  function recalcRow(id) {
    const w = parseFloat(document.getElementById("w-" + id).value);
    const d = parseFloat(document.getElementById("d-" + id).value);
    const l = parseFloat(document.getElementById("l-" + id).value);
    const runNameEl = document.getElementById("run-" + id);
    const runRefEl = document.getElementById("runref-" + id);
    if (runNameEl && runRefEl) runRefEl.textContent = runNameEl.value;
    const inEl = document.getElementById("row-" + id);
    const resEl = document.getElementById("res-" + id);
    const overrideEl = document.getElementById("gaugeover-" + id);
    const overrideVal = overrideEl ? overrideEl.value : "Auto";
    const gaugeOverride = overrideVal === "Auto" ? null : SMACNA.gaugeInfo.findIndex((g) => g.label === overrideVal);
    const result = SMACNA.computeRow(w, d, l, assumptions, gaugeOverride != null && gaugeOverride >= 0 ? gaugeOverride : null, sectionLength(), ductMaterial());
    rowResults.set(id, result);

    const fields = ["perim", "area", "ins", "seal", "adh", "pin", "tape", "strap", "corner", "angle", "rod", "insert", "nuts", "wash", "weight"];

    if (!result) {
      fields.forEach((f) => (document.getElementById(f + "-" + id).textContent = "—"));
      SMACNA.gaFields.forEach((f) => {
        document.getElementById(f + "-" + id).textContent = "—";
        document.getElementById(f + "-" + id).classList.remove("gauge-hit");
      });
      inEl.classList.add("incomplete");
      if (resEl) resEl.classList.add("incomplete");
      recalcTotals();
      return;
    }
    inEl.classList.remove("incomplete");
    if (resEl) resEl.classList.remove("incomplete");

    document.getElementById("perim-" + id).textContent = result.perimeter.toFixed(2);
    document.getElementById("area-" + id).textContent = result.area.toFixed(2);
    SMACNA.gaFields.forEach((f, i) => {
      const cell = document.getElementById(f + "-" + id);
      if (i === result.gaugeIndex) {
        cell.textContent = (result.gaugeOutOfRange ? "⚠ " : "") + result.area.toFixed(2);
        cell.title = result.gaugeOutOfRange
          ? `Exceeds ${result.gaugeTableRef}'s documented 96" (2438mm) range — this gauge is extrapolated from the largest bracket, not a verified table value. Use the manual gauge override.`
          : "";
        cell.classList.add("gauge-hit");
      } else {
        cell.textContent = "—";
        cell.title = "";
        cell.classList.remove("gauge-hit");
      }
    });
    if (resEl) resEl.classList.toggle("gauge-outrange", !!result.gaugeOutOfRange);
    document.getElementById("ins-" + id).textContent = result.insulation.toFixed(2);
    document.getElementById("seal-" + id).textContent = result.sealant.toFixed(2);
    document.getElementById("adh-" + id).textContent = result.adhesive.toFixed(2);
    document.getElementById("pin-" + id).textContent = result.pins;
    document.getElementById("tape-" + id).textContent = result.tape;
    document.getElementById("strap-" + id).textContent = result.strap;
    document.getElementById("corner-" + id).textContent = result.corner.toFixed(2);
    document.getElementById("angle-" + id).textContent = result.angle.toFixed(2);
    document.getElementById("rod-" + id).textContent = result.rod.toFixed(2);
    document.getElementById("insert-" + id).textContent = result.insert;
    document.getElementById("nuts-" + id).textContent = result.nuts;
    document.getElementById("wash-" + id).textContent = result.washers;
    const weightCell = document.getElementById("weight-" + id);
    weightCell.textContent = result.weight.toFixed(1);
    weightCell.title = result.materialLabel || "";

    recalcTotals();
  }

  // field: real computeRow() result key. suf: DOM id suffix (t-<suf> / w-<suf> / f-<suf>).
  // Kept as one paired list (not two separately-keyed lookups) specifically
  // because a field/suffix name mismatch previously made Insulation/Sealant/
  // Adhesive/Duct-Pin grand totals silently render as 0.
  const RECT_COL_DEFS = [
    { field: "insulation", suf: "ins", label: "Insulation", unit: "sq m" },
    { field: "sealant", suf: "seal", label: "Sealant", unit: "gal" },
    { field: "adhesive", suf: "adh", label: "Adhesive", unit: "gal" },
    { field: "pins", suf: "pin", label: "Duct Pins", unit: "pcs" },
    { field: "tape", suf: "tape", label: "Duct Tape", unit: "rolls" },
    { field: "strap", suf: "strap", label: "Strap", unit: "rolls" },
    { field: "corner", suf: "corner", label: "Corner Trim", unit: "sq m" },
    { field: "angle", suf: "angle", label: "Angle (trapeze)", unit: "m" },
    { field: "rod", suf: "rod", label: "Threaded Rod", unit: "m" },
    { field: "insert", suf: "insert", label: "Concrete Inserts", unit: "pcs" },
    { field: "nuts", suf: "nuts", label: "Nuts", unit: "pcs" },
    { field: "washers", suf: "wash", label: "Washers", unit: "pcs" },
    { field: "weight", suf: "weight", label: "Est. Sheet Metal Weight", unit: "kg" }
  ];

  // Shared by the on-screen totals row and the print report so both always
  // agree — computes Net / Waste-or-Contingency-delta / Final for every
  // material column plus each gauge, using the current A-15 assumption.
  function computeGrandTotals() {
    const results = Array.from(rowResults.values());
    const totals = {};
    RECT_COL_DEFS.forEach(({ field }) => (totals[field] = SMACNA.sumRows(results, field)));
    SMACNA.gaFields.forEach((g) => (totals[g] = SMACNA.sumGauge(results, g)));
    const wasteFactor = assumptions.A15;
    return { totals, wasteFactor, rowCount: results.length };
  }

  function recalcTotals() {
    const { totals, wasteFactor } = computeGrandTotals();
    const colDefs = RECT_COL_DEFS;
    colDefs.forEach(({ field, suf }) => {
      const t = totals[field];
      const dec = SMACNA.decimalCols.includes(field);
      const tEl = document.getElementById("t-" + suf);
      const wEl = document.getElementById("w-" + suf);
      const fEl = document.getElementById("f-" + suf);
      const fmt = (v) => (dec ? v.toFixed(2) : Math.round(v * 100) / 100);
      if (tEl) tEl.textContent = fmt(t);
      if (wEl) wEl.textContent = fmt(t * wasteFactor);
      if (fEl) fEl.textContent = fmt(t * (1 + wasteFactor));
    });
    SMACNA.gaFields.forEach((g) => {
      const t = totals[g];
      const tEl = document.getElementById("t-" + g);
      const wEl = document.getElementById("w-" + g);
      const fEl = document.getElementById("f-" + g);
      if (tEl) tEl.textContent = t.toFixed(2);
      if (wEl) wEl.textContent = (t * wasteFactor).toFixed(2);
      if (fEl) fEl.textContent = (t * (1 + wasteFactor)).toFixed(2);
    });
    const wasteLabelEl = document.getElementById("waste-row-label");
    if (wasteLabelEl) wasteLabelEl.textContent = `+ Waste/Contingency Allowance (A-15 = ${Math.round(wasteFactor * 100)}%) →`;

    const nIncomplete = document.querySelectorAll("#input-body tr.data-row.incomplete").length;
    document.getElementById("incomplete-warning").style.display = nIncomplete > 0 ? "block" : "none";

    const nOutOfRange = document.querySelectorAll("#results-body tr.data-row.gauge-outrange").length;
    const outOfRangeWarning = document.getElementById("gauge-outrange-warning");
    if (outOfRangeWarning) outOfRangeWarning.style.display = nOutOfRange > 0 ? "block" : "none";

    renderSummary(totals, wasteFactor);
  }

  // ---------------- Summary tab (item 9: Final Takeoff primary, Net/allowance as audit detail) ----------------
  function renderSummary(totals, wasteFactor) {
    const body = document.getElementById("summary-body");
    if (!body) return;
    const sheetArea = (assumptions.A12.w / 1000) * (assumptions.A12.h / 1000);

    const gaugeBoxes = SMACNA.gaFields
      .map((g, i) => ({ g, label: SMACNA.gaugeInfo[i].label, net: totals[g] }))
      .filter((x) => x.net > 0)
      .map((x) => {
        const waste = x.net * wasteFactor;
        const fin = x.net + waste;
        const sheets = Math.ceil(fin / sheetArea);
        return `<div class="summary-primary-box">
          <div class="sp-label">${x.label}</div>
          <div class="sp-value">${fin.toFixed(2)} sq m &nbsp;·&nbsp; ${sheets} sheets</div>
          <div class="sp-audit">Net ${x.net.toFixed(2)} + Waste/Contingency ${waste.toFixed(2)} = Final ${fin.toFixed(2)} sq m</div>
        </div>`;
      })
      .join("");

    const lineBox = (field) => {
      const def = RECT_COL_DEFS.find((c) => c.field === field);
      const net = totals[field];
      const isContingency = SMACNA.contingencyFields.includes(field);
      const waste = net * wasteFactor;
      const fin = net + waste;
      const dec = SMACNA.decimalCols.includes(field);
      const f = (v) => (dec ? v.toFixed(2) : Math.round(v));
      return `<div class="summary-primary-box">
        <div class="sp-label">${def.label}</div>
        <div class="sp-value">${f(fin)} ${def.unit}</div>
        <div class="sp-audit">Net ${f(net)} + ${isContingency ? "Contingency" : "Waste"} ${f(waste)}</div>
      </div>`;
    };
    const miscFields = ["insulation", "sealant", "adhesive", "pins", "tape", "strap", "corner"];
    const hangerFields = ["angle", "rod", "insert", "nuts", "washers"];

    const nRows = document.querySelectorAll("#input-body tr.data-row:not(.incomplete)").length;

    body.innerHTML = `
      <div class="subsection-header">Gauge Summary (Final Takeoff Area &amp; Est. No. of Sheets are the primary procurement figures; Net + allowance shown as audit detail)</div>
      <div class="summary-grid">${gaugeBoxes || '<div class="summary-primary-box">No gauge totals — enter duct runs above.</div>'}</div>

      <div class="subsection-header">Miscellaneous &amp; Consumables</div>
      <div class="summary-grid">${miscFields.map(lineBox).join("")}</div>

      <div class="subsection-header">Hangers &amp; Supports</div>
      <div class="warning-box">⚠ Rod diameter (A-13: ${assumptions.A13}) and trapeze angle size (A-14: ${assumptions.A14}) are sourced from SMACNA Table 6-7, Section C — but as <b>one project-wide manual pick</b>, not auto-varied per run. Confirm the selected bracket matches the <b>largest</b> duct run in this project (see Tab 1 guidance / Tab 3 reference), and have the project engineer verify final support sizing before fabrication or installation.</div>
      <div class="summary-grid">${hangerFields.map(lineBox).join("")}</div>

      <div class="ok-box" id="rows-ok">${nRows} duct run(s) computed successfully. Final Takeoff totals (Net + Waste/Contingency Allowance, A-15) update live as you edit any cell above.</div>
    `;
  }

  // ---------------- Round duct rows (separate calc engine, separate DOM tree) ----------------
  let roundRowCounter = 0;
  const roundRowResults = new Map();

  const ROUND_COL_DEFS = [
    { field: "insulation", suf: "ins", label: "Insulation", unit: "sq m" },
    { field: "sealant", suf: "seal", label: "Sealant", unit: "gal" },
    { field: "adhesive", suf: "adh", label: "Adhesive", unit: "gal" },
    { field: "pins", suf: "pin", label: "Duct Pins", unit: "pcs" },
    { field: "angle", suf: "angle", label: "Angle (trapeze)", unit: "m" },
    { field: "rod", suf: "rod", label: "Threaded Rod", unit: "m" },
    { field: "insert", suf: "insert", label: "Concrete Inserts", unit: "pcs" },
    { field: "nuts", suf: "nuts", label: "Nuts", unit: "pcs" },
    { field: "washers", suf: "wash", label: "Washers", unit: "pcs" },
    { field: "weight", suf: "weight", label: "Est. Sheet Metal Weight", unit: "kg" }
  ];
  const ROUND_DECIMAL_FIELDS = ["insulation", "sealant", "adhesive", "angle", "rod", "weight"];
  const ROUND_CONTINGENCY_FIELDS = ["pins", "insert", "nuts", "washers"];

  function roundInputRowHtml(id, run, diameter, length, qty, gauge, flanges) {
    const gaugeOptions = ["Auto"].concat(SMACNA.gaugeInfo.map((g) => g.label));
    return `
    <tr class="data-row" id="round-row-${id}" data-id="${id}">
      <td><input type="text" id="rrun-${id}" value="${run}"></td>
      <td><input type="number" min="0" id="rdia-${id}" value="${diameter}"></td>
      <td><input type="number" min="0" step="0.1" id="rlen-${id}" value="${length}"></td>
      <td><input type="number" min="1" step="1" id="rqty-${id}" value="${qty}"></td>
      <td><select id="rgauge-${id}" title="Auto = SMACNA Table 6-8 lookup by diameter (Low Pressure, <2&quot; w.g.). Pick a specific gauge to override.">${gaugeOptions.map((g) => `<option value="${g}"${g === gauge ? " selected" : ""}>${g}</option>`).join("")}</select></td>
      <td><input type="number" min="0" step="1" id="rflange-${id}" value="${flanges}"></td>
      <td class="no-print"><button class="del-btn" onclick="removeRoundRow(${id})">✕</button></td>
    </tr>`;
  }

  function roundResultsRowHtml(id, run) {
    return `
    <tr class="data-row" id="round-res-${id}" data-id="${id}">
      <td class="computed" id="rrunref-${id}">${run}</td>
      <td class="computed" id="rcirc-${id}">—</td>
      <td class="computed" id="rarea-${id}">—</td>
      <td class="computed round-gauge-cell" id="rgaugeval-${id}">—</td>
      <td class="computed" id="rins-${id}">—</td><td class="computed" id="rseal-${id}">—</td>
      <td class="computed" id="radh-${id}">—</td><td class="computed" id="rpin-${id}">—</td>
      <td class="computed" id="rangle-${id}">—</td><td class="computed" id="rrod-${id}">—</td>
      <td class="computed" id="rinsert-${id}">—</td><td class="computed" id="rnuts-${id}">—</td><td class="computed" id="rwash-${id}">—</td>
      <td class="computed" id="rweight-${id}">—</td>
    </tr>`;
  }

  window.addRoundRow = function (run, diameter, length, qty, gauge, flanges) {
    roundRowCounter++;
    const id = roundRowCounter;
    const runName = run || "RD-" + String(id).padStart(2, "0");
    document.getElementById("round-input-body").insertAdjacentHTML(
      "beforeend",
      roundInputRowHtml(id, runName, diameter || "", length || "", qty || 1, gauge || "Auto", flanges || 0)
    );
    document.getElementById("round-results-body").insertAdjacentHTML("beforeend", roundResultsRowHtml(id, runName));
    ["rrun", "rdia", "rlen", "rqty", "rgauge", "rflange"].forEach((p) => {
      const el = document.getElementById(p + "-" + id);
      el.addEventListener(p === "rgauge" ? "change" : "input", () => recalcRoundRow(id));
    });
    recalcRoundRow(id);
  };

  window.removeRoundRow = function (id) {
    const inEl = document.getElementById("round-row-" + id);
    const resEl = document.getElementById("round-res-" + id);
    if (inEl) inEl.remove();
    if (resEl) resEl.remove();
    roundRowResults.delete(id);
    recalcRoundTotals();
  };

  window.clearAllRoundRows = function () {
    document.getElementById("round-input-body").innerHTML = "";
    document.getElementById("round-results-body").innerHTML = "";
    roundRowResults.clear();
    recalcRoundTotals();
  };

  function recalcAllRoundRows() {
    document.querySelectorAll("#round-input-body tr.data-row").forEach((tr) => recalcRoundRow(parseInt(tr.dataset.id, 10)));
  }

  function recalcRoundRow(id) {
    const dia = parseFloat(document.getElementById("rdia-" + id).value);
    const len = parseFloat(document.getElementById("rlen-" + id).value);
    const qty = parseFloat(document.getElementById("rqty-" + id).value);
    const gauge = document.getElementById("rgauge-" + id).value;
    const runNameEl = document.getElementById("rrun-" + id);
    const runRefEl = document.getElementById("rrunref-" + id);
    if (runNameEl && runRefEl) runRefEl.textContent = runNameEl.value;
    const inEl = document.getElementById("round-row-" + id);
    const resEl = document.getElementById("round-res-" + id);
    const result = SMACNA_ROUND.computeRow(dia, len, qty, gauge, assumptions, ductMaterial());
    roundRowResults.set(id, result);

    const fields = ["circ", "area", "gaugeval", "ins", "seal", "adh", "pin", "angle", "rod", "insert", "nuts", "wash", "weight"];
    if (!result) {
      fields.forEach((f) => (document.getElementById("r" + f + "-" + id).textContent = "—"));
      inEl.classList.add("incomplete");
      if (resEl) resEl.classList.add("incomplete");
      recalcRoundTotals();
      return;
    }
    inEl.classList.remove("incomplete");
    if (resEl) resEl.classList.remove("incomplete");

    document.getElementById("rcirc-" + id).textContent = result.circumference.toFixed(2);
    document.getElementById("rarea-" + id).textContent = result.area.toFixed(2);
    const gaugeCell = document.getElementById("rgaugeval-" + id);
    gaugeCell.textContent = (result.gaugeOutOfRange ? "⚠ " : "") + result.gaugeLabel + (result.gaugeAuto ? " (auto)" : " (manual)");
    gaugeCell.title = result.gaugeOutOfRange
      ? "Exceeds SMACNA Table 6-8's documented 84\" (2134mm) range — this gauge is extrapolated from the largest bracket, not a verified table value. Use the manual gauge override."
      : "";
    if (resEl) resEl.classList.toggle("gauge-outrange", !!result.gaugeOutOfRange);
    document.getElementById("rins-" + id).textContent = result.insulation.toFixed(2);
    document.getElementById("rseal-" + id).textContent = result.sealant.toFixed(2);
    document.getElementById("radh-" + id).textContent = result.adhesive.toFixed(2);
    document.getElementById("rpin-" + id).textContent = result.pins;
    document.getElementById("rangle-" + id).textContent = result.angle.toFixed(2);
    document.getElementById("rrod-" + id).textContent = result.rod.toFixed(2);
    document.getElementById("rinsert-" + id).textContent = result.insert;
    document.getElementById("rnuts-" + id).textContent = result.nuts;
    document.getElementById("rwash-" + id).textContent = result.washers;
    const rWeightCell = document.getElementById("rweight-" + id);
    rWeightCell.textContent = result.weight.toFixed(1);
    rWeightCell.title = result.materialLabel || "";

    recalcRoundTotals();
  }

  // Fittings & Accessories schedule contributes an *estimated* surface area
  // (A-16 equivalent-length factor — see calc.js) into the same coverage-rate
  // formulas as straight duct (Insulation/Sealant/Adhesive/Duct Pins only —
  // not weight, since fitting gauge/material isn't tracked). Quantities
  // themselves stay manual; only this derived area is estimated.
  function computeFittingsArea() {
    let total = 0;
    document.querySelectorAll("#fittings-body tr").forEach((tr) => {
      const id = tr.id.replace("fitting-row-", "");
      const sizeEl = document.getElementById("fitsize-" + id);
      const qtyEl = document.getElementById("fitqty-" + id);
      if (!sizeEl || !qtyEl) return;
      total += SMACNA_ROUND.computeFittingArea(parseFloat(sizeEl.value), parseFloat(qtyEl.value), assumptions);
    });
    return total;
  }

  function computeRoundGrandTotals() {
    const results = Array.from(roundRowResults.values());
    const totals = {};
    ROUND_COL_DEFS.forEach(({ field }) => (totals[field] = SMACNA_ROUND.sumRows(results, field)));

    const fittingsArea = computeFittingsArea();
    totals.insulation += fittingsArea;
    totals.sealant += Math.round((fittingsArea / assumptions.A01) * 100) / 100;
    totals.adhesive += Math.round((fittingsArea / assumptions.A02) * 100) / 100;
    totals.pins += Math.ceil(fittingsArea * assumptions.A03);

    return { totals, wasteFactor: assumptions.A15, fittingsArea };
  }

  function recalcRoundTotals() {
    const { totals, wasteFactor, fittingsArea } = computeRoundGrandTotals();
    ROUND_COL_DEFS.forEach(({ field, suf }) => {
      const t = totals[field];
      const dec = ROUND_DECIMAL_FIELDS.includes(field);
      const tEl = document.getElementById("rt-" + suf);
      const wEl = document.getElementById("rw-" + suf);
      const fEl = document.getElementById("rf-" + suf);
      const fmt = (v) => (dec ? v.toFixed(2) : Math.round(v * 100) / 100);
      if (tEl) tEl.textContent = fmt(t);
      if (wEl) wEl.textContent = fmt(t * wasteFactor);
      if (fEl) fEl.textContent = fmt(t * (1 + wasteFactor));
    });
    const wasteLabelEl = document.getElementById("round-waste-row-label");
    if (wasteLabelEl) wasteLabelEl.textContent = `+ Waste/Contingency Allowance (A-15 = ${Math.round(wasteFactor * 100)}%) →`;

    const nIncomplete = document.querySelectorAll("#round-input-body tr.data-row.incomplete").length;
    const incompleteWarning = document.getElementById("round-incomplete-warning");
    if (incompleteWarning) incompleteWarning.style.display = nIncomplete > 0 ? "block" : "none";

    const nOutOfRange = document.querySelectorAll("#round-results-body tr.data-row.gauge-outrange").length;
    const outOfRangeWarning = document.getElementById("round-gauge-outrange-warning");
    if (outOfRangeWarning) outOfRangeWarning.style.display = nOutOfRange > 0 ? "block" : "none";

    renderRoundSummary(totals, wasteFactor, fittingsArea);
  }

  function renderRoundSummary(totals, wasteFactor, fittingsArea) {
    const body = document.getElementById("round-summary-body");
    if (!body) return;
    const lineBox = (field) => {
      const def = ROUND_COL_DEFS.find((c) => c.field === field);
      const net = totals[field];
      const isContingency = ROUND_CONTINGENCY_FIELDS.includes(field);
      const waste = net * wasteFactor;
      const fin = net + waste;
      const dec = ROUND_DECIMAL_FIELDS.includes(field);
      const f = (v) => (dec ? v.toFixed(2) : Math.round(v));
      return `<div class="summary-primary-box">
        <div class="sp-label">${def.label}</div>
        <div class="sp-value">${f(fin)} ${def.unit}</div>
        <div class="sp-audit">Net ${f(net)} + ${isContingency ? "Contingency" : "Waste"} ${f(waste)}</div>
      </div>`;
    };
    const miscFields = ["insulation", "sealant", "adhesive", "pins"];
    const hangerFields = ["angle", "rod", "insert", "nuts", "washers"];
    const nRows = document.querySelectorAll("#round-input-body tr.data-row:not(.incomplete)").length;
    const nFittings = document.querySelectorAll("#fittings-body tr").length;

    body.innerHTML = `
      <div class="subsection-header">Miscellaneous &amp; Consumables (Straight Duct + Fittings Estimate)</div>
      <div class="report-note" style="margin-bottom:6px">Includes an estimated surface-area contribution from the Fittings &amp; Accessories schedule below (A-16 equivalent-length factor, currently ${fittingsArea.toFixed(2)} sq m before waste/contingency) — a rough approximation, not a verified SMACNA fitting-dimension calculation.</div>
      <div class="summary-grid">${miscFields.map(lineBox).join("")}</div>

      <div class="subsection-header">Hangers &amp; Supports</div>
      <div class="warning-box">⚠ Rod diameter (A-13: ${assumptions.A13}) and trapeze angle size (A-14: ${assumptions.A14}) are sourced from SMACNA Table 6-7, Section C — but as <b>one project-wide manual pick</b>, not auto-varied per run. Confirm the selected bracket matches the <b>largest</b> duct run in this project (see Tab 1 guidance / Tab 3 reference), and have the project engineer verify final support sizing before fabrication or installation.</div>
      <div class="summary-grid">${hangerFields.map(lineBox).join("")}</div>

      <div class="subsection-header">Fittings &amp; Accessories</div>
      <div class="ok-box">${nFittings} fitting line item(s) entered in the schedule above. Quantities are manual (for ordering); their estimated surface-area contribution (A-16) is included in Insulation/Sealant/Adhesive/Duct Pins above. Weight/gauge per fitting is still not tracked — verify against actual fabrication drawings before procurement.</div>

      <div class="ok-box">${nRows} round duct run(s) computed successfully. Final Takeoff totals (Net + Waste/Contingency Allowance, A-15) update live as you edit any cell above.</div>
    `;
  }

  // ---------------- Fittings & Accessories schedule (manual, no calculation) ----------------
  let fittingRowCounter = 0;
  window.addFittingRow = function () {
    fittingRowCounter++;
    const id = fittingRowCounter;
    document.getElementById("fittings-body").insertAdjacentHTML(
      "beforeend",
      `<tr id="fitting-row-${id}">
        <td><select id="fittype-${id}">${SMACNA_ROUND.fittingTypes.map((t) => `<option value="${t}">${t}</option>`).join("")}</select></td>
        <td><input type="number" min="0" id="fitsize-${id}" placeholder="mm"></td>
        <td><input type="number" min="0" step="1" id="fitqty-${id}" value="1"></td>
        <td class="no-print"><button class="del-btn" onclick="removeFittingRow(${id})">✕</button></td>
      </tr>`
    );
    document.getElementById("fitqty-" + id).addEventListener("input", () => recalcRoundTotals());
    document.getElementById("fitsize-" + id).addEventListener("input", () => recalcRoundTotals());
    document.getElementById("fittype-" + id).addEventListener("change", () => recalcRoundTotals());
  };
  window.removeFittingRow = function (id) {
    const el = document.getElementById("fitting-row-" + id);
    if (el) el.remove();
    recalcRoundTotals();
  };

  // ---------------- Print report (professional PDF, not a screenshot of the app) ----------------
  function pv(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
  }

  function fmtAssumpValue(a) {
    const v = assumptions[a.field];
    if (a.type === "dual") return `${v.w} × ${v.h} mm`;
    return `${v} ${a.unit}`;
  }

  function assumptionsByTierHtml() {
    const tiers = ["primary", "existing", "secondary", "assumption", "general"];
    return tiers
      .map((t) => {
        const rows = SMACNA.assumptionsMeta.filter((a) => a.tier === t);
        if (!rows.length) return "";
        return `<div class="report-tier-block">
          <div class="report-tier-badge">${TIER_LABELS[t].badge}</div>
          <div class="report-tier-note">${TIER_LABELS[t].note}</div>
          <table class="report-table"><thead><tr><th>Ref.</th><th>Value</th><th>Description</th><th>Source</th></tr></thead>
          <tbody>${rows.map((a) => `<tr><td>${a.ref}</td><td>${fmtAssumpValue(a)}</td><td style="text-align:left">${a.label}</td><td style="text-align:left;font-size:8.5px">${a.source}</td></tr>`).join("")}</tbody>
          </table></div>`;
      })
      .join("");
  }

  function buildRectReportSections() {
    const { totals, wasteFactor } = computeGrandTotals();
    const sheetArea = (assumptions.A12.w / 1000) * (assumptions.A12.h / 1000);

    const rowsHtml = Array.from(document.querySelectorAll("#input-body tr.data-row"))
      .map((tr) => {
        const id = tr.dataset.id;
        const r = rowResults.get(parseInt(id, 10));
        const run = pv("run-" + id), type = pv("type-" + id);
        if (!r) return `<tr><td>${run}</td><td>${type}</td><td colspan="6" style="color:#9A2323">Incomplete — missing Width/Depth/Length</td></tr>`;
        const overrideEl = document.getElementById("gaugeover-" + id);
        const gauge = overrideEl && overrideEl.value !== "Auto" ? overrideEl.value + " (manual override)" : SMACNA.gaugeInfo[r.gaugeIndex].label;
        return `<tr><td>${run}</td><td>${type}</td><td>${pv("w-" + id)}</td><td>${pv("d-" + id)}</td><td>${pv("l-" + id)}</td>
          <td>${r.perimeter.toFixed(2)}</td><td>${r.area.toFixed(2)}</td><td>${gauge}</td></tr>`;
      })
      .join("");

    const gaugeRowsHtml = SMACNA.gaFields
      .map((g, i) => ({ g, label: SMACNA.gaugeInfo[i].label, net: totals[g] }))
      .filter((x) => x.net > 0)
      .map((x) => {
        const waste = x.net * wasteFactor;
        const fin = x.net + waste;
        const sheets = Math.ceil(fin / sheetArea);
        return `<tr>
          <td>${x.label}</td>
          <td class="report-primary">${fin.toFixed(2)} sq m</td>
          <td class="report-primary">${sheets}</td>
          <td class="report-audit">Net ${x.net.toFixed(2)} + Waste/Contingency ${waste.toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const miscFields = ["insulation", "sealant", "adhesive", "pins", "tape", "strap", "corner"];
    const hangerFields = ["angle", "rod", "insert", "nuts", "washers"];
    const lineHtml = (field) => {
      const def = RECT_COL_DEFS.find((c) => c.field === field);
      const net = totals[field];
      const isContingency = SMACNA.contingencyFields.includes(field);
      const waste = net * wasteFactor;
      const fin = net + waste;
      const dec = SMACNA.decimalCols.includes(field);
      const f = (v) => (dec ? v.toFixed(2) : Math.round(v));
      return `<tr>
        <td>${def.label}</td>
        <td class="report-primary">${f(fin)} ${def.unit}</td>
        <td class="report-audit">Net ${f(net)} + ${isContingency ? "Contingency" : "Waste"} ${f(waste)}</td>
      </tr>`;
    };

    return `
      <div class="report-section">
        <div class="report-section-title">1. Duct Identification &amp; Results (Rectangular)</div>
        <table class="report-table">
          <thead><tr><th>Run</th><th>Type</th><th>Width mm</th><th>Depth mm</th><th>Length m</th><th>Perimeter m</th><th>Area sq m</th><th>Gauge</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="8">No duct runs entered.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="report-section">
        <div class="report-section-title">2. Calculation Summary — Gauge Summary</div>
        <div class="report-note">Final Takeoff Area and Est. No. of Sheets are the primary procurement figures (post Waste/Contingency Allowance, A-15). Net and the allowance amount are shown as audit detail. Sheet count uses the A-12 sheet size assumption (${assumptions.A12.w} × ${assumptions.A12.h} mm).</div>
        <table class="report-table">
          <thead><tr><th>Gauge</th><th>Final Takeoff Area</th><th>Est. No. of Sheets</th><th>Audit detail</th></tr></thead>
          <tbody>${gaugeRowsHtml || '<tr><td colspan="4">No gauge totals — enter duct runs first.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="report-section">
        <div class="report-section-title">3. Miscellaneous &amp; Consumables</div>
        <table class="report-table"><thead><tr><th>Item</th><th>Final (incl. allowance)</th><th>Audit detail</th></tr></thead>
        <tbody>${miscFields.map(lineHtml).join("")}</tbody></table>
      </div>
      <div class="report-section">
        <div class="report-section-title">4. Hangers &amp; Supports</div>
        <div class="report-disclaimer">⚠ Rod diameter (A-13: ${assumptions.A13}) and trapeze angle size (A-14: ${assumptions.A14}) are sourced from SMACNA Table 6-7, Section C — but as one project-wide manual pick, not auto-varied per run. Confirm the selected bracket matches the largest duct run in this project, and have the project engineer verify final support sizing before fabrication or installation.</div>
        <table class="report-table"><thead><tr><th>Item</th><th>Final (incl. allowance)</th><th>Audit detail</th></tr></thead>
        <tbody>${hangerFields.map(lineHtml).join("")}</tbody></table>
      </div>`;
  }

  function buildRoundReportSections() {
    const { totals, wasteFactor, fittingsArea } = computeRoundGrandTotals();

    const rowsHtml = Array.from(document.querySelectorAll("#round-input-body tr.data-row"))
      .map((tr) => {
        const id = tr.dataset.id;
        const r = roundRowResults.get(parseInt(id, 10));
        const run = pv("rrun-" + id);
        if (!r) return `<tr><td>${run}</td><td colspan="5" style="color:#9A2323">Incomplete — missing Diameter/Length/Quantity</td></tr>`;
        return `<tr><td>${run}</td><td>${pv("rdia-" + id)}</td><td>${pv("rlen-" + id)}</td><td>${pv("rqty-" + id)}</td>
          <td>${r.circumference.toFixed(2)}</td><td>${r.area.toFixed(2)}</td><td>${r.gaugeLabel}${r.gaugeAuto ? " (auto, SMACNA T6-8)" : " (manual override)"}${r.gaugeOutOfRange ? " ⚠ >84\" range" : ""}</td></tr>`;
      })
      .join("");

    // Gauge grouping: round duct gauge is resolved per-row (auto-lookup or manual override), so group by whatever labels are actually in use.
    const byGauge = {};
    roundRowResults.forEach((r) => {
      if (!r) return;
      byGauge[r.gaugeLabel] = (byGauge[r.gaugeLabel] || 0) + r.area;
    });
    const gaugeRowsHtml = Object.keys(byGauge)
      .map((label) => {
        const net = byGauge[label];
        const waste = net * wasteFactor;
        const fin = net + waste;
        return `<tr><td>${label}</td><td class="report-primary">${fin.toFixed(2)} sq m</td>
          <td class="report-audit">Net ${net.toFixed(2)} + Waste/Contingency ${waste.toFixed(2)}</td></tr>`;
      })
      .join("");

    const miscFields = ["insulation", "sealant", "adhesive", "pins"];
    const hangerFields = ["angle", "rod", "insert", "nuts", "washers"];
    const lineHtml = (field) => {
      const def = ROUND_COL_DEFS.find((c) => c.field === field);
      const net = totals[field];
      const isContingency = ROUND_CONTINGENCY_FIELDS.includes(field);
      const waste = net * wasteFactor;
      const fin = net + waste;
      const dec = ROUND_DECIMAL_FIELDS.includes(field);
      const f = (v) => (dec ? v.toFixed(2) : Math.round(v));
      return `<tr><td>${def.label}</td><td class="report-primary">${f(fin)} ${def.unit}</td>
        <td class="report-audit">Net ${f(net)} + ${isContingency ? "Contingency" : "Waste"} ${f(waste)}</td></tr>`;
    };

    const fittingsHtml = Array.from(document.querySelectorAll("#fittings-body tr"))
      .map((tr) => {
        const id = tr.id.replace("fitting-row-", "");
        return `<tr><td>${pv("fittype-" + id)}</td><td>${pv("fitsize-" + id)}</td><td>${pv("fitqty-" + id)}</td></tr>`;
      })
      .join("");

    return `
      <div class="report-section">
        <div class="report-section-title">1① AUTOMATIC — Round Duct Identification &amp; Results</div>
        <table class="report-table">
          <thead><tr><th>Run</th><th>Diameter mm</th><th>Length m</th><th>Qty</th><th>Circumference m</th><th>Area sq m</th><th>Gauge</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="7">No round duct runs entered.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="report-section">
        <div class="report-section-title">2. Calculation Summary — By Selected Gauge</div>
        <div class="report-note">Round duct gauge is resolved per run (SMACNA Table 6-8 auto-lookup by diameter, or manual override) — grouped here by whichever gauge labels are actually in use.</div>
        <table class="report-table">
          <thead><tr><th>Gauge</th><th>Final Takeoff Area</th><th>Audit detail</th></tr></thead>
          <tbody>${gaugeRowsHtml || '<tr><td colspan="3">No gauge totals — enter round duct runs first.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="report-section">
        <div class="report-section-title">3. Miscellaneous &amp; Consumables</div>
        <div class="report-note">Includes an estimated surface-area contribution from the Fittings &amp; Accessories schedule below (A-16 equivalent-length factor, ${fittingsArea.toFixed(2)} sq m before waste/contingency) — a rough approximation, not a verified SMACNA fitting-dimension calculation.</div>
        <table class="report-table"><thead><tr><th>Item</th><th>Final (incl. allowance)</th><th>Audit detail</th></tr></thead>
        <tbody>${miscFields.map(lineHtml).join("")}</tbody></table>
      </div>
      <div class="report-section">
        <div class="report-section-title">4. Hangers &amp; Supports</div>
        <div class="report-disclaimer">⚠ Rod diameter (A-13: ${assumptions.A13}) and trapeze angle size (A-14: ${assumptions.A14}) are sourced from SMACNA Table 6-7, Section C — but as one project-wide manual pick, not auto-varied per run. Confirm the selected bracket matches the largest duct run in this project, and have the project engineer verify final support sizing before fabrication or installation.</div>
        <table class="report-table"><thead><tr><th>Item</th><th>Final (incl. allowance)</th><th>Audit detail</th></tr></thead>
        <tbody>${hangerFields.map(lineHtml).join("")}</tbody></table>
      </div>
      <div class="report-section">
        <div class="report-section-title">1② Fittings &amp; Accessories Schedule</div>
        <div class="report-disclaimer">⚠ Fitting quantities and sizes are entered manually. Their surface-area contribution to Section 3 above is an ESTIMATE (A-16 equivalent-length approximation) — NOT a verified SMACNA fitting-dimension calculation, since real fitting geometry varies by manufacturer. Weight and gauge per fitting are still not tracked. Verify against actual fabrication drawings before procurement.</div>
        <table class="report-table"><thead><tr><th>Fitting Type</th><th>Size/Diameter mm</th><th>Quantity</th></tr></thead>
        <tbody>${fittingsHtml || '<tr><td colspan="3">No fittings entered.</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderPrintReport() {
    const container = document.getElementById("print-report");
    if (!container) return;
    const modeLabel = ductMode === "rect" ? "Rectangular" : "Round";
    const pressureClass = pv("p-pressure-class") || "Low";
    const designPressure = pv("p-design-pressure");
    const materialLabel = ductMaterial() === "aluminum" ? "Aluminum (Alloy 3003-H14, SMACNA T6-3 equiv.)" : "Galvanized Steel";

    container.innerHTML = `
      <div class="report-header">
        <h1>SMACNA ${modeLabel} Duct Material Takeoff — Report</h1>
        <div class="report-sub">Reference Basis: SMACNA HVAC Duct Construction Standards, 3rd Ed. | Generated ${new Date().toLocaleDateString()}</div>
        <table class="report-projgrid">
          <tr><td><b>Project:</b> ${pv("p-project")}</td><td><b>Date:</b> ${pv("p-date")}</td></tr>
          <tr><td><b>Reference:</b> ${pv("p-ref")}</td><td><b>Prepared By:</b> ${pv("p-prep")}</td></tr>
          <tr><td><b>Location:</b> ${pv("p-loc")}</td><td><b>Checked By:</b> ${pv("p-check")}</td></tr>
          <tr><td><b>Revision:</b> ${pv("p-rev")}</td><td><b>Sheet:</b> ${pv("p-sheet")}</td></tr>
          <tr><td><b>Pressure Class (terminology):</b> ${pressureClass}${pressureClass !== "Low" ? " — classification label only, not backed by a verified gauge/reinforcement table in this app" : ""}</td><td><b>Design Static Pressure:</b> ${designPressure ? designPressure + " in.w.g." : "—"}</td></tr>
          <tr><td><b>Duct Material:</b> ${materialLabel}</td><td></td></tr>
        </table>
      </div>

      ${ductMode === "rect" ? buildRectReportSections() : buildRoundReportSections()}

      <div class="report-section">
        <div class="report-section-title">5. Material Coverage Assumptions &amp; References</div>
        ${assumptionsByTierHtml()}
      </div>

      <div class="report-section">
        <div class="report-section-title">6. References</div>
        <div class="report-note">SMACNA HVAC Duct Construction Standards, 3rd Edition (2005) | PSME Code (2012 Ed.) Part 1 &amp; 2 | ASHRAE Fundamentals 2021 (Ch. 21 — Duct Design). Verify all quantities with final construction drawings before procurement. See Section 5 above for which figures in this report are existing-app references vs. secondary-sourced guidance vs. estimating assumptions.</div>
      </div>
    `;
  }
  window.renderPrintReport = renderPrintReport;

  // ---------------- Offline indicator ----------------
  function updateOnlineStatus() {
    document.body.classList.toggle("offline", !navigator.onLine);
  }
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);

  // ---------------- PWA install prompt ----------------
  let deferredInstallEvent = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallEvent = e;
    const btn = document.getElementById("install-btn");
    if (btn) btn.disabled = false;
  });
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("install-btn");
    if (btn) {
      btn.addEventListener("click", async () => {
        if (!deferredInstallEvent) return;
        deferredInstallEvent.prompt();
        await deferredInstallEvent.userChoice;
        deferredInstallEvent = null;
        btn.disabled = true;
      });
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((err) => console.error("SW registration failed:", err));
    }
    updateOnlineStatus();

    // ---- Init: same sample rows as the source workbook ----
    renderAssumptions();
    renderFormulaRef();
    renderFormulaRefRound();
    renderGaugeTable();
    renderDuctSupportTable();
    renderRoundGaugeTable();
    renderAluminumTable();
    renderReferenceTiers();
    window.addRow("SA-01", "SA", 400, 300, 10);
    window.addRow("SA-02", "SA", 600, 400, 8);
    window.addRow("SA-03", "SA", 900, 600, 12);
    window.addRow("SA-04", "SA", 1200, 800, 6);
    window.addRow("SA-05", "RA", 280, 200, 15);
    window.addRoundRow("RD-01", 300, 5, 1, "Auto", 0);
    window.addRoundRow("RD-02", 450, 8, 2, "Auto", 1);

    // ---- Splash branding: remove the moment first render is done, not on
    // a timer — this is a static local app, so that's effectively instant. ----
    const splash = document.getElementById("app-splash");
    if (splash) {
      splash.classList.add("splash-hidden");
      splash.addEventListener("transitionend", () => splash.remove(), { once: true });
      setTimeout(() => splash.remove(), 400); // fallback if transitionend doesn't fire
    }
  });
})();
