// View B — stage-shift timeline: sequences x time heatmap of the shared movement of all cells.
import { COL, TEXT_COL, RED, DARK_RED, short, lineOf, hours, box, showTip, hideTip, matrixRows, groupBreaks, fmt1, MAX_HOURS } from "../common.js";

const VMAX = 120; // px; larger shifts share the darkest color
const color = d3.scaleLinear([0, 30, 60, 90, VMAX], ["#ffffff", "#f3d3cf", "#e0806f", "#c8322b", "#7a1410"]).clamp(true);
const NFRAMES = 385;
export const LEFT = 122; // room for cell-line names + field labels

function hatchPattern(ctx) {
  const c = document.createElement("canvas");
  c.width = c.height = 6;
  const g = c.getContext("2d");
  g.fillStyle = "#ece9e3"; g.fillRect(0, 0, 6, 6);
  g.strokeStyle = "#a9a59c"; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(0, 6); g.lineTo(6, 0); g.stroke();
  return ctx.createPattern(c, "repeat");
}

export function shiftView(el, app) {
  const canvas = d3.select(el).append("canvas");
  const svg = d3.select(el).append("svg");
  let x, y, seqs, brush, gBrush, gSel;

  function draw() {
    const { w, h } = box(el);
    const dpr = window.devicePixelRatio || 1;
    seqs = app.visibleSeqs();
    x = d3.scaleLinear([0, MAX_HOURS], [LEFT, w - 12]);
    y = matrixRows(seqs, h);

    // ---- heatmap on canvas
    canvas.attr("width", w * dpr).attr("height", h * dpr).style("width", `${w}px`).style("height", `${h}px`);
    const ctx = canvas.node().getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const hatch = hatchPattern(ctx);
    const cw = (x(MAX_HOURS) - x(0)) / NFRAMES;
    for (const s of seqs) {
      const fr = app.data.frames[s], y0 = y(s), bh = y.bandwidth();
      ctx.fillStyle = hatch;
      ctx.fillRect(x(0), y0, x(MAX_HOURS) - x(0), bh);   // background = no cells annotated
      fr.f.forEach((f, i) => {
        ctx.fillStyle = color(fr.shift[i] ?? 0);
        ctx.fillRect(x(hours(f)), y0, cw + 0.6, bh);
      });
    }

    // ---- axes, labels, legend in SVG on top
    svg.attr("width", w).attr("height", h).selectAll("*").remove();
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - 34})`)
      .call(d3.axisBottom(x).tickValues([0, 24, 48, 72, 96]).tickSizeOuter(0));
    svg.append("text").attr("class", "axis-label").attr("x", x(MAX_HOURS)).attr("y", h - 4).attr("text-anchor", "end")
      .text("hours since first frame");

    const breaks = groupBreaks(seqs);
    svg.append("g").selectAll("line").data(breaks).join("line")
      .attr("x1", LEFT - 40).attr("x2", x(MAX_HOURS)).attr("y1", s => y(s) - y.step() * y.paddingInner() / 2)
      .attr("y2", s => y(s) - y.step() * y.paddingInner() / 2).attr("stroke", "#fff").attr("stroke-width", 3);

    // cell-line groups: colored bar + name
    const groups = d3.groups(seqs, lineOf);
    const gg = svg.append("g").selectAll("g").data(groups).join("g");
    gg.append("rect").attr("x", LEFT - 44).attr("width", 3)
      .attr("y", ([, ss]) => y(ss[0])).attr("height", ([, ss]) => y(ss[ss.length - 1]) + y.bandwidth() - y(ss[0]))
      .attr("fill", ([l]) => COL[l]);
    gg.append("text").attr("x", LEFT - 48).attr("text-anchor", "end").attr("font-size", 10.5).attr("font-weight", 700)
      .attr("y", ([, ss]) => (y(ss[0]) + y(ss[ss.length - 1]) + y.bandwidth()) / 2).attr("dy", "0.32em")
      .style("fill", ([l]) => TEXT_COL[l]).text(([l]) => l);

    svg.append("g").selectAll("text").data(seqs).join("text").attr("class", "row-label")
      .attr("x", LEFT - 5).attr("y", s => y(s) + y.bandwidth() / 2).attr("dy", "0.32em").attr("text-anchor", "end")
      .text(short)
      .on("click", (e, s) => app.set({ seq: s, track: null, ending: null, hoverSeg: null }));

    legend(w);

    // ---- brush for a time window (sets C's frame range)
    brush = d3.brushX().extent([[x(0), y.range()[0]], [x(MAX_HOURS), y.range()[1]]])
      .on("end", ({ selection, sourceEvent }) => {
        if (!sourceEvent) return;
        const win = selection ? selection.map(v => Math.round(x.invert(v) / 0.25)) : null;
        app.set({ window: win });
      });
    gBrush = svg.append("g").attr("class", "brush").call(brush);
    if (app.state.window) gBrush.call(brush.move, app.state.window.map(f => x(hours(f))));
    gBrush.on("mousemove.tip", hover).on("mouseleave.tip", () => { hideTip(); app.set({ hoverFrame: null }); });

    gSel = svg.append("g").attr("pointer-events", "none");
    marks();
  }

  function legend(w) {
    const lw = Math.min(110, w * 0.2), lx = w - 12 - lw - 92, ly = 6;
    const g = svg.append("g").attr("transform", `translate(${lx},${ly})`);
    const grad = svg.append("defs").append("linearGradient").attr("id", "shiftGrad");
    d3.range(0, 1.01, 0.25).forEach(t => grad.append("stop").attr("offset", t).attr("stop-color", color(t * VMAX)));
    g.append("rect").attr("width", lw).attr("height", 8).attr("fill", "url(#shiftGrad)").attr("stroke", "#bbb").attr("stroke-width", 0.5);
    g.selectAll("text.t").data([0, 60, VMAX]).join("text").attr("class", "note").attr("font-size", 9.5)
      .attr("x", v => (v / VMAX) * lw).attr("y", 18).attr("text-anchor", (v, i) => ["start", "middle", "end"][i])
      .text(v => v === VMAX ? "≥120 px" : v);
    const pat = svg.select("defs").append("pattern").attr("id", "hatch").attr("width", 6).attr("height", 6).attr("patternUnits", "userSpaceOnUse");
    pat.append("rect").attr("width", 6).attr("height", 6).attr("fill", "#ece9e3");
    pat.append("path").attr("d", "M0,6 L6,0").attr("stroke", "#a9a59c").attr("stroke-width", 0.8);
    g.append("rect").attr("x", lw + 12).attr("width", 14).attr("height", 8).attr("fill", "url(#hatch)");
    g.append("text").attr("class", "note").attr("font-size", 9.5).attr("x", lw + 30).attr("y", 8).text("no cells");
  }

  function rowAt(py) {
    return seqs.find(s => py >= y(s) - y.step() * y.paddingInner() / 2 && py < y(s) + y.bandwidth() + y.step() * y.paddingInner() / 2);
  }

  function hover(e) {
    const [px, py] = d3.pointer(e, svg.node());
    const s = rowAt(py);
    const f = Math.max(0, Math.min(NFRAMES - 1, Math.floor(x.invert(px) / 0.25)));
    app.set({ hoverFrame: f });
    if (!s) return hideTip();
    const fr = app.data.frames[s], i = fr.f.indexOf(f);
    const html = i < 0
      ? `<b>${s}</b><br>${fmt1(hours(f))} h (frame ${f})<br>no cells annotated`
      : `<b style="color:${TEXT_COL[lineOf(s)]}">${s}</b><br>${fmt1(hours(f))} h (frame ${f}) · ${fr.count[i]} cells<br>` +
        `shared shift <b>${fmt1(fr.shift[i] ?? 0)} px</b> · coherence ${fr.coh[i] ?? "–"}` +
        (fr.flag.includes(f) ? `<br><b style="color:${RED}">flagged stage shift</b> (corrected in C)` : "");
    showTip(e, html);
  }

  /** Selected row outline, hover rule, and hovered branch's time span. */
  function marks() {
    if (!gSel) return;
    gSel.selectAll("*").remove();
    svg.selectAll("text.row-label").classed("sel", s => s === app.state.seq)
      .style("fill", s => s === app.state.seq ? RED : TEXT_COL[lineOf(s)]);
    const s = app.state.seq;
    if (s && seqs.includes(s)) {
      gSel.append("rect").attr("x", x(0) - 1).attr("y", y(s) - 1.5).attr("width", x(MAX_HOURS) - x(0) + 2)
        .attr("height", y.bandwidth() + 3).attr("fill", "none").attr("stroke", RED).attr("stroke-width", 1.5);
      const seg = app.state.hoverSeg && app.data.segById.get(app.state.hoverSeg);
      if (seg) gSel.append("rect").attr("x", x(hours(seg.f0))).attr("y", y(s) - 3)
        .attr("width", Math.max(2, x(hours(seg.f1 + 1)) - x(hours(seg.f0)))).attr("height", y.bandwidth() + 6)
        .attr("fill", "none").attr("stroke", DARK_RED).attr("stroke-width", 2.5);
    }
    const f = app.state.hoverFrame;
    if (f != null) gSel.append("line").attr("x1", x(hours(f))).attr("x2", x(hours(f)))
      .attr("y1", y.range()[0]).attr("y2", y.range()[1]).attr("stroke", "#333").attr("stroke-dasharray", "2,2");
  }

  return {
    update(changed) {
      if (["init", "resize", "hidden", "reset"].some(k => changed.has(k))) draw();
      else if (["seq", "hoverSeg", "hoverFrame"].some(k => changed.has(k))) marks();
    },
  };
}
