// CellTrack Explorer — app state, data loading and coordination between views.
import { COL, TEXT_COL, short, lineOf, fmt1, hours } from "./common.js";
import { growthView } from "./views/growth.js";
import { shiftView } from "./views/shift.js";
import { speedView } from "./views/speed.js";
import { endingsView } from "./views/endings.js";
import { mapView } from "./views/map.js";
import { treeView } from "./views/tree.js";

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
    .style("--c", l => COL[l])
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

d3.select("#reset").on("click", () => {
  app.set({ hidden: new Set(), seq: DEFAULT.seq, track: DEFAULT.track, brush: null, window: null, ending: null, raw: false, hoverSeg: null });
  renderChips();
  for (const v of app.views) v.update(new Set(["reset"]));
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

  app.views = [
    growthView(document.querySelector("#vA .body"), app),
    shiftView(document.querySelector("#vB .body"), app),
    speedView(document.querySelector("#vE .body"), app),
    endingsView(document.querySelector("#vF .body"), app),
    mapView(document.querySelector("#vC"), app),
    treeView(document.querySelector("#vD"), app),
  ];
  renderChips();
  renderStatus();
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
