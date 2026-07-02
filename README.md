# n8n-nodes-cardly

n8n community node for the [Cardly](https://www.card.ly) API — send physical greeting cards / direct mail, sync contacts, read account data, and react to Cardly webhook events.

## Installation

In n8n: **Settings → Community Nodes → Install**, enter `n8n-nodes-cardly`.

Or self-hosted CLI:
```bash
npm install n8n-nodes-cardly
```

## Credentials

Create a **Cardly API** credential with your API key (Cardly portal → API keys). Test-mode keys are prefixed `test_` and validate requests without performing mutations or spending credit.

## Nodes

### Cardly (action)
- **Order** — Place, Preview, Get, Get Many
- **Contact** — Create, Sync (into a contact list; supply the list ID from the portal)
- **Artwork** — Get Many
- **Account** — Get Balance

Cards are sent one recipient per input item; use previous nodes to fan out to multiple recipients.

### Cardly Trigger
Starts a workflow on subscribed webhook events (order created/sent/refunded, gift-card redeemed, QR scanned, undeliverable, change-of-address, consignment events). The node auto-registers the webhook with Cardly on activation and removes it on deactivation.

## Security notes
- The webhook `secret` is returned by Cardly only once (at creation) and is stored in n8n's workflow static data (unencrypted, as is standard for community trigger nodes).
- **Signature verification is off by default.** Cardly's signature scheme (header name / algorithm) is not published in the v2 OpenAPI spec; incoming signature-like headers are passed through on the trigger output as `_signatureHeaders` so you can inspect and verify downstream. Once the scheme is confirmed, enable **Verify Signature**.

## Development
```bash
npm install
npm run build
npm run lint
npm test
```
