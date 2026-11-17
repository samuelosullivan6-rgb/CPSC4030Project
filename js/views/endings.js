// View F — how cell segments end: 100% stacked bar per sequence.
import { END_COL, RED, TEXT_COL, lineOf, box, showTip, hideTip, matrixRows, fmtPct } from "../common.js";

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
      .call(g => g.append("text").attr("class", "note").attr("font-size", 9.5).attr("x", 12).attr("y", 7.5).text(d => d.e));

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
      .attr("x", p => x(p.x0)).attr("width", p => Math.max(0, x(p.x1) - x(p.x0) - 0.8)).attr("height", y.bandwidth())
      .attr("fill", p => END_COL[p.i]).style("cursor", "pointer")
      .on("mouseenter", (e, p) => showTip(e, `<b style="color:${TEXT_COL[lineOf(p.s)]}">${p.s}</b><br>` +
        `${app.data.endings[p.i]}: <b>${p.k}</b> of ${p.n} segments (${fmtPct(p.k / p.n)})<br><i>click to show only these in C</i>`))
      .on("mouseleave", hideTip)
      .on("click", (e, p) => {
        const same = app.state.seq === p.s && app.state.ending === p.i;
        app.set({ seq: p.s, ending: same ? null : p.i, ...(app.state.seq !== p.s ? { track: null } : {}) });
      });
    gBars.append("text").attr("x", w - 34).attr("y", y.bandwidth() / 2).attr("dy", "0.32em")
      .attr("font-size", 9.5).text(r => r.n);
    svg.append("text").attr("x", w - 34).attr("y", y.range()[0] - 3).attr("font-size", 9.5).attr("font-weight", 700)
      .attr("class", "note").text("n");
    style();
  }

  function style() {
    gBars.selectAll("rect")
      .attr("stroke", p => p.s === app.state.seq && (app.state.ending == null || app.state.ending === p.i) ? RED : "none")
      .attr("stroke-width", p => p.s === app.state.seq && app.state.ending === p.i ? 2.5 : 1.2)
      .attr("opacity", p => app.state.ending != null && p.s === app.state.seq && app.state.ending !== p.i ? 0.45 : 1);
    gBars.select("text").style("fill", r => r.s === app.state.seq ? RED : "#555")
      .attr("font-weight", r => r.s === app.state.seq ? 700 : 400);
  }

  return {
    update(changed) {
      if (["init", "resize", "hidden", "reset"].some(k => changed.has(k))) draw();
      else if (["seq", "ending"].some(k => changed.has(k))) style();
    },
  };
}
