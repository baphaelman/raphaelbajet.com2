---
name: slop-update
description: Refresh the Slop Zone's facts (commits, agents, sessions, agent hours, each card's months, the slop editor's npm version, the Craft PRs) and commit them after one question. Only when the user types /slop-update.
disable-model-invocation: true
argument-hint: "[rescan]"
---

# /slop-update

Quiet: the only text the user sees is the one question and one final line. Work in `vite-project/`.

Everything comes from `scripts/slop-stats.mjs`, which writes `src/slopStats.json`. The cards fill their `{when}`, `{since}`, `{version}`, `{released}`, `{prs}` and PR titles from it (`facts()` in `components/SlopZone.jsx`); no text in `src/slopText.json` changes on a normal run.

Sources: git repos on this machine (commits, months), Claude Code's transcripts (agents, sessions, hours), the npm registry (slop editor version), and `~/Desktop/Coding/oss/craft-prs.json`, which `/craft-fix` rewrites every run (the PRs are as fresh as the last `/craft-fix`).

## 1. Every project is counted

- Each project and collection item id in `src/slopProjects.json` has an entry in `PROJECTS` in `scripts/slop-stats.mjs`. A missing one: add it, its `paths` (what in a session's tool calls points at it) and its `repo` (or `site` for an AI-rticle), in the style of the others.
- Each card's `when` in `src/slopText.json` is `[{"data": "{when}"}]`. A new one that isn't: make it so (bump `version`, keep every `me` and `ok` piece word for word).

## 2. Run

`npm run slop-stats`, or `SLOP_RESCAN=1 npm run slop-stats` with the argument `rescan` or after step 1 changed `PROJECTS` (it places every transcript still on disk again).

Then `npm run build 2>&1 | tail -3`. If it fails, stop: `Build fails: <a few words>.`

## 3. Look

- `git diff --stat src/slopStats.json src/slopText.json scripts`; nothing changed → end with `No change.`
- Note, for the question: which projects changed (the script prints them), the Craft PR states, and the slop editor's version.
- `npm ls slop-editor` older than the version in `slopStats.json`: say so in the question; don't update it.

## 4. Ask, then commit

One AskUserQuestion, no other text: `Slop Zone facts: <what changed, one line>`, options `Commit and push`, `Commit only`, `Discard`.

- **Commit:** `git add` the changed files from step 1–2 (`src/slopStats.json`, `scripts/slopSessions.json`, and any `scripts/slop-stats.mjs`, `src/slopText.json`), commit `Slop Zone: facts as of <today>` with the `Co-Authored-By:` trailer. On `master`, push only with `Commit and push`.
- **Discard:** `git checkout -- src/slopStats.json src/slopText.json scripts/slop-stats.mjs`. Keep `scripts/slopSessions.json`: it holds sessions whose transcripts Claude Code may delete.

Final line: the commit hash and what changed, `No change.`, or why it stopped.
