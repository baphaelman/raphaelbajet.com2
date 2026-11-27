# raphaelbajet.com

The site is a Vite + React app in `vite-project/`.

## Slop Zone text

Every word the Slop Zone shows lives in `vite-project/src/slopText.json`, in the slop editor's format (the `slop-editor` package on npm; full reference: https://github.com/baphaelman/slop-editor). Never write zone text into the JSX. Add it to the JSON and render it by path with `<Words path="..." />` (`components/SlopWords.jsx`), or with `Slop.words(path)` for alt text and labels. The build puts the JSON in the page as the `slop-text` block, so the HTML source never shows it.

- Structure (ids, colors, hrefs, icons, images, thumbs) goes in `vite-project/src/slopProjects.json`; words go in `slopText.json` under the project's id (a game or article goes under `<collection>.<item>`).
- A text is a plain string (an agent's words) or a list of pieces: strings (an agent's), `{"me": "..."}` (Raphael's), `{"ok": "..."}` (an agent's, approved) and `{"data": "..."}` (facts and quotes). Inline markup: `[label](url)`, `**bold**`, `*italic*`.
- Write new text as an agent's, and keep it terse. Only words Raphael dictates word for word go in as `{"me": ...}`. Never reword Raphael's words without asking, and never approve text (`ok`) unless asked.
- When editing the file, bump `version` and keep every `me` and `ok` piece word for word: the editor (`npm run edit`) may be open and saves the whole file.
- Paragraphs are `p1`, `p2`… in `what`, `how` and `role`; an empty section is `{"p1": ""}`.
- Facts that go out of date (a card's months, the slop editor's version, the Craft PRs and their count) are `{when}`, `{version}`, `{released}`, `{prs}`… placeholders, filled from `vite-project/src/slopStats.json`, which `scripts/slop-stats.mjs` writes before every commit (`.githooks/pre-commit`; turn it on in a fresh clone with `git config core.hooksPath .githooks`). Never type them into the text.
- Adding a project: give it an entry in `PROJECTS` in `vite-project/scripts/slop-stats.mjs` (its paths and repo, like the others), its `when` as `[{"data": "{when}"}]`, then run `SLOP_RESCAN=1 npm run slop-stats` from `vite-project/`.
- Never build UI for adding projects: Raphael adds them by asking an agent.

## AI-rticles

The interactive articles the Slop Zone opens are `vite-project/public/slop/play/<name>.html` (`comma-pump`, `single-cycles`, `everything-rhymes`). Those files are the articles: edit them there. Before working on one, read `vite-project/articles/CLAUDE.md` and `vite-project/articles/<name>/CLAUDE.md` (its notes, checks and tools). Edit their text with `npx slop-editor edit public/slop/play/<name>.html` from `vite-project/`.

## Changes to the slop editor itself

The site runs the `slop-editor` package from npm: the zone gets its `slop.js` and `slop.css` inlined by `vite.config.js`, and the AI-rticles link `/slop/slop.js` and `/slop/slop.css`, which it serves from `node_modules`. Change the editor in its own repo (`~/Desktop/Coding/slopometer/`, https://github.com/baphaelman/slop-editor), release it, then `npm update slop-editor` here.
