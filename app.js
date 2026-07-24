(function () {
  "use strict";

  let assumptions = SMACNA.defaultAssumptions();
  let rowCounter = 0;
  const rowResults = new Map(); // id -> computeRow() result (or null if incomplete)

  // ---------------- Tabs ----------------
  window.showTab = function (i) {
    document.querySelectorAll(".tab-content").forEach((el, idx) => el.classList.toggle("active", idx === i));
    document.querySelectorAll(".tab-btn").forEach((el, idx) => el.classList.toggle("active", idx === i));
  };

  // ---------------- Assumptions tab ----------------
  function renderAssumptions() {
    const body = document.getElementById("assump-body");
    body.innerHTML = SMACNA.assumptionsMeta
      .map(
        (a) => `
      <tr class="${a.locked ? "locked-row" : ""}">
        <td>${a.ref}</td>
        <td class="rate-cell"><input type="number" step="any" id="assump-${a.field}" value="${assumptions[a.field]}"${a.locked ? " readonly title=\"Fixed SMACNA / standard value — not editable\"" : ""}></td>
        <td>${a.unit}</td>
        <td style="text-align:left">${a.label}</td>
        <td style="text-align:left;font-size:.72rem;color:#555">${a.locked ? "🔒 " : ""}${a.source}</td>
      </tr>`
      )
      .join("");
    body.querySelectorAll("input:not([readonly])").forEach((inp) => inp.addEventListener("input", onAssumptionChange));
  }

  function onAssumptionChange() {
    SMACNA.assumptionsMeta.forEach((a) => {
      if (a.locked) return;
      const v = parseFloat(document.getElementById("assump-" + a.field).value);
      assumptions[a.field] = isNaN(v) ? a.def : v;
    });
    recalcAllRows();
  }

  // ---------------- Formula reference tab ----------------
  function renderFormulaRef() {
    document.getElementById("formula-ref-list").innerHTML = SMACNA.formulaRef
      .map(
        (f) => `
      <div class="formula-item">
        <div class="fname">${f.name} <span style="color:#8FA3AF;font-weight:400">(col ${f.col})</span></div>
        <div class="formula-box" style="margin:4px 0">${f.formula}</div>
        <div style="font-size:.8rem;color:#3C4B57">${f.note}</div>
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

  // ---------------- Duct rows ----------------
  function rowTemplate(id, run, type, width, depth, length) {
    const types = ["SA", "RA", "EA", "OA", "TA"];
    return `
    <tr class="data-row" id="row-${id}" data-id="${id}">
      <td><input type="text" id="run-${id}" value="${run}"></td>
      <td><select id="type-${id}">${types.map((t) => `<option value="${t}" ${t === type ? "selected" : ""}>${t}</option>`).join("")}</select></td>
      <td><input type="number" min="0" id="w-${id}" value="${width}"></td>
      <td><input type="number" min="0" id="d-${id}" value="${depth}"></td>
      <td><input type="number" min="0" step="0.1" id="l-${id}" value="${length}"></td>
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
      <td class="no-print"><button class="del-btn" onclick="removeRow(${id})">✕</button></td>
    </tr>`;
  }

  window.addRow = function (run, type, width, depth, length) {
    rowCounter++;
    const id = rowCounter;
    const tbody = document.getElementById("takeoff-body");
    tbody.insertAdjacentHTML(
      "beforeend",
      rowTemplate(id, run || "R-" + String(id).padStart(2, "0"), type || "SA", width || "", depth || "", length || "")
    );
    ["run", "type", "w", "d", "l"].forEach((p) => {
      document.getElementById(p + "-" + id).addEventListener("input", () => recalcRow(id));
    });
    recalcRow(id);
  };

  window.removeRow = function (id) {
    const el = document.getElementById("row-" + id);
    if (el) el.remove();
    rowResults.delete(id);
    recalcTotals();
  };

  window.clearAllRows = function () {
    document.getElementById("takeoff-body").innerHTML = "";
    rowResults.clear();
    recalcTotals();
  };

  function recalcAllRows() {
    document.querySelectorAll("#takeoff-body tr.data-row").forEach((tr) => recalcRow(parseInt(tr.dataset.id, 10)));
  }

  function recalcRow(id) {
    const w = parseFloat(document.getElementById("w-" + id).value);
    const d = parseFloat(document.getElementById("d-" + id).value);
    const l = parseFloat(document.getElementById("l-" + id).value);
    const rowEl = document.getElementById("row-" + id);
    const result = SMACNA.computeRow(w, d, l, assumptions);
    rowResults.set(id, result);

    const fields = ["perim", "area", "ins", "seal", "adh", "pin", "tape", "strap", "corner", "angle", "rod", "insert", "nuts", "wash", "weight"];

    if (!result) {
      fields.forEach((f) => (document.getElementById(f + "-" + id).textContent = "—"));
      SMACNA.gaFields.forEach((f) => {
        document.getElementById(f + "-" + id).textContent = "—";
        document.getElementById(f + "-" + id).classList.remove("gauge-hit");
      });
      rowEl.classList.add("incomplete");
      recalcTotals();
      return;
    }
    rowEl.classList.remove("incomplete");

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

  function recalcTotals() {
    const results = Array.from(rowResults.values());
    // field: real computeRow() result key. suf: DOM id suffix (t-<suf> / w-<suf>).
    // Kept as one paired list (not two separately-keyed lookups) specifically
    // because a field/suffix name mismatch previously made Insulation/Sealant/
    // Adhesive/Duct-Pin grand totals silently render as 0.
    const colDefs = [
      { field: "insulation", suf: "ins" },
      { field: "sealant", suf: "seal" },
      { field: "adhesive", suf: "adh" },
      { field: "pins", suf: "pin" },
      { field: "tape", suf: "tape" },
      { field: "strap", suf: "strap" },
      { field: "corner", suf: "corner" },
      { field: "angle", suf: "angle" },
      { field: "rod", suf: "rod" },
      { field: "insert", suf: "insert" },
      { field: "nuts", suf: "nuts" },
      { field: "washers", suf: "wash" },
      { field: "weight", suf: "weight" }
    ];

    const totals = {};
    colDefs.forEach(({ field }) => (totals[field] = SMACNA.sumRows(results, field)));
    SMACNA.gaFields.forEach((g) => (totals[g] = SMACNA.sumGauge(results, g)));

    colDefs.forEach(({ field, suf }) => {
      const t = totals[field];
      const tEl = document.getElementById("t-" + suf);
      const wEl = document.getElementById("w-" + suf);
      const dec = SMACNA.decimalCols.includes(field);
      if (tEl) tEl.textContent = dec ? t.toFixed(2) : Math.round(t * 100) / 100;
      if (wEl) wEl.textContent = dec ? (t * 1.2).toFixed(2) : Math.round(t * 1.2 * 100) / 100;
    });
    SMACNA.gaFields.forEach((g) => {
      const t = totals[g];
      const tEl = document.getElementById("t-" + g);
      const wEl = document.getElementById("w-" + g);
      if (tEl) tEl.textContent = t.toFixed(2);
      if (wEl) wEl.textContent = (t * 1.2).toFixed(2);
    });

    const totalArea = SMACNA.gaFields.reduce((s, g) => s + totals[g], 0);
    document.getElementById("sum-area").textContent = totalArea.toFixed(2);
    document.getElementById("sum-weight").textContent = (totals.weight * 1.2).toFixed(1);
    // NOTE (flagged, unchanged): this mirrors the source app's label — it is actually
    // the total rod-insert count (hangerCount × A-11), not the hanger count itself.
    document.getElementById("sum-hangers").textContent = totals.insert;

    const nRows = document.querySelectorAll("#takeoff-body tr.data-row:not(.incomplete)").length;
    const nIncomplete = document.querySelectorAll("#takeoff-body tr.data-row.incomplete").length;
    document.getElementById("rows-ok").textContent =
      nRows + " duct run(s) computed successfully. Totals and 20% waste allowance update live as you edit any cell above.";
    document.getElementById("incomplete-warning").style.display = nIncomplete > 0 ? "block" : "none";
  }

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
    window.addRow("SA-01", "SA", 400, 300, 10);
    window.addRow("SA-02", "SA", 600, 400, 8);
    window.addRow("SA-03", "SA", 900, 600, 12);
    window.addRow("SA-04", "SA", 1200, 800, 6);
    window.addRow("SA-05", "RA", 280, 200, 15);
  });
})();
