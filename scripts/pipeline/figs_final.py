"""Revised views on the full ground-truth data, plus the assembled dashboard figure."""
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.collections import LineCollection
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import Rectangle

from common import *

gt, pf, sg, ln, sq = load()
order = seq_order(sq)
pf["hours"] = pf.frame_t * 0.25
SEL_SEQ, SEL_TRACK = "MCF10A F102", 1592
BRUSH = (25, 70)                     # px per 15-min step, brushed in view E
MIN_FRAMES = 8                       # segments shorter than 2 h are left out of E
VMAX = 120                           # heatmap color cap (px); larger shifts share the darkest color
sgB = sg[sg.n >= MIN_FRAMES]
SHIFT = LinearSegmentedColormap.from_list("shift", ["#ffffff", "#f3d3cf", "#e0806f", RED, DARK_RED])
MISSING = dict(fc="#ece9e3", ec="#a9a59c", hatch="////", lw=0)
HALO = [pe.withStroke(linewidth=4.6, foreground="white")]
END_MARK = {"left image": ">", "lost mid-image": "x"}

# Font sizes in figure points. Both the dashboard and the standalone figures are drawn so that
# they print at roughly 0.7-0.8x, which keeps printed text near 7 pt or larger.
SZ = dict(title=12.5, label=10.5, tick=10, row=9.5, note=9.5, small=9)


def short(s):
    return s.split(" ")[1]


def line_of(s):
    return s.split(" ")[0]


def badge(fig, ax, letter, dx=-0.012, dy=0.014):
    b = ax.get_position()
    fig.text(b.x0 + dx, b.y1 + dy, letter, ha="center", va="center", color="white", fontsize=12, fontweight="bold",
             bbox=dict(boxstyle="circle,pad=0.25", fc=RED, ec="none"))


def ticks(ax):
    ax.tick_params(labelsize=SZ["tick"])


# ---------------- A: growth, one panel per cell line, log2 count ----------------
def draw_growth(axs, sel=SEL_SEQ, labels=True):
    for a, l in zip(axs, LINES):
        ss = [s for s in order if line_of(s) == l]
        ends = []
        for s in ss:
            d = pf[pf.seq == s]
            y = d["count"].rolling(5, center=True, min_periods=1).median()   # 1-hour median smooths ID flicker
            hi = s == sel
            a.plot(d.hours, y, color=RED if hi else COL[l], lw=2.2 if hi else 1.0,
                   alpha=1 if hi else 0.8, zorder=3 if hi else 2)
            ends.append((np.log2(y.iloc[-1]), d.hours.iloc[-1], s, hi))
        if labels:                                   # nudge end labels apart in log space
            gap = 0.95
            ends.sort()
            ys = [e[0] for e in ends]
            for i in range(1, len(ys)):
                ys[i] = max(ys[i], ys[i - 1] + gap)
            ys[-1] = min(ys[-1], 7.7)
            for i in range(len(ys) - 2, -1, -1):
                ys[i] = min(ys[i], ys[i + 1] - gap)
            for (y0, h, s, hi), y in zip(ends, ys):
                a.text(h + 1.5, 2 ** y, short(s), fontsize=SZ["small"] - 0.5, va="center",
                       color=RED if hi else TEXT_COL[l], fontweight="bold" if hi else "normal")
        a.set_yscale("log", base=2)
        a.set(ylim=(0.8, 256), xlim=(0, 112), yticks=[1, 4, 16, 64, 256])
        a.set_yticklabels(["1", "4", "16", "64", "256"])
        a.set_xticks([0, 24, 48, 72, 96])
        a.text(0.03, 0.97, l, transform=a.transAxes, color=TEXT_COL[l], fontweight="bold",
               fontsize=SZ["label"], va="top")
        a.grid(axis="y", color="#eee", lw=0.6)
        ticks(a)


# ---------------- B: stage-shift heatmap, sequences x hours ----------------
def draw_shift(ax, rows=order, sel=SEL_SEQ):
    nh = 385
    M = np.full((len(rows), nh), np.nan)
    for i, s in enumerate(rows):
        d = pf[pf.seq == s]
        M[i, d.frame_t.values] = (d.drift * d.coherence.clip(0, 1)).fillna(0).values
    cmap = SHIFT.copy()
    cmap.set_bad("white")
    im = ax.imshow(M, aspect="auto", cmap=cmap, vmin=0, vmax=VMAX, interpolation="nearest",
                   extent=(0, nh * 0.25, len(rows) - 0.5, -0.5))
    for i in range(len(rows)):                       # hatched gray where no cells are annotated
        miss = np.isnan(M[i])
        j = 0
        while j < nh:
            if miss[j]:
                k = j
                while k < nh and miss[k]:
                    k += 1
                ax.add_patch(Rectangle((j * 0.25, i - 0.5), (k - j) * 0.25, 1, **MISSING))
                j = k
            else:
                j += 1
    for i, s in enumerate(rows):
        if i and line_of(rows[i - 1]) != line_of(s):
            ax.axhline(i - 0.5, color="white", lw=2.5)
    ax.set_yticks(range(len(rows)), [short(s) for s in rows], fontsize=SZ["row"])
    for t, s in zip(ax.get_yticklabels(), rows):
        t.set_color(RED if s == sel else TEXT_COL[line_of(s)])
        if s == sel:
            t.set_fontweight("bold")
    ax.set_xticks([0, 24, 48, 72, 96])
    ax.set_xlabel("hours since first frame", fontsize=SZ["label"])
    ticks(ax)
    ax.tick_params(axis="y", labelsize=SZ["row"])
    for sp in ax.spines.values():
        sp.set_visible(False)
    return im


def line_names(fig, ax, rows=order, x_name=0.008, x_bar=None):
    """Horizontal cell-line names with a colored bracket, to the left of the row labels."""
    b = ax.get_position()
    x_bar = x_bar if x_bar is not None else b.x0 - 0.04
    n = len(rows)
    for l in LINES:
        idx = [i for i, s in enumerate(rows) if line_of(s) == l]
        y0 = b.y1 - (idx[0] + 0.1) / n * b.height
        y1 = b.y1 - (idx[-1] + 0.9) / n * b.height
        fig.add_artist(plt.Line2D([x_bar, x_bar], [y0, y1], color=COL[l], lw=3, transform=fig.transFigure))
        fig.text(x_name, (y0 + y1) / 2, l, color=TEXT_COL[l], fontsize=SZ["row"], fontweight="bold", va="center")


def shift_colorbar(fig, im, rect):
    cax = fig.add_axes(rect)
    cb = fig.colorbar(im, cax=cax, orientation="horizontal", extend="max")
    cb.set_ticks([0, 60, 120], labels=["0", "60", "≥120 px"])
    cb.ax.tick_params(labelsize=SZ["small"])
    b = cax.get_position()
    rend = fig.canvas.get_renderer()
    t = fig.text(b.x1 + 0.03, b.y0 + b.height / 2, "shared shift of all cells per frame", fontsize=SZ["small"],
                 color="#555", va="center")
    x = b.x1 + 0.03 + t.get_window_extent(rend).width / fig.bbox.width + 0.03
    sw = 0.25 / fig.get_figwidth()                    # 0.25-inch swatch
    fig.patches.append(Rectangle((x, b.y0 - 0.002), sw, b.height + 0.004, transform=fig.transFigure,
                                 figure=fig, **MISSING))
    fig.text(x + sw + 0.006, b.y0 + b.height / 2, "no cells annotated", fontsize=SZ["small"], color="#555", va="center")


# ---------------- E: speed distribution per sequence ----------------
def draw_speed(ax, rows=order, sel=SEL_SEQ, brush=BRUSH):
    ax.axvspan(*brush, color="#fbe3e0", zorder=0)
    for i, s in enumerate(rows):
        v = sgB[sgB.seq == s].speed.dropna().values
        l = line_of(s)
        q1, med, q3 = np.percentile(v, [25, 50, 75])
        iqr = q3 - q1
        lo, hi = v[v >= q1 - 1.5 * iqr].min(), v[v <= q3 + 1.5 * iqr].max()
        c = RED if s == sel else COL[l]
        ax.plot([lo, hi], [i, i], color=c, lw=1)
        ax.add_patch(Rectangle((q1, i - 0.32), q3 - q1, 0.64, fc=c, ec=c, lw=0.8, alpha=0.4 if s != sel else 0.6))
        ax.plot([med, med], [i - 0.38, i + 0.38], color=c, lw=2)
        out = v[(v < lo) | (v > hi)]
        ax.scatter(out, np.full(len(out), i), s=10, color=c, lw=0, alpha=0.85, zorder=3)
    ax.set_ylim(len(rows) - 0.5, -0.5)
    ax.set_yticks(range(len(rows)), [])
    ax.set_xlim(0, 75)
    ax.set_xlabel("mean step per cell segment (px / 15 min, drift-corrected)", fontsize=SZ["label"])
    ticks(ax)
    for i, s in enumerate(rows):
        if i and line_of(rows[i - 1]) != line_of(s):
            ax.axhline(i - 0.5, color="#ddd", lw=0.8)
    ax.spines["left"].set_visible(False)


# ---------------- F: how cell segments end ----------------
ENDS = ["divided", "until video end", "left image", "lost mid-image"]


def draw_endings(ax, rows=order, sel=SEL_SEQ):
    share = sg.groupby("seq").ending.value_counts(normalize=True).unstack().reindex(rows).fillna(0)
    left = np.zeros(len(rows))
    for e in ENDS:
        ax.barh(range(len(rows)), share[e], left=left, color=END_COL[e], height=0.74, label=e,
                edgecolor="white", lw=0.8)
        left += share[e].values
    n = sg.groupby("seq").size().reindex(rows)
    ax.text(1.03, -0.9, "n", fontsize=SZ["small"], va="bottom", color="#555", fontweight="bold")
    for i, s in enumerate(rows):
        ax.text(1.03, i, f"{n[s]}", fontsize=SZ["small"] - 0.5, va="center", color=RED if s == sel else "#555")
    ax.set_ylim(len(rows) - 0.5, -0.5)
    ax.set_yticks(range(len(rows)), [])
    ax.set_xlim(0, 1)
    ax.set_xticks([0, 0.5, 1], ["0", "50%", "100%"])
    ax.set_xlabel("share of cell segments", fontsize=SZ["label"])
    ticks(ax)
    ax.spines["left"].set_visible(False)


def endings_key(ax, y=-0.17, dy=0.05, cols=2):
    """Key in the same order as the bar segments (left to right, then next row)."""
    for k, e in enumerate(ENDS):
        r, c = divmod(k, cols)
        x, yy = c / cols - 0.02, y - r * dy
        ax.add_patch(Rectangle((x, yy - 0.012), 0.07, 0.024, transform=ax.transAxes, clip_on=False, color=END_COL[e]))
        ax.text(x + 0.09, yy, e, transform=ax.transAxes, fontsize=SZ["small"], va="center")


# ---------------- C: drift-corrected track map ----------------
def draw_map(ax, seq=SEL_SEQ, track=SEL_TRACK, brush=BRUSH, corrected=True, hover=None):
    d = gt[gt.seq == seq].sort_values("frame_t")
    sp = sg.set_index("segment").speed
    xs, ys = ("cx", "cy") if corrected else ("position_x_t", "position_y_t")
    ctx, hit, sel, hov = [], [], [], []
    for sid, g in d.groupby("segment"):
        if len(g) < 2:
            continue
        p = np.c_[g[xs], g[ys]]
        if sid == hover:
            hov.append(p)
        elif g.track_id.iloc[0] == track:
            sel.append(p)
        elif len(g) >= MIN_FRAMES and brush[0] <= sp[sid] <= brush[1]:
            hit.append(p)
        else:
            ctx.append(p)
    # draw order: context, lineage, brushed on top of lineage, hovered branch on top of all
    ax.add_collection(LineCollection(ctx, colors="#b9b6ae", lw=0.45, alpha=0.6, zorder=1))
    ax.add_collection(LineCollection(sel, colors=RED, lw=0.8, zorder=2))
    ax.add_collection(LineCollection(hit, colors=COL[line_of(seq)], lw=1.5, zorder=3))
    hl = LineCollection(hov, colors=DARK_RED, lw=3, zorder=5)
    hl.set_path_effects(HALO)
    ax.add_collection(hl)
    ss = sg[(sg.seq == seq) & (sg.track_id == track)]
    for e, mk in END_MARK.items():
        q = ss[ss.ending == e]
        ax.scatter(q.x1, q.y1, marker=mk, s=34 if mk == "x" else 26, color=END_COL[e], lw=1.6, zorder=6)
    q = ss[ss.ending == "until video end"]
    ax.scatter(q.x1, q.y1, marker="o", s=22, fc="white", ec=INK, lw=1, zorder=6)
    if len(ss):
        r = ss.sort_values("f0").iloc[0]
        ax.scatter([r.x0], [r.y0], s=46, color=INK, zorder=7, edgecolor="white", lw=1)
    x0, x1 = min(0, d[xs].min()) - 5, max(IMG_W, d[xs].max()) + 5
    y0, y1 = min(0, d[ys].min()) - 5, max(IMG_H, d[ys].max()) + 5
    if corrected and (x0 < -10 or y0 < -10 or x1 > IMG_W + 10 or y1 > IMG_H + 10):
        ax.add_patch(Rectangle((0, 0), IMG_W, IMG_H, fill=False, ls="--", lw=0.8, ec="#888"))
    ax.set(xlim=(x0, x1), ylim=(y1, y0), aspect="equal")
    ax.set_xticks([0, 400, 800, 1200])
    ax.set_yticks([0, 300, 600, 900])
    ax.set_xlabel("x (px)", fontsize=SZ["small"], labelpad=1)
    ax.set_ylabel("y (px)", fontsize=SZ["small"], labelpad=1)
    ax.tick_params(labelsize=SZ["small"])
    return len(ctx) + len(hit) + len(sel) + len(hov), len(hit), len(sel) + len(hov)


MAP_KEY = [("line", "#b9b6ae", 0.8, "all paths"), ("line", None, 1.5, "brushed in E"),
           ("line", RED, 0.9, "lineage"), ("halo", DARK_RED, 3, "hovered branch"),
           ("pt", "o", INK, "start"), ("pt", "o", "white", "at video end"),
           ("pt", ">", END_COL["left image"], "left image"), ("pt", "x", END_COL["lost mid-image"], "lost mid-image")]


def map_key(ax, seq=SEL_SEQ, rows=2, y=-0.13, dy=0.075, counts=None):
    per = (len(MAP_KEY) + rows - 1) // rows
    for k, item in enumerate(MAP_KEY):
        r, c = divmod(k, per)
        x = c / per
        yy = y - r * dy
        kind = item[0]
        if kind in ("line", "halo"):
            col = item[1] or COL[line_of(seq)]
            l = plt.Line2D([x, x + 0.05], [yy, yy], color=col, lw=item[2], transform=ax.transAxes, clip_on=False)
            if kind == "halo":
                l.set_path_effects(HALO)
            ax.add_artist(l)
        else:
            mk, col = item[1], item[2]
            ax.scatter([x + 0.025], [yy], marker=mk, s=26, transform=ax.transAxes, clip_on=False,
                       **(dict(color=col, lw=1.4) if mk == "x" else dict(fc=col, ec=INK if col == "white" else col, lw=0.8)))
        label = item[-1]
        if counts and k < 2:
            label += f" ({counts[k]})"
        ax.text(x + 0.06, yy, label, transform=ax.transAxes, fontsize=SZ["small"], va="center")


# ---------------- D: lineage dendrogram ----------------
def draw_tree(ax, seq=SEL_SEQ, track=SEL_TRACK, hover=None):
    lay, kids = lineage_layout(gt, seq, track)
    ends = sg.set_index("segment").ending
    has_parent = lay.parent.isin(lay.index)
    for sid, r in lay.iterrows():
        h0, h1 = r.f0 * 0.25, r.f1 * 0.25
        hot = sid == hover
        ln_ = ax.plot([r.x, r.x], [h0, h1], color=DARK_RED if hot else INK, lw=3 if hot else 1,
                      solid_capstyle="butt", zorder=4 if hot else 2)[0]
        if hot:
            ln_.set_path_effects(HALO)
        if not has_parent[sid]:                       # root of the lineage (incl. a cell that entered later)
            ax.scatter([r.x], [h0], s=30, color=INK, zorder=3, edgecolor="white", lw=0.8)
        if kids[sid]:
            xs = [lay.x[c] for c in kids[sid]]
            ax.plot([min(xs), max(xs)], [h1, h1], color=INK, lw=1)
            ax.scatter([r.x], [h1], s=9, color=INK, zorder=3)
        else:
            e = ends.get(sid)
            if e in END_MARK:
                ax.scatter([r.x], [h1], marker=END_MARK[e], s=30 if e == "lost mid-image" else 24,
                           color=END_COL[e], lw=1.5, zorder=3)
    ax.set_ylim(98, -3)
    ax.set_xlim(-1.5, lay.x.max() + 1.5)
    ax.set_xticks([])
    ax.set_yticks([0, 24, 48, 72, 96])
    ax.set_ylabel("hours", fontsize=SZ["label"])
    ticks(ax)
    ax.spines["bottom"].set_visible(False)
    return lay


def lineage_stats(seq=SEL_SEQ, track=SEL_TRACK):
    r = ln[(ln.seq == seq) & (ln.track_id == track)].iloc[0]
    e = sg[(sg.seq == seq) & (sg.track_id == track)].ending.value_counts()
    return r, e


def lay_hover_id():
    """Pick the longest leaf of lineage 1592 to show the hover-highlight state."""
    lay, kids = lineage_layout(gt, SEL_SEQ, SEL_TRACK)
    leaves = lay[[not kids[s] for s in lay.index]]
    return (leaves.f1 - leaves.f0).sort_values().index[-1].split("#")[1]


def dashboard():
    fig = plt.figure(figsize=(15, 10.4))
    HOV = f"{SEL_SEQ}#{lay_hover_id()}"
    # header
    fig.text(0.012, 0.972, "Cell Behavior Explorer", fontsize=18, fontweight="bold", va="center")
    fig.text(0.205, 0.972, "ground-truth tracks · 25 sequences · 229,890 observations · 5,927 cell segments",
             fontsize=SZ["note"], color="#555", va="center")
    rend = fig.canvas.get_renderer()
    x = 0.995
    for l in reversed(LINES):                         # right-aligned chips, spaced by measured width
        t = fig.text(x, 0.975, f" {l} ", fontsize=SZ["small"], color="white", va="center", ha="right",
                     fontweight="bold", bbox=dict(boxstyle="round,pad=0.3", fc=TEXT_COL[l], ec="none"))
        w = t.get_window_extent(rend).width / fig.bbox.width
        x -= w + 0.012
    fig.text(0.995, 0.945, "Selected: MCF10A F102  ·  brush 25–70 px  ·  lineage 1592     [Reset]",
             fontsize=SZ["small"], color=RED, va="center", ha="right", fontweight="bold")

    # --- A growth (2x2)
    gA = fig.add_gridspec(2, 2, left=0.045, right=0.295, top=0.9, bottom=0.6, hspace=0.12, wspace=0.12)
    axA = [fig.add_subplot(gA[i // 2, i % 2]) for i in range(4)]
    draw_growth(axA)
    for i, a in enumerate(axA):
        if i % 2:
            a.set_yticklabels([])
        if i < 2:
            a.set_xticklabels([])
    axA[0].set_title("Growth: cells in frame (log₂) vs. hours", pad=7, fontsize=SZ["title"])
    for i in (0, 2):
        axA[i].set_ylabel("cells", fontsize=SZ["label"])
    for i in (2, 3):
        axA[i].set_xlabel("hours", fontsize=SZ["label"])

    # --- C map
    axC = fig.add_axes([0.34, 0.6, 0.33, 0.3])
    n, nh, ns = draw_map(axC, hover=HOV)
    axC.set_title("Track map · MCF10A F102 (drift-corrected)", pad=7, fontsize=SZ["title"])
    map_key(axC, y=-0.15, dy=0.075, counts=(n, nh))
    axS = fig.add_axes([0.355, 0.5, 0.3, 0.014])
    axS.add_patch(Rectangle((0, 0.35), 1, 0.3, color="#999"))
    axS.scatter([1], [0.5], s=60, color=INK, zorder=3)
    axS.set(xlim=(-0.01, 1.01), ylim=(0, 1))
    axS.axis("off")
    axS.text(-0.01, 0.5, "▶ ", ha="right", va="center", fontsize=11)
    axS.text(1.015, 0.5, " frames 0–384", ha="left", va="center", fontsize=SZ["small"], color="#555")

    # --- D lineage + detail
    axD = fig.add_axes([0.715, 0.6, 0.165, 0.3])
    draw_tree(axD, hover=HOV)
    axD.set_title("Lineage · track 1592", pad=7, fontsize=SZ["title"])
    r, e = lineage_stats()
    axP = fig.add_axes([0.893, 0.6, 0.1, 0.3])
    axP.axis("off")
    rows = [("span", f"{r.duration_h:.0f} h"), ("observations", f"{int(r.obs):,}"), ("divisions", f"{int(r.divisions)}"),
            ("branches", f"{int(r.branches)}"), ("mean step", f"{r.speed:.1f} px"), ("ends:", ""),
            ("divided", f"{e.get('divided', 0)}"), ("video end", f"{e.get('until video end', 0)}"),
            ("left image ▷", f"{e.get('left image', 0)}"), ("lost mid ✕", f"{e.get('lost mid-image', 0)}")]
    for i, (k, v) in enumerate(rows):
        axP.text(0.0, 1.0 - i * 0.064, k, fontsize=SZ["small"], color="#555", va="top", transform=axP.transAxes)
        axP.text(1.0, 1.0 - i * 0.064, v, fontsize=SZ["small"], ha="right", va="top", fontweight="bold",
                 transform=axP.transAxes)
    d = gt[(gt.seq == SEL_SEQ) & (gt.track_id == SEL_TRACK)].groupby("frame_t").size()
    axSp = fig.add_axes([0.9, 0.615, 0.093, 0.07])
    axSp.fill_between(d.index * 0.25, d.values, color="#f2c4bf", lw=0)
    axSp.plot(d.index * 0.25, d.values, color=RED, lw=1)
    axSp.set_xticks([0, 48, 96])
    axSp.set_yticks([0, int(d.max())])
    axSp.tick_params(labelsize=SZ["small"] - 1)
    axSp.set_title("cells alive in lineage", fontsize=SZ["small"], fontweight="normal", pad=2)
    fig.text(0.715, 0.565, "hover a branch → its path is highlighted in C", fontsize=SZ["small"], color=RED)

    # --- bottom: sequence matrix (B | E | F share rows)
    top, bot = 0.43, 0.105
    axH = fig.add_axes([0.125, bot, 0.38, top - bot])
    im = draw_shift(axH)
    line_names(fig, axH, x_name=0.006, x_bar=0.083)
    axH.set_title("Stage-shift timeline: shared movement of all cells per frame", pad=7, fontsize=SZ["title"])
    axB = fig.add_axes([0.53, bot, 0.255, top - bot])
    draw_speed(axB)
    axB.set_title(f"Speed by sequence · {len(sgB):,} segments ≥ 2 h", pad=7, fontsize=SZ["title"])
    axE = fig.add_axes([0.81, bot, 0.15, top - bot])
    draw_endings(axE)
    axE.set_title("How cell segments end", pad=7, fontsize=SZ["title"])
    endings_key(axE, y=-0.165, dy=0.055)
    shift_colorbar(fig, im, [0.125, 0.033, 0.1, 0.009])
    for a, L in [(axA[0], "A"), (axH, "B"), (axC, "C"), (axD, "D"), (axB, "E"), (axE, "F")]:
        badge(fig, a, L, dx=-0.014 if a is not axH else -0.105)
    axH.annotate("MCF10A stage jump at frame 345\n(all 9 fields at once)", xy=(86.4, 4), xytext=(62, 1.3),
                 fontsize=SZ["small"], color=INK, arrowprops=dict(arrowstyle="-", color=INK, lw=0.7),
                 bbox=dict(fc="white", ec="none", alpha=0.85, pad=1))
    axH.annotate("F108 empty until 61 h", xy=(30, 5), xytext=(16, 7.8), fontsize=SZ["small"], color=INK,
                 arrowprops=dict(arrowstyle="-", color=INK, lw=0.7), bbox=dict(fc="white", ec="none", alpha=0.85, pad=1))
    fig.savefig(FIG / "dashboard.png", dpi=220)
    plt.close(fig)
    print("wrote dashboard.png")


def standalone():
    fig, axs = plt.subplots(1, 2, figsize=(10, 4.3))
    draw_map(axs[0], brush=(999, 999), track=-1)
    axs[0].collections[0].set(color=COL["MCF10A"], alpha=0.7, lw=0.6)
    axs[0].set_title("Step 1: correction removes the streaks,\nbut 305 paths still tangle", fontsize=SZ["label"])
    n, nh, ns = draw_map(axs[1])
    axs[1].set_title(f"Step 2: gray context lets {nh} brushed paths\nand lineage 1592 stand out", fontsize=SZ["label"])
    map_key(axs[1], rows=4, y=-0.2, dy=0.075)
    fig.tight_layout()
    fig.savefig(FIG / "rev_map.png", bbox_inches="tight")
    plt.close(fig)

    fig = plt.figure(figsize=(6.4, 4.2))
    g = fig.add_gridspec(2, 2, hspace=0.12, wspace=0.12)
    axs = [fig.add_subplot(g[i // 2, i % 2]) for i in range(4)]
    draw_growth(axs, sel=None)
    for i, a in enumerate(axs):
        if i % 2: a.set_yticklabels([])
        if i < 2: a.set_xticklabels([])
    fig.suptitle("Log₂ axis: MDA-MB-231 F3/F4 and U87 F4 stay flat while MCF10A grows 15–76×",
                 x=0.1, ha="left", fontsize=SZ["label"], fontweight="bold")
    fig.savefig(FIG / "rev_growth.png", bbox_inches="tight")
    plt.close(fig)

    fig = plt.figure(figsize=(9, 4.8))
    ax = fig.add_axes([0.2, 0.17, 0.78, 0.72])
    im = draw_shift(ax, sel=None)
    line_names(fig, ax, x_name=0.01, x_bar=0.135)
    ax.set_title("Stage shifts line up across every field of a cell line", fontsize=SZ["label"])
    shift_colorbar(fig, im, [0.2, 0.04, 0.12, 0.016])
    fig.savefig(FIG / "rev_shift.png", bbox_inches="tight")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(6.4, 4.0))
    draw_tree(ax)
    ax.set_title("Lineage 1592 as a dendrogram: 37 divisions readable without labels", fontsize=SZ["label"])
    fig.savefig(FIG / "rev_tree.png", bbox_inches="tight")
    plt.close(fig)

    fig = plt.figure(figsize=(9, 5.2))
    a0 = fig.add_axes([0.165, 0.12, 0.48, 0.74])
    a1 = fig.add_axes([0.68, 0.12, 0.26, 0.74])
    draw_speed(a0, sel=None)
    a0.set_yticks(range(len(order)), [short(s) for s in order], fontsize=SZ["row"])
    for t, s in zip(a0.get_yticklabels(), order):
        t.set_color(TEXT_COL[line_of(s)])
    line_names(fig, a0, x_name=0.003, x_bar=0.103)
    draw_endings(a1, sel=None)
    endings_key(a1, y=-0.16, dy=0.05)
    a0.set_title("U87 moves fastest, MDA-MB-231 slowest", fontsize=SZ["label"], pad=16)
    a1.set_title("U87 cells mostly leave the image", fontsize=SZ["label"], pad=16)
    fig.savefig(FIG / "rev_speed_end.png", bbox_inches="tight")
    plt.close(fig)

    big = "HEK293T F29"
    t = int(ln[ln.seq == big].sort_values("divisions").track_id.iloc[-1])
    fig, ax = plt.subplots(figsize=(6.4, 5.0))
    n, nh, ns = draw_map(ax, seq=big, track=t, brush=(20, 70))
    ax.set_title(f"Largest sequence ({big}, {n} paths, {int(sq.set_index('seq').rows[big]):,} positions):\n"
                 f"{nh} brushed paths (20–70 px) still stand out", fontsize=SZ["label"])
    map_key(ax, seq=big, rows=2, y=-0.14, dy=0.06)
    fig.savefig(FIG / "rev_map_big.png", bbox_inches="tight")
    plt.close(fig)
    print("wrote standalone revisions", big, t, n, nh)


if __name__ == "__main__":
    dashboard()
    standalone()
