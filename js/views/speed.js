// View E — speed by sequence: compact box plot of drift-corrected mean step per cell segment.
import { COL, TEXT_COL, RED, lineOf, box, showTip, hideTip, matrixRows, groupBreaks, fmt1, describe } from "../common.js";

const XMAX = 75;

export function speedView(el, app) {
  const svg = d3.select(el).append("svg");
  let x, y, seqs, stats, gBoxes, gDots, brush, gBrush;

  function compute() {
    const min = app.data.minFrames;
    stats = new Map();
    for (const [s, segs] of d3.group(app.data.segs.filter(d => d.n >= min && d.speed != null), d => d.seq)) {
      const v = segs.map(d => d.speed).sort(d3.ascending);
      const q1 = d3.quantileSorted(v, 0.25), med = d3.quantileSorted(v, 0.5), q3 = d3.quantileSorted(v, 0.75);
      const iqr = q3 - q1;
      const lo = d3.min(v.filter(a => a >= q1 - 1.5 * iqr)), hi = d3.max(v.filter(a => a <= q3 + 1.5 * iqr));
      stats.set(s, { q1, med, q3, lo, hi, n: v.length, out: segs.filter(d => d.speed < lo || d.speed > hi) });
    }
  }

  function draw() {
    if (!stats) compute();
    const { w, h } = box(el);
    seqs = app.visibleSeqs();
    if (w < 150 || h < 120) return;   // pane still laying out
    x = d3.scaleLinear([0, XMAX], [10, w - 12]);
    y = matrixRows(seqs, h);
    svg.attr("width", w).attr("height", h).selectAll("*").remove();

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - 34})`)
      .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(w / 60))).tickSizeOuter(0));
    svg.append("text").attr("class", "axis-label").attr("x", w - 12).attr("y", h - 4).attr("text-anchor", "end")
      .text("mean step per cell (px / 15 min)");
    svg.append("g").selectAll("line").data(groupBreaks(seqs)).join("line")
      .attr("x1", 0).attr("x2", w).attr("y1", s => y(s) - y.step() * y.paddingInner() / 2)
      .attr("y2", s => y(s) - y.step() * y.paddingInner() / 2).attr("stroke", "#ddd");
    svg.append("text").attr("class", "note").attr("x", 10).attr("y", 12)
      .text("segment = one cell from birth/entry");
    svg.append("text").attr("class", "note").attr("x", 10).attr("y", 25)
      .text(`to division/exit · only segments ≥ ${app.data.minFrames / 4} h`);
    const med = l => d3.median(app.data.segs.filter(d => lineOf(d.seq) === l && d.n >= app.data.minFrames && d.speed != null), d => d.speed);
    const lines = [...new Set(seqs.map(lineOf))];
    describe(svg, "Box plots of mean step per cell segment, in pixels per 15 minutes, one row per sequence. " +
      lines.map(l => `${l} median ${fmt1(med(l))}`).join(", ") + ". Dots are outlier segments.");

    brush = d3.brushX().extent([[x(0), y.range()[0]], [x(XMAX), y.range()[1]]])
      .on("end", ({ selection, sourceEvent }) => {
        if (!sourceEvent) return;
        app.set({ brush: selection ? selection.map(v => +x.invert(v).toFixed(1)) : null });
      })
      .on("brush", ({ selection }) => selection && dotStyle(selection.map(x.invert)));
    gBrush = svg.append("g").attr("class", "brush").call(brush);
    if (app.state.brush) gBrush.call(brush.move, app.state.brush.map(x));

    gBoxes = svg.append("g").attr("pointer-events", "none");
    const rows = gBoxes.selectAll("g").data(seqs).join("g").attr("transform", s => `translate(0,${y(s) + y.bandwidth() / 2})`);
    const bh = Math.max(3, y.bandwidth() * 0.8);
    rows.append("line").attr("class", "whisker").attr("x1", s => x(stats.get(s).lo)).attr("x2", s => x(stats.get(s).hi));
    rows.append("rect").attr("class", "iqr").attr("x", s => x(stats.get(s).q1)).attr("y", -bh / 2)
      .attr("width", s => x(stats.get(s).q3) - x(stats.get(s).q1)).attr("height", bh);
    rows.append("line").attr("class", "median").attr("x1", s => x(stats.get(s).med)).attr("x2", s => x(stats.get(s).med))
      .attr("y1", -bh / 2 - 1).attr("y2", bh / 2 + 1).attr("stroke-width", 2);

    // outlier dots sit above the brush so they stay clickable
    const outs = seqs.flatMap(s => stats.get(s).out);
    gDots = svg.append("g").selectAll("circle").data(outs, d => d.id).join("circle")
      .attr("cx", d => x(Math.min(d.speed, XMAX))).attr("cy", d => y(d.seq) + y.bandwidth() / 2)
      .style("cursor", "pointer")
      .on("mouseenter", (e, d) => showTip(e, `<b style="color:${TEXT_COL[lineOf(d.seq)]}">${d.seq}</b> · lineage ${d.track}<br>` +
        `mean step <b>${fmt1(d.speed)}</b> px/15 min · ${d.n / 4} h · ${app.data.endings[d.ending]}<br><i>click to open its lineage</i>`))
      .on("mouseleave", hideTip)
      .on("click", (e, d) => app.set({ seq: d.seq, track: d.track, ending: null }));
    style();
  }

  function dotStyle(range = app.state.brush) {
    if (!gDots) return;
    gDots.attr("r", d => range && d.speed >= range[0] && d.speed <= range[1] ? 3.6 : 2)
      .attr("stroke", d => d.seq === app.state.seq && d.track === app.state.track ? "#000" : "none");
  }

  function style() {
    if (!gBoxes) return;
    const c = s => s === app.state.seq ? RED : COL[lineOf(s)];
    gBoxes.selectAll("line.whisker").attr("stroke", c);
    gBoxes.selectAll("rect.iqr").attr("fill", c).attr("fill-opacity", s => s === app.state.seq ? 0.6 : 0.4).attr("stroke", c);
    gBoxes.selectAll("line.median").attr("stroke", c);
    gDots.attr("fill", d => c(d.seq)).attr("fill-opacity", 0.85);
    dotStyle();
  }

  return {
    update(changed) {
      if (["init", "resize", "hidden", "reset"].some(k => changed.has(k))) draw();
      else if (["seq", "track", "brush"].some(k => changed.has(k))) style();
    },
  };
}
