# Spend your leftover tokens on review, not more pull requests

Most weeks I end with AI coding quota I never touched. My first idea was a command that points that quota at the Craft issue tracker: pick an unclaimed issue, fix it, open a pull request. I already run one like that myself.

Then I read what the project is actually discussing, and I changed my mind about what the tokens should go to.

## Fixes aren't what's missing

The Craft repositories already get far more pull requests than anyone can review:

- In [photocraft#3561](https://github.com/storytold/photocraft/issues/3561), a contributor counted **172 issues** fixed by pull requests from two or more authors. **148** of those pull requests were closed unmerged. That's wasted work for both the authors and the reviewers who had to compare them.
- A draft of the roles and review capacity RFC ([craft-contrib#9](https://github.com/storytold/craft-contrib/pull/9)) estimates that since October 10, about **1000 more pull requests have been opened than merged every day**. The same thread is debating limits on how many pull requests a person can have open.
- The shared rules for coding agents (RFC-0006) say plainly that much of the pull request volume already comes from coding agents.

Another fixer, however careful, adds to the pile in front of the same few reviewers. The bottleneck is review and triage. Spare tokens can help there without opening a single pull request.

## Four jobs that shrink the queue

Each of these saves a maintainer time and leaves the project with fewer open items, not more.

**1. Is it already fixed?** Many reports come from an older release, while `main` already has the fix, or an open pull request covers it without naming the issue. RFC-0003 asks everyone to check this before starting work. An agent can check it on its own: read recent commits on `main` and search pull requests by keyword. If the issue is fixed, it comments with the link. The triage RFC ([craft-contrib#8](https://github.com/storytold/craft-contrib/pull/8)) proposes an `already fixed` label for exactly this.

**2. Untangle collisions.** When two or three pull requests fix the same issue, someone has to compare them. House rule 6 asks authors to look for a better pull request and close theirs when the other is better or equal. An agent can do that comparison and post it on the issue: which pull requests pass their tests, which one has a test that fails without the fix, and what each one changes that the others don't. The maintainer then makes one decision instead of reading three diffs.

**3. Pre-review a pull request.** House rule 5 lists what to check before opening a pull request: identifiers exist as used, the test fails without the fix, nothing unrelated changed, and the description is true. Each of those can be checked on someone else's pull request too, by actually running things. "I reverted the fix and `test_x` still passes" is something a maintainer can use. "LGTM" isn't. The review is advisory: a person still approves and merges. In the review capacity thread, vangel76 is already drafting a pre-review tool that people run by hand on their own AI accounts. This is the same idea.

**4. Reproduce bug reports.** Confirm the bug on `main` with steps and a version, or report that it doesn't reproduce. Then suggest a difficulty from the triage RFC's proposed labels (`trivial`, `easy`, `medium`, `hard`). That's the work that lets the people who do write fixes pick the right issue.

## How a run would work

The same way my fixer works, because those limits are what keep it from becoming a nuisance:

- **One job per run.** It never loops, polls or waits on CI, and it has a time limit. When the time runs out, it stops and posts nothing.
- **One question before posting.** Nothing goes on GitHub until the person running it answers yes to a single question listing what would be posted.
- **The model picks the job.** A smaller model checks for existing fixes and reproduces bugs. A bigger one does pre-reviews that build and run tests.
- **Only verified findings get posted.** Every claim comes with a link, a command that ran, or its output. If it can't show it, it doesn't say it.

## About not reading the code

I don't read the diffs my agent looks at, and I should say that plainly. That's why the rule about verified findings isn't optional. House rule 1 makes the person running an agent answerable for its review comments, not just its pull requests. A wrong review comment costs the author time to rebut. A comment backed by a test run, a commit link or a reproduction can be checked in seconds, whoever wrote it.

## What could go wrong

**Noise.** A flood of review comments is as bad as a flood of pull requests. The command skips a pull request that already has a pre-review and an issue that already has a "fixed by" link. It posts nothing when it finds nothing.

**Unwanted reviews.** Not every author or maintainer will want an unsolicited pre-review. A label, or a pinned thread per app where reviewers ask for one, would let them opt in.

**Wrong "already fixed" calls.** Closing an issue stays a human decision, as the triage RFC already says. The command only comments with the evidence.

## The ask

Maintainers: which of these four jobs would actually save you time, and where should the results go: a comment, a label, a pinned thread?

Everyone else: next time your week ends with quota left over, pick a job from this list before you open another pull request.
