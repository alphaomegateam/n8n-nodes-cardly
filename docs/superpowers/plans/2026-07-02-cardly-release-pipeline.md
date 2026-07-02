# Cardly Release Pipeline (CI/CD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Actions CI (lint/build/test on PRs and `main`) and a tag-triggered npm release workflow that publishes `@alphaomega-team/n8n-nodes-cardly` via OIDC trusted publishing.

**Architecture:** Two workflow files under `.github/workflows/`. `ci.yml` gates code on a Node 22+24 matrix. `release.yml` fires on `v*.*.*` tags, asserts the npm floor and tag↔version match, runs tests, then `npm publish` authenticated by OIDC (no stored token, provenance automatic). README documents the one-time trusted-publisher setup and the release flow.

**Tech Stack:** GitHub Actions (`actions/checkout@v6`, `actions/setup-node@v6`), npm OIDC trusted publishing, Node 24 (publish) / 22+24 (CI).

## Global Constraints

- Package: `@alphaomega-team/n8n-nodes-cardly` (scoped, public). `publishConfig.access: public` already set.
- Publish auth: **OIDC trusted publishing** — NO `NODE_AUTH_TOKEN`, no stored npm token. Provenance attaches automatically (requires the repo to be **public**).
- Trusted publishing floor: npm CLI ≥ 11.5.1, Node ≥ 22.14.0. Publish job pins **Node 24** (bundled npm 11.x qualifies; Node 22's npm 10.x does not).
- CI matrix: Node **22** and **24**. `package-manager-cache: false` in all setup-node steps (no caching in release/CI-publish builds).
- Release trigger: push of a tag matching `v*.*.*`. A tag/version guard fails the job if the tag (minus leading `v`) ≠ `package.json` version.
- No pre-release tags in this iteration (the glob would publish them to `latest`).
- `engines.node` bump to `>=22.14.0` (constrains consumers / n8n hosts; EOL 18/20 dropped deliberately).
- Existing `prepublishOnly` = `npm run build && eslint -c .eslintrc.prepublish.js ...` runs automatically during `npm publish`; do not duplicate a build step before publish.
- Spec of record: `docs/superpowers/specs/2026-07-02-cardly-release-pipeline-design.md`.

---

## File Structure

- `.github/workflows/ci.yml` — lint/build/test matrix on PR + push to main.
- `.github/workflows/release.yml` — tag-triggered OIDC publish with guards.
- `package.json` — `engines.node` bump.
- `README.md` — CI badge + a "Releasing" section (one-time trusted-publisher setup, release flow, branch-protection recommendation, public-repo/no-pre-release notes).

Workflow YAML is not unit-testable. Each task verifies via (a) GitHub Actions workflow-schema
validation with `action-validator`, and (b) local execution of any embedded shell logic
against the real repo. True end-to-end verification is the first PR run and first tagged
release on GitHub (noted for the maintainer, not performed here).

---

### Task 1: CI workflow + engines bump

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` (`engines.node`)

**Interfaces:**
- Consumes: existing npm scripts `lint`, `build`, `test`.
- Produces: a CI workflow named `CI`; `engines.node` = `>=22.14.0`.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ['22', '24']
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node }}
          package-manager-cache: false
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

- [ ] **Step 2: Bump `engines.node` in `package.json`**

Change:
```json
  "engines": { "node": ">=18.10" },
```
to:
```json
  "engines": { "node": ">=22.14.0" },
```

- [ ] **Step 3: Validate the workflow schema**

Run: `npx --yes action-validator .github/workflows/ci.yml`
Expected: exits 0 with no errors (valid GitHub Actions workflow). If `action-validator` cannot be fetched, fall back to a YAML parse: `node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8'); console.log('read ok')"` and visually confirm structure — but prefer action-validator.

- [ ] **Step 4: Confirm the CI commands actually pass locally (the workflow just runs these)**

Run: `npm ci && npm run lint && npm run build && npm test`
Expected: all exit 0; Jest reports 42 passing. (This proves the workflow's steps succeed on this repo.)

- [ ] **Step 5: Confirm the engines bump is valid JSON and present**

Run: `node -p "require('./package.json').engines.node"`
Expected: prints `>=22.14.0`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: add lint/build/test workflow (Node 22+24) and bump engines to >=22.14.0"
```

---

### Task 2: Release workflow (OIDC publish)

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `package.json` `version`; existing `test` script and `prepublishOnly` hook.
- Produces: a workflow named `Release` triggered by `v*.*.*` tags that publishes via OIDC.

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  id-token: write   # OIDC — required for trusted publishing
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    # To add a manual approval gate before publishing, create a GitHub Environment
    # named "release" with required reviewers, set the same environment name in the
    # npm trusted-publisher config, then uncomment the next line:
    # environment: release
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
          package-manager-cache: false

      - run: npm ci

      - name: Assert npm >= 11.5.1 (trusted publishing floor)
        run: |
          npm_ver="$(npm --version)"
          req="11.5.1"
          if [ "$(printf '%s\n%s\n' "$req" "$npm_ver" | sort -V | head -n1)" != "$req" ]; then
            echo "npm $npm_ver is below the required $req for trusted publishing" >&2
            exit 1
          fi
          echo "npm $npm_ver satisfies the >= $req floor"

      - name: Verify tag matches package.json version
        run: |
          tag="${GITHUB_REF_NAME#v}"
          pkg="$(node -p "require('./package.json').version")"
          if [ "$tag" != "$pkg" ]; then
            echo "Tag $GITHUB_REF_NAME (version $tag) does not match package.json version $pkg" >&2
            exit 1
          fi
          echo "Tag matches package.json version $pkg"

      - run: npm test

      - run: npm publish
```

- [ ] **Step 2: Validate the workflow schema**

Run: `npx --yes action-validator .github/workflows/release.yml`
Expected: exits 0, valid workflow. (Fallback YAML parse as in Task 1 Step 3 if the tool can't be fetched.)

- [ ] **Step 3: Verify the npm-floor assertion logic locally (both directions)**

Run:
```bash
req="11.5.1"
for v in 11.10.1 11.5.1 10.9.0; do
  if [ "$(printf '%s\n%s\n' "$req" "$v" | sort -V | head -n1)" != "$req" ]; then echo "$v -> FAIL (below floor)"; else echo "$v -> OK"; fi
done
```
Expected:
```
11.10.1 -> OK
11.5.1 -> OK
10.9.0 -> FAIL (below floor)
```
(Confirms the assertion passes at/above 11.5.1 and fails below it.)

- [ ] **Step 4: Verify the tag/version guard logic locally (match + mismatch)**

Run:
```bash
pkg="$(node -p "require('./package.json').version")"
echo "package.json version: $pkg"
for GITHUB_REF_NAME in "v$pkg" "v9.9.9"; do
  tag="${GITHUB_REF_NAME#v}"
  if [ "$tag" != "$pkg" ]; then echo "$GITHUB_REF_NAME -> MISMATCH (job would fail)"; else echo "$GITHUB_REF_NAME -> match (job would proceed)"; fi
done
```
Expected: the `v<current-version>` line prints `match`; the `v9.9.9` line prints `MISMATCH`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered npm release workflow via OIDC trusted publishing"
```

---

### Task 3: README release documentation + CI badge

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing. Produces: a documented release process for the maintainer.

- [ ] **Step 1: Add a CI badge under the README title**

Insert immediately after the top `# n8n-nodes-cardly` heading line:

```markdown

[![CI](https://github.com/alphaomegateam/n8n-nodes-cardly/actions/workflows/ci.yml/badge.svg)](https://github.com/alphaomegateam/n8n-nodes-cardly/actions/workflows/ci.yml)
```

- [ ] **Step 2: Add a "Releasing" section at the end of `README.md`**

Append:

```markdown
## Releasing (maintainers)

Releases publish to npm automatically via GitHub Actions using **OIDC trusted publishing** —
no npm token is stored in GitHub.

### One-time setup

1. The GitHub repository must be **public** (required for automatic build provenance).
2. On npmjs.com → the `@alphaomega-team/n8n-nodes-cardly` package → **Settings → Trusted Publisher**,
   add a GitHub Actions publisher:
   - Organization/user: `alphaomegateam`
   - Repository: `n8n-nodes-cardly`
   - Workflow filename: `release.yml`
   - Allow: `npm publish`

   (CLI equivalent: `npm trust github @alphaomega-team/n8n-nodes-cardly --repo alphaomegateam/n8n-nodes-cardly --file release.yml --allow-publish`.)
3. (Recommended) Protect `main`: require the `CI` checks to pass and disallow force-pushes.

### Cutting a release

```bash
npm version patch        # or minor / major — bumps package.json, commits, and tags vX.Y.Z
git push --follow-tags   # pushes the commit and the tag
```

The tag push triggers `release.yml`, which verifies the tag matches `package.json`, runs the
tests, and publishes. **Do not push pre-release tags** (e.g. `v1.0.0-beta.1`) — they would
publish to the `latest` dist-tag.

An optional manual approval gate before each publish is available by enabling a `release`
GitHub Environment (see the commented `environment:` line in `release.yml`).
```

- [ ] **Step 3: Verify the README renders and links are consistent**

Run: `node -e "const s=require('fs').readFileSync('README.md','utf8'); if(!s.includes('actions/workflows/ci.yml/badge.svg')) throw new Error('badge missing'); if(!s.includes('Trusted Publisher')) throw new Error('release docs missing'); console.log('README ok')"`
Expected: prints `README ok`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add CI badge and maintainer release/trusted-publishing guide"
```

---

## Notes for the executor

- Do NOT create any git tag or push — the maintainer cuts releases. This plan only adds the
  workflows and docs.
- `action-validator` is fetched via `npx --yes`; it needs network. If unavailable, do the YAML
  parse fallback and note it in the report.
- The workflows' real end-to-end behavior (OIDC publish, matrix runs) can only be confirmed on
  GitHub after the branch is pushed and the trusted publisher is configured — call this out in
  the final report as the remaining manual verification, do not attempt to trigger it.
