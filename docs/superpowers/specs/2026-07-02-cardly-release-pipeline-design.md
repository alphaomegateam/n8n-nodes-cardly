# Cardly n8n Node — Release Pipeline (CI/CD) Design

**Date:** 2026-07-02
**Status:** Approved, ready for implementation planning
**Scope:** Sub-project A of two (the other: API parity expansion). Independent of B.

## Purpose

Automate testing and npm publishing for `@alphaomega-team/n8n-nodes-cardly`:
- Run lint + build + tests on every PR and push to `main` (keep `main` green).
- Auto-publish to npm when a version tag is pushed, using OIDC trusted publishing (no
  long-lived npm token stored in GitHub).

## Key decisions

- **Auth: OIDC Trusted Publishing** (not a stored `NPM_TOKEN`). GitHub Actions authenticates
  to npm via short-lived OIDC; build provenance is attached automatically. No leakable
  credential. Requires npm CLI ≥ 11.5.1 and Node ≥ 22.14.0 in the publish job.
- **Trigger: version-tag push** matching `v*.*.*`. The workflow verifies the tag equals
  `package.json`'s version before publishing, so a mistagged release cannot publish.
- **Node versions:** as of mid-2026, Node 18 and 20 are End-of-Life; only 22 (Jod) and 24
  (Krypton) are supported LTS. CI tests on **22 + 24**; the release job uses **24** (its
  bundled npm 11.x satisfies trusted publishing's npm ≥ 11.5.1; Node 22's bundled npm 10.x
  would not, which is why the publish job pins 24).
- **`engines.node` bump:** from the stale `>=18.10` to **`>=22.14.0`**. Note this field
  constrains **consumers** (the n8n host that installs the package), *not* the CI publish
  environment — the two are unrelated. The rationale is to stop advertising support for two
  EOL Node lines, not to match any CI floor. **Consumer impact:** self-hosted n8n instances
  still running Node 18 or 20 will get an npm `EBADENGINE` warning on install (a hard failure
  only under `engine-strict`). Acceptable at 0.1.0 since those lines are EOL, but it is a real
  narrowing, called out here deliberately.

## Preconditions

- **The GitHub repository must be public.** Automatic build provenance on trusted publishing
  is granted only for a public repo publishing a public package; if the repo is ever made
  private, provenance silently stops being attached.
- **No pre-release tags in this iteration.** The `v*.*.*` tag glob also matches
  `v0.2.0-beta.1` (the `*` matches any non-`/` char), and the workflow publishes to the
  `latest` dist-tag unconditionally. Until dist-tag handling is added (out of scope here),
  only push final-release tags. The tag/version guard still protects against tag↔version
  mismatch, but does not distinguish pre-releases.

## Components

### `.github/workflows/ci.yml`
Triggers: `pull_request`, and `push` to `main`.
Concurrency: group per ref with `cancel-in-progress: true` (supersede stale PR runs, save
runner minutes).
Matrix: Node `22` and `24`. `package-manager-cache: false`.
Steps: `actions/checkout@v6` → `actions/setup-node@v6` → `npm ci` → `npm run lint` →
`npm run build` → `npm test`.

### `.github/workflows/release.yml`
Trigger: `push` on tags matching `v*.*.*`.
Permissions: `id-token: write` (OIDC), `contents: read`.
Node: `24`, `registry-url: https://registry.npmjs.org`, `package-manager-cache: false`.
Steps:
1. `actions/checkout@v6`
2. `actions/setup-node@v6` (node 24, registry-url as above)
3. `npm ci`
4. **npm floor assertion:** assert `npm --version` ≥ 11.5.1 (turns a future stale-runner OIDC
   failure into an obvious error). One line; fail fast if not met.
5. **Tag/version guard:** compare `package.json` `version` to the tag with the leading `v`
   stripped (`${GITHUB_REF_NAME#v}`); fail the job with a clear message on mismatch.
6. `npm test` (final gate)
7. `npm publish` — OIDC authenticates; provenance attaches automatically (public repo, see
   Preconditions); no `NODE_AUTH_TOKEN`. `publishConfig.access: public` already makes it
   public. The existing `prepublishOnly` hook (clean build + strict lint) runs as part of
   publish.

Optional hardening (recommended): scope the job to a GitHub **Environment** named `release`
(`environment: release`) with *required reviewers*, and set the same environment in the npm
trusted-publisher config. This inserts a human approval gate before each OIDC publish.

### `package.json`
- Bump `engines.node` to `>=22.14.0`.

## One-time manual setup (maintainer, once)

On npmjs.com → the package → Settings → **Trusted Publisher** → GitHub Actions, with:
- Organization/user: `alphaomegateam`
- Repository: `n8n-nodes-cardly`
- Workflow filename: `release.yml`
- Permission: allow `npm publish`

(Equivalently, `npm trust github @alphaomega-team/n8n-nodes-cardly --repo alphaomegateam/n8n-nodes-cardly --file release.yml --allow-publish`.)

Until this trusted publisher is configured, `npm publish` in CI will not be authorized. This
step is documented in the README's Development/Release section.

## Release ergonomics (documented flow)

```bash
npm version patch        # bumps package.json, creates commit + vX.Y.Z tag
git push --follow-tags   # pushes commit and tag → release.yml publishes
```
No manual `npm publish` after initial setup.

## Access & protection model

Who can trigger a publish, and what protection is warranted:

- **Baseline (inherent to GitHub):** on a public repo, only users with **write access**
  (collaborators / org members with a writing role) can push commits, push tags, or create
  releases to *this* repo. Forks cannot push tags upstream, and `pull_request` runs from forks
  get a read-only `GITHUB_TOKEN` with **no OIDC `id-token` and no secrets** — so an outside PR
  can neither publish nor exfiltrate credentials. This is the primary gate: only write-access
  collaborators can cause a release.
- **Branch protection on `main`** (recommended hygiene, not a publish gate): require `ci.yml`
  to pass and disallow force-pushes; optionally require PR review. Note it does **not** gate
  publishing, because publishing is *tag*-triggered, not `main`-push-triggered.
- **Tag protection (optional):** branch-protection rules do **not** cover tags. To restrict
  who can create `v*` tags, use a repository **ruleset** on the `refs/tags/v*` pattern. Skippable
  for a solo/small-maintainer repo where all collaborators are trusted.
- **Publish approval gate (optional, strongest):** the `release` GitHub Environment with
  required reviewers (see release.yml step 7) forces a manual approval before each OIDC
  publish, even for a write-access collaborator's tag push.

Recommendation for the current solo-maintainer setup: enable basic `main` branch protection
(require CI, no force-push); the environment/tag-ruleset gates are available if the
collaborator set grows.

## Testing

Workflow YAML cannot be meaningfully unit-tested. Verification is the first real tagged
release: after the trusted publisher is configured, a `v0.1.1` patch bump exercises the full
path (guard → build → test → OIDC publish → provenance). CI (`ci.yml`) is self-verifying on
its first PR/push run.

## Out of scope

- GitHub Release creation / changelog automation (tag-only for now).
- Multi-registry / GitHub Packages publishing.
