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
  (Krypton) are supported LTS. CI tests on **22 + 24**; the release job uses **24**.
- **`engines.node` bump:** from the stale `>=18.10` to **`>=22.14.0`** — drops two EOL
  versions and aligns with the trusted-publishing floor. (Compatibility narrowing, acceptable
  at 0.1.0 since the dropped versions are EOL.)

## Components

### `.github/workflows/ci.yml`
Triggers: `pull_request`, and `push` to `main`.
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
4. **Tag/version guard:** compare `package.json` `version` to the tag with the leading `v`
   stripped (`${GITHUB_REF_NAME#v}`); fail the job with a clear message on mismatch.
5. `npm test` (final gate)
6. `npm publish` — OIDC authenticates; provenance attaches automatically; no
   `NODE_AUTH_TOKEN`. `publishConfig.access: public` already makes it public. The existing
   `prepublishOnly` hook (clean build + strict lint) runs as part of publish.

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

## Testing

Workflow YAML cannot be meaningfully unit-tested. Verification is the first real tagged
release: after the trusted publisher is configured, a `v0.1.1` patch bump exercises the full
path (guard → build → test → OIDC publish → provenance). CI (`ci.yml`) is self-verifying on
its first PR/push run.

## Out of scope

- GitHub Release creation / changelog automation (tag-only for now).
- Multi-registry / GitHub Packages publishing.
