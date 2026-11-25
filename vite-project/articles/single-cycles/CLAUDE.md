# Single Cycles — interactive article

A scroll- and arrow-key-driven explainer: how often does a scrambled Rubik's Cube need no cycle break in a blindfolded (Old Pochmann) edge solve? It began as a rebuild of the user's site article (`components/Articles/ArticleOne.jsx`) and has since diverged a lot (it now leads with the corrected "cuber's" answer). Not ported back to the React site.

- **Live pages:** the site, at `/slop/play/single-cycles.html` (opened from the Slop Zone; it's live once committed to master), and https://claude.ai/artifact/5Lin65kjYuha9nyuLvbxs8 (private Artifact owned by the user, republished on 2026-11-23, version 38, with `capabilities: {}`).
- **Source of truth:** `public/slop/play/single-cycles.html` (one file: CSS, markup, inline JS; three.js r128 from cdnjs). No build step. It lived in `~/Desktop/Coding/AIrticles/single-cycles` until 2026-11-24. The file starts at `<title>`; browsers and the Artifact host wrap it in the doctype/head skeleton. This folder holds its notes and tools; run the tools from here.

## Publishing (read this first)

1. Only publish when the user asks. The live page has no editor, so there's nothing to fold in from it.
2. The site: commit `public/slop/play/single-cycles.html`. The Artifact: the page links `/slop/slop.js`, which an Artifact doesn't have, so publish a copy with the code inlined (`python3 ../page.py single-cycles > shots/publish.html`), with `url` set to the live link and `capabilities: {}`. Publishing without `url` creates a new, separate artifact. Don't.
3. **"(del)" (the user's standing convention):** any text in the `#slop-text` block that contains "(del)" means delete that element from the page, and treat any words after "(del)" as an instruction to carry out. Check for them before each publish. Delete the elements and their block entries, do what the words say, and tell the user what each one was and what was done.

## Files

| Path | What |
|---|---|
| `../../public/slop/play/single-cycles.html` | The whole page. |
| `tools/render.sh` | (renders a copy with slop-editor inlined from `node_modules`, via `../page.py`) Headless Brave screenshot of any scene/build at any moment + script-error check. |
| `tools/stress.py` | Random ←/→ presses over a run of stops (via `drive.py`), checks edges, corners, no flying. |
| `tools/drive.py` | Runs the frame loop synchronously in simulated time and reports the end state (cube pose vs a target, corners, leftover turns, any "flying" fallback). Use it to test animations headless can't finish. |
| `tools/edge_search.py` | Edge-only face-turn search (numpy meet-in-the-middle) used to find the scramble sequences. |
| `tools/check_math.py` | Exact fractions + Monte Carlo for the four numbers. |
| `shots/` | Scratch render output (safe to delete by hand). |

## The math (don't change numbers without re-running `check_math.py`)

Edges only: 12! permutations × 2^11 flip patterns, uniform (corners absorb parity).

| | Question | Exact | ≈ |
|---|---|---|---|
| The answer | buffer (UR) cycle covers every misplaced edge, solved cube excluded = no cycle break | 9864101/43545600 | 22.65% ≈ e/12 |
| The answer | same, and no flipped edge outside it = no break, no flip algorithm | 2042156287/14863564800 | 13.74% ≈ √e/12 |
| First attempt | one cycle anywhere, ignoring flips, solved cube counted | 103447/414720 | 24.94% |
| First attempt | same, counting flips | 4279796117/29727129600 | 14.40% |

The page teaches: the buffer's cycle length is uniform on 1..12 (telescoping "moves on / back to UR" table), and the single-cycle term 1/(k·(12−k)!) (×1/2^(12−k) with flips). The "first attempt" numbers are framed as the user's original, mistaken question (a cycle anywhere), which Claude corrected while building the page.

## Story and slides (19 steps, 4 chapters)

`CHAPTERS` (pills under the progress bar) → first scene of each:
1. **Blindfolded Rubik's Cubing** — `hero` (front page), `pieces` ("The Cube"; b0 outlines a center, edge and corner in their colors, hover for every piece of a kind; b1 outlines the three edge slots nearest the camera in yellow), `homes` (outlines `UF` and `DR` in pink, `NAMES_MARK`, and its `UF`/`DR` chips take the same pink), `scramble` ("Scrambling": 8 builds, one per turn of `DEMO_MOVES` (`SC_AT`, `U' L` share one). b0 `R` on the cube, its arrows drawing out with the turn (`drawTurn`, `turnD`); b1 flattens: the cube shrinks aside and each slot's node peels off it onto a ring beside it (`split` + `peel`, `peeling`); from b2 the ring follows each turn in step with the cube, then traces the new cycles (`makeRingTurns`). The cycles go 4 → 5+2 → 9 → 6+5 (split) → 9 (joined) → 6+5 → 9 → 4+3; the buffer's cycle stays blue, a split-off cycle is orange), `buffer`, `tperm` ("One swap, up close": the real first swap UR ↔ DF, 3 builds: corners color in + setup `D' L2` / T-perm / setup undone), `swaps` (picks up at `SWAPS[1]`, 2 builds: FL, UB), `closed`, `break`. (`rewind`, which proved every scramble is a set of cycles by rewinding the solve, was cut on 2026-11-25: "Scrambling" now shows it forwards.)
2. **The Question** — `ring` ("Back to the ring": flattening is introduced on "Scrambling"; this one fades from the solved cube to `DEMO` as a ring, with the question in a box at the bottom; b1 shows the 8-edge single cycle), `flips` ("First, a wrinkle").
3. **The Answer** — `uniform` ("The buffer's cycle": arrow fan + 1/12 table + live histogram strip, 4 builds), `cuber` ("The answers", ring steps through buffer-cycle lengths).
4. **My First Attempt** — `attempt` (single cycle that skips UR), `count`, `term` ("First answer"), `flipcount`, `full`, `lab` (live simulation of all four), then the `#after` section (tables).

Slide titles in the text above are the code's scene names and older titles. The user retitled some slides ("The Cube", "Names", "Scrambling"), and the block has the current ones.

## Architecture

**Layout.** Text cards (`.step > .card`) left; sticky `.stage` right (on top, 50vh, on phones ≤900px). Stage layers toggled by `.on`: `L-cube` (WebGL canvas + SVG overlay `#ov`), `L-chart`, `L-cancel` (fan + table + histogram strip), `L-lab`. Only the current step's card is visible (`.step.cur .card`). Build pips are bottom-centre (`#pipbar`); slide number + chapters top. The page scroll bar is hidden on purpose.

**Slides.** `S[scene] = {n, f(build, elapsedSec) → spec}`; defaults in `DEF`. Spec fields: `layer`, `state`, `morph` (0 cube → 1 ring), `view {rx, ry}`, `spin`, `labels`, `glow` (+`glowCol`), `focus`, `arrows` (`true` | `'buffer'` | pairs), `tags`, `caption`, `via: 'swaps'`, `chartMode`, `tri`, `poses`, `buf` (UR marker), `slotMark` (names or `'near3'`), `cornerCol`/`cornerSet` (T-perm slide), `fly` (in-place flips), `split`/`tally`/`dimHome`/`heroDone` (front page), `fan` (uniform), `marks` (colored outlines: `{edge}` follows a piece, `{cell: [x, y, z]}` stays put), `track` (pieces marked wherever they go, even mid-turn: a pink outline of the piece's own faces, drawn like the buffer's yellow slot outline (`drawQuads`/`pieceQuads`); `PARTNER`, the edge that starts in DF, on buffer/tperm/swaps). `cornerCol` is 0/1 or a list of corner indices (`TP_CORNERS`: only the two corners the T-perm swaps are colored).

**Edge state.** `{p, fl}` by slot in ring order `POS = UR, UF, UL, UB, FR, FL, BL, BR, DR, DF, DL, DB` (0 = buffer). `p[i]` = home of the piece in slot i; arrows `i → p[i]`. Named states: `SOLVED`, `DEMO` (UR→DF→FL→UB + UF→DR→BR; the second cycle chosen to project cleanly on the cube), `SWAPS`, `BREAK`, `ONE8`, `F1`, `F2`, `TRI`, `CYC4`, `CUB`, `SKIP5`, `OP_SET`, `OP_TP`.

**Cube transitions — no flying pieces.** A change of `spec.state` on the visible cube is exactly one of:
- **Face turns** (`TURNS[key(A)+'>'+key(B)] = {path, from, to}`, `makePath`, `pathSteps`): real layer turns; edges rotate with the layer, corners/centres (`cubies`) follow via `turnNow` and are committed per turn. Paths play either way from any fractional position; pressing ←/→ mid-way reverses or continues from exactly where the cube is; a target off the path but reachable from its end finishes the current turn and plays one merged, reversible path (`pathSegment`). Paths: `OP_PATH`, one line for the opening slides: solved → `DEMO` (`R F2 D L' R' U' L D'`, from `tools/edge_search.py`) → `OP_SET` (setup `D' L2`, DF's edge to UL) → `OP_TP` (T-perm) → `SWAPS[1]` (setup undone = the Old Pochmann swap UR ↔ DF). `OP_AT` holds those five indices; every pair is in `TURNS`, so any target among them is reached by turning along the one path (DEMO→OP_SET has `lead: 0.9` s so the corners color in first). The page warns in the console if the path misses or revisits one of the five states. Plus the front page's scramble chain.
- **Queue, never fly.** If something is playing that can't be turned around onto the new target, `startTransition` sets `pend` to a route (`route()`: BFS over `PATHS` + `TURNS`) and the frame loop plays those hops when the animation lands. Swap steps are never appended to a face-turn animation (that used to crash reversing). The flying fallback (`fly: true` step) is only for unrelated states; `drive.py` counts it as `flyFrames`.
- **Old Pochmann swap demos** (`PATHS`, `via: 'swaps'`): swaps/closed/break; pieces swap directly (`interp`). Checked before face turns.
- **In-place flip** (`fly: true`, flips slide) or **pose demo** (`poses`, flipcount).
- Otherwise a **fade** (`xf`): fade out, snap, fade in. Also used for cube↔ring changes that alter the state.
Corners move physically and are only reset on a snap: `setCubies(spec.cornerSet)` takes the move list from solved (`opCorners(i)` = `OP_PATH` up to `OP_AT[i]`; set on scramble (`OP_MOVES` up to `SC_AT[b]`), buffer, tperm, swaps, closed, break so a fade lands them where the turns would have).

**Turn timing — two standard speeds** (`turnTiming`): `kind: 'scramble'` (front page: 0.05 s/turn, slower ends ×1.5, fast middle ×0.5, smooth easing; `RV`) and `kind: 'present'` (every face-turn sequence in the slides: `PRES` × 0.05 s per turn, **evenly timed**, smooth easing). Every new cube sequence in a slide must use `'present'`. Speeds (the user's pick): `PRES = 8` for slides, `PRES_TP = 3` for the T-perm's 14 moves only, `PRES_SC = 12` for the scramble's 8 (slower, so the ring can follow each turn) (per-move `path.mul`). The scramble's checkpoints (`SC_AT`) are in `TURNS` with `OP_AT` (`OP_STOPS`). Before a slide's turn sequence starts there's a `UI_CLEAR` (0.3 s) hold, and while it turns the overlay's labels/tags/glows are hidden (`turning` in the frame loop); arrows reappear when the pieces land.

**Ring (flattened view).** Same state drawn as 12 nodes (piece colours) with arrows. Ring state changes are choreographed by `makeRingAnim` (old arrows retract, pieces travel straight across lifted with a shadow (`ringMove`), then each cycle is traced arrow by arrow from its first slot, UR if in it, with ripples). Ring arrows are smooth quadratic bends; arrowheads sit near the middle but move off crossings (`arrowGeo`). A glow takes its cycle's colour.

**Front page (`hero`).** `split`: cube one side, ring beside/below (`splitGeo`, `applySplit` via `camera.setViewOffset`). Starts solved for `HERO_DELAY` s each visit, then each scramble is 18 random face turns on top of the last (fresh `Math.random` chain per visit, `newHeroChain`). The ring doesn't follow each turn: `makeRingSpread` moves every piece once over the scramble's duration, then traces cycles. Only the ring shows arrows. Home edges dim (`dimHome`) once settled. Running tally (`TALLY`, localStorage `sc-tally`, per browser, persists across visits) as one bar split by 1/2/3/4+ cycles, plus "no cycle break" vs exact 22.65%. Spins slowly horizontally (`spin: true`). The only other self-moving view is "The buffer", which tilts slowly up/down (16 s); all other slides hold still unless dragged.

**Navigation.** `stops` = every (step, build) + the after section. ←/→ (↑/↓, Space, PageUp/Down, stage keycaps, progress segments, chapter pills) glide-scroll (sine ease); the stage switches to the target stop at once so animation and text move together. Back-run: the first ← steps one build back; consecutive ← jump to the previous slide's last build. Wheel/touch cancels a glide.

## Text and authorship

This follows the AI-rticles standard in `../CLAUDE.md`. Read it first. The parts specific to this article:

- **The block.** `#slop-text` holds one group per scene in reading order (`hero` … `lab`), then `after`. Each group has `title`, `p1`, `p2`, … plus `eyebrow`, `dek`, `note`, `hint` and `question` (the ring slide's box). It also holds that slide's stage text: `caption` or `caption1`… per build, the swap captions (`swaps.swapping`, `break.breaking`, `break.finishing`, `ring.moving`), the stage panel titles (`term.stageTitle`, `uniform.stageTitle`, `lab.stageTitle`), `uniform.fan1`…`fan4`, `uniform.tableRest`, `uniform.histHead` and `lab.stageHint`. Captions are rendered with `Slop.html` in `S[scene].f` (cheap enough per frame) and set with `innerHTML`. Some caption values are filled in: `{slot}`, `{k}`, `{j}` and `{jFact}` show as data.
- **Formulas aren't words.** Inline `<math>` lives in `MATH` (top of the main script) and goes into `Slop.vars` with no data flag, so it takes the color of whoever wrote the `{name}`. Display-math blocks stay in the markup between the paragraphs. Backticks render as `.pos` chips (`Slop.start({code: 'pos'})`).
- **Labels stay in code**, uncolored and out of the block: buttons, keycaps, chapter pills, slot names, cube tags (buffer, home, corner…), chart and legend labels, the answers' "who" labels, table headers and rows, the tally, the lab rows' names and group headers, and the live tickers (`opCap` move lists, "Scramble N: …", "Scrambling: N face turns", "From UR: …", "Flip pattern i of 8").
- **The user's words.** Migrated from the old on-page editor (`#sc-text`) with a word-level diff. Changed words became `{"me": ...}` and unchanged ones stayed AI: `pieces.title` ("The Cube"), `pieces.p1`, `homes.title` ("Names"), `homes.p1`, `homes.p2`, `scramble.title` ("Scrambling"), `scramble.p1`, `tperm.p1`, `uniform.p2` and `hero.note`. `pieces.p2` was a deletion only, so it is all AI. Four sim-row edits were captures of live numbers, not words, and were dropped. "Running tally" was already the label in code.
- **Re-rendering.** `Slop.onChange` (next to the main loop's state) refreshes the segment titles from the headings and redraws the fan note and caption. Scroll positions (`stopY`, the frame loop's step detection) are measured live, so they follow text changes.
- **Captions in the editor.** Each stage caption has a `Slop.reveal` hook (`showAt`, before the main loop): focusing it in the editor glides to its slide and build, and back afterwards. The ones shown only mid-move (`swaps.swapping`, `break.breaking`, `break.finishing`, `ring.moving`) or for a moment (`flips.caption1`) have none. A new caption needs an entry there.
- **Edit mode:** From `vite-project/`: `npx slop-editor edit public/slop/play/single-cycles.html` (it picks a free port from 5178 and prints the link). The page links `/slop/slop.css` and `/slop/slop.js`, which come from the installed `slop-editor` package (see `../CLAUDE.md`). Never copy them into the page.
- **Editing the JSON by hand while the user might be using the editor:** read the file right before each edit, bump `version`, and check that every `"me"` and `"ok"` piece survives word for word. Keep AI text terse: about half the words you'd naturally use. Never reword the user's words without asking. Point out typos instead.

## The user's preferences (keep these)

- American spelling everywhere (center, color, gray, traveled, memorize).
- Smooth, deliberate animation; no jump cuts, no pieces passing through the cube, nothing cut off. No flying pieces between cube states (see above). Cube motion between slides is real face turns or a fade.
- One press = one stage action; stage animation and text scroll start together. Text glides are slow and sine-eased. Only the current card is visible.
- UI (labels, tags, glows) clears before a cube turn sequence between slides and returns after.
- Slides' cube turns are evenly timed (no fast middle); the front page keeps its fast-middle rhythm and its own speed.
- Don't rotate the whole cube between slides. Shared view `V_HOME` for "The Cube"/"Names".
- UR (buffer) is marked by a yellow glow outline on the slot (cube) / ring round the node, from "The buffer" on. Outlines (buffer and tracked pieces) show dashed where a face is turned away, i.e. through the cube.
- Color-coded slot labels (`slotName`: UL = white U, orange L; white/yellow letters get a thin dark outline for the light stage) appear only on the front page's ring, which labels all 12 slots. The user removed them from cube views; other labels stay plain.
- Highlights never overlap: the pink tracked outline fades out as its piece reaches UR (where the yellow buffer outline is) and back in as it leaves.
- The user tried a slow `U'` with a rising camera on "The Cube" b1 and asked to revert it: b1 is the near-three yellow edge outlines, no turn, no camera move.
- Card text for a later build: `data-from="b"` on the element fades it in at that build (`pieces.p3`).
- The user tried a camera that followed the setup turns and asked to undo it: keep the view still on "One swap, up close". "The Cube" b0 outlines one center (pink), edge (yellow, the buffer's) and corner (blue) (`marks`, `PIECE`); the words centers/edges/corners in its first paragraph take those colors (`markChips`, `.kw`; the Slop-o-meter's colors win while on, the user's call). Hovering one of those words, or a piece on the cube (`cubeKind`, raycast; a drag keeps the kind it started on until it ends), outlines every piece of that kind and hides the other kinds' outlines and tags. b1: `slotMark: 'near3'` (follows dragging).
- Dimmed pieces are a flat gray (`DIM_GRAY`), like the corners; centers never dim.
- Highlights take their cycle's colour (orange for the second cycle; orange on "a wrinkle").
- Arrowheads mid-line, kept off crossings; ring arrows smooth.
- Every time cycles are drawn on the ring they're traced from a node (UR if in the cycle).
- Arrows point from a piece to its home everywhere, the scramble included. Cycles *split* and *join*; "break" is kept for the solver's cycle break (itself a swap that joins two cycles).
- The single-cycle example shouldn't look too clean, but no central pile-up.
- Say explicitly that sorting by cycle length is a choice and is what makes counting easy.
- Lead with the real (cuber's) answer; the "first attempt" numbers are framed as the user's original mistake. Front page shows only 22.65% / 13.74%.
- √e uses `mpadded height="0.7em"` inside `msqrt` and `math.sq` (Chrome spacing).

## Testing

- Screenshot a moment: `tools/render.sh NAME "[[0,'swaps',0],[1.0,'swaps',1]]" 1450 [W,H]` → `shots/NAME.png`, prints script errors and console warnings. `PRE="js"` runs code in `<head>` first, for example `document.documentElement.dataset.theme='dark';localStorage.setItem('slop-o-meter','on')`. Cards off the first screen don't show (the page isn't scrolled). To see one, make PRE add a style that hides every other `.step`. Headless runs few animation frames: good for layout and errors, not motion. For settled end states re-shoot the generated `shots/t_NAME.html` with Brave `--force-prefers-reduced-motion`.
- Animation end states: `python3 tools/drive.py NAME "PLAN" TARGET [SECONDS]`, e.g. `python3 tools/drive.py t "[[0,'buffer',0],[0.5,'tperm',0],[5,'tperm',1],[9,'tperm',2]]" "SWAPS[1]" 14 "opCorners(4)"` should print `near: true, corners: true, flyFrames: 0, turnNow: false` (5th arg: corners must match that move list). Smoke-test all scenes by looping it over every scene name.
- Back-and-forth stress: `python3 tools/stress.py "scramble:0,buffer:0,tperm:0,tperm:1,tperm:2,swaps:0,swaps:1,closed:0" 14 SEED` (random presses, many mid-animation; ~30 s a run). Must print all ok.
- Mid-animation values: `PROBE="[cur.rx, cur.ry]" python3 tools/drive.py ...` adds `probe` to the output. Headless screenshots of a drive file show the overlay only (WebGL canvas comes out blank).
- Seed the front-page tally in a test copy by replacing `localStorage.getItem('sc-tally') || 'null'` with a JSON literal.
- Phone: pass `500,860`.
- Headless Brave sometimes hangs: run it with a kill-after loop (see how `drive.py` uses a timeout).
- `python3 tools/check_math.py` after touching any number.
- `node` is installed (for the edit server); there is no `timeout`; `pip install` was blocked (use numpy, already installed).
- Editor test without touching the file: copy the page into a temp folder and run `npx slop-editor edit <copy> --port 5190 --no-open` (from `vite-project/`, so it's the site's slop-editor). Headless dump-dom fires no rAF, so drive `requestAnimationFrame` from timers in a test copy.

## Open threads

- Not ported to the React site. Real-device mobile and real-browser smoothness are only checked by the user, not headless.
