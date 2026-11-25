# The Comma Pump

A playable, scroll-driven explainer on musical tuning, in one self-contained HTML file.

It's `public/slop/play/comma-pump.html` on the site (`npm run dev`, then `/slop/play/comma-pump.html`). No build step of its own, no framework, no samples: every note is synthesized with the Web Audio API from exact frequency ratios, and every number on the page is computed from those ratios in the browser.

1. **Pure intervals**: octave, fifth and major third as 2:1, 3:2 and 5:4. Shows both waves, their sum and the overtone ladders, against a piano third that beats.
2. **They don't fit**: twelve fifths overshoot seven octaves by the Pythagorean comma; three thirds fall short of an octave by the diesis.
3. **The comma pump**: I–vi–ii–V–I tuned purely chord to chord, so the tonic sinks by 81/80 each loop. Two alternatives play next to it: keep C fixed (a held note has to jump), or equal temperament (nothing is pure).
4. **Temperaments**: just intonation, Pythagorean, quarter-comma meantone, Werckmeister III and 12-TET. You can play one triad with beat rates and the wolf fifth, or see all twelve major triads around the circle of fifths.
5. **Playground**: a 5-limit lattice (fifths across, thirds up), with clickable notes and triads, a walk along the comma pump, and a tempered comparison.

An appendix lists the intervals, commas and the five tunings note by note.

Keys: `→`/`Space` next, `←` back, `P` play the current example, `S`/`Esc` stop everything.

## Who wrote what

Every word on the page lives in one JSON block in `comma-pump.html` (`#slop-text`), and each word is marked as AI-generated, written by me, or data/quotes. The **Slop-o-meter** at the top shows the share of each, and its switch colors them: AI text in purple, my words in the body ink and data in amber. It's on by default.

To edit the text, run:

```sh
npx slop-editor edit public/slop/play/comma-pump.html   # from vite-project/: opens the article with an "Edit text" button
```

The editor shows every piece of text, grouped by section. Anything typed there becomes mine, and edits show on the page live. Each text, section and the page has a **slop** switch: off approves the AI's words, on takes that back. **Save** (or ⌘S) writes into `comma-pump.html` and bumps the block's `version`. A tab that loaded an older version can't save over newer text: reload it. On the site, the page has no editor. The shared code is the `slop-editor` package (see `../CLAUDE.md`).

## Checks

Requires Brave (headless), Python 3 and the site's `npm install`. Run them from this folder (`articles/comma-pump/`).

```sh
python3 tools/check_numbers.py   # every printed figure vs an independent Python computation
tools/smoke.sh                   # every stop at desktop and phone width, plus all sound paths, for script errors
tools/render.sh NAME STOP [W,H]  # screenshot one stop to shots/NAME.png
```
