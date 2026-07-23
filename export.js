function exportExcel() {
  const wb = XLSX.utils.book_new();
  const aoa = [];
  const setRow = (r, obj) => {
    aoa[r] = aoa[r] || [];
    Object.keys(obj).forEach((c) => {
      aoa[r][colIdx(c)] = obj[c];
    });
  };
  const colIdx = (letters) => XLSX.utils.decode_col(letters);
  const val = (id) => document.getElementById(id).value;
  const gaugeInfo = SMACNA.gaugeInfo;
  const assumptionsMeta = SMACNA.assumptionsMeta;
  const formulaRef = SMACNA.formulaRef;
  const assumptions = {};
  assumptionsMeta.forEach((a) => {
    const v = parseFloat(document.getElementById("assump-" + a.field).value);
    assumptions[a.field] = isNaN(v) ? a.def : v;
  });

  // ---- Title / header rows (1-8) ----
  setRow(0, { A: "RECTANGULAR DUCT MATERIAL TAKEOFF", S: "SMACNA HVAC Duct Construction Standards — 3rd Ed." });
  setRow(1, { A: "Low Pressure Class | Maximum 2 in. w.g. (500 Pa) | Rectangular Galvanized Sheet Metal Ductwork | Philippine PSME Code Compliant" });
  setRow(2, { A: "PROJECT :", B: val("p-project"), H: "DATE :", I: val("p-date") });
  setRow(3, { A: "REFERENCE :", B: val("p-ref"), H: "PREPARED BY :", I: val("p-prep") });
  setRow(4, { A: "LOCATION :", B: val("p-loc"), H: "CHECKED BY :", I: val("p-check") });
  setRow(5, { A: "REVISION :", B: val("p-rev"), M: val("p-sheet"), S: "Form: ME-DUCT-001" });
  setRow(6, { A: "  COLOR CODE:  YELLOW = User Input   WHITE = Auto-calculated   BLUE = Section totals  |  Formulas reference Assumptions block rows 21-31" });

  // ---- Gauge table rows 9-18 ----
  setRow(8, { A: "GAUGE SELECTION TABLE (SMACNA Table 1-7 — Low Pressure — Based on LONGER Side)" });
  setRow(9, { A: "Item", B: "Range (mm)", C: "Min mm", D: "Max mm", E: "Gauge", F: "Designation", G: "Thickness (mm)", H: "Weight (kg/m²)", I: "SMACNA Ref." });
  gaugeInfo.forEach((g, i) => {
    setRow(10 + i, {
      A: i + 1,
      B: i === 0 ? "≤ 300 mm" : i === 5 ? "> 3050 mm" : g.min + " – " + g.max + " mm",
      C: g.min, D: g.max, E: g.label, F: "No. " + g.label.split(" ")[1], G: g.thickness + " mm", H: g.weight, I: "SMACNA T1-7"
    });
  });
  setRow(17, { A: "Boundaries per SMACNA HVAC Duct Construction Standards 3rd Ed. Table 1-7. Gauge = MAX(Width, Depth). ga 16 row wired to takeoff column M in this workbook (fix over source template)." });

  // ---- Assumptions rows 19-32 ----
  setRow(18, { A: "MATERIAL COVERAGE ASSUMPTIONS (all formulas reference these cells)" });
  setRow(19, { A: "Ref.", B: "RATE VALUE", C: "Unit", D: "Description", I: "Code / Source" });
  assumptionsMeta.forEach((a, i) => {
    setRow(20 + i, { A: a.ref, B: assumptions[a.field], C: a.unit, D: a.label, I: a.source });
  });

  // ---- Table headers rows 34-36 ----
  const DATA_HDR_ROW = 33;
  setRow(DATA_HDR_ROW, { A: "DUCT IDENTIFICATION & GEOMETRY", F: "COMPUTED DIMENSIONS", H: "SHEET METAL BY GAUGE (sq m)", N: "INSULATION & ACCESSORIES", V: "HANGER SUPPORT HARDWARE" });
  setRow(DATA_HDR_ROW + 1, {
    A: "Run", B: "Type", C: "Width", D: "Depth", E: "Length", F: "Perimeter", G: "Area",
    H: "ga 26", I: "ga 24", J: "ga 22", K: "ga 20", L: "ga 18", M: "ga 16",
    N: "Insulation", O: "Sealant", P: "Adhesive", Q: "Duct Pin", R: "Duct Tape", S: "Strap", T: "Corner",
    V: "Angle", W: "Rod", X: "Cnc Insert", Y: "Nuts", Z: "Washers", AA: "Est. Weight (kg)"
  });
  setRow(DATA_HDR_ROW + 2, {
    C: "mm", D: "mm", E: "m", F: "m", G: "sq m", H: "sq m", I: "sq m", J: "sq m", K: "sq m", L: "sq m", M: "sq m",
    N: "sq m", O: "gal", P: "gal", Q: "pcs", R: "20yd/rls", S: "20yd/rls", T: "sq m", V: "m", W: "m", X: "pcs", Y: "pcs", Z: "pcs", AA: "kg"
  });

  // ---- Data rows starting row 37 ----
  const DATA_START = 36;
  const dataRows = document.querySelectorAll("#takeoff-body tr.data-row");
  let rIdx = DATA_START;
  const rowRefs = [];
  dataRows.forEach((tr) => {
    const id = tr.dataset.id;
    const excelRow = rIdx + 1; // 1-based for formula strings
    rowRefs.push(excelRow);
    setRow(rIdx, {
      A: val("run-" + id),
      B: val("type-" + id),
      C: parseFloat(val("w-" + id)) || "",
      D: parseFloat(val("d-" + id)) || "",
      E: parseFloat(val("l-" + id)) || ""
    });
    rIdx++;
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Attach formulas per data row (mirrors source workbook logic + ga16 fix + weight bonus)
  rowRefs.forEach((r) => {
    ws["F" + r] = { t: "n", f: `IF(OR(C${r}="",D${r}="",E${r}=""),"",2*(C${r}/1000+D${r}/1000))` };
    ws["G" + r] = { t: "n", f: `IF(F${r}="","",F${r}*E${r})` };
    ws["H" + r] = { t: "n", f: `IF(G${r}="","",IF(MAX(C${r},D${r})<=300,G${r},""))` };
    ws["I" + r] = { t: "n", f: `IF(G${r}="","",IF(AND(MAX(C${r},D${r})>=301,MAX(C${r},D${r})<=450),G${r},""))` };
    ws["J" + r] = { t: "n", f: `IF(G${r}="","",IF(AND(MAX(C${r},D${r})>=451,MAX(C${r},D${r})<=1350),G${r},""))` };
    ws["K" + r] = { t: "n", f: `IF(G${r}="","",IF(AND(MAX(C${r},D${r})>=1351,MAX(C${r},D${r})<=2100),G${r},""))` };
    ws["L" + r] = { t: "n", f: `IF(G${r}="","",IF(AND(MAX(C${r},D${r})>=2101,MAX(C${r},D${r})<=3050),G${r},""))` };
    ws["M" + r] = { t: "n", f: `IF(G${r}="","",IF(MAX(C${r},D${r})>=3051,G${r},""))` };
    ws["N" + r] = { t: "n", f: `IF(G${r}="","",G${r})` };
    ws["O" + r] = { t: "n", f: `IF(G${r}="","",ROUND(G${r}/$B$21,2))` };
    ws["P" + r] = { t: "n", f: `IF(G${r}="","",ROUND(G${r}/$B$22,2))` };
    ws["Q" + r] = { t: "n", f: `IF(G${r}="","",CEILING(G${r}*$B$23,1))` };
    ws["R" + r] = { t: "n", f: `IF(G${r}="","",CEILING(F${r}*(E${r}/$B$24)/$B$25,1))` };
    ws["S" + r] = { t: "n", f: `IF(G${r}="","",CEILING((E${r}/$B$26)*(F${r}+0.3)/$B$27,1))` };
    ws["T" + r] = { t: "n", f: `IF(G${r}="","",ROUND(G${r}*$B$28,2))` };
    ws["V" + r] = { t: "n", f: `IF(OR(C${r}="",D${r}="",E${r}=""),"",ROUNDUP(E${r}/$B$29+1,0)*(C${r}/1000+0.4))` };
    ws["W" + r] = { t: "n", f: `IF(OR(C${r}="",D${r}="",E${r}=""),"",ROUNDUP(E${r}/$B$29+1,0)*$B$31*$B$30)` };
    ws["X" + r] = { t: "n", f: `IF(OR(C${r}="",D${r}="",E${r}=""),"",ROUNDUP(E${r}/$B$29+1,0)*$B$31)` };
    ws["Y" + r] = { t: "n", f: `IF(OR(C${r}="",D${r}="",E${r}=""),"",ROUNDUP(E${r}/$B$29+1,0)*$B$31*2)` };
    ws["Z" + r] = { t: "n", f: `IF(OR(C${r}="",D${r}="",E${r}=""),"",ROUNDUP(E${r}/$B$29+1,0)*$B$31*2)` };
    ws["AA" + r] = { t: "n", f: `IF(G${r}="","",IFERROR(N(H${r})*4.34+N(I${r})*5.52+N(J${r})*6.70+N(K${r})*7.88+N(L${r})*10.24+N(M${r})*12.60,0))` };
  });

  // Totals row + waste row
  if (rowRefs.length > 0) {
    const firstR = rowRefs[0], lastR = rowRefs[rowRefs.length - 1];
    const totalsR = lastR + 1, wasteR = lastR + 2;
    setRow(totalsR - 1, { A: "GRAND TOTALS" });
    ["F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "V", "W", "X", "Y", "Z", "AA"].forEach((c) => {
      ws[c + totalsR] = { t: "n", f: `IFERROR(SUM(${c}${firstR}:${c}${lastR}),0)` };
    });
    setRow(wasteR - 1, { A: "20% - Additional Waste Factor" });
    ["F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "V", "W", "X", "Y", "Z", "AA"].forEach((c) => {
      ws[c + wasteR] = { t: "n", f: `${c}${totalsR}*1.2` };
    });
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: wasteR + 2, c: 26 } });
  }

  ws["!cols"] = Array.from({ length: 27 }).map(() => ({ wch: 11 }));
  XLSX.utils.book_append_sheet(wb, ws, "Duct Takeoff");

  // ---- Reference Tables sheet ----
  const refAoa = [];
  refAoa.push(["SMACNA TABLE 1-7 — GAUGE SELECTION (Low Pressure Class)"]);
  refAoa.push(["Item", "Range (mm)", "Min mm", "Max mm", "Gauge", "Designation", "Thickness (mm)", "Weight (kg/m²)"]);
  gaugeInfo.forEach((g, i) => refAoa.push([i + 1, i === 0 ? "≤ 300" : i === 5 ? "> 3050" : g.min + " – " + g.max, g.min, g.max, g.label, "No. " + g.label.split(" ")[1], g.thickness, g.weight]));
  refAoa.push([]);
  refAoa.push(["MATERIAL COVERAGE ASSUMPTIONS"]);
  refAoa.push(["Ref.", "Rate Value", "Unit", "Description", "Code / Source"]);
  assumptionsMeta.forEach((a) => refAoa.push([a.ref, assumptions[a.field], a.unit, a.label, a.source]));
  refAoa.push([]);
  refAoa.push(["FORMULA REFERENCE & ENGINEERING BASIS"]);
  refAoa.push(["Item", "Column", "Formula", "Note"]);
  formulaRef.forEach((f) => refAoa.push([f.name, f.col, f.formula, f.note]));
  refAoa.push([]);
  refAoa.push(["REFERENCES: SMACNA HVAC Duct Construction Standards 3rd Ed. (2005); PSME Code (2012 Ed.) Part 1 & 2; ASHRAE Fundamentals 2021 Ch. 21. Verify quantities with construction drawings."]);
  const wsRef = XLSX.utils.aoa_to_sheet(refAoa);
  wsRef["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 45 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsRef, "Reference Tables");

  const projName = val("p-project") || "Duct_Takeoff";
  XLSX.writeFile(wb, `SMACNA_${projName.replace(/[^a-z0-9]+/gi, "_")}_Takeoff.xlsx`);
}
