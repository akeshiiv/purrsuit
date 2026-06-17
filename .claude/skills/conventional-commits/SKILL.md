---
name: conventional-commits
description: Write git commit messages that follow the Conventional Commits specification — correct format AND a description that actually says what changed. Use whenever the user is writing a commit message, describes a code change and wants it phrased as a commit, asks to review/fix/clean up commit messages or git history, is setting up commitlint or a changelog/semver-release pipeline, or mentions "conventional commits", commit format, or commit conventions. Apply even when the user just pastes a diff or describes what they did and asks for "a commit message" without naming the convention.
---

# Conventional Commits

A commit message format that is both human-readable and machine-parseable. The format matters because tools (semantic-release, commitlint, changelog generators) read the type and the breaking-change marker to decide version bumps and generate release notes automatically. But the format is only half the job: a perfectly-formatted commit that says `fix: fix bug` is useless. The goal is a message that tells a future reader **what changed and why** at a glance.

## Format

```
<type>(<scope>): <description>

<optional body>

<optional footer>
```

- `<type>` and `<description>` are required; `(<scope>)` is optional.
- One blank line separates description from body, and body from footer.

## Types

| Type | Use it when you... | Semver effect |
|------|--------------------|---------------|
| `feat` | Add a new feature | MINOR |
| `fix` | Fix a bug | PATCH |
| `perf` | Improve performance without changing behaviour | PATCH |
| `refactor` | Restructure code without changing behaviour | — |
| `docs` | Change documentation only | — |
| `style` | Formatting/whitespace, no logic change | — |
| `test` | Add or update tests | — |
| `build` | Change the build system or dependencies | — |
| `ci` | Change CI/pipeline config | — |
| `chore` | Other maintenance (tooling, config) that doesn't fit above | — |
| `revert` | Revert a previous commit | — |

For a small solo project, collapsing `build`/`ci` into `chore` is fine. On a team that lints commits or auto-generates changelogs, keep them distinct — the categories drive the generated release notes.

**Dependency bumps — pick one and stay consistent.** Default to `build(deps)`, since changelog/release tooling treats `build` as a real category and surfaces upgrades in release notes, whereas `chore` is usually hidden as noise. Downgrade to `chore(deps)` only when the project has no changelog/semver tooling, where the distinction buys nothing. Don't coin-flip between the two — an inconsistent history is the thing to avoid.

## Subject line rules

- **Imperative mood.** Write the description as a command, as if instructing the codebase. Test it against this sentence: *"If applied, this commit will ___."* → `add login page` fits; `added login page` and `adds login page` do not.
- **Aim for ≤50 chars; 72 is the hard ceiling.** 50 is a soft target, not a wall — it's the length that keeps `git log --oneline` readable, so push toward it and trim wording to land under 50 when you reasonably can. Going to 51–72 is acceptable when the change genuinely needs the room; over 72 is never OK. The body is where length belongs.
- **Keep soft or load-bearing numbers out of the subject.** Approximate metrics ("roughly half", "~40% faster") read as exact claims once they're in a terse subject line, which overstates them. Put the precise or hedged figure in the body and keep the subject qualitative: `perf(search): cache compiled regex to cut query latency` + body noting "~50% reduction in local benchmarks" — not `perf(search): cache compiled regex to halve query latency`.
- **Lowercase** everything except proper nouns and identifiers (`Windows`, `OAuth`, `parseUser()`).
- **No trailing period** on the subject line.

## Scope

A short label for the part of the codebase touched — `auth`, `ui`, `db`, `api`, a module, or a filename. It's optional. Use it when it adds clarity; omit it for broad changes that touch everything. Keep it to one or two words.

## Breaking changes

This is the part the tooling cares about most, and the most common omission. Signal a breaking change in **one** of two ways:

1. A `!` after the type/scope: `feat(api)!: drop support for v1 auth tokens`
2. A `BREAKING CHANGE:` footer explaining the break:
```
feat(api): switch session store to Redis

BREAKING CHANGE: SESSION_BACKEND env var is now required.
Deployments without it will fail to start.
```

You can use both. Either one triggers a MAJOR version bump in semver tooling — which is exactly why getting this right matters more than any other formatting detail.

## Writing a description that isn't vague (the part that stops it sounding dumb)

Most "dumb" commits aren't malformed — they're *empty of information*. `fix(auth): fix bug` is perfectly formatted and tells the reader nothing. State the **specific change**, not the fact that a change happened.

| Vague (sounds dumb) | Specific (useful) |
|---------------------|-------------------|
| `fix(auth): fix bug` | `fix(auth): handle null token on session expiry` |
| `feat(ui): updates` | `feat(ui): add quantity selector to product page` |
| `chore: stuff` | `chore(deps): upgrade express to v5.1.0` |
| `refactor: clean up code` | `refactor(parser): extract token validation into helper` |

A good test: could a teammate, reading only the subject line a year from now, tell what this commit did without opening the diff? If not, it's too vague.

## Body and footer

Use the **body** to explain *why*, not *what* — the diff already shows what. Good reasons to add a body: non-obvious motivation, tradeoffs considered, links to context. Wrap body lines at 72 characters.

Use the **footer** for metadata: `BREAKING CHANGE:` notes, issue references (`Closes #123`, `Refs #456`), or `Co-authored-by:` lines.

```
fix(cart): prevent duplicate orders on double-click

The submit handler had no debounce, so a fast double-click fired
two POST requests. Disable the button on first click until the
request resolves.

Closes #284
```

## Examples

```
feat(cart): add quantity selector to product page
fix(auth): prevent login crash on empty password field
perf(search): cache compiled regex to cut query latency
docs(readme): update setup instructions for Windows
build(deps): upgrade express to v5.1.0
ci(github): run test suite on pull requests
refactor(parser): extract token validation into helper
feat(api)!: drop support for v1 auth tokens
```

## Workflow when generating a commit message

When the user describes a change or pastes a diff and wants a commit message:

1. Identify the **type** from what actually changed (new behaviour → `feat`; bug → `fix`; speed only → `perf`; etc.).
2. Pick a **scope** if one part of the codebase is clearly the subject; otherwise omit it.
3. Write the **description** in imperative mood, naming the specific change — not "fix bug".
4. Check for a **breaking change**; if the change alters a public API, config, or contract, add `!` and/or a `BREAKING CHANGE:` footer.
5. Add a **body** only if the *why* isn't obvious from the subject.
6. Verify: imperative mood, aiming ≤50 chars (72 hard max), lowercase, no trailing period, description is specific, no soft metrics in the subject.
