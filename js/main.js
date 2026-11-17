// CellTrack Explorer — app state, data loading and coordination between views.
import { COL, TEXT_COL, short, lineOf, fmt1, hours } from "./common.js?v=20261117c";
import { growthView } from "./views/growth.js?v=20261117c";
import { shiftView } from "./views/shift.js?v=20261117c";
import { speedView } from "./views/speed.js?v=20261117c";
import { endingsView } from "./views/endings.js?v=20261117c";
import { mapView } from "./views/map.js?v=20261117c";
import { treeView } from "./views/tree.js?v=20261117c";

const DEFAULT = { seq: "MCF10A F102", track: 1592 };

const app = {
  data: null,
  seqCache: new Map(),
  state: {
    hidden: new Set(),   // cell lines toggled off in the header
    seq: DEFAULT.seq,    // selected sequence
    track: DEFAULT.track,// selected lineage (Track_ID) in that sequence
    brush: null,         // [lo, hi] speed range brushed in E
    window: null,        // [f0, f1] frame range brushed in B
    ending: null,        // ending index clicked in F
    raw: false,          // C shows raw (true) or drift-corrected positions
    hoverSeg: null,      // segment id hovered in C or D
    hoverFrame: null,    // frame hovered in A or B
  },
  views: [],

  visibleSeqs() {
    return this.data.order.filter(s => !this.state.hidden.has(lineOf(s)));
  },

  /** Merge a patch into the state and tell every view which keys changed. */
  set(patch) {
    const changed = new Set();
    for (const [k, v] of Object.entries(patch)) {
      if (this.state[k] !== v) { this.state[k] = v; changed.add(k); }
    }
    if (!changed.size) return;
    if (changed.has("seq")) this.loadSeq(this.state.seq);
    for (const v of this.views) v.update(changed);
    renderStatus();
    syncControls();
    if ([...changed].some(k => k !== "hoverSeg" && k !== "hoverFrame")) writeURL();
  },

  /** Per-sequence path files are fetched on demand; views read them via seqData(). */
  async loadSeq(seq) {
    if (!seq) return;
    if (!this.seqCache.has(seq)) {
      const slug = this.data.seqInfo.get(seq).slug;
      this.seqCache.set(seq, d3.json(`data/seq/${slug}.json`).then(d => {
        d.byId = new Map(d.segments.map(s => [s.id, s]));
        this.seqLoaded.set(seq, d);
      }));
    }
    await this.seqCache.get(seq);
    if (this.state.seq === seq) for (const v of this.views) v.update(new Set(["seqData"]));
  },
  seqLoaded: new Map(),

  seqData() { return this.seqLoaded.get(this.state.seq) || null; },
};

// ---- header controls
function renderChips() {
  const chips = d3.select("#chips").selectAll("button").data(app.data.lines).join("button")
    .attr("class", "chip")
    .style("--c", l => TEXT_COL[l])   // darker text-safe hues: white chip text stays >= 4.5:1
    .attr("aria-pressed", l => !app.state.hidden.has(l))
    .text(l => l)
    .on("click", (e, l) => {
      const hidden = new Set(app.state.hidden);
      hidden.has(l) ? hidden.delete(l) : hidden.add(l);
      if (hidden.size === app.data.lines.length) return; // keep at least one line
      app.set({ hidden });
      renderChips();
    });
  chips.classed("off", l => app.state.hidden.has(l));
}

function renderStatus() {
  const s = app.state, parts = [];
  if (s.seq) parts.push(`<b style="color:${TEXT_COL[lineOf(s.seq)]}">${s.seq}</b>`);
  if (s.track != null) parts.push(`lineage <b>${s.track}</b>`);
  if (s.brush) parts.push(`speed ${fmt1(s.brush[0])}–${fmt1(s.brush[1])} px/15 min`);
  if (s.window) parts.push(`${fmt1(hours(s.window[0]))}–${fmt1(hours(s.window[1]))} h`);
  if (s.ending != null) parts.push(`ending: ${app.data.endings[s.ending]}`);
  d3.select("#status").html(parts.length ? parts.join(" · ") : "nothing selected");
}

// ---- shareable URL: ?seq=U87%20F2&track=12&brush=25,70&win=300,360&ending=3&raw=1&hide=HEK293T
function readURL() {
  const q = new URLSearchParams(location.search), st = app.state;
  const nums = k => q.get(k) && q.get(k).split(",").map(Number).filter(Number.isFinite);
  if (q.has("seq") && app.data.seqInfo.has(q.get("seq"))) { st.seq = q.get("seq"); st.track = null; }
  if (q.has("track")) st.track = +q.get("track");
  const b = nums("brush"); if (b && b.length === 2) st.brush = b;
  const w = nums("win"); if (w && w.length === 2) st.window = w;
  if (q.has("ending") && app.data.endings[+q.get("ending")]) st.ending = +q.get("ending");
  st.raw = q.get("raw") === "1";
  if (q.has("hide")) st.hidden = new Set(q.get("hide").split(",").filter(l => app.data.lines.includes(l)));
}
function writeURL() {
  const s = app.state, q = new URLSearchParams();
  if (s.seq && s.seq !== DEFAULT.seq) q.set("seq", s.seq);
  if (s.track != null && !(s.seq === DEFAULT.seq && s.track === DEFAULT.track)) q.set("track", s.track);
  if (s.seq === DEFAULT.seq && s.track == null) q.set("track", "none");
  if (s.brush) q.set("brush", s.brush.join(","));
  if (s.window) q.set("win", s.window.join(","));
  if (s.ending != null) q.set("ending", s.ending);
  if (s.raw) q.set("raw", "1");
  if (s.hidden.size) q.set("hide", [...s.hidden].join(","));
  const qs = q.toString().replace(/%2C/g, ",");
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

// ---- keyboard / screen-reader controls (everything the mouse can select)
function initControls() {
  d3.select("#seqSelect").selectAll("optgroup").data(d3.groups(app.data.order, lineOf)).join("optgroup")
    .attr("label", d => d[0])
    .selectAll("option").data(d => d[1]).join("option").attr("value", s => s).text(s => s);
  d3.select("#seqSelect").on("change", function () { app.set({ seq: this.value, track: null, ending: null, hoverSeg: null }); });
  d3.select("#trackSelect").on("change", function () { app.set({ track: this.value === "" ? null : +this.value }); });
  d3.select("#endSelect").selectAll("option").data([{ v: "", t: "all endings" }, ...app.data.endings.map((e, i) => ({ v: i, t: e }))])
    .join("option").attr("value", d => d.v).text(d => d.t);
  d3.select("#endSelect").on("change", function () { app.set({ ending: this.value === "" ? null : +this.value }); });
  d3.select(window).on("keydown.app", e => {
    if (e.key === "Escape") { app.set({ hoverSeg: null, hoverFrame: null }); d3.select("#tip").style("opacity", 0); }
  });
}
function syncControls() {
  const s = app.state;
  d3.select("#seqSelect").property("value", s.seq || "");
  const tracks = d3.rollups(app.data.segs.filter(d => d.seq === s.seq), v => v.length, d => d.track)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  d3.select("#trackSelect").selectAll("option").data([[null, 0], ...tracks], d => d[0]).join("option")
    .attr("value", d => d[0] ?? "").text(d => d[0] == null ? "pick a lineage…" : `Track ${d[0]} · ${d[1]} branch${d[1] > 1 ? "es" : ""}`);
  d3.select("#trackSelect").property("value", s.track ?? "");
  d3.select("#endSelect").property("value", s.ending ?? "");
}

d3.select("#reset").on("click", () => {
  app.set({ hidden: new Set(), seq: DEFAULT.seq, track: DEFAULT.track, brush: null, window: null, ending: null, raw: false, hoverSeg: null });
  renderChips();
  for (const v of app.views) v.update(new Set(["reset"]));
  history.replaceState(null, "", location.pathname);
});

// ---- boot
async function main() {
  const data = await d3.json("data/overview.json");
  const S = data.segments;
  data.segs = S.id.map((id, i) => ({
    id, seq: data.order[S.seq[i]], track: S.track[i], f0: S.f0[i], f1: S.f1[i], n: S.n[i],
    speed: S.speed[i], straight: S.straight[i], net: S.net[i], ending: S.ending[i],
  }));
  data.segById = new Map(data.segs.map(s => [s.id, s]));
  data.seqInfo = new Map(data.sequences.map(s => [s.seq, s]));
  app.data = data;
  readURL();
  if (new URLSearchParams(location.search).get("track") === "none") app.state.track = null;

  app.views = [
    growthView(document.querySelector("#vA .body"), app),
    shiftView(document.querySelector("#vB .body"), app),
    speedView(document.querySelector("#vE .body"), app),
    endingsView(document.querySelector("#vF .body"), app),
    mapView(document.querySelector("#vC"), app),
    treeView(document.querySelector("#vD"), app),
  ];
  initControls();
  renderChips();
  renderStatus();
  syncControls();
  for (const v of app.views) v.update(new Set(["init"]));
  app.loadSeq(app.state.seq);

  let t;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => app.views.forEach(v => v.update(new Set(["resize"]))), 120);
  }).observe(document.querySelector("#dash"));
  d3.select("body").classed("loading", false);
}

main().catch(err => {
  console.error(err);
  d3.select("#status").html(`<span class="err">Could not load data (${err.message}). If you opened this file directly, serve the folder over HTTP — see README.</span>`);
});

window.app = app; // handy for debugging in the console
