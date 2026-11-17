# Milestone 4 demo script (5 minutes)

Presentation on Dec 1 / Dec 3, 2026. One title slide, then a live demo of
https://samuelosullivan6-rgb.github.io/CPSC4030Project/

**Before you present**
- Open the site in a fresh tab and press Reset, so you start from the default state (MCF10A F102, lineage 1592).
- Backup in case the wifi fails: clone the repo and run `python3 -m http.server 8000` in it, then open http://localhost:8000.
  Also keep a short screen recording of the demo ready.
- Decide who drives the mouse and who talks for each part. The `[Speaker]` slots below are placeholders.
- Every state below can also be opened directly from a URL (listed under each step), if a drag goes wrong live.

---

### 0:00–0:20 · Title slide `[Speaker 1]`
- Who we are. Use Case 1: explore cell behavior.
- 25 ground-truth time-lapse videos, 4 cell lines, about 230,000 annotated cell positions.
- Switch to the live site.

### 0:20–1:30 · Overview: what is going on in all 25 videos? `[Speaker 1]`
- **B (stage shifts):** each row is one video. Dark vertical stripes are moments where *every* cell moved the same
  way at once, which means the microscope stage moved, not the cells.
  - Point at the **9/9** marker: all nine MCF10A fields shift at the same frame (about 86 h). That's a plate-level event.
  - MDA-MB-231 does the same at about 12 h (6/6 fields).
- **A (growth):** log scale, so a straight line means steady exponential growth. Most cultures grow many-fold;
  the **"slow"** labels mark the ones that barely grow (MDA-MB-231 F3/F4, U87 F3/F4).

### 1:30–2:30 · Zoom: one video `[Speaker 2]`
- Click **MCF10A F102** (row label in B, or the Sequence menu). Every view now highlights it in red.
- **C (track map):** 305 cell paths. Tick **raw positions** and drag across B from about 80 to 92 h: long sideways
  streaks are the stage jump dragging every cell. Untick it: our correction removes them.
  - URL: `?win=320,370&raw=1`

### 2:30–3:30 · Filter: which cells are unusual? `[Speaker 2]`
- **E (speed):** one box per video. U87 is clearly the fastest line. Brush **25–70 px / 15 min**: only fast cells stay
  colored in C, mostly one tight group at the right edge of the image.
  - URL: `?brush=25,70`
- **F (endings):** how each cell's track ends. Click the red **lost mid-image** part of a U87 row: C shows only those
  cells, with an ✕ where each one stops. These are possible apoptosis or annotation gaps, not confirmed deaths.
  - URL: `?seq=U87%20F2&track=none&ending=3`

### 3:30–4:30 · Details: one cell family `[Speaker 3]`
- Press Reset: **lineage 1592** opens in D, drawn red in C (any path in C, or the Lineage menu, opens another).
  It is one cell that becomes 76 branches through 37 divisions over 96 h.
- Hover a branch in D: its exact path lights up in C, and its time span is marked on B's row.
- The panel under the tree gives the numbers: 5 branches were lost mid-image.

### 4:30–5:00 · Takeaway `[Speaker 3]`
- `[One sentence: the single most important thing you want the audience to remember.]`
  Suggestion: "Before comparing cell behavior, you have to separate the cells from the microscope. Stage shifts hit
  whole plates at once, and correcting them changes what fast and lost cells look like."
- Questions.

---

**If someone asks…**
- *How do you know it's the stage and not the cells?* A frame is flagged when nearly all cells move the same
  distance in the same direction (coherence > 0.9, shift > 40 px, at least 10 cells). Real cells don't do that together.
- *Is "lost mid-image" death?* Not necessarily. The data has no apoptosis label; a track that stops away from the border
  could be a death or a gap in the annotation.
- *Why px and not microns?* The data has no microns-per-pixel value.
