(function () {
  "use strict";

  let assumptions = SMACNA.defaultAssumptions();
  let rowCounter = 0;
  const rowResults = new Map(); // id -> computeRow() result (or null if incomplete)

  // Shared across the Gauge & References tab, the Formula Reference tab, and
  // the print report — one definition of what each source tier means and how
  // it's badged, so the three surfaces never drift out of sync.
  const TIER_LABELS = {
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

  function renderAssumptions() {
    const body = document.getElementById("assump-body");
    body.innerHTML = SMACNA.assumptionsMeta
      .map((a) => {
        const rangeLine =
          a.min != null
            ? `<div style="font-size:.68rem;color:#607D8B;margin-top:3px">Typical: ${a.typical} &nbsp;|&nbsp; Range: ${a.min}–${a.max} ${a.unit}</div>`
            : "";
        const guidanceLine = a.guidance
          ? `<div style="font-size:.68rem;color:#607D8B;font-style:italic;margin-top:3px">${a.guidance}</div>`
          : "";
        const rowClass = a.locked ? "locked-row" : a.tier === "secondary" ? "secondary-row" : "";
        return `
      <tr class="${rowClass}">
        <td>${a.ref}</td>
        <td class="rate-cell">${rateCellHtml(a)}${rangeLine}</td>
        <td>${a.unit}</td>
        <td style="text-align:left">${a.label}${guidanceLine}</td>
        <td style="text-align:left;font-size:.72rem;color:#555">${a.locked ? "🔒 " : ""}${a.source}</td>
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

  // ---------------- Gauge reference tab ----------------
  function renderGaugeTable() {
    const body = document.getElementById("gauge-ref-body");
    body.innerHTML = SMACNA.gaugeInfo
      .map((g, i) => {
        const range = i === 0 ? "≤ 300 mm" : i === SMACNA.gaugeInfo.length - 1 ? "> 3050 mm" : `${g.min} – ${g.max} mm`;
        return `<tr><td>${i + 1}</td><td>${range}</td><td>${g.label}</td><td>No. ${g.label.split(" ")[1]}</td><td>${g.thickness}</td><td>${g.weight}</td><td>${g.ref}</td></tr>`;
      })
      .join("");
  }

  // ---------------- Gauge & References tab: four-tier breakdown ----------------
  function renderReferenceTiers() {
    const rowsFor = (tier) => SMACNA.assumptionsMeta.filter((a) => a.tier === tier);

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
    return `
    <tr class="data-row" id="res-${id}" data-id="${id}">
      <td class="computed" id="runref-${id}">${run}</td>
      <td class="computed" id="perim-${id}">—</td>
      <td class="computed" id="area-${id}">—</td>
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
    const result = SMACNA.computeRow(w, d, l, assumptions);
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
        cell.textContent = result.area.toFixed(2);
        cell.classList.add("gauge-hit");
      } else {
        cell.textContent = "—";
        cell.classList.remove("gauge-hit");
      }
    });
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
    document.getElementById("weight-" + id).textContent = result.weight.toFixed(1);

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
      <div class="warning-box">⚠ Rod diameter (A-13: ${assumptions.A13}) and trapeze angle size (A-14: ${assumptions.A14}) are manually selected estimating assumptions — <b>NOT</b> automatically SMACNA-compliant sizing. Final support sizing must be verified by the project engineer against the applicable SMACNA edition before fabrication or installation.</div>
      <div class="summary-grid">${hangerFields.map(lineBox).join("")}</div>

      <div class="ok-box" id="rows-ok">${nRows} duct run(s) computed successfully. Final Takeoff totals (Net + Waste/Contingency Allowance, A-15) update live as you edit any cell above.</div>
    `;
  }

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

  function renderPrintReport() {
    const container = document.getElementById("print-report");
    if (!container) return;
    const { totals, wasteFactor } = computeGrandTotals();
    const sheetArea = (assumptions.A12.w / 1000) * (assumptions.A12.h / 1000);

    // ---- Duct Identification & Results (one combined table for the report) ----
    const rowsHtml = Array.from(document.querySelectorAll("#input-body tr.data-row"))
      .map((tr) => {
        const id = tr.dataset.id;
        const r = rowResults.get(parseInt(id, 10));
        const run = pv("run-" + id), type = pv("type-" + id);
        if (!r) return `<tr><td>${run}</td><td>${type}</td><td colspan="6" style="color:#9A2323">Incomplete — missing Width/Depth/Length</td></tr>`;
        const gauge = SMACNA.gaugeInfo[r.gaugeIndex].label;
        return `<tr><td>${run}</td><td>${type}</td><td>${pv("w-" + id)}</td><td>${pv("d-" + id)}</td><td>${pv("l-" + id)}</td>
          <td>${r.perimeter.toFixed(2)}</td><td>${r.area.toFixed(2)}</td><td>${gauge}</td></tr>`;
      })
      .join("");

    // ---- Gauge Summary (Final Takeoff Area primary, Net/Waste as audit detail) ----
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

    // ---- Misc & Consumables / Hangers & Supports (Final primary, Net+delta audit) ----
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

    // ---- Assumptions, grouped by tier ----
    const tiers = ["existing", "secondary", "assumption", "general"];
    const assumptionsByTier = tiers
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

    container.innerHTML = `
      <div class="report-header">
        <h1>SMACNA Rectangular Duct Material Takeoff — Report</h1>
        <div class="report-sub">Reference Basis: SMACNA HVAC Duct Construction Standards, 3rd Ed. | Generated ${new Date().toLocaleDateString()}</div>
        <table class="report-projgrid">
          <tr><td><b>Project:</b> ${pv("p-project")}</td><td><b>Date:</b> ${pv("p-date")}</td></tr>
          <tr><td><b>Reference:</b> ${pv("p-ref")}</td><td><b>Prepared By:</b> ${pv("p-prep")}</td></tr>
          <tr><td><b>Location:</b> ${pv("p-loc")}</td><td><b>Checked By:</b> ${pv("p-check")}</td></tr>
          <tr><td><b>Revision:</b> ${pv("p-rev")}</td><td><b>Sheet:</b> ${pv("p-sheet")}</td></tr>
        </table>
      </div>

      <div class="report-section">
        <div class="report-section-title">1. Duct Identification &amp; Results</div>
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
        <table class="report-table">
          <thead><tr><th>Item</th><th>Final (incl. allowance)</th><th>Audit detail</th></tr></thead>
          <tbody>${miscFields.map(lineHtml).join("")}</tbody>
        </table>
      </div>

      <div class="report-section">
        <div class="report-section-title">4. Hangers &amp; Supports</div>
        <div class="report-disclaimer">⚠ Rod diameter (A-13: ${assumptions.A13}) and trapeze angle size (A-14: ${assumptions.A14}) are manually selected estimating assumptions — NOT automatically SMACNA-compliant sizing. Final support sizing must be verified by the project engineer against the applicable SMACNA edition before fabrication or installation.</div>
        <table class="report-table">
          <thead><tr><th>Item</th><th>Final (incl. allowance)</th><th>Audit detail</th></tr></thead>
          <tbody>${hangerFields.map(lineHtml).join("")}</tbody>
        </table>
      </div>

      <div class="report-section">
        <div class="report-section-title">5. Material Coverage Assumptions &amp; References</div>
        ${assumptionsByTier}
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
    renderGaugeTable();
    renderReferenceTiers();
    window.addRow("SA-01", "SA", 400, 300, 10);
    window.addRow("SA-02", "SA", 600, 400, 8);
    window.addRow("SA-03", "SA", 900, 600, 12);
    window.addRow("SA-04", "SA", 1200, 800, 6);
    window.addRow("SA-05", "RA", 280, 200, 15);
  });
})();
