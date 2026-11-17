"""Shared loading, palette, and layout helpers for the Milestone 2 figures."""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
D = HERE / "derived"
FIG = HERE / "fig"
FIG.mkdir(exist_ok=True)

LINES = ["MCF10A", "HEK293T", "MDA-MB-231", "U87"]
# Mark colors: each >= 3:1 on white; no pair confusable under protan/deutan/tritan (dE >= 15).
COL = {"MCF10A": "#3b6fb6", "HEK293T": "#c06a17", "U87": "#2f8f55", "MDA-MB-231": "#a8397a"}
# Text colors: each >= 4.5:1 on white (and white text on them >= 4.5:1).
TEXT_COL = {"MCF10A": "#3b6fb6", "HEK293T": "#a8601a", "U87": "#267a47", "MDA-MB-231": "#a8397a"}
RED, INK, GRAY = "#c8322b", "#2b2b2b", "#c9c6bf"
DARK_RED = "#7a1410"
# Endings: each >= 3:1 on white, CVD-safe (dE >= 20 in all three conditions).
END_COL = {"divided": "#2e5f8e", "until video end": "#6f95bd", "left image": "#bd8414", "lost mid-image": "#b02a24"}
IMG_W, IMG_H = 1224, 904

plt.rcParams.update({
    "font.family": ["Helvetica Neue", "DejaVu Sans"], "font.size": 8.5, "axes.titlesize": 10, "axes.titleweight": "bold",
    "axes.titlelocation": "left", "axes.spines.top": False, "axes.spines.right": False,
    "axes.edgecolor": "#888", "axes.labelcolor": "#333", "xtick.color": "#555", "ytick.color": "#555",
    "axes.linewidth": 0.7, "xtick.major.width": 0.6, "ytick.major.width": 0.6, "savefig.dpi": 220,
    "figure.facecolor": "white",
})


def seq_order(sq):
    """Sequences grouped by cell line (LINES order), then by field number."""
    sq = sq.copy()
    sq["num"] = sq.fld.str.replace("FLD_", "").astype(int)
    sq["li"] = sq.cell_line.map(LINES.index)
    return sq.sort_values(["li", "num"]).seq.tolist()


def load():
    gt = pd.read_pickle(D / "gt_all.pkl")
    pf = pd.read_csv(D / "per_frame.csv")
    sg = pd.read_csv(D / "segments.csv")
    ln = pd.read_csv(D / "lineages.csv")
    sq = pd.read_csv(D / "sequences.csv")
    return gt, pf, sg, ln, sq


def lineage_layout(gt, seq, track):
    """Return segment boxes for a dendrogram: x = leaf order, y = frames."""
    d = gt[(gt.seq == seq) & (gt.track_id == track)]
    cell2seg = dict(zip(d.cell_id, d.segment))
    segs = d.sort_values("frame_t").groupby("segment").agg(
        f0=("frame_t", "min"), f1=("frame_t", "max"), first_parent=("PARENT_ID", "first"),
        node0=("NODE_TYPE", "first"), status=("FUTURE_STATUS", "last"), speed=("cdisp", "mean"))
    segs["parent"] = [cell2seg.get(p) if n == "daughter_cell" else None
                      for p, n in zip(segs.first_parent, segs.node0)]
    kids = {s: [] for s in segs.index}
    for s, p in segs.parent.items():
        if p in kids:
            kids[p].append(s)
    roots = [s for s, p in segs.parent.items() if p not in kids]
    x, leaf = {}, [0]

    def place(s):
        ch = sorted(kids[s], key=lambda c: segs.f0[c])
        if not ch:
            x[s] = leaf[0]
            leaf[0] += 1
        else:
            for c in ch:
                place(c)
            x[s] = np.mean([x[c] for c in ch])

    for r in sorted(roots, key=lambda r: segs.f0[r]):
        place(r)
    segs["x"] = pd.Series(x)
    return segs, kids
