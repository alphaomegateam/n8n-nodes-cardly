# Cardly n8n Community Node — Design

**Date:** 2026-07-02
**Status:** Approved, ready for implementation planning
**Revision:** 2 (incorporates design-review corrections against the Cardly OpenAPI spec)

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
  handling of the nested `orders/place` body, pre-flight validation, friendly error
  mapping, and `loadOptions` dropdowns. End-user panel UX is equivalent to declarative; the
  wins are nicer dropdowns and errors caught before an order is attempted.
- **One order per input item.** Cardly recommends individual orders per recipient, and n8n
  executes once per item. The Place operation exposes a single-recipient form and internally
  wraps it as `lines: [ { … } ]`. Sending to N people = N input items.
- **Distribution:** public npm community package (self-hosted installs). Follow community
  conventions and lint with `eslint-plugin-n8n-nodes-base`. Not targeting Cloud-verified
  initially, so strict declarative-only rules do not bind us.

## API facts (v2)

- Base URL: `https://api.card.ly/v2`
- Auth: header `API-Key: <key>` (case-insensitive). Test-mode keys are prefixed `test_`.
- Response envelope: `{ state: { status: OK|WARN|ERROR, messages, version }, data: {…} }`.
- Notable status codes: `402` insufficient credit (returns required amount), `422` field
  validation failures (keyed by field), `404` not found.
- Send JSON bodies only (their examples use `application/json`); do not send form-encoded bodies.
- **Test-mode behavior:** a `test_` key validates but performs **no mutations** — e.g.
  `POST /orders/place` returns a near-identical response with `testMode: true` and **no order
  is actually placed / no credit spent**. This makes `/orders/place` safe to exercise in
  automated tests. (See Testing for the webhook caveat.)
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

- Field: **API Key** (string, `typeOptions.password: true`), sent as header `API-Key`.
- `baseURL` fixed to `https://api.card.ly/v2`, with an optional override field for future-proofing.
- **Credential test:** `GET /account/balance` (cheap, no credit usage). `/echo` as fallback.

## Component 2 — `Cardly` action node

Programmatic router by `resource` → `operation`, one request per input item, respecting
`continueOnFail`.

### Resources & operations

- **Order**
  - **Place** — single-recipient form wrapped as `lines: [ { … } ]`. Note the body layering:
    - **Per line item:** artwork (loadOptions dropdown), template, quantity, `style`,
      `messages.pages` (fixedCollection of `page`/`text`/`style` — key is `page`, a 1-based
      integer, **not** `name`), `variables` (key-value), recipient
      (firstName/lastName/company/address/address2/**city**/region/postcode/country),
      optional **sender** collection, **shippingMethod** (standard|tracked|express),
      **shipToMe**, **requestedArrival**.
    - **Top-level (order, not line):** `purchaseOrderNumber`.
    - Pre-flight validation: if any sender field is set, all sender fields required
      (API rule: "if any sender element is specified, all must be specified");
      region/postcode required-by-country hinting.
  - **Preview** — same *UI form* as Place but a **different, flat request body** (no `lines`
    array — preview handles a single card, fields at top level). Returns preview PDF URLs
    (`data.preview.urls.card` / `.envelope`; envelope absent for postcards), an `expires`
    timestamp for those links (surface it — links are temporary), projected `creditCost`, and
    delivery window. Serves as a dry run before Place.
  - **Get** — by order ID (`GET /orders/{id}`).
  - **Get Many** — `GET /orders` with `limit`/`offset` pagination + "Return All" toggle.
- **Contact** (address fields differ from Order recipient — see below)
  - **Create** — `POST /contact-lists/{listId}/contacts`. Required: `firstName`, `address`,
    `locality`, `country` (+ conditional `region`/`postcode` by country). **Rejects
    duplicates** on `externalId`/`email`.
  - **Sync** — `POST /contact-lists/{listId}/contacts/sync`. Upserts; requires at least one
    of `externalId`/`email`.
  - Both support optional **custom `fields`** (key-value keyed by Cardly field code — e.g.
    birthday, homepage) via a key-value collection.
  - Contact list chosen via loadOptions dropdown.
- **Artwork**
  - **Get Many** — `GET /art`; `ownOnly` filter; `limit`/`offset` pagination + "Return All".
- **Account**
  - **Get Balance** — `GET /account/balance`.

> **Address field naming:** Order `recipient` uses `city`. Contact endpoints use `locality`
> (and responses return `adminAreaLevel1` for region). The request builders must not share a
> single address shape or contact creation will 422.

### loadOptions dropdowns

- Artwork picker (`GET /art`) for order operations.
- Contact-list picker for contact operations (endpoint to confirm — see open items).

## Component 3 — `Cardly Trigger` node

Programmatic trigger using n8n `webhookMethods` lifecycle:

- **create** → `POST /webhooks` with the n8n callback URL + selected events; store returned
  `id` + `secret` in node static data. (`secret` is returned **only** at creation.)
- **checkExists** → `GET /webhooks/{id}` (returns 404 if the stored hook is gone).
- **delete** → `DELETE /webhooks/{id}` on workflow deactivation.
- **Re-activation / event changes:** Cardly supports `POST /webhooks/{id}` to update in
  place. Prefer update when only the event set changed and we still hold the `secret`; fall
  back to delete+recreate if the secret was lost (recreate is the only way to obtain a fresh
  secret).
- **Events** (multi-select — full v2 enum, 9 events):
  `contact.order.created`, `contact.order.sent`, `contact.order.refunded`,
  `giftCard.redeemed`, `qrCode.scanned`, `contact.undeliverable`,
  `contact.changeOfAddress`, `consignment.undeliverable`, `consignment.changeOfAddress`.
- **Signature verification:** the `secret` is documented as usable to verify postbacks, but
  the OpenAPI spec does **not** specify the header name / HMAC algorithm / signed payload.
  **Do not hard-reject unverified postbacks until the scheme is confirmed** (Cardly prose docs
  or an empirical live-key test) — a wrong guess silently drops every event. Plan: implement
  verification behind a confirmed scheme; ship with a "Verify signature" option that defaults
  to on **only once the mechanism is validated**, otherwise off with a README note.
- Emits the postback body as the trigger output item.

## Error handling & response shape

- Map the `{ state, data }` envelope to `NodeApiError` / `NodeOperationError`.
- Special cases: **402** → surface required credit vs. current balance; **422** → surface
  the offending field(s) and reason.
- Response unwrapping: return `data` by default, with an option to include the full envelope.
- Surface `testMode: true` in outputs when present so users know a call was a no-op.

## Testing & tooling

- Live calls against the **test key** (`op read` the dev key).
- **Non-mutating in test mode**, so safe to exercise automatically: `/account/balance`,
  `/orders/preview`, `/orders/place` (returns `testMode: true`, places nothing), `/echo`,
  and contact Create/Sync.
- **Trigger node needs a live key:** webhook creation and live postbacks presumably no-op
  under a test key, so the create/checkExists/delete lifecycle and signature scheme must be
  validated with a live key. Webhook CRUD itself is free (no credit), but plan the live-key
  test explicitly.
- Lint with `eslint-plugin-n8n-nodes-base`; load into a local n8n instance to smoke-test the
  node panel and the trigger registration/postback flow.
- README note: the webhook `secret` is stored unencrypted in n8n's DB (standard for community
  trigger nodes) — call this out for security-conscious users.

## Shipping-method availability (dropdown hints)

- `standard` — all regions.
- `tracked` — Australia only.
- `express` — Australia and US only.
  Surface these as dropdown descriptions to preempt 422s.

## Open items to confirm against the full v2 spec during implementation

These do not change the architecture; they fill in operation details:

- Contact-list **listing** endpoint (for the list-picker dropdown) — did not surface in spec queries.
- **Listing contacts** within a list (possible extra Contact "Get Many" operation).
- Exact **webhook** create/update request+response field shapes.
- **Signature verification scheme** (header, algorithm, signed payload) — confirm before
  enabling reject-by-default.
- Order cancellation appears to be **portal-only** (no cancel endpoint in v2; `contact.order.refunded`
  exists as an event without a matching cancel operation). No Order → Cancel for v1.
