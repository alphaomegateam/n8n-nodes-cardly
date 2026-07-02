# Cardly n8n Community Node — Design

**Date:** 2026-07-02
**Status:** Approved, ready for implementation planning

## Purpose

A community npm package (`n8n-nodes-cardly`) that lets n8n workflows interact with the
[Cardly API](https://api.card.ly) (v2) — sending physical greeting cards / direct mail,
syncing contacts, reading account/catalogue data, and reacting to Cardly webhook events.

Driving use cases (all four in scope):

1. **Send cards/orders** — place orders and generate previews from workflows.
2. **Sync contacts** — push contacts into Cardly contact lists.
3. **React to events** — start workflows on Cardly webhooks (order sent, undeliverable, change-of-address).
4. **Read data** — pull orders, artwork catalogue, and account balance.

## Key decisions

- **Node style: programmatic** (`execute()` method), not declarative. Chosen for clean
  handling of the deeply nested `orders/place` body, pre-flight validation, friendly error
  mapping, and `loadOptions` dropdowns. End-user panel UX is equivalent to declarative; the
  wins are nicer dropdowns and errors caught before an order is attempted.
- **One order per input item.** Cardly recommends individual orders per recipient, and n8n
  executes once per item. The Place/Preview operations expose a single-recipient form and
  internally wrap it as `lines: [ { … } ]`. Sending to N people = N input items.
- **Distribution:** public npm community package (self-hosted installs). Follow community
  conventions and lint with `eslint-plugin-n8n-nodes-base`. Not targeting Cloud-verified
  initially, so strict declarative-only rules do not bind us.

## API facts (v2)

- Base URL: `https://api.card.ly/v2`
- Auth: header `api-key: <key>`. Test-mode keys are prefixed `test_`.
- Response envelope: `{ state: { status, messages, version }, data: {…} }`.
- Notable status codes: `402` insufficient credit, `422` field validation failures, `404` not found.
- Test/dev API key stored at 1Password reference
  `op://Creative People Inc/Cardly/api_keys_contracts/development_key` (retrieve with
  `op read`, never echo the value).

## Package structure

```
n8n-nodes-cardly/
├── credentials/
│   └── CardlyApi.credentials.ts
├── nodes/
│   └── Cardly/
│       ├── Cardly.node.ts              # programmatic action node
│       ├── CardlyTrigger.node.ts       # webhook trigger node
│       ├── cardly.svg                  # node icon
│       ├── GenericFunctions.ts         # request helper, pagination, loadOptions
│       └── descriptions/
│           ├── OrderDescription.ts
│           ├── ContactDescription.ts
│           ├── ArtworkDescription.ts
│           └── AccountDescription.ts
├── package.json    # n8n.credentials + n8n.nodes manifest
├── tsconfig.json
├── .eslintrc.js    # eslint-plugin-n8n-nodes-base
├── gulpfile.js     # icon build
└── README.md
```

## Component 1 — Credential `cardlyApi`

- Field: **API Key** (string, `typeOptions.password: true`), sent as header `api-key`.
- `baseURL` fixed to `https://api.card.ly/v2`, with an optional override field for future-proofing.
- **Credential test:** `GET /account/balance` (cheap, no credit usage). `/echo` as fallback.

## Component 2 — `Cardly` action node

Programmatic router by `resource` → `operation`, one request per input item, respecting
`continueOnFail`.

### Resources & operations

- **Order**
  - **Place** — single-recipient form wrapped as `lines: [ … ]`. Fields:
    artwork (loadOptions dropdown), template, quantity, recipient
    (firstName/lastName/company/address/address2/city/region/postcode/country),
    optional **sender** collection, **message pages** (fixedCollection of page/text/style),
    **template variables** (key-value), shippingMethod (standard|tracked|express),
    shipToMe, requestedArrival, purchaseOrderNumber.
    - Pre-flight validation: if any sender field is set, all sender fields required;
      region/postcode required-by-country hinting.
  - **Preview** — same form as Place; returns preview PDF URLs + projected credit cost +
    delivery window. Serves as a dry run before Place.
  - **Get** — by order ID.
  - **Get Many** — list with pagination + "Return All" toggle.
- **Contact**
  - **Create** — add contact to a list (list via loadOptions dropdown).
  - **Sync** — upsert by externalId/email.
- **Artwork**
  - **Get Many** — list catalogue; `ownOnly` filter; pagination + "Return All".
- **Account**
  - **Get Balance**.

### loadOptions dropdowns

- Artwork picker (`GET /art`) for order operations.
- Contact-list picker for contact operations.

## Component 3 — `Cardly Trigger` node

Programmatic trigger using n8n `webhookMethods` lifecycle:

- **create** → `POST /webhooks` with the n8n callback URL + selected events; store returned
  `id` + `secret` in node static data.
- **checkExists** → verify the stored webhook still exists.
- **delete** → `DELETE /webhooks/{id}` on workflow deactivation.
- **Events** (multi-select): `contact.order.created`, `contact.order.sent`,
  `contact.undeliverable`, `contact.changeOfAddress`.
- **Signature verification:** validate incoming postbacks against the webhook `secret`
  (HMAC); reject unverified requests. On by default (docs strongly recommend).
- Emits the postback body as the trigger output item.

## Error handling & response shape

- Map the `{ state, data }` envelope to `NodeApiError` / `NodeOperationError`.
- Special cases: **402** → surface required credit vs. current balance; **422** → surface
  the offending field(s) and reason.
- Response unwrapping: return `data` by default, with an option to include the full envelope.

## Testing & tooling

- Live calls against the **test key** (`op read` the dev key).
- Safe-for-automation endpoints: `/account/balance`, `/orders/preview`, `/echo`.
- `/orders/place` exercised manually / gated to avoid unintended credit spend.
- Lint with `eslint-plugin-n8n-nodes-base`; load into a local n8n instance to smoke-test the
  node panel and the trigger registration/postback flow.

## Open items to confirm against the full v2 spec during implementation

These do not change the design; they fill in operation details. Enumerate the complete v2
OpenAPI spec before coding to confirm:

- Contact-list **listing** endpoint (for the list-picker dropdown).
- **Listing contacts** within a list (possible extra Contact "Get Many" operation).
- **Webhook** create/update/delete request+response shapes.
- Whether an **order cancel** operation exists (would add Order → Cancel).
