"""Render the Milestone 1 designs (and first Milestone 2 attempts) on the full real data."""
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection

from common import *

gt, pf, sg, ln, sq = load()
order = seq_order(sq)
pf["hours"] = pf.frame_t * 0.25
plt.rcParams.update({"font.size": 10, "axes.titlesize": 10.5})   # these print at ~0.75x in the report


def save(fig, name):
    fig.savefig(FIG / name, bbox_inches="tight")
    plt.close(fig)
    print("wrote", name)


# F1: first Milestone 2 attempt - every growth curve on one chart
fig, ax = plt.subplots(figsize=(6.4, 3.4))
for s in order:
    d = pf[pf.seq == s]
    ax.plot(d.hours, d["count"], color=COL[d.cell_line.iloc[0]], lw=0.9, alpha=0.85)
for l in LINES:
    ax.plot([], [], color=COL[l], label=l)
leg = ax.legend(frameon=False, ncol=4, loc="upper left", fontsize=9)
for t, l in zip(leg.get_texts(), LINES):
    t.set_color(TEXT_COL[l])
ax.set(xlabel="hours", ylabel="cells in frame", title="25 growth curves on one axis: no single sequence can be followed")
save(fig, "fail_spaghetti.png")

# F2: Milestone 1 View A as sketched - shared linear y + mean-movement strip
fig = plt.figure(figsize=(9.5, 5.2))
gs = fig.add_gridspec(8, 9, height_ratios=[3, 1] * 4, hspace=0.25, wspace=0.12)
ymax = pf["count"].max()
for r, l in enumerate(LINES):
    ss = [s for s in order if s.startswith(l + " ")]
    for c, s in enumerate(ss):
        d = pf[pf.seq == s]
        a = fig.add_subplot(gs[2 * r, c])
        a.plot(d.hours, d["count"], color=COL[l], lw=1)
        a.set(ylim=(0, ymax * 1.05), xlim=(0, 96), xticks=[], yticks=[0, 100] if c == 0 else [])
        a.set_title(s.split(" ")[1], fontsize=8.5, fontweight="normal", pad=1)
        b = fig.add_subplot(gs[2 * r + 1, c])
        b.fill_between(d.hours, d.mdisp, color="#777", lw=0)
        b.set(xlim=(0, 96), ylim=(0, 200), xticks=[], yticks=[])
        for sp in b.spines.values():
            sp.set_visible(False)
    fig.text(0.09, 0.84 - r * 0.205, l, color=TEXT_COL[l], fontweight="bold", ha="right", fontsize=9.5)
fig.suptitle("Milestone 1 View A: a shared linear axis flattens slow growers, and each movement spike sits in its own box",
             x=0.12, ha="left", fontweight="bold", fontsize=10)
save(fig, "fail_smallmult_linear.png")

# F3: Milestone 1 View C - raw paths for one sequence
s = "MCF10A F102"
d = gt[gt.seq == s].sort_values("frame_t")
fig, ax = plt.subplots(figsize=(6.4, 4.9))
segs = []
for _, g in d.groupby("segment"):
    if len(g) > 1:
        segs.append(np.c_[g.position_x_t, g.position_y_t])
ax.add_collection(LineCollection(segs, colors=COL["MCF10A"], lw=0.6, alpha=0.7))
ax.set(xlim=(0, IMG_W), ylim=(IMG_H, 0), aspect="equal", xlabel="x (px)", ylabel="y (px)",
       title=f"Raw paths, {s}: the frame-345 stage jump draws fake horizontal streaks\n({len(segs)} cell paths, {len(d):,} positions)")
save(fig, "fail_map_raw.png")

# F4: Milestone 1 View B - box + jittered dot per track, raw mean speed
fig, ax = plt.subplots(figsize=(6.4, 3.2))
rng = np.random.default_rng(1)
for i, l in enumerate(LINES):
    v = sg[sg.cell_line == l].raw_speed.dropna()
    ax.scatter(v, i + rng.uniform(-0.3, 0.3, len(v)), s=4, color=COL[l], alpha=0.5, lw=0)
    ax.boxplot(v, positions=[i], orientation="horizontal", widths=0.6, showfliers=False,
               medianprops=dict(color=INK), boxprops=dict(color=INK), whiskerprops=dict(color=INK), capprops=dict(color=INK))
ax.set_yticks(range(4), LINES)
for t, l in zip(ax.get_yticklabels(), LINES):
    t.set_color(TEXT_COL[l])
ax.invert_yaxis()
ax.set(xlabel="mean step length per segment (px / 15 min, raw)",
       title=f"{sg.raw_speed.notna().sum():,} jittered dots: boxes hide the cloud, and the long tail\nis mostly short or shift-inflated segments")
save(fig, "fail_box_dots.png")

# F5: Milestone 1 View E - direction rose per cell line
fig, axs = plt.subplots(1, 4, figsize=(9.5, 2.9), subplot_kw=dict(projection="polar"))
fig.subplots_adjust(wspace=0.55)
bins = np.linspace(0, 360, 17)
for a, l in zip(axs, LINES):
    v = gt[(gt.cell_line == l)].ANGLE_DEG.dropna()
    h, _ = np.histogram(v, bins)
    a.bar(np.radians(bins[:-1] + 11.25), h / h.sum(), width=np.radians(22.5), color=COL[l], alpha=0.8, edgecolor="white", lw=0.5)
    a.set_title(l, color=TEXT_COL[l], fontsize=10, loc="center", pad=14)
    a.set_yticklabels([])
    a.set_xticks(np.radians([0, 90, 180, 270]), ["E", "N", "W", "S"], fontsize=8.5)
    a.tick_params(axis="x", pad=1)
fig.suptitle("Direction roses (16 bins, share of steps) are nearly round for every cell line",
             x=0.06, y=1.1, ha="left", fontweight="bold", fontsize=10.5)
save(fig, "fail_rose.png")

# F6: Milestone 1 View D - labelled node-link lineage tree for the busiest lineage
s, t = "MCF10A F102", 1592
lay, kids = lineage_layout(gt, s, t)
fig, ax = plt.subplots(figsize=(6.4, 4.2))
for sid, r in lay.iterrows():
    ax.plot([r.x, r.x], [r.f0, r.f1], color=INK, lw=1)
    for c in kids[sid]:
        ax.plot([r.x, lay.x[c]], [r.f1, lay.f0[c]], color=INK, lw=1)
    ax.scatter([r.x], [r.f0], s=40, color="white", edgecolor=INK, zorder=3)
    ax.text(r.x, r.f0, sid.split("#")[1], fontsize=6.5, ha="center", va="bottom")
ax.invert_yaxis()
ax.set(ylabel="frame", xticks=[], title=f"Labeled node-link tree, {s} track {t}: {len(lay)} branches\ncollide below the 4th generation ({int(ln[(ln.seq==s)&(ln.track_id==t)].divisions.iloc[0])} divisions)")
save(fig, "fail_tree.png")
