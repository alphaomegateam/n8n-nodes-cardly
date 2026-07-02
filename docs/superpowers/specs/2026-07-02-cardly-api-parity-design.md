# Cardly n8n Node — Full API Parity Design

**Date:** 2026-07-02
**Status:** Approved, ready for implementation planning
**Scope:** Sub-project B of two (the other: release pipeline). Independent of A.
**Builds on:** `docs/superpowers/specs/2026-07-02-cardly-n8n-node-design.md` (v0.1.0).

## Purpose

Expand `@alphaomega-team/n8n-nodes-cardly` from its v0.1.0 subset to full coverage of the
Cardly v2 API surface: complete Contact CRUD, a new Contact List resource (with custom-field
management), Webhook management as action operations, single-artwork Get, and downloading a
preview PDF as binary.

## Operations added (on top of v0.1.0)

- **Contact** (have: Create, Sync) → add **Update, Delete, Get, Get Many, Find**.
  - The `listId` field upgrades from a pasted string to a **live dropdown** backed by
    `GET /contact-lists` (still expression-friendly via n8n's `options` type).
  - Endpoints (all confirmed present in the v2 spec): Update
    `POST /contact-lists/{listId}/contacts/{id}` ("Edit Contact"), Delete
    `DELETE /contact-lists/{listId}/contacts/{id}`, Get `GET .../contacts/{id}`, Get Many
    `GET .../contacts`, **Find** `GET .../contacts/find?query=` (look up by email/externalId —
    the required `query` param; high value since users rarely have raw contact UUIDs).
- **Contact List** *(new resource)* → **Get Many** (`GET /contact-lists`), **Get**
  (`GET /contact-lists/{id}`), **Create** (`POST /contact-lists`), **Delete**
  (`DELETE /contact-lists/{id}`). **No Update operation** — `POST /contact-lists/{id}` does
  **not exist** in the v2 API (verified); a list's name/description cannot be edited via API.
  - **Custom-field management:** the `fields[]` array (name/description/type text|date|number|url)
    on **Create only** (there is no list-update endpoint), exposed as a fixedCollection.
- **Webhook** *(new action resource, separate from the existing Trigger node)* → **Get Many**
  (`GET /webhooks`), **Get** (`GET /webhooks/{id}`), **Create** (`POST /webhooks`), **Update**
  (`POST /webhooks/{id}`), **Delete** (`DELETE /webhooks/{id}`). Create takes `targetUrl`
  (required), the 9-event multiOptions (required), description, metadata. Update **also
  requires `targetUrl`** (the API marks it required even when only toggling state), with
  optional `events`, description, metadata, and `disabled`.
- **Artwork** (have: Get Many) → add **Get** single (`GET /art/{id}`, confirmed).
- **Order** (have: Place, Preview, Get, Get Many) → add **Download Preview PDF**: runs a
  preview and downloads the returned document(s) in one operation (Preview + fetch), because
  the preview URLs carry an `expires` time and a stored URL from a prior run may be dead. It
  posts to `/orders/preview` (reusing `buildPreviewBody`), then fetches `preview.urls.card`
  (and `.envelope` when present) **through the authenticated request path**, emitting n8n
  **binary** data.
- **Account** (have: Get Balance) → add **Get Credit History** (`GET /account/credit-history`)
  and **Get Gift Credit History** (`GET /account/gift-credit-history`) — read-only ledger
  operations (confirm exact paths during planning). **Echo:** not included.
- **Reference** *(new read-only resource)* → **Get Many** for **Fonts** (`GET /fonts`),
  **Writing Styles** (`GET /writing-styles`), **Doodles** (`GET /doodles`), **Templates**
  (`GET /templates`), and **Media/Products** (`GET /media`). Simple list operations that expose
  the IDs used by order `style`/`template` fields. Exact paths confirmed during planning.
  (Not auto-wired as order-field dropdowns in this iteration — noted as a future enhancement.)

## Architectural change — per-resource handler modules

v0.1.0's `Cardly.node.ts` `execute()` is a single `if / else if` chain over ~8 operations.
At ~20 operations this becomes an unmaintainable tangle. Refactor:

- New directory `nodes/Cardly/actions/` with one module per resource:
  `order.ts`, `contact.ts`, `contactList.ts`, `webhook.ts`, `artwork.ts`, `account.ts`,
  `reference.ts`.
  Each exports `execute(this: IExecuteFunctions, operation: string, i: number): Promise<HandlerResult>`
  where `HandlerResult = any | INodeExecutionData[]`. A handler returns **either** plain
  (already-unwrapped) data — which the dispatcher wraps as `{ json, pairedItem }` — **or** one
  or more pre-formed `INodeExecutionData` items, which the dispatcher passes through unchanged.
  This lets the Download Preview PDF handler emit an item with a `binary` key; every other
  handler returns plain data exactly as today.
- `Cardly.node.ts`'s `execute()` becomes a thin per-item loop that dispatches by `resource`
  to the matching module, preserving `continueOnFail()` and the paired-item output shape. The
  dispatcher normalizes the two return shapes: pre-formed `INodeExecutionData[]` are pushed
  as-is (with `pairedItem` set), plain data / arrays are wrapped as before.
- The request layer (`GenericFunctions`), pure builders, and descriptions are untouched by
  the dispatch change; existing account/artwork/order/contact behavior is preserved (verified
  by the existing tests continuing to pass).

This is a bounded refactor that serves the expansion, not a rewrite.

## New / changed components

- **Descriptions:** new `ContactListDescription.ts`, `WebhookDescription.ts`,
  `ReferenceDescription.ts`; extend `ContactDescription.ts` (new ops incl. Find + listId
  dropdown), `ArtworkDescription.ts` (Get), `OrderDescription.ts` (Download Preview PDF),
  `AccountDescription.ts` (credit-history ops).
- **Builders (pure, unit-tested):** new `contactListBuilder.ts` (**create body only** incl.
  `fields[]` — no list-update endpoint exists), `webhookBuilder.ts` (create/update body;
  update mode **requires `targetUrl`** and supports the optional `disabled` flag); extend
  `contactBuilder.ts` with an `update` mode (same required fields as `create`, no
  externalId/email requirement).
- **loadOptions:** add `getContactLists` (maps `GET /contact-lists` results to
  `{name, value}`); keep `getArtwork`.
- **Binary handling:** Download Preview PDF fetches the preview document **through the
  authenticated request path** — the preview URLs are on the API host itself
  (`api.card.ly/v2/preview/{uuid}/card/pdf`), not a pre-signed CDN link, so the `API-Key`
  header may be required. Use `this.helpers.httpRequestWithAuthentication('cardlyApi', …)`
  with `encoding: 'arraybuffer'` (+ `returnFullResponse` for the content-type), normalize the
  returned URL to `https://` (schema examples show `http://`), then `prepareBinaryData`. Emit
  an `INodeExecutionData` with a `binary` key (via the handler-returns-items contract above).
  Surface a clear error if `preview.expires` has passed.

## Address-field consistency (carried from v0.1.0)

Order recipient/sender use `city`; Contact uses `locality`. The new Contact operations
(Update/Get) and the contactList builders must preserve this split. `contactBuilder`'s
`update` mode reuses the `locality` mapping.

## Conventions (carried from v0.1.0)

- Node inputs/outputs use the string `'main'` (installed n8n-workflow rejects
  `NodeConnectionType`). Throws use `NodeOperationError`. Response envelope `{state,data}`
  unwrapped to `data`. Pagination is offset/limit with a "Return All" toggle. Auth via the
  `cardlyApi` credential's `API-Key` header (transport layer owns it).

## Testing

- **Unit tests (TDD):** every new builder (`contactListBuilder`, `webhookBuilder`,
  `contactBuilder` update mode) and every new/changed description (operation lists, field
  scoping, listId dropdown wiring). Per-resource handler modules get focused tests where they
  contain logic beyond straight request assembly.
- **Regression:** the existing 42 tests must stay green after the handler refactor.
- **Live smoke tests (test key):** read ops (contact-list Get Many/Get, contact Get Many/Get,
  contact **Find**, artwork Get, webhook Get Many, account **credit-history**, and each
  **Reference** list — fonts/writing-styles/doodles/templates/media) hit the real API and
  double as confirmation the endpoints exist and their shapes match. Mutating ops
  (contact/contactList/webhook Create/Update/Delete) are safe to exercise because test keys
  validate without mutating. Download Preview PDF is exercised by previewing then fetching the
  returned URL.
- **Pagination check:** the new list endpoints (`GET /contact-lists`, `.../contacts`,
  `/webhooks`) return `{meta, results}` but the OpenAPI spec does not declare `limit`/`offset`
  query params on them (only `/art` has `ownOnly`). `cardlyApiRequestAllItems` sends
  limit/offset anyway; the live smoke tests must specifically confirm pagination behaves on
  these endpoints (they are likely small collections regardless).

## Endpoints (verified against the live v2 spec)

All planned endpoints confirmed present **except one**:
`GET /contact-lists` ✓, `GET /contact-lists/{id}` ✓, `POST /contact-lists` ✓,
`DELETE /contact-lists/{id}` ✓, `GET /contact-lists/{listId}/contacts` ✓,
`GET /contact-lists/{listId}/contacts/{id}` ✓,
`POST /contact-lists/{listId}/contacts/{id}` (edit) ✓,
`DELETE /contact-lists/{listId}/contacts/{id}` ✓, full `/webhooks` CRUD ✓, `GET /art/{id}` ✓.
**`POST /contact-lists/{id}` (update list) does NOT exist** → no Contact List Update operation
(reflected above).

## Scope (confirmed with maintainer)

**In scope:** the core resources (Order incl. Download Preview PDF, Contact full CRUD + Find,
Contact List Get Many/Get/Create/Delete, Webhook CRUD, Artwork Get Many/Get, Account balance),
**plus** the confirmed additions: contact **Find**, account **credit-history** reads, and the
**Reference** read lists (fonts, writing-styles, doodles, templates, media).

## Out of scope

- **Echo** operation; **Order cancel** (no v2 endpoint); **Contact List Update**
  (`POST /contact-lists/{id}` does not exist).
- **Write/admin endpoints, deferred by maintainer decision:** artwork write ops (`POST /art`,
  `POST /art/{id}`, `DELETE /art/{id}` — binary upload), `/users`, `/invitations`, and
  contact delete-by-body (`DELETE /contact-lists/{listId}/contacts`). These exist in the v2
  API; excluding them is a deliberate scope choice (higher effort/risk, less common in
  automation), not an API limitation.
- **Reference lists as order-field dropdowns** (font/writing-style/template loadOptions on the
  order `style`/`template` fields) — a future enhancement; this iteration exposes them only as
  standalone Get Many operations.
