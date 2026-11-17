// Shared palette, constants and helpers. Colors match the Milestone 2 figures (build/common.py).

export const COL = { "MCF10A": "#3b6fb6", "HEK293T": "#c06a17", "U87": "#2f8f55", "MDA-MB-231": "#a8397a" };
export const TEXT_COL = { "MCF10A": "#3b6fb6", "HEK293T": "#a8601a", "U87": "#267a47", "MDA-MB-231": "#a8397a" };
export const RED = "#c8322b", DARK_RED = "#7a1410", INK = "#2b2b2b", GRAY = "#b9b6ae";
export const END_COL = ["#2e5f8e", "#6f95bd", "#bd8414", "#b02a24"]; // divided, until video end, left image, lost mid-image
export const IMG_W = 1224, IMG_H = 904;
export const HOURS_PER_FRAME = 0.25;
export const MAX_HOURS = 96.25;

// Rows of the sequence matrix (views B, E, F) share these margins so they line up exactly.
export const MATRIX = { top: 30, bottom: 34, rowPad: 0.18 };

export const hours = f => f * HOURS_PER_FRAME;
export const short = seq => seq.split(" ")[1];
export const lineOf = seq => seq.split(" ")[0];
export const fmt1 = d3.format(".1f");
export const fmtPct = d3.format(".0%");

export function matrixRows(seqs, height) {
  return d3.scaleBand().domain(seqs).range([MATRIX.top, height - MATRIX.bottom]).paddingInner(MATRIX.rowPad).paddingOuter(0.1);
}

/** Line-group separators: indices i where row i starts a new cell line. */
export function groupBreaks(seqs) {
  return seqs.filter((s, i) => i && lineOf(seqs[i - 1]) !== lineOf(s));
}

// ---- tooltip
const tip = d3.select("#tip");
export function showTip(event, html) {
  tip.html(html).style("opacity", 1);
  const { innerWidth: W, innerHeight: H } = window;
  const r = tip.node().getBoundingClientRect();
  let x = event.clientX + 14, y = event.clientY + 14;
  if (x + r.width > W - 8) x = event.clientX - r.width - 14;
  if (y + r.height > H - 8) y = event.clientY - r.height - 14;
  tip.style("left", `${x}px`).style("top", `${y}px`);
}
export function hideTip() { tip.style("opacity", 0); }

/** Size of a view's drawing area. */
export function box(el) {
  const r = el.getBoundingClientRect();
  return { w: Math.max(40, Math.floor(r.width)), h: Math.max(40, Math.floor(r.height)) };
}

export function rollingMedian(values, k = 5) {
  const h = Math.floor(k / 2);
  return values.map((_, i) => d3.median(values.slice(Math.max(0, i - h), i + h + 1)));
}

/** Short text marker for an ending, used in tooltips. */
export function endName(app, i) { return app.data.endings[i]; }
