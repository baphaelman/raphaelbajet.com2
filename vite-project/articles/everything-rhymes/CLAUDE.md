# Everything Rhymes: Rhyme X-ray tested against chance

A scroll- and arrow-key-driven explainer in the Comma Pump's frame (pinned stage, builds within steps, progress segments). One file, `public/slop/play/everything-rhymes.html`: CSS, markup and inline JS, no build step for the page itself. It runs [Rhyme X-ray](https://github.com/baphaelman/rhyme-xray)'s engine to study rap's Hot Rap Songs #1s, 1989–2019, against random versions of themselves. Written by an agent on 2026-11-24, from the user's brief: use the X-ray as a tool for a new analysis or claim, check that its results hold up, and say what could go back into the X-ray.

## The claims (keep them true)

At the X-ray's defaults, real lyrics get only a bit more color than random copies of themselves (about 57% vs 55% of syllables), and a song's score mostly predicts its random copy's (rank correlation about 0.9). What beats chance is the end of the bar: perfect end rhymes, and multis in the last two syllables. Shuffling a section's own words kills the end-of-bar edge but changes nothing inside the bar, so in there it's word choice, not placement. Perfect multis run about 7× chance. Perfect end rhymes with a different word fell by about two-fifths above chance from 1989–93 to 2014–19, also with every bar counted once; bars that only repeat their last word rose. Near-or-better end rhymes fell much less and shared-vowel ones barely moved: perfect end rhymes gave way to looser ones. MCFlow's hand marks (its 102 songs from 1989–2014) agree: hand-marked end rhyme sits and falls about where the X-ray's Near does (about 78%, 3 vs 4 points a decade, the hand interval taking in zero), and perfect end rhymes fall fastest. The text quotes these as `{vars}` from `#rx-data`; rerun the pipeline below, then reread the text against the new numbers (words like "about as often" or "close to random" are claims too).

## Pipeline (run from this folder)

| Step | What |
|---|---|
| `python3 tools/songs.py` | Wikipedia's Hot Rap Songs #1 lists → `tools/songs.json` (335 songs; committed). |
| `node tools/fetch.mjs` | Lyrics from LRCLIB → `cache/lyrics/` (327 found). **Never commit or publish lyrics**: `cache/` is gitignored, and the page keeps only numbers. |
| `node tools/corpus.mjs [K] [settings…]` | Runs the study (`RX.study`) for every song at `def near perfect ends endsUnique endsNear endsAsso`, K=8 → `cache/results/`, and the word pool → `cache/results/pool.json`. About a minute per setting, run in parallel (one process each). `ER_RESULTS=cache/test ER_LIMIT=24` makes a quick run of 24 evenly spaced songs into another folder (`build.mjs` reads `ER_RESULTS` too). |
| `node tools/mcflow.mjs [K]` | [MCFlow](https://github.com/Computational-Cognitive-Musicology-Lab/MCFlow) (cloned into `cache/MCFlow`; it holds lyrics and has no license, so never commit or publish it): per song, its hand-marked end rhymes and the study at `ends`, `endsNear`, `endsAsso` on its own lines (a line is a `**break` of 3 or more) → `cache/results/mcflow.json`. Needs the pool from `corpus.mjs`. Seconds. |
| `node tools/build.mjs` | Summarises the results into the page's `<script type="application/json" id="rx-data">`: headline means, profiles, eras with bootstrap CIs (perfect, near, shared vowel), the MCFlow summary (no per-song rows: those wait on its author's OK), one row per song, the pool. Every figure on the page comes from there. |
| `tools/render.sh NAME STOP [W,H] [JS]` | Headless Brave screenshot of a stop (`-1`: the appendix), plus a script-error check (`OK` or `ERR …`), into `shots/` (gitignored). The copy inlines the engine and dictionary from `cache/`, shows only the current card, and forces reduced motion. The Slop Zone's `public/slop/everything-rhymes.jpg` and `-light.jpg` are stop 0 at 1600,900, converted with `sips`. |

`tools/rx.mjs` loads, in Node, the engine and dictionary at the exact versions the page loads (its script tag and `DICT_URL`, downloaded once into `cache/`) and the page's own analysis code, `<script id="rx-lib">`. So the study's code lives once, in the page; the "Try a song" panel runs the same `RX.study` the corpus did. Change the method there, then rerun corpus and build.

## The method (`#rx-lib`)

- `RX.bars`: LRC timestamps and inline `[tags]` stripped (`RX.clean`), ad-libs and punctuation dropped, a section that repeats an earlier one word for word dropped. `unique` also drops every bar sung before (`endsUnique`).
- Versions: **real**; **same words, shuffled** (`RX.shuffled`: a section's content words in random content slots); **random sounds** (`RX.swapped`: each distinct content word → one random content word with its stress pattern, by frequency, from the pool). Function words (`RX.STOP`, the engine's list) stay put in both; bar lengths stay; random sounds keeps repeats. Seeded (`RX.rng`): song i uses seed 1000 + i.
- `RX.realRuns`: the X-ray's multis minus those with fewer than two rhyming positions that pair different words (stems: "Monie's" = "Monie"). The X-ray's own rule only drops runs where every word repeats.
- Settings (`RX.SETTINGS`): `def` = the X-ray's defaults (Assonance, a word rhymes with itself, reach 4); `near`; `perfect`; `ends` = perfect without self-rhymes (end rhymes with a different word); `endsNear` and `endsAsso` the same at Near and Assonance. `RX.measure` gives `endPerfect` (bars ending on a perfect rhyme) and `endRhyme` (on any rhyme the setting allows). "Repeats only" per era = `perfect` minus `ends`, real.
- The pool leaves out slurs and the crudest words, so the demos never generate them.

## Text and authorship

This follows the AI-rticles standard in `../CLAUDE.md`. Read it first. Specific to this article:

- Groups `hero`, `xray`, `swap`, `end`, `place`, `strict`, `years`, `try`, `after`, stage text under each group's `stage`. Stage text is rendered with `Slop.html` (`pfTitle`, `yrTitle`, the try verdict) or filled by `data-slop` in the layers; `Slop.reveal` hooks (`showAt`) glide to the slide where each shows.
- All the words are AI text so far. Song titles and the DOOM credit are `data`. Numbers are `{vars}` (`VARS` in the main script, from `#rx-data`), shown as data.
- Labels stay in code: buttons, legends, axis labels, the readout labels, table headers, tooltips, status lines ("X-raying 3 of 48 versions…").
- Edit mode, from `vite-project/`: `npx slop-editor edit public/slop/play/everything-rhymes.html`.

## Stage

Layers: `L-verse` (hero, `xray`, `swap` build 0: the DOOM couplet as the X-ray's ink chips, with Real / Same words, shuffled / Random sounds and New draw), `L-scatter` (`swap` 1–2), `L-profile` (`end`, `place`: rhyme by position from the bar's end), `L-tiers` (`strict`), `L-years` (`years`: perfect end rhymes real and random, above chance, then by strictness), `L-try` (LRCLIB search, then `RX.study` at three settings, live). Charts are SVG drawn at the container's pixel size, redrawn on resize, theme change and text edits; each has a hover tooltip and a Table toggle. Colors: real = categorical slot 1 (blue), shuffled = slot 2 (orange), third series = slot 3 (aqua), random = gray reference. The verse chips use the X-ray's OKLCH recipe and 14 hues.

The live parts need the CMU dictionary (4.7 MB from jsDelivr) and LRCLIB. Everything else works without them.
