# AI-rticles

Interactive explainers the Slop Zone opens, at `/slop/play/<name>.html`. Each article is one HTML file in `public/slop/play/` (`comma-pump.html`, `single-cycles.html`): CSS, markup and inline JS, no build step. That file is the article itself: edit it there, and commit it for the live site. Its notes, checks and tools are in `articles/<name>/` (CLAUDE.md, README.md, `tools/`); read that CLAUDE.md before working on an article. Drafts that aren't on the site yet are here too (`spare-tokens/`).

Moved here from `~/Desktop/Coding/AIrticles` on 2026-11-24 (`comma-pump` was `tuning-explainer/tuning.html`). The old folder is archived as `~/Desktop/Coding/AIrticles-archived`, with The Comma Pump's earlier git history.

## Every article tracks who wrote its words (new articles too)

This is the **slop editor** (the `slop-editor` package on npm; its repo is `~/Desktop/Coding/slopometer/`, installed as the `slop-editor` plugin). Its skill (`slop-editor`) has the full rules for writing text, and its README and ARCHITECTURE.md have the reference.

- **Every article links `/slop/slop.css` and `/slop/slop.js`.** `vite.config.js` serves those from the installed package (`node_modules/slop-editor`), and the build writes them to `dist/slop/`, so `npm update slop-editor` updates every article. Never copy the code into an article. Change the editor in its own repo, release it, then update the package here.
- **A new article:** `public/slop/play/<name>.html` with the two links (copy them from an existing article), a `slop-text` block, and a folder `articles/<name>/` with its CLAUDE.md. Then follow the skill's setup steps.
- **Opening one:** `npm run dev`, then `/slop/play/<name>.html`. Opened straight from disk it has no slop code. `python3 articles/page.py <name> > some.html` writes a copy with the code inlined (the render tools use it), which also works for publishing elsewhere.

**Text in one place.** Every word a reader sees lives in one JSON block, `<script type="application/json" id="slop-text">`. It holds a top-level `"version"`, then one group (object) per section in reading order, with texts keyed `eyebrow`, `title`, `p1`, `p2`, … and stage text under `stage`. Elements get `data-slop="group.key"` and are filled by `Slop.fill()`. Code renders text with `Slop.html(path, vars)` (or `Slop.words(path)` for plain strings). Computed numbers stay computed: a text says `{name}` and the code sets `Slop.vars.name` (`{html, data: true}` for a number, `{html}` for a formula). Only words go in the block. Obvious labels (buttons, axis labels, table headers, pills) stay in code.

**Authorship.** A text is a plain string (AI text) or a list that mixes strings (AI), `{"me": "..."}` (the user's words), `{"ok": "..."}` (AI words the user approved) and `{"data": "..."}` (facts, or other people's words quoted). A list is always one text, never a list of paragraphs. Backticks render with the class set by `Slop.start({code})`.
- Write everything as AI text to start. Whatever the user dictates word for word goes in as `{"me": ...}`.
- Never reword the user's words without asking. If you see a typo, point it out instead of fixing it.
- AI text is terse: use about half the words you'd naturally use.
- Don't approve or un-approve anything unless asked.
- Before the move to the slop editor (2026-11-23), approving AI text made it `me`. So older `me` pieces are the user's typed or approved words, which can't be told apart.

**What readers see.** Both articles set `"_show": "colors"`: the **Slop-o-meter** (`<div data-slop-meter>`, at the top of the first card) shows a pie, the share of each category and a switch that colors the words. It starts on unless the reader turned it off.

**Edit mode** (local only), from `vite-project/`: `npx slop-editor edit public/slop/play/<name>.html` (slop-editor 0.4 or later). It serves that folder on 127.0.0.1, with the package's `slop.js` and `slop.css`, and opens the article with an **Edit text** button; the editor saves into the HTML file when you click Save (or ⌘S). Only that article gets the editor. On the site the page shows no sign of it. `npm run edit` is the Slop Zone's editor: the articles have none there. After an edit the page calls its `Slop.onChange` handlers: each article re-runs there anything built from text or measured from it (stage text, step titles, layout).

**Editing the JSON by hand while the user might be using the editor:** read the file right before each edit, bump `version`, and check that every `"me"` and `"ok"` piece survives word for word (compare their lists before and after).
