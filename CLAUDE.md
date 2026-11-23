# raphaelbajet.com

The site is a Vite + React app in `vite-project/`.

## Slop Zone text

Every word the Slop Zone shows lives in `vite-project/src/slopText.json`, in the slop editor's format (the `slop-editor` package on npm; full reference: https://github.com/baphaelman/slop-editor). Never write zone text into the JSX. Add it to the JSON and render it by path with `<Words path="..." />` (`components/SlopWords.jsx`), or with `Slop.words(path)` for alt text and labels. The build puts the JSON in the page as the `slop-text` block, so the HTML source never shows it.

- Structure (ids, colors, hrefs, icons, images, thumbs) goes in `vite-project/src/slopProjects.json`; words go in `slopText.json` under the project's id (a game or article goes under `<collection>.<item>`).
- A text is a plain string (an agent's words) or a list of pieces: strings (an agent's), `{"me": "..."}` (Raphael's), `{"ok": "..."}` (an agent's, approved) and `{"data": "..."}` (facts and quotes). Inline markup: `[label](url)`, `**bold**`, `*italic*`.
- Write new text as an agent's, and keep it terse. Only words Raphael dictates word for word go in as `{"me": ...}`. Never reword Raphael's words without asking, and never approve text (`ok`) unless asked.
- When editing the file, bump `version` and keep every `me` and `ok` piece word for word: the editor (`npm run edit`) may be open and saves the whole file.
- Paragraphs are `p1`, `p2`… in `what`, `how` and `role`; an empty section is `{"p1": ""}`.
- Never build UI for adding projects: Raphael adds them by asking an agent.

## Changes to the slop editor itself

The page runs `vite-project/vendor/slop-editor/slop.js`, a copy of the package's with changes not yet published. Make any change to the editor there, and log it in `vite-project/vendor/slop-editor/CHANGES.md`. Raphael ports those to the package (https://github.com/baphaelman/slop-editor) and syncs back, so keep each change self-contained and described well enough to port.
