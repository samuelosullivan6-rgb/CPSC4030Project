"""Export the Milestone 2 derived tables to compact JSON for the D3 site.

Run from the website folder after `Milestone 2/build/derive.py` has produced build/derived/:

    python scripts/export_data.py

Writes:
  data/overview.json      sequences, per-frame series (views A, B) and per-segment table (views E, F)
  data/seq/<slug>.json    one file per sequence: drift-corrected + raw paths and lineage parents (views C, D)
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent.parent
DERIVED = HERE.parent / "Milestone 2" / "build" / "derived"
OUT = HERE / "data"
(OUT / "seq").mkdir(parents=True, exist_ok=True)

LINES = ["MCF10A", "HEK293T", "MDA-MB-231", "U87"]
ENDS = ["divided", "until video end", "left image", "lost mid-image"]
MIN_FRAMES = 8  # segments shorter than 2 h are left out of the speed view (E)


def slug(seq):
    return seq.replace(" ", "_")


def r1(v):
    return [None if pd.isna(x) else round(float(x), 1) for x in v]


def dump(obj, path):
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False))
    print(f"{path.relative_to(HERE)}  {path.stat().st_size / 1024:.0f} KB")


def main():
    gt = pd.read_pickle(DERIVED / "gt_all.pkl")
    pf = pd.read_csv(DERIVED / "per_frame.csv")
    sg = pd.read_csv(DERIVED / "segments.csv")
    sq = pd.read_csv(DERIVED / "sequences.csv")

    sq["num"] = sq.fld.str.replace("FLD_", "").astype(int)
    sq["li"] = sq.cell_line.map(LINES.index)
    sq = sq.sort_values(["li", "num"])
    order = sq.seq.tolist()

    sequences = [dict(seq=r.seq, line=r.cell_line, field=f"F{r.num}", slug=slug(r.seq),
                      first=int(r.first_frame), last=int(r.last_frame), rows=int(r.rows),
                      lineages=int(r.lineages), segments=int(r.segments), divisions=int(r.divisions),
                      shifts=int(r.drift_frames))
                 for r in sq.itertuples()]

    frames = {}
    for s, d in pf.groupby("seq"):
        d = d.sort_values("frame_t")
        frames[s] = dict(
            f=d.frame_t.astype(int).tolist(),
            count=d["count"].astype(int).tolist(),
            # shared movement of all cells in the frame (what view B colors by)
            shift=r1(d.drift * d.coherence.clip(0, 1)),
            dx=r1(d.mdx), dy=r1(d.mdy),
            coh=[None if pd.isna(x) else round(float(x), 2) for x in d.coherence],
            flag=d.frame_t[d.flag].astype(int).tolist())

    sg = sg.sort_values(["seq", "f0"])
    segs = dict(
        id=sg.segment.tolist(), seq=sg.seq.map(order.index).tolist(), track=sg.track_id.astype(int).tolist(),
        f0=sg.f0.astype(int).tolist(), f1=sg.f1.astype(int).tolist(), n=sg.n.astype(int).tolist(),
        speed=r1(sg.speed), straight=[None if pd.isna(x) else round(float(x), 3) for x in sg.straight],
        net=r1(sg.net), ending=sg.ending.map(ENDS.index).tolist())

    dump(dict(lines=LINES, endings=ENDS, minFrames=MIN_FRAMES, order=order, sequences=sequences,
              frames=frames, segments=segs), OUT / "overview.json")

    # ---- per-sequence path files
    ends = sg.set_index("segment").ending
    for s, d in gt.groupby("seq"):
        d = d.sort_values("frame_t")
        cell2seg = dict(zip(d.cell_id, d.segment))
        out = []
        for sid, g in d.groupby("segment", sort=False):
            first = g.iloc[0]
            parent = cell2seg.get(first.PARENT_ID) if first.NODE_TYPE == "daughter_cell" else None
            out.append(dict(
                id=sid, track=int(first.track_id), f0=int(g.frame_t.iloc[0]),
                parent=parent, ending=ENDS.index(ends[sid]),
                speed=None if pd.isna(g.cdisp.mean()) else round(float(g.cdisp.mean()), 1),
                x=r1(g.cx), y=r1(g.cy), rx=r1(g.position_x_t), ry=r1(g.position_y_t)))
        dump(dict(seq=s, segments=out), OUT / "seq" / f"{slug(s)}.json")


if __name__ == "__main__":
    main()
