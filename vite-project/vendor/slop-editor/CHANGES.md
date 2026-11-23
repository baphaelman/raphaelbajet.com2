# Changes to slop.js not yet in the slop-editor package

`slop.js` here is slop-editor 0.1.0's (from npm), with the changes below. vite.config.js serves it in place of the
package's. Port each change to the package, publish, then delete this folder and point `slopFile` in vite.config.js
back at the package for slop.js too. `diff node_modules/slop-editor/slop.js vendor/slop-editor/slop.js` shows them all.

1. **Clicking a field scrolls the page to its text, even inside a panel that scrolls on its own.** `mark()` used to
   scroll the window only, so on a page whose content scrolls in its own element (the Slop Zone) nothing moved. It now
   scrolls the nearest scrolling ancestor (new `scroller()`), keeps a margin at the top for a header that stays put,
   and, when a just-revealed text isn't drawn yet (React draws on the next frame), retries for up to 10 frames.
