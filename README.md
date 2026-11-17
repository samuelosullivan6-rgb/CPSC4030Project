# CellTrack Explorer — CPSC 4030 Final Project

GitHub Pages site for our CPSC 4030 (Fall 2026) final project: an interactive D3.js dashboard for exploring cell
behavior in ground-truth cell-tracking videos (Use Case 1).

Team: Levi Dyer, Mir Patel, Samuel Sullivan

- **Website:** https://samuelosullivan6-rgb.github.io/CPSC4030Project/ 
- **Process book:** `process-book.html`
- **Presentation demo script:** `presentation/demo-script.md`

## Layout

| Path | What it is |
|---|---|
| `index.html` | the dashboard (views A–F) |
| `process-book.html`, `about.html` | process book; project summary + screencast embed |
| `js/main.js` | app state and linking between views |
| `js/views/*.js` | one file per view: growth (A), shift (B), map (C), tree (D), speed (E), endings (F) |
| `data/overview.json` | per-frame series and per-segment table for every sequence |
| `data/seq/*.json` | drift-corrected + raw paths for one sequence, loaded when it is selected |
| `scripts/pipeline/derive.py` | reads the raw ground-truth CSVs and derives per-frame, per-segment and per-lineage tables (stage-shift flags, drift correction, endings) |
| `scripts/pipeline/figs_*.py` | the Milestone 2 static figures (final and failed designs) |
| `scripts/export_data.py` | turns the derived tables into the JSON in `data/` |
| `presentation/` | Milestone 4 demo script |
| `img/process/` | figures for the process book |

## Run locally

The page loads JSON with `fetch`, so it has to be served over HTTP (opening `index.html` as a file won't work):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Rebuild the data

The raw dataset (the `GT/` folder of ground-truth CSVs) is not committed because it is large. By default the
pipeline looks for it in the course's `Milestone 2` folder next to this repo; point it elsewhere with `CELLTRACK_DATA`.

```bash
pip install -r requirements.txt
CELLTRACK_DATA=/path/to/folder/containing/GT python scripts/pipeline/derive.py   # writes scripts/pipeline/derived/
python scripts/export_data.py                                                    # writes data/
```

Running both steps reproduces the committed `data/` files exactly.

## Deploy (GitHub Pages)

Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`**. The site is
served from the repo root; `.nojekyll` turns off Jekyll processing.

## Releasing a change

Browsers (and GitHub Pages, which caches for 10 minutes) can mix old and new JS modules. After changing any JS or CSS,
bump the `?v=` tag everywhere so every file is fetched fresh:

```bash
V=$(date +%Y%m%d%H%M); sed -i '' -E "s/\?v=[0-9a-z]+/?v=$V/g" index.html process-book.html about.html js/main.js js/views/*.js
```
