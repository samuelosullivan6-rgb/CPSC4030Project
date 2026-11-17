"""Load every ground-truth CSV and derive per-frame, per-segment, and per-lineage tables.

Writes parquet-free CSVs into build/derived/ so the plotting scripts stay fast.
"""
import glob
import os
from pathlib import Path

import numpy as np
import pandas as pd

# Folder that contains the dataset's GT/ directory. Default: the course "Milestone 2" folder next to this repo.
# Override with:  CELLTRACK_DATA=/path/to/dataset python scripts/pipeline/derive.py
ROOT = Path(os.environ.get("CELLTRACK_DATA", Path(__file__).resolve().parents[3] / "Milestone 2"))
OUT = Path(__file__).resolve().parent / "derived"
OUT.mkdir(exist_ok=True)
LINES = ["MCF10A", "HEK293T", "U87", "MDA-MB-231"]
IMG_W, IMG_H, EDGE = 1224, 904, 25  # px; EDGE = border band for "left image"


def load():
    if not (ROOT / "GT").is_dir():
        raise SystemExit(f"No GT/ folder under {ROOT}. Set CELLTRACK_DATA to the dataset folder.")
    dfs = []
    for f in sorted(glob.glob(str(ROOT / "GT" / "*" / "GT_FLD_*.csv"))):
        d = pd.read_csv(f)
        d["cell_line"] = Path(f).parent.name
        d["fld"] = os.path.basename(f)[3:-4]
        dfs.append(d)
    df = pd.concat(dfs, ignore_index=True)
    df["seq"] = df["cell_line"] + " " + df["fld"].str.replace("FLD_", "F")
    return df


def segments(df):
    """A segment = one cell between birth/entry and division/exit (a branch of a lineage)."""
    df = df.copy()
    out = []
    for s, d in df.groupby("seq", sort=False):
        seg = {}
        nxt = dict(zip(d.cell_id, d.target_spot_id))
        div = dict(zip(d.cell_id, d.IS_DIVISION))
        has_pred = set(d.target_spot_id[d.target_spot_id >= 0])
        sid = 0
        for c in d.sort_values("frame_t").cell_id:
            if c in seg:
                continue
            sid += 1
            cur = c
            while cur in nxt and cur not in seg:
                seg[cur] = f"{s}#{sid}"
                if div[cur]:
                    break
                n = nxt[cur]
                if n < 0:
                    break
                cur = n
        out.append(d.cell_id.map(seg))
    df["segment"] = pd.concat(out)
    return df


MIN_CELLS = 10  # below this, a few cells moving together by chance can look like a shift


def drift_flags(pf):
    """A frame step is a stage shift when (almost) every cell moved the same big amount the same way.

    Rule 1: coherence > 0.9, shared shift > 40 px, and at least MIN_CELLS cells.
    Rule 2 (Milestone 3): stage shifts hit a whole plate at once, so at a frame where most fields of the same
    cell line pass rule 1, a sparser field is also flagged if it passes the coherence and shift tests. Only the
    cell minimum is relaxed: fields that did not move (low coherence or shift) are never flagged by rule 2.
    """
    moved = (pf.coherence > 0.9) & (pf.drift > 40)
    rule1 = moved & (pf["count"] >= MIN_CELLS)
    fields = pf.groupby("cell_line").seq.transform("nunique")
    hits = rule1.groupby([pf.cell_line, pf.frame_t]).transform("sum")
    line_wide = hits >= np.maximum(2, np.ceil(fields / 2))
    rule2 = moved & (pf["count"] < MIN_CELLS) & line_wide
    return rule1 | rule2


def correct(df, pf):
    """Remove flagged stage shifts: subtract the shared step vector from every later position."""
    fl = pf[pf.flag][["seq", "frame_t", "mdx", "mdy"]]
    df = df.merge(fl.rename(columns={"mdx": "sx", "mdy": "sy"}), on=["seq", "frame_t"], how="left")
    df[["sx", "sy"]] = df[["sx", "sy"]].fillna(0.0)
    shift = (fl.sort_values("frame_t").groupby("seq")[["mdx", "mdy"]].cumsum()
               .assign(seq=fl.seq, frame_t=fl.frame_t + 1))
    allf = df[["seq", "frame_t"]].drop_duplicates()
    cum = allf.merge(shift, on=["seq", "frame_t"], how="left").sort_values(["seq", "frame_t"])
    cum[["mdx", "mdy"]] = cum.groupby("seq")[["mdx", "mdy"]].ffill().fillna(0.0)
    df = df.merge(cum.rename(columns={"mdx": "cumx", "mdy": "cumy"}), on=["seq", "frame_t"], how="left")
    df["cx"] = df.position_x_t - df.cumx
    df["cy"] = df.position_y_t - df.cumy
    df["cdisp"] = np.hypot(df.DELTA_X - df.sx, df.DELTA_Y - df.sy)
    df.loc[df.DISPLACEMENT.isna(), "cdisp"] = np.nan
    df["cangle"] = np.degrees(np.arctan2(-(df.DELTA_Y - df.sy), df.DELTA_X - df.sx)) % 360
    return df


def main():
    df = segments(load())

    # --- per sequence summary
    seqs = (df.groupby(["cell_line", "fld", "seq"])
              .agg(rows=("cell_id", "size"), first_frame=("frame_t", "min"), last_frame=("frame_t", "max"),
                   lineages=("track_id", "nunique"), segments=("segment", "nunique"),
                   divisions=("IS_DIVISION", "sum"))
              .reset_index())

    # --- per sequence x frame
    pf = (df.groupby(["cell_line", "seq", "frame_t"])
            .agg(count=("cell_id", "size"), mdx=("DELTA_X", "mean"), mdy=("DELTA_Y", "mean"),
                 mdisp=("DISPLACEMENT", "mean"), meddisp=("DISPLACEMENT", "median"),
                 divs=("IS_DIVISION", "sum"))
            .reset_index())
    pf["drift"] = np.hypot(pf.mdx, pf.mdy)              # length of the average step vector
    pf["coherence"] = pf.drift / pf.mdisp               # 1 = every cell moved the same way
    pf["flag"] = drift_flags(pf)
    pf.to_csv(OUT / "per_frame.csv", index=False)

    df = correct(df, pf)
    df.to_pickle(OUT / "gt_all.pkl")

    # --- per segment (one cell between birth/entry and division/exit)
    g = df.sort_values("frame_t").groupby("segment")
    sg = g.agg(cell_line=("cell_line", "first"), seq=("seq", "first"), track_id=("track_id", "first"),
               f0=("frame_t", "min"), f1=("frame_t", "max"), n=("cell_id", "size"),
               x0=("cx", "first"), y0=("cy", "first"), x1=("cx", "last"), y1=("cy", "last"),
               rx1=("position_x_t", "last"), ry1=("position_y_t", "last"),
               raw_speed=("DISPLACEMENT", "mean"), raw_max=("DISPLACEMENT", "max"),
               path=("cdisp", "sum"), speed=("cdisp", "mean"), maxstep=("cdisp", "max"),
               start=("NODE_TYPE", "first"), life0=("cell_lifecycle", "first"),
               end_status=("FUTURE_STATUS", "last")).reset_index()
    sg["duration_h"] = sg.n * 0.25
    sg["net"] = np.hypot(sg.x1 - sg.x0, sg.y1 - sg.y0)
    sg["straight"] = np.where(sg.path > 0, sg.net / sg.path, np.nan)
    last = seqs.set_index("seq").last_frame
    edge = (sg.rx1 < EDGE) | (sg.rx1 > IMG_W - EDGE) | (sg.ry1 < EDGE) | (sg.ry1 > IMG_H - EDGE)
    sg["ending"] = np.select(
        [sg.end_status.eq("divided"), sg.f1.eq(sg.seq.map(last)), edge],
        ["divided", "until video end", "left image"], "lost mid-image")
    sg.to_csv(OUT / "segments.csv", index=False)

    # --- per lineage (Track_ID)
    ln = (df.groupby(["cell_line", "seq", "track_id"])
            .agg(f0=("frame_t", "min"), f1=("frame_t", "max"), obs=("cell_id", "size"),
                 divisions=("IS_DIVISION", "sum"), branches=("segment", "nunique"),
                 speed=("cdisp", "mean"))
            .reset_index())
    ln["duration_h"] = (ln.f1 - ln.f0 + 1) * 0.25
    ln.to_csv(OUT / "lineages.csv", index=False)

    seqs["mean_speed"] = seqs.seq.map(df.groupby("seq").cdisp.mean())
    seqs["drift_frames"] = seqs.seq.map(pf[pf.flag].groupby("seq").size()).fillna(0).astype(int)
    seqs.to_csv(OUT / "sequences.csv", index=False)
    print(seqs.to_string())
    print("segments", len(sg), "lineages", len(ln), "rows", len(df), "flagged steps", int(pf.flag.sum()))
    print(sg.ending.value_counts())
    print(sg.groupby("cell_line")[["duration_h", "raw_speed", "speed", "straight", "raw_max", "maxstep"]].median())
    print(sg[["raw_max", "maxstep"]].describe())


if __name__ == "__main__":
    main()
