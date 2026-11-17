// View C — track map: cell paths of the selected sequence in image coordinates.
import { COL, TEXT_COL, RED, DARK_RED, INK, GRAY, END_COL, IMG_W, IMG_H, lineOf, hours, box, showTip, hideTip, fmt1 } from "../common.js";

const END_SYMBOL = { 2: d3.symbolTriangle, 3: d3.symbolX };   // left image, lost mid-image

export function mapView(section, app) {
  const el = section.querySelector(".body");
  const svg = d3.select(el).append("svg");
  const title = d3.select("#mapTitle");
  const key = d3.select("#mapKey");
  d3.select("#rawToggle").on("change", function () { app.set({ raw: this.checked }); });
  let sx, sy, line, paths = [], gHover;

  /** Visible points of each segment (raw or corrected, clipped to the time window). */
  function segPaths(data) {
    const { raw, window: win } = app.state;
    return data.segments.map(s => {
      const X = raw ? s.rx : s.x, Y = raw ? s.ry : s.y;
      let pts = X.map((x, i) => [x, Y[i], s.f0 + i]).filter(p => p[0] != null && p[1] != null);
      if (win) pts = pts.filter(p => p[2] >= win[0] && p[2] <= win[1]);
      return { s, meta: app.data.segById.get(s.id), pts };
    }).filter(d => d.pts.length >= 2);
  }

  function draw() {
    d3.select("#rawToggle").property("checked", app.state.raw);
    const { w, h } = box(el);
    svg.attr("width", w).attr("height", h).selectAll("*").remove();
    const data = app.seqData();
    const seq = app.state.seq;
    if (!data) {
      title.text(seq ? `${seq} · loading…` : "");
      svg.append("text").attr("class", "empty-msg").attr("x", w / 2).attr("y", h / 2).attr("text-anchor", "middle")
        .text(seq ? "loading paths…" : "select a sequence in A, B, E or F");
      return;
    }
    paths = segPaths(data);
    const all = paths.flatMap(d => d.pts);
    const x0 = Math.min(0, d3.min(all, p => p[0]) ?? 0) - 5, x1 = Math.max(IMG_W, d3.max(all, p => p[0]) ?? 0) + 5;
    const y0 = Math.min(0, d3.min(all, p => p[1]) ?? 0) - 5, y1 = Math.max(IMG_H, d3.max(all, p => p[1]) ?? 0) + 5;
    const m = { l: 34, r: 8, t: 6, b: 22 };
    const k = Math.min((w - m.l - m.r) / (x1 - x0), (h - m.t - m.b) / (y1 - y0));
    const ox = m.l + ((w - m.l - m.r) - k * (x1 - x0)) / 2, oy = m.t;
    sx = d3.scaleLinear([x0, x1], [ox, ox + k * (x1 - x0)]);
    sy = d3.scaleLinear([y0, y1], [oy, oy + k * (y1 - y0)]);
    line = d3.line().x(p => sx(p[0])).y(p => sy(p[1]));

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${sy(y1)})`)
      .call(d3.axisBottom(sx).ticks(Math.max(2, Math.floor(k * (x1 - x0) / 70))).tickSizeOuter(0));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${sx(x0)},0)`)
      .call(d3.axisLeft(sy).ticks(Math.max(2, Math.floor(k * (y1 - y0) / 50))).tickSizeOuter(0));
    svg.append("rect").attr("x", sx(0)).attr("y", sy(0)).attr("width", sx(IMG_W) - sx(0)).attr("height", sy(IMG_H) - sy(0))
      .attr("fill", "none").attr("stroke", "#999").attr("stroke-width", 0.8)
      .attr("stroke-dasharray", x0 < -10 || y0 < -10 || x1 > IMG_W + 10 || y1 > IMG_H + 10 ? "4,3" : null);

    const { brush, track, ending } = app.state;
    const minF = app.data.minFrames;
    const isBrushed = d => brush && d.meta && d.meta.n >= minF && d.s.speed != null && d.s.speed >= brush[0] && d.s.speed <= brush[1];
    const isLineage = d => d.s.track === track;
    const isEnding = d => ending != null && d.s.ending === ending;
    const lc = COL[lineOf(seq)];

    const layer = (data, stroke, width, opacity = 1) => svg.append("g").attr("fill", "none").attr("stroke", stroke)
      .attr("stroke-width", width).attr("stroke-opacity", opacity).attr("stroke-linejoin", "round").attr("pointer-events", "none")
      .selectAll("path").data(data).join("path").attr("d", d => line(d.pts));

    const ctx = paths.filter(d => !isLineage(d) && !isBrushed(d) && !isEnding(d));
    layer(ctx, GRAY, 0.6, ending != null ? 0.35 : 0.65);
    layer(paths.filter(isLineage), RED, 1, 1);
    layer(paths.filter(d => isBrushed(d) && !isEnding(d)), lc, 1.6);
    if (ending != null) layer(paths.filter(isEnding), END_COL[ending], 1.6);

    // end marks: for the selected lineage, and for every segment when an ending is filtered
    // (only where the segment really ends, not where a time window cuts it off)
    const marked = paths.filter(d => (isLineage(d) || isEnding(d)) && d.meta && d.pts[d.pts.length - 1][2] === d.meta.f1);
    const gm = svg.append("g").attr("pointer-events", "none");
    for (const d of marked) {
      const p = d.pts[d.pts.length - 1], e = d.s.ending;
      if (e === 1) gm.append("circle").attr("cx", sx(p[0])).attr("cy", sy(p[1])).attr("r", 3).attr("fill", "#fff").attr("stroke", INK);
      else if (END_SYMBOL[e]) gm.append("path").attr("transform", `translate(${sx(p[0])},${sy(p[1])}) rotate(${e === 2 ? 90 : 0})`)
        .attr("d", d3.symbol(END_SYMBOL[e], e === 3 ? 42 : 30)()).attr("fill", e === 2 ? END_COL[e] : END_COL[e])
        .attr("stroke", e === 3 ? END_COL[e] : "none");
    }
    // start dot for roots of the selected lineage
    for (const d of paths.filter(isLineage)) {
      if (d.s.parent && data.byId.has(d.s.parent)) continue;
      gm.append("circle").attr("cx", sx(d.pts[0][0])).attr("cy", sy(d.pts[0][1])).attr("r", 4).attr("fill", INK).attr("stroke", "#fff");
    }

    gHover = svg.append("g").attr("pointer-events", "none");

    // invisible wide strokes for hover/click
    svg.append("g").attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 7)
      .selectAll("path").data(paths).join("path").attr("d", d => line(d.pts)).style("cursor", "pointer")
      .on("mouseenter", (e, d) => {
        app.set({ hoverSeg: d.s.id });
        const mm = d.meta;
        showTip(e, `<b style="color:${TEXT_COL[lineOf(seq)]}">${d.s.id}</b> · lineage ${d.s.track}<br>` +
          (mm ? `${fmt1(hours(mm.f0))}–${fmt1(hours(mm.f1))} h · ${mm.n} frames<br>` : "") +
          `mean step <b>${d.s.speed == null ? "–" : fmt1(d.s.speed)}</b> px/15 min<br>ending: ${app.data.endings[d.s.ending]}` +
          `<br><i>click to open its lineage in D</i>`);
      })
      .on("mousemove", (e) => d3.select("#tip").style("left", `${e.clientX + 14}px`).style("top", `${e.clientY + 14}px`))
      .on("mouseleave", () => { hideTip(); app.set({ hoverSeg: null }); })
      .on("click", (e, d) => app.set({ track: d.s.track }));

    hover();
    const nb = paths.filter(isBrushed).length;
    title.html(`<b style="color:${TEXT_COL[lineOf(seq)]}">${seq}</b> · ${paths.length} paths` +
      (brush ? ` · ${nb} brushed` : "") +
      (app.state.window ? ` · ${fmt1(hours(app.state.window[0]))}–${fmt1(hours(app.state.window[1]))} h` : "") +
      (app.state.raw ? " · <b>raw</b>" : " · drift-corrected"));
    legend(lc);
  }

  function hover() {
    if (!gHover) return;
    gHover.selectAll("*").remove();
    const d = paths.find(p => p.s.id === app.state.hoverSeg);
    if (!d) return;
    gHover.append("path").attr("d", line(d.pts)).attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 5.5);
    gHover.append("path").attr("d", line(d.pts)).attr("fill", "none").attr("stroke", DARK_RED).attr("stroke-width", 3);
  }

  function legend(lc) {
    const sw = (stroke, wdt, halo) => `<svg width="18" height="8">${halo ? `<line x1="1" x2="17" y1="4" y2="4" stroke="#fff" stroke-width="5"/>` : ""}<line x1="1" x2="17" y1="4" y2="4" stroke="${stroke}" stroke-width="${wdt}"/></svg>`;
    const mk = inner => `<svg width="10" height="10" viewBox="-5 -5 10 10">${inner}</svg>`;
    const items = [
      [sw(GRAY, 1.2), "all paths"],
      [sw(lc, 1.8), "brushed in E"],
      [sw(RED, 1.2), "selected lineage"],
      [sw(DARK_RED, 3, true), "hovered branch"],
      [mk(`<circle r="3.5" fill="${INK}"/>`), "start"],
      [mk(`<circle r="3" fill="#fff" stroke="${INK}"/>`), "at video end"],
      [mk(`<path transform="rotate(90)" d="${d3.symbol(d3.symbolTriangle, 30)()}" fill="${END_COL[2]}"/>`), "left image"],
      [mk(`<path d="${d3.symbol(d3.symbolX, 40)()}" fill="${END_COL[3]}" stroke="${END_COL[3]}"/>`), "lost mid-image"],
    ];
    if (app.state.ending != null) items.splice(2, 0, [sw(END_COL[app.state.ending], 1.8), `ending: ${app.data.endings[app.state.ending]}`]);
    key.html(items.map(([s, t]) => `<span>${s}${t}</span>`).join(""));
  }

  return {
    update(changed) {
      if (["init", "resize", "seq", "seqData", "raw", "window", "brush", "track", "ending", "reset"].some(k => changed.has(k))) draw();
      else if (changed.has("hoverSeg")) hover();
    },
  };
}
