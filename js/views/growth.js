// View A — growth: cell count over time, one panel per cell line, log2 y-axis.
import { COL, TEXT_COL, RED, short, lineOf, hours, box, showTip, hideTip, rollingMedian, MAX_HOURS, describe } from "../common.js?v=20261117c";

export function growthView(el, app) {
  const svg = d3.select(el).append("svg");
  let series = null;   // seq -> [{f, h, y, count}]
  let panels = [];     // [{line, x, y, g}]

  function prepare() {
    series = new Map();
    for (const seq of app.data.order) {
      const fr = app.data.frames[seq];
      const sm = rollingMedian(fr.count, 5);   // 1-hour median smooths ID flicker in sparse fields
      series.set(seq, fr.f.map((f, i) => ({ f, h: hours(f), y: Math.max(sm[i], 1), count: fr.count[i] })));
    }
  }

  function draw() {
    if (!series) prepare();
    const { w, h } = box(el);
    svg.attr("width", w).attr("height", h).selectAll("*").remove();
    const lines = app.data.lines.filter(l => !app.state.hidden.has(l));
    const cols = lines.length === 3 ? 3 : Math.min(lines.length, 2), rows = Math.ceil(lines.length / cols);
    const pw = w / cols, ph = h / rows;
    const m = { l: 34, r: 66, t: 16, b: 26 };   // wide right margin for end labels like "F3 ×1.0 slow"

    panels = lines.map((line, k) => {
      const c = k % cols, r = Math.floor(k / cols);
      const g = svg.append("g").attr("transform", `translate(${c * pw},${r * ph})`);
      const x = d3.scaleLinear([0, MAX_HOURS], [m.l, pw - m.r]);
      const y = d3.scaleLog().base(2).domain([0.8, 300]).range([ph - m.b, m.t]);

      g.append("g").attr("class", "grid").selectAll("line").data([1, 4, 16, 64, 256]).join("line")
        .attr("x1", m.l).attr("x2", pw - m.r).attr("y1", y).attr("y2", y).attr("stroke", "#eee");
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${ph - m.b})`)
        .call(d3.axisBottom(x).tickValues([0, 24, 48, 72, 96]).tickSizeOuter(0));
      g.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
        .call(d3.axisLeft(y).tickValues([1, 4, 16, 64, 256]).tickFormat(d3.format("d")).tickSizeOuter(0));
      g.append("text").attr("class", "panel-title").attr("x", m.l + 6).attr("y", m.t + 4)
        .attr("fill", TEXT_COL[line]).style("fill", TEXT_COL[line]).text(line);
      if (r === rows - 1) g.append("text").attr("class", "axis-label").attr("x", pw - m.r).attr("y", ph - 2)
        .attr("text-anchor", "end").text("hours");
      if (c === 0) g.append("text").attr("class", "axis-label").attr("transform", `translate(10,${m.t + 8}) rotate(-90)`)
        .attr("text-anchor", "end").text("cells");

      const seqs = app.data.order.filter(s => lineOf(s) === line);
      const lineGen = d3.line().x(d => x(d.h)).y(d => y(d.y));
      const gl = g.append("g");
      gl.selectAll("path.ln").data(seqs, s => s).join("path").attr("class", "ln")
        .attr("fill", "none").attr("d", s => lineGen(series.get(s)));
      // wide invisible strokes make thin lines easy to hover and click
      gl.selectAll("path.hit").data(seqs).join("path").attr("class", "hit")
        .attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 9).style("cursor", "pointer")
        .attr("d", s => lineGen(series.get(s)))
        .on("mousemove", (e, s) => {
          const [mx] = d3.pointer(e, g.node());
          const pts = series.get(s), f = Math.round(x.invert(mx) / 0.25);
          const p = pts[Math.max(0, Math.min(pts.length - 1, d3.bisector(d => d.f).center(pts, f)))];
          app.set({ hoverFrame: p.f });
          showTip(e, `<b style="color:${TEXT_COL[line]}">${s}</b><br>${p.h.toFixed(2)} h (frame ${p.f})<br>` +
            `${p.count} cells annotated · ${Math.round(p.y)} after 1-h median`);
        })
        .on("mouseleave", () => { hideTip(); app.set({ hoverFrame: null }); })
        .on("click", (e, s) => app.set({ seq: s, track: null, ending: null, hoverSeg: null }));

      // end labels, nudged apart in log space; cultures that barely grow get their fold change
      const ends = seqs.map(s => {
        const p = series.get(s), last = p[p.length - 1], fold = last.y / p[0].y;
        return { s, h: last.h, v: Math.log2(last.y), slow: fold < 1.5 ? `×${fold.toFixed(1)}` : null };
      }).sort((a, b) => a.v - b.v);
      const gap = Math.log2(300 / 0.8) * 11 / (ph - m.t - m.b);
      for (let i = 1; i < ends.length; i++) ends[i].v = Math.max(ends[i].v, ends[i - 1].v + gap);
      // keep the top label inside the panel, then push the others back down to keep the spacing
      const top = Math.log2(y.invert(m.t + 4));
      if (ends.length) ends[ends.length - 1].v = Math.min(ends[ends.length - 1].v, top);
      for (let i = ends.length - 2; i >= 0; i--) ends[i].v = Math.min(ends[i].v, ends[i + 1].v - gap);
      g.append("g").selectAll("text").data(ends).join("text").attr("class", "end-label")
        .attr("x", d => x(d.h) + 3).attr("y", d => y(2 ** d.v)).attr("dy", "0.32em")
        .attr("font-size", 10.5).style("cursor", "pointer").text(d => d.slow ? `${short(d.s)} ${d.slow} slow` : short(d.s))
        .on("click", (e, d) => app.set({ seq: d.s, track: null, ending: null, hoverSeg: null }));

      g.append("line").attr("class", "rule").attr("y1", m.t).attr("y2", ph - m.b)
        .attr("stroke", "#555").attr("stroke-dasharray", "2,2").style("display", "none").attr("pointer-events", "none");
      return { line, x, y, g, seqs };
    });
    style();
    rule();
    const slow = panels.flatMap(p => p.g.selectAll("text.end-label").data().filter(d => d.slow).map(d => `${d.s} (${d.slow})`));
    describe(svg, `Line charts of cell count over time on a log-2 axis, one panel per cell line (${lines.join(", ")}). ` +
      `Straight lines mean exponential growth; most MCF10A and HEK293T fields grow many-fold` +
      (slow.length ? `, while ${slow.join(", ")} barely grow.` : "."));
  }

  function style() {
    for (const p of panels) {
      p.g.selectAll("path.ln")
        .attr("stroke", s => s === app.state.seq ? RED : COL[p.line])
        .attr("stroke-width", s => s === app.state.seq ? 2.4 : 1.1)
        .attr("opacity", s => s === app.state.seq ? 1 : 0.8)
        .filter(s => s === app.state.seq).raise();
      p.g.selectAll("text.end-label")
        .style("fill", d => d.s === app.state.seq ? RED : TEXT_COL[p.line])
        .attr("font-weight", d => d.s === app.state.seq ? 700 : 400);
    }
  }

  function rule() {
    const f = app.state.hoverFrame;
    for (const p of panels) p.g.select("line.rule").style("display", f == null ? "none" : null)
      .attr("x1", f == null ? 0 : p.x(hours(f))).attr("x2", f == null ? 0 : p.x(hours(f)));
  }

  return {
    update(changed) {
      if (changed.has("init") || changed.has("resize") || changed.has("hidden") || changed.has("reset")) draw();
      else if (changed.has("seq")) style();
      if (changed.has("hoverFrame")) rule();
    },
  };
}
