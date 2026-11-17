// View D — lineage dendrogram (time runs down) + detail panel for the selected Track_ID.
import { INK, DARK_RED, END_COL, RED, TEXT_COL, lineOf, hours, box, showTip, hideTip, fmt1, MAX_HOURS, describe } from "../common.js?v=20261117c";

/** x = leaf order, y = frames. Mirrors lineage_layout() in build/common.py. */
function layout(segs, byId) {
  const ids = new Set(segs.map(s => s.id));
  const kids = new Map(segs.map(s => [s.id, []]));
  for (const s of segs) if (s.parent && ids.has(s.parent)) kids.get(s.parent).push(s);
  const roots = segs.filter(s => !(s.parent && ids.has(s.parent))).sort((a, b) => a.f0 - b.f0);
  const x = new Map();
  let leaf = 0;
  const place = s => {
    const ch = kids.get(s.id).sort((a, b) => a.f0 - b.f0);
    if (!ch.length) x.set(s.id, leaf++);
    else { ch.forEach(place); x.set(s.id, d3.mean(ch, c => x.get(c.id))); }
  };
  roots.forEach(place);
  const nodes = segs.map(s => ({ s, m: byId.get(s.id), x: x.get(s.id), kids: kids.get(s.id), root: roots.includes(s) }));
  return { nodes, leaves: leaf };
}

export function treeView(section, app) {
  const el = section.querySelector(".body");
  const svg = d3.select(el).append("svg");
  const title = d3.select("#treeTitle");
  const details = d3.select("#treeDetails");
  let nodes = [], sx, sy;

  function draw() {
    let { w, h } = box(el);
    svg.attr("width", w).attr("height", h).selectAll("*").remove();
    const data = app.seqData(), { seq, track } = app.state;
    const segs = data && track != null ? data.segments.filter(s => s.track === track) : [];
    if (!segs.length) {
      title.text("");
      svg.append("text").attr("class", "empty-msg").attr("x", w / 2).attr("y", h / 2).attr("text-anchor", "middle")
        .text(data ? "click a path in C or an outlier in E" : "loading…");
      details.html(`<span class="hint">Pick a lineage to see its family tree and summary.</span>`);
      nodes = [];
      return;
    }
    const L = layout(segs, app.data.segById);
    nodes = L.nodes;
    const f1 = n => n.m ? n.m.f1 : n.s.f0 + n.s.x.length - 1;
    // fill the detail panel first: it changes how much height the tree gets
    detail(segs, f1);
    ({ w, h } = box(el));
    svg.attr("width", w).attr("height", h);
    const m = { l: 30, r: 10, t: 8, b: 6 };
    sx = d3.scaleLinear([-0.8, Math.max(1, L.leaves - 0.2)], [m.l, w - m.r]);
    sy = d3.scaleLinear([0, MAX_HOURS], [m.t, h - m.b]);

    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l - 4},0)`)
      .call(d3.axisLeft(sy).tickValues([0, 24, 48, 72, 96]).tickSizeOuter(0));
    svg.append("text").attr("class", "axis-label").attr("transform", `translate(9,${m.t}) rotate(-90)`).attr("text-anchor", "end").text("hours");

    const g = svg.append("g");
    const xOf = new Map(nodes.map(n => [n.s.id, n.x]));
    // division bars
    g.selectAll("line.div").data(nodes.filter(n => n.kids.length)).join("line")
      .attr("x1", n => sx(d3.min(n.kids, c => xOf.get(c.id)))).attr("x2", n => sx(d3.max(n.kids, c => xOf.get(c.id))))
      .attr("y1", n => sy(hours(f1(n) + 1))).attr("y2", n => sy(hours(f1(n) + 1))).attr("stroke", INK);
    // branches
    g.selectAll("line.br").data(nodes).join("line").attr("class", "br")
      .attr("x1", n => sx(n.x)).attr("x2", n => sx(n.x)).attr("y1", n => sy(hours(n.s.f0))).attr("y2", n => sy(hours(f1(n) + 1)))
      .attr("stroke", INK).attr("stroke-width", 1.2);
    // roots and end marks
    g.selectAll("circle.root").data(nodes.filter(n => n.root)).join("circle")
      .attr("cx", n => sx(n.x)).attr("cy", n => sy(hours(n.s.f0))).attr("r", 3.5).attr("fill", INK).attr("stroke", "#fff");
    for (const n of nodes.filter(n => !n.kids.length)) {
      const cx = sx(n.x), cy = sy(hours(f1(n) + 1)), e = n.s.ending;
      if (e === 2) g.append("path").attr("transform", `translate(${cx},${cy}) rotate(90)`).attr("d", d3.symbol(d3.symbolTriangle, 26)()).attr("fill", END_COL[2]);
      if (e === 3) g.append("path").attr("transform", `translate(${cx},${cy})`).attr("d", d3.symbol(d3.symbolX, 36)()).attr("fill", END_COL[3]).attr("stroke", END_COL[3]);
    }
    g.append("g").attr("class", "hot");
    // hit areas
    svg.append("g").selectAll("line").data(nodes).join("line")
      .attr("x1", n => sx(n.x)).attr("x2", n => sx(n.x)).attr("y1", n => sy(hours(n.s.f0))).attr("y2", n => sy(hours(f1(n) + 1)))
      .attr("stroke", "transparent").attr("stroke-width", Math.max(6, Math.min(12, (sx(1) - sx(0)) * 0.9))).style("cursor", "pointer")
      .on("mouseenter", (e, n) => {
        app.set({ hoverSeg: n.s.id });
        showTip(e, `<b>${n.s.id}</b><br>${fmt1(hours(n.s.f0))}–${fmt1(hours(f1(n) + 1))} h · ` +
          `mean step ${n.s.speed == null ? "–" : fmt1(n.s.speed)} px/15 min<br>ending: ${app.data.endings[n.s.ending]}`);
      })
      .on("mouseleave", () => { hideTip(); app.set({ hoverSeg: null }); });

    title.html(`<b style="color:${TEXT_COL[lineOf(seq)]}">${seq}</b> · Track ${track}`);
    hover();
    const lost = segs.filter(s => s.ending === 3).length;
    describe(svg, `Family tree of lineage ${track} in ${seq}, time running down in hours: ${segs.length} branches and ` +
      `${nodes.filter(n => n.kids.length).length} divisions` + (lost ? `; ${lost} branches are lost mid-image (possible apoptosis or annotation gap).` : "."));
  }

  function hover() {
    const hot = svg.select("g.hot");
    if (hot.empty()) return;
    hot.selectAll("*").remove();
    const n = nodes.find(n => n.s.id === app.state.hoverSeg);
    if (!n) return;
    const f1 = n.m ? n.m.f1 : n.s.f0 + n.s.x.length - 1;
    const ln = (c, wd) => hot.append("line").attr("x1", sx(n.x)).attr("x2", sx(n.x)).attr("y1", sy(hours(n.s.f0))).attr("y2", sy(hours(f1 + 1)))
      .attr("stroke", c).attr("stroke-width", wd);
    ln("#fff", 6); ln(DARK_RED, 3.2);
  }

  function detail(segs, f1) {
    const f0 = d3.min(segs, s => s.f0), fEnd = d3.max(nodes, n => f1(n));
    const obs = d3.sum(segs, s => s.x.length);
    const divs = nodes.filter(n => n.kids.length).length;
    const steps = segs.filter(s => s.speed != null);
    const meanStep = d3.sum(steps, s => s.speed * (s.x.length - 1)) / d3.sum(steps, s => s.x.length - 1);
    const ends = [0, 0, 0, 0];
    segs.forEach(s => ends[s.ending]++);
    // sparkline: cells of this lineage alive per frame
    const alive = d3.range(f0, fEnd + 1).map(f => ({ f, n: nodes.filter(n => n.s.f0 <= f && f1(n) >= f).length }));
    const W = 150, H = 26;
    const x = d3.scaleLinear([f0, Math.max(f0 + 1, fEnd)], [0, W]), y = d3.scaleLinear([0, d3.max(alive, d => d.n)], [H, 1]);
    const area = d3.area().x(d => x(d.f)).y0(H).y1(d => y(d.n)).curve(d3.curveStepAfter)(alive);
    const endTxt = app.data.endings.map((e, i) => ends[i] ? `<span style="color:${END_COL[i]}">■</span> ${ends[i]} ${e}` : "").filter(Boolean).join("<br>");
    details.html(`<table>
      <tr><td>span</td><td>${fmt1(hours(f0))}–${fmt1(hours(fEnd + 1))} h</td></tr>
      <tr><td>observations</td><td>${obs.toLocaleString()}</td></tr>
      <tr><td>divisions · branches</td><td>${divs} · ${segs.length}</td></tr>
      <tr><td>mean step</td><td>${fmt1(meanStep)} px / 15 min</td></tr>
      <tr><td style="vertical-align:top">endings</td><td>${endTxt}</td></tr>
      <tr><td>cells alive</td><td><svg width="${W}" height="${H}" role="img" aria-label="cells of this lineage alive over time"><path d="${area}" fill="${RED}" fill-opacity=".25" stroke="${RED}"/></svg></td></tr>
    </table>`);
  }

  return {
    update(changed) {
      if (["init", "resize", "seq", "seqData", "track", "reset"].some(k => changed.has(k))) draw();
      else if (changed.has("hoverSeg")) hover();
    },
  };
}
