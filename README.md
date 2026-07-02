# n8n-nodes-cardly

[![CI](https://github.com/alphaomegateam/n8n-nodes-cardly/actions/workflows/ci.yml/badge.svg)](https://github.com/alphaomegateam/n8n-nodes-cardly/actions/workflows/ci.yml)

n8n community node for the [Cardly](https://www.card.ly) API — send physical greeting cards / direct mail, sync contacts, read account data, and react to Cardly webhook events.

## Installation

In n8n: **Settings → Community Nodes → Install**, enter `@alphaomega-team/n8n-nodes-cardly`.

Or self-hosted CLI (into your n8n custom nodes folder, e.g. `~/.n8n/nodes`):
```bash
npm install @alphaomega-team/n8n-nodes-cardly
```

Self-hosted without publishing to npm — install straight from the repo or a local build:
```bash
cd ~/.n8n/nodes            # /home/node/.n8n/nodes in Docker; create it if missing
npm install alphaomegateam/n8n-nodes-cardly   # from GitHub
# ...then restart n8n
```

## Credentials

Create a **Cardly API** credential with your API key (Cardly portal → API keys). Test-mode keys are prefixed `test_` and validate requests without performing mutations or spending credit.

## Nodes

### Cardly (action)
- **Order** — Place, Preview, Get, Get Many, Download Preview PDF
- **Contact** — Create, Sync, Update, Delete, Get, Get Many, Find (into a contact list; pick the list from the dropdown)
- **Contact List** — Get Many, Get, Create, Delete
- **Webhook** — Get Many, Get, Create, Update, Delete
- **Artwork** — Get Many, Get
- **Reference** — Get Many for Fonts, Writing Styles, Doodles, Templates, Media
- **Account** — Get Balance, Get Credit History, Get Gift Credit History

Cards are sent one recipient per input item; use previous nodes to fan out to multiple recipients.

### Cardly Trigger
Starts a workflow on subscribed webhook events (order created/sent/refunded, gift-card redeemed, QR scanned, undeliverable, change-of-address, consignment events). The node auto-registers the webhook with Cardly on activation and removes it on deactivation.

## Security notes
- The webhook `secret` is returned by Cardly only once (at creation) and is stored in n8n's workflow static data (unencrypted, as is standard for community trigger nodes).
- **Signature verification is on by default.** Cardly signs each postback as `md5(secret + "." + timestamp + "." + <JSON-encoded data>)` and includes the result in the body's `signatures` array. The Cardly Trigger recomputes this from the stored webhook secret and drops any postback that doesn't match (including postbacks received when no secret is stored — fail-closed). Turn off **Verify Signature** only if you need to accept unverified postbacks.

## Development
```bash
npm install
npm run build
npm run lint
npm test
```

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
