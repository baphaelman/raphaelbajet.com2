# Note for the agent working on the slop-editor package

The package is /Users/raps/Desktop/Coding/slopometer (npm `slop-editor`, 0.1.0). raphaelbajet.com's Slop Zone runs on it, a React SPA that injects `slop.js`, `slop.css` and the text block at build time (vite-project/vite.config.js). Using it there turned up the items below. Port them to the package, add tests, bump the version and publish. Then raphaelbajet.com deletes `vite-project/vendor/slop-editor/` and goes back to the npm files.

## 1. Port: clicking a field scrolls to its text inside panels that scroll (done in the site's copy)

`diff /Users/raps/Desktop/Coding/raphaelbajet.com/vite-project/node_modules/slop-editor/slop.js /Users/raps/Desktop/Coding/raphaelbajet.com/vite-project/vendor/slop-editor/slop.js`

`mark()` used `window.scrollBy`, so nothing moved on a page whose content scrolls inside its own element. Now it:
- scrolls the nearest scrolling ancestor (new `scroller()`), or the window when there isn't one;
- keeps a top margin of up to 120px, for a header that stays put;
- when a just-revealed text isn't drawn yet, retries for up to 10 frames. A React page draws on the next frame.

## 2. Fix: meters added after `start()` are never built

`start()` builds only the `[data-slop-meter]` elements present at that moment. On an SPA the meter's spot doesn't exist yet, so the site injects a hidden holder into the HTML and moves it into place (components/slop.js, `useMeter`). Build late meters instead: watch for them with a MutationObserver, or expose `Slop.meter(el)`.

## 3. Small API gaps the site worked around

- `Slop.onChange(fn)` returns no unsubscribe. Return one.
- A text rendered without `data-slop` (the site does this for words inside buttons and links) can't be found by the editor. It can't be scrolled to or highlighted. Consider `data-slop-ref` or similar for those copies.
- `Slop.makeup` and `Slop.categories()` are public, but neither is in the README. The site's per-section demo uses both. Document them.

## 4. Feature: a Slop-o-meter per section

The site has a hand-built one in a single card (vite-project/components/SlopZone.jsx, `SlopDemo`, CSS under "the slop editor's premise" in src/App.css): a switch for that card alone, a pie of the card's texts, and a tag per author with its share. Pointing at a tag dims everyone else's words. Proposal for the package:

- **Markup:** `<div data-slop-meter="games.paper-othello">` measures only the texts under that path prefix. A bare `data-slop-meter` stays page-wide.
- **Scope:** the switch colors only the meter's section: the closest `[data-slop-section]`, or the meter's parent. To make that work, scope the colors to an ancestor class instead of `html` only. Today the generated stylesheet writes `html.slop-on .slop-<id>{…}`; write `.slop-on .slop-<id>` and toggle `slop-on` on the section. The page-wide switch keeps toggling it on `<html>`.
- **State:** a section switch starts on whatever the page-wide one is, and is its own once flipped. Only the page-wide choice is remembered (in storage).
- **Tags:** hovering or focusing a tag sets `data-slop-only="<id>"` on the section, and CSS dims the other authors' words. That works for the page-wide meter too.
- **Readers see:** `_show` still decides whether meters show at all. A per-section meter follows it: nothing means none, pie means pie and tags, colors means pie, tags and switch.
- **Editor:** consider a "Section meters" toggle, or leave them to the markup.

## Site conventions worth knowing

- **Approved words are white.** The site shows approved AI words (`ok`) like the author's own, and green only while the colors are on.
- **Data is amber.** Data and quotes are amber (`--slop-data: #e6b45c`), the package's own dark default. The page always sets it, so the zone's pie and text agree.
