# Everything Rhymes

An interactive article that uses [Rhyme X-ray](https://baphaelman.github.io/rhyme-xray/) as a measuring tool. It runs every Billboard Hot Rap Songs #1 from 1989 to 2019 (325 songs with lyrics) through the X-ray, then runs random versions of each song the same way:

- **Same words, shuffled**: each section's own words in random places.
- **Random sounds**: each word replaced by a random word with the same stress pattern, with the rhythm, the little words and every repeat kept.

What it finds:

1. The X-ray's headline reading (the share of syllables that rhyme) is almost all chance. Random copies score about as high, and a song's score mostly predicts its copy's.
2. What beats chance is the end of the bar: perfect end rhymes, and multisyllabic rhymes in the last two syllables. Inside the bar, real lyrics rhyme about as often as random ones.
3. Shuffling a song's own words erases the end-of-bar edge and leaves the inside of the bar unchanged. End rhymes are placed; whatever beats chance inside the bar comes from which words were chosen.
4. Since 1989, perfect end rhymes above chance have fallen by about two-fifths, even with every bar counted once. Looser end rhymes have mostly held: rappers traded perfect end rhymes for near and slant ones.
5. [MCFlow](https://github.com/Computational-Cognitive-Musicology-Lab/MCFlow)'s hand-marked rhymes agree: by hand, end rhyme sits and falls about where the X-ray's Near does, and perfect end rhymes fall fastest.

It's `public/slop/play/everything-rhymes.html` on the site (`npm run dev`, then `/slop/play/everything-rhymes.html`). The demos run the X-ray in the browser, and **Try a song** tests any song on LRCLIB the same way.

## Who wrote what

Every word on the page is in one JSON block (`#slop-text`), marked as AI-generated, written by me, or data/quotes. The **Slop-o-meter** at the top shows the share of each. To edit the text:

```sh
npx slop-editor edit public/slop/play/everything-rhymes.html   # from vite-project/
```

## Rebuilding the numbers

See `CLAUDE.md`: `tools/songs.py` → `tools/fetch.mjs` → `tools/corpus.mjs` → `tools/mcflow.mjs` → `tools/build.mjs`. Lyrics and MCFlow stay in `cache/` and are never committed; the page holds only the numbers.
