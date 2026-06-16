# CLAUDE.md

Guidance for AI assistants (Claude Code) working in this repository.

## Project Overview

**SC 過去問道場** ("SC Kakomon Dōjō") is a Japanese-language Progressive Web
App (PWA) for studying past exam questions ("過去問") for the **情報処理安全確保支援士
(Registered Information Security Specialist, "SC")** exam — specifically the
**午前I (Morning I)** multiple-choice section.

It is a flashcard-style quiz app with a spaced-repetition (SRS) scheduler,
local history/stats tracking, manual question entry/import, and optional
Google Drive sync of progress across devices.

## Tech Stack & Architecture

- **No build step, no package manager, no dependencies.** This is a static
  site: `index.html` + JSON data files + a service worker + a web app
  manifest + icons.
- Everything — HTML, CSS, and JavaScript — lives in **one file**:
  `index.html`. The app is a single IIFE that renders different "views" by
  manipulating `innerHTML` of container divs (no framework, no JSX, no
  templating engine).
- Question data is split into per-exam JSON files under `data/`, loaded at
  runtime via `fetch`.
- The app is installable as a PWA (`manifest.webmanifest` + `sw.js` for
  offline caching).
- Optional cloud sync uses **Google Identity Services (GIS)** OAuth +
  **Google Drive `appDataFolder`** to store a small JSON blob of progress and
  custom (user-added) questions.

## Repository Structure

```
.
├── index.html              # Entire app: HTML shell, CSS, and JS (single IIFE)
├── manifest.webmanifest    # PWA manifest (name, theme color, icons)
├── sw.js                   # Service worker: cache-first offline support
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── data/
    ├── index.json          # Manifest listing which question-set files to load
    ├── sc_r3a_am1.json      # R3秋 (Reiwa 3, Autumn) 午前I questions
    ├── sc_r4a_am1.json      # R4秋
    ├── sc_r5h_am1.json      # R5春 (Reiwa 5, Spring)
    ├── sc_r6h_am1.json      # R6春
    └── sc_r7a_am1.json      # R7秋
```

File naming convention for question sets: `sc_r<NN><a|h>_am1.json`
- `r<NN>` = Reiwa year number (e.g. `r7` = Reiwa 7)
- `a` = 秋 (Autumn), `h` = 春 (Haru/Spring)
- `am1` = 午前I (Morning section I)

## Data Model

### `data/index.json`
A manifest listing every dataset file the app should fetch and merge on boot:
```json
{ "datasets": [ { "file": "sc_r3a_am1.json" }, ... ] }
```

### `data/sc_*.json`
```json
{
  "questions": [
    {
      "id": "sc-r7a-am1-q01",        // unique, stable ID — used for dedup/upsert and SRS progress keys
      "section": "午前1",
      "year": "R7秋",
      "exam": "R7秋 午前I 問1",       // display label
      "category": "基礎理論",         // used for category-based study & stats breakdown
      "question": "...",              // plain text, may contain \n (rendered with white-space:pre-wrap)
      "choices": ["...", "...", "...", "..."], // exactly 4 choices (ア/イ/ウ/エ)
      "answer": 1,                    // 0-based index into choices (0=ア,1=イ,2=ウ,3=エ)
      "explanation": "...",           // shown after answering
      "image": "data:...",            // OPTIONAL: base64 data URL for a question diagram
      "calc": true                    // OPTIONAL: marks a question as requiring calculation
    }
  ]
}
```
- `id` format convention: `sc-r<NN><a|h>-am1-q<NN>` (zero-padded question number).
- `answer` is normalized at import time by `normAnswer()` — it also accepts
  1-based numbers or `ア/イ/ウ/エ`/`1-4` strings, but **new bundled data
  files should use 0-based integers** for consistency.
- `image` (if present) is stored separately in IndexedDB/localStorage
  (`kakomon:img:<id>`) and the in-memory question gets `hasImage: true`.
- `calc` (boolean, optional) flags whether a question requires calculation
  ("計算問題"). For the bundled question sets this is **not** stored in the
  JSON; instead a curated `CALC_IDS` set near the top of the script lists the
  IDs of calculation questions, and `isCalcQ(id, raw)` resolves the flag
  (explicit `raw.calc` wins, otherwise membership in `CALC_IDS`, else false).
  Every in-memory question carries a resolved `q.calc` boolean. When adding a
  new dataset, classify each question and add the calc IDs to `CALC_IDS`
  (or set `"calc": true` in the JSON).

## Key Application Concepts (in `index.html`'s `<script>`)

- **Storage**: `jget`/`jset`/`jdel` abstract over `window.storage` (host
  environment hook) → `localStorage` → in-memory fallback (`MEM`). Always use
  these helpers rather than calling `localStorage` directly, so the app keeps
  working when storage is unavailable (e.g. private browsing).
- **State**: `questions` (array, merged bundled + custom), `progress` (map of
  question id → `{attempts:[{t,ok,unknown}], level, due}`), `bundledIds`
  (Set of IDs that came from `data/*.json`, used to exclude them from sync
  payloads and exports-as-custom).
- **SRS scheduler**: `INTERVALS = [0,1,7,30,90]` days. `record()` advances
  `level`/`due` on correct answers and resets to level 0 (+1 day) on
  incorrect/"don't know". `groupOf()` buckets each question into
  0=new, 1=due & previously wrong, 2=due for review, 3=not yet due.
  `buildQueue()` ranks/filters questions for a study session.
- **Session filtering**: `matchFilter(q, f)` supports `section`, `year`,
  single `category`, a `categories` array (multi-select), and `calc`
  (`'yes'`=calc only, `'no'`=non-calc only, `null`=both). The home tab's
  "区分を選んで学習" panel builds a `{categories, calc}` filter from category
  checkboxes plus 計算問題 / 計算以外 checkboxes and starts a session via
  `startSession(filter, true, label)`.
- **Views**: four tabs — ホーム (home/dashboard), 学習 (study/quiz session),
  履歴 (history/log + stats), 問題管理 (manage: sync, import, export, manual
  add, reset). Each has a `render*()` function that rebuilds the view's
  `innerHTML` from scratch — there is no virtual DOM or diffing.
- **Import/upsert**: `upsert(arr)` merges an array of question objects into
  `questions` by `id` (update if exists, add if new), persists to storage,
  and triggers a sync push if enabled.
- **Google Drive sync**: gated by `GOOGLE_CLIENT_ID` (hardcoded OAuth client
  ID near the top of the script). Stores `{schema, updatedAt, deviceId,
  progress, customQuestions, customImages}` as `kakomon-sync.json` in the
  user's Drive `appDataFolder`. `mergeProgress()` does a union-merge of
  attempt logs by timestamp, then recomputes `level`/`due`. Bundled
  (built-in) questions are never pushed/pulled — only `customQuestions`
  (i.e. `id not in bundledIds`).

## Development Workflow

There is no build/test/lint tooling configured. To work on this app:

1. Serve the directory with any static file server (fetches for `data/*.json`
   and the service worker require `http(s)://`, not `file://`):
   ```sh
   python3 -m http.server 8080
   # then open http://localhost:8080/
   ```
2. Edit `index.html` directly — CSS is in the `<style>` block inside
   `#app-root`, JS is in the single `<script>` IIFE at the bottom.
3. After changing data files or `index.html`, hard-refresh / clear the
   service worker cache (or bump `CACHE` in `sw.js`, see below) since the SW
   is cache-first.

There are no automated tests. Manually verify changes in a browser:
- Home tab stats (new/due/accuracy counts) update correctly.
- Starting a session (recommended / by year / by category) and answering
  questions (correct, incorrect, and "分からない / don't know") behaves as
  expected, including re-queueing of missed questions.
- History tab log + stats render correctly.
- Manage tab: import (file and pasted JSON), manual add, export, and reset
  all work.

## Conventions

- **Language**: All user-facing text is Japanese. Keep new UI strings in
  Japanese consistent with the existing tone/terminology.
- **Code style**: The existing JS is intentionally terse/minified-looking
  (short helper names like `el`, `$`, single-letter locals in loops, minimal
  whitespace). Match this style for small edits rather than reformatting
  large blocks — keep diffs minimal and consistent with surrounding code.
- **No external JS libraries** beyond the Google Identity Services script tag
  in `<head>`. Avoid adding new dependencies/CDNs.
- **CSS variables** for theming live in `:root` at the top of the `<style>`
  block (`--primary`, `--ok`, `--ng`, `--due`, `--new`, `--unk`, etc.) — reuse
  these instead of hardcoding new colors.
- **IDs are the source of truth** for dedup/upsert and SRS progress keys.
  Never reuse an existing question `id` for a different question, and never
  change an existing `id` (it would orphan users' SRS progress for that
  question).

## Adding a New Exam Dataset

When adding a new past-exam question set (e.g. a new term's 午前I questions):

1. Create `data/sc_r<NN><a|h>_am1.json` following the schema above, with IDs
   following `sc-r<NN><a|h>-am1-q<NN>`.
2. Add an entry to `data/index.json`'s `datasets` array.
3. Add the new file path to the `ASSETS` array in `sw.js`.
4. Bump the `CACHE` constant in `sw.js` (e.g. `kakomon-v2` → `kakomon-v3`) so
   the service worker picks up the new file and doesn't serve a stale cache
   that's missing it.

## Notes / Gotchas

- `GOOGLE_CLIENT_ID` in `index.html` is a real OAuth client ID tied to this
  app's Drive `appDataFolder` scope — don't remove/replace it casually, and
  don't commit any *other* secrets (API keys, tokens) into this repo.
- The service worker explicitly bypasses caching for `googleapis.com` and
  `accounts.google.com` requests — preserve this when editing `sw.js` so auth
  always hits the network.
- `manifest.webmanifest` and `icons/` define the installable PWA icon set
  (192px and 512px, `any maskable`); update both sizes together if changing
  the app icon.
