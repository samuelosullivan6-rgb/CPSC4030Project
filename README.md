# CellTrack Explorer — CPSC 4030 Final Project

GitHub Pages site for our CPSC 4030 (Fall 2026) final project: an interactive D3.js dashboard for exploring cell
behavior in ground-truth cell-tracking videos (Use Case 1).

Team: Levi Dyer, Mir Patel, Samuel Sullivan

- **Website:** https://samuelosullivan6-rgb.github.io/CPSC4030Project/ (after Pages is enabled, see below)
- **Process book:** `process-book.html`

## Layout

| Path | What it is |
|---|---|
| `index.html` | the dashboard (views A–F) |
| `process-book.html`, `about.html` | process book; project summary + screencast embed |
| `js/main.js` | app state and linking between views |
| `js/views/*.js` | one file per view: growth (A), shift (B), map (C), tree (D), speed (E), endings (F) |
| `data/overview.json` | per-frame series and per-segment table for every sequence |
| `data/seq/*.json` | drift-corrected + raw paths for one sequence, loaded when it is selected |
| `scripts/export_data.py` | builds `data/` from the Milestone 2 derived tables |
| `img/process/` | figures for the process book |

## Run locally

The page loads JSON with `fetch`, so it has to be served over HTTP (opening `index.html` as a file won't work):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Rebuild the data

The JSON comes from `Milestone 2/build/derived/` (made by `derive.py`). That folder sits next to this repo on the
author's machine and is not committed, because the raw data is large.

```bash
pip install -r requirements.txt
python scripts/export_data.py
```

## Deploy (GitHub Pages)

Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`**. The site is
served from the repo root; `.nojekyll` turns off Jekyll processing.
