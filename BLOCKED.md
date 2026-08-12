# BLOCKED.md — current maintenance state

## Product blockers

- None.

## Governance limitation

- GitHub branch protection and repository rulesets are unavailable for this private repository on the current plan. On 2026-08-13, both APIs returned HTTP 403: `Upgrade to GitHub Pro or make this repository public to enable this feature.`
- Until the plan changes, `main` protection is a documented operating rule rather than a GitHub-enforced boundary: use short-lived branches, pull requests, and the Firefox CI before merging; reserve direct `main` pushes for explicitly authorized emergencies.

## Deliberately pending external actions

- The current `main` source is not a newly signed Firefox release.
- The existing signed `1.2.2` XPI predates the accepted source fixes; replacing a permanent installation requires a separately authorized version bump, Mozilla signing, and installation.

These are release-state boundaries, not product defects. A source-branch push does not imply merge, signing, or publication.
