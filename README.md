# Personal Website
www.raphaelbajet.com

Where I post projects and what I'm working on, but also little things like crosswords or art. Take a gander!

## Editing the Slop Zone's text

The Slop Zone's words are in `vite-project/src/slopText.json`, tracked by the [slop editor](https://www.npmjs.com/package/slop-editor) (who wrote each word: me, an agent, or nobody). The rest of each project (colors, links, pictures) is in `vite-project/src/slopProjects.json`.

```sh
cd vite-project && npm run edit
```

opens the zone with the slop editor's **Edit text** button, which saves into `slopText.json`.
