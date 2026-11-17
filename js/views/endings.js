// View F — how cell segments end: 100% stacked bar per sequence.
import { END_COL, RED, TEXT_COL, lineOf, box, showTip, hideTip, matrixRows, fmtPct, describe, rowFont } from "../common.js?v=20261117e";

export function endingsView(el, app) {
  const svg = d3.select(el).append("svg");
  let counts, gBars, seqs;

  function compute() {
    counts = new Map();
    for (const s of app.data.order) counts.set(s, [0, 0, 0, 0]);
    for (const d of app.data.segs) counts.get(d.seq)[d.ending]++;
  }

  function draw() {
    if (!counts) compute();
    const { w, h } = box(el);
    seqs = app.visibleSeqs();
    if (w < 150 || h < 120) return;   // pane still laying out
    const x = d3.scaleLinear([0, 1], [8, w - 38]);
    const y = matrixRows(seqs, h);
    svg.attr("width", w).attr("height", h).selectAll("*").remove();

    // legend in the top margin (same order as the bar segments)
    const lg = svg.append("g").attr("transform", "translate(8,4)");
    const items = app.data.endings.map((e, i) => ({ e, i }));
    const colW = (w - 16) / 2;
    lg.selectAll("g").data(items).join("g")
      .attr("transform", d => `translate(${(d.i % 2) * colW},${Math.floor(d.i / 2) * 11})`)
      .call(g => g.append("rect").attr("width", 9).attr("height", 8).attr("fill", d => END_COL[d.i]))
      .call(g => g.append("text").attr("class", "note").attr("font-size", 10.5).attr("x", 12).attr("y", 7.5)
        .text(d => d.i === 3 ? `${d.e} ?` : d.e));
    lg.append("text").attr("class", "note").attr("font-size", 10.5).attr("y", 30)
      .text("? = possible apoptosis or annotation gap");

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - 34})`)
      .call(d3.axisBottom(x).tickValues([0, 0.5, 1]).tickFormat(d3.format(".0%")).tickSizeOuter(0));
    svg.append("text").attr("class", "axis-label").attr("x", w - 38).attr("y", h - 4).attr("text-anchor", "end")
      .text("share of cell segments");

    const rows = seqs.map(s => {
      const c = counts.get(s), n = d3.sum(c);
      let acc = 0;
      return { s, n, parts: c.map((k, i) => { const p = { s, i, k, n, x0: acc / n, x1: (acc + k) / n }; acc += k; return p; }) };
    });
    gBars = svg.append("g").selectAll("g").data(rows).join("g").attr("transform", r => `translate(0,${y(r.s)})`);
    gBars.selectAll("rect").data(r => r.parts.filter(p => p.k)).join("rect")
      .attr("x", p => x(p.x0)).attr("width", p => Math.max(0, x(p.x1) - x(p.x0) - 1.8)).attr("height", y.bandwidth())
      .attr("fill", p => END_COL[p.i]).style("cursor", "pointer")
      .on("mouseenter", (e, p) => showTip(e, `<b style="color:${TEXT_COL[lineOf(p.s)]}">${p.s}</b><br>` +
        `${app.data.endings[p.i]}: <b>${p.k}</b> of ${p.n} segments (${fmtPct(p.k / p.n)})` +
        (p.i === 3 ? `<br>the cell's track stops away from the border: possible apoptosis or an annotation gap` : "") +
        `<br><i>click to show only these in C</i>`))
      .on("mouseleave", hideTip)
      .on("click", (e, p) => {
        const same = app.state.seq === p.s && app.state.ending === p.i;
        app.set({ seq: p.s, ending: same ? null : p.i, ...(app.state.seq !== p.s ? { track: null } : {}) });
      });
    // percentage inside segments wide enough to hold it (dark text on the two light hues, white on the dark ones)
    if (y.bandwidth() >= 9) gBars.selectAll("text.pct").data(r => r.parts.filter(p => x(p.x1) - x(p.x0) >= 26)).join("text")
      .attr("class", "pct").attr("x", p => (x(p.x0) + x(p.x1)) / 2 - 0.9).attr("y", y.bandwidth() / 2).attr("dy", "0.34em")
      .attr("text-anchor", "middle").attr("font-size", Math.min(10, y.bandwidth() - 1)).attr("pointer-events", "none")
      .style("fill", p => p.i === 1 || p.i === 2 ? "#1a1a1a" : "#fff").text(p => Math.round(100 * p.k / p.n));
    const lineShare = d3.rollups([...counts], v => {
      const c = [0, 1, 2, 3].map(i => d3.sum(v, ([, k]) => k[i])); return c[3] / d3.sum(c);
    }, ([s]) => lineOf(s)).filter(([l]) => !app.state.hidden.has(l));
    describe(svg, "100% stacked bars of how cell segments end, one row per sequence: divided, until video end, left image, " +
      "or lost mid-image (possible apoptosis or annotation gap). Share lost mid-image by cell line: " +
      lineShare.map(([l, v]) => `${l} ${fmtPct(v)}`).join(", ") + ".");
    gBars.append("text").attr("class", "n").attr("x", w - 34).attr("y", y.bandwidth() / 2).attr("dy", "0.32em")
      .attr("font-size", rowFont(y)).text(r => r.n);
    svg.append("text").attr("x", w - 34).attr("y", y.range()[0] - 3).attr("font-size", 10.5).attr("font-weight", 700)
      .attr("class", "note").text("n");
    style();
  }

  function style() {
    if (!gBars) return;
    gBars.selectAll("rect")
      .attr("stroke", p => p.s === app.state.seq && (app.state.ending == null || app.state.ending === p.i) ? RED : "none")
      .attr("stroke-width", p => p.s === app.state.seq && app.state.ending === p.i ? 2.5 : 1.2)
      .attr("opacity", p => app.state.ending != null && p.s === app.state.seq && app.state.ending !== p.i ? 0.45 : 1);
    gBars.select("text.n").style("fill", r => r.s === app.state.seq ? RED : "#555")
      .attr("font-weight", r => r.s === app.state.seq ? 700 : 400);
  }

  return {
    update(changed) {
      if (["init", "resize", "hidden", "reset"].some(k => changed.has(k))) draw();
      else if (["seq", "ending"].some(k => changed.has(k))) style();
    },
  };
}
