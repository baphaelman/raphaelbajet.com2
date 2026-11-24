# Single Cycles

An interactive, scroll-driven article in one HTML file: how often does a scrambled Rubik's Cube need no cycle break in a blindfolded (Old Pochmann) edge solve? The answer is 22.65% ≈ e/12, or 13.74% ≈ √e/12 if you also need no flip algorithm.

It's `public/slop/play/single-cycles.html` on the site (`npm run dev`, then `/slop/play/single-cycles.html`). There's no build step of its own; three.js comes from cdnjs. Keys: `→`/`Space` next, `←` back. Drag the cube to turn it.

## Who wrote what

Every word on the page lives in one JSON block in the file (`<script type="application/json" id="slop-text">`), and each piece of text records who wrote it: AI-generated, mine, or data and quotes. The **Slop-o-meter** at the top of the article shows the share of each, and its switch colors the text by author: AI in purple, mine in the body ink, data in amber. It's on by default.

## Edit mode

```sh
npx slop-editor edit public/slop/play/single-cycles.html   # from vite-project/
```

This serves the page's folder locally and opens it with an **Edit text** button. The editor shows every piece of text, grouped by section. What you type there becomes yours, and the rest keeps its author. Each text, section and the page has a **slop** switch: off approves the AI's words, on takes that back. The page updates as you type, and **Save** (or ⌘S) writes into `single-cycles.html`. If the file changed since the page loaded, the save is refused and the page asks you to reload. On the site, the page has no editor.

The shared code is the `slop-editor` package, which the site serves at `/slop/slop.js`. See `../CLAUDE.md`.
