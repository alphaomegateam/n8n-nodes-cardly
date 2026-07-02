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

- **Contact** (have: Create, Sync) → add **Update, Delete, Get, Get Many**.
  - The `listId` field upgrades from a pasted string to a **live dropdown** backed by
    `GET /contact-lists` (still expression-friendly via n8n's `options` type).
  - Endpoints: Update `POST /contact-lists/{listId}/contacts/{id}`, Delete
    `DELETE /contact-lists/{listId}/contacts/{id}`, Get `GET .../contacts/{id}` (confirm),
    Get Many `GET .../contacts` (confirm).
- **Contact List** *(new resource)* → **Get Many** (`GET /contact-lists`, confirm), **Get**
  (`GET /contact-lists/{id}`), **Create** (`POST /contact-lists`), **Update**
  (`POST /contact-lists/{id}`, confirm), **Delete** (`DELETE /contact-lists/{id}`, confirm).
  - **Custom-field management:** the `fields[]` array (name/description/type text|date|number|url)
    on Create/Update, exposed as a fixedCollection.
- **Webhook** *(new action resource, separate from the existing Trigger node)* → **Get Many**
  (`GET /webhooks`), **Get** (`GET /webhooks/{id}`), **Create** (`POST /webhooks`), **Update**
  (`POST /webhooks/{id}`), **Delete** (`DELETE /webhooks/{id}`). Create/Update take targetUrl,
  the 9-event multiOptions, description, metadata; Update also supports `disabled`.
- **Artwork** (have: Get Many) → add **Get** single (`GET /art/{id}`, confirm).
- **Order** (have: Place, Preview, Get, Get Many) → add **Download Preview PDF**: fetch the
  PDF bytes from the `preview.urls.card` (and `.envelope` when present) URL that Preview
  returns, emitted as n8n **binary** data.
- **Account:** unchanged (Get Balance). **Echo:** not included.

## Architectural change — per-resource handler modules

v0.1.0's `Cardly.node.ts` `execute()` is a single `if / else if` chain over ~8 operations.
At ~20 operations this becomes an unmaintainable tangle. Refactor:

- New directory `nodes/Cardly/actions/` with one module per resource:
  `order.ts`, `contact.ts`, `contactList.ts`, `webhook.ts`, `artwork.ts`, `account.ts`.
  Each exports `execute(this: IExecuteFunctions, operation: string, i: number): Promise<any>`
  returning the (already-unwrapped) data for item `i`.
- `Cardly.node.ts`'s `execute()` becomes a thin per-item loop that dispatches by `resource`
  to the matching module, preserving `continueOnFail()` and the paired-item output shape.
- The request layer (`GenericFunctions`), pure builders, and descriptions are untouched by
  the dispatch change; existing account/artwork/order/contact behavior is preserved (verified
  by the existing tests continuing to pass).

This is a bounded refactor that serves the expansion, not a rewrite.

## New / changed components

- **Descriptions:** new `ContactListDescription.ts`, `WebhookDescription.ts`; extend
  `ContactDescription.ts` (new ops + listId dropdown), `ArtworkDescription.ts` (Get),
  `OrderDescription.ts` (Download Preview PDF).
- **Builders (pure, unit-tested):** new `contactListBuilder.ts` (create/update body incl.
  `fields[]`), `webhookBuilder.ts` (create/update body); extend `contactBuilder.ts` with an
  `update` mode (same required fields as `create`, no externalId/email requirement).
- **loadOptions:** add `getContactLists` (maps `GET /contact-lists` results to
  `{name, value}`); keep `getArtwork`.
- **Binary handling:** Download Preview PDF uses n8n's binary helpers
  (`this.helpers.httpRequest` with `encoding: 'arraybuffer'` / `returnFullResponse`, then
  `this.helpers.prepareBinaryData`), isolated to the order handler; output item carries the
  PDF under a `binary` key.

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
  artwork Get, webhook Get Many) hit the real API. Mutating ops (contact/contactList/webhook
  Create/Update/Delete) are safe to exercise because test keys validate without mutating.
  Download Preview PDF is exercised by previewing then fetching the returned URL.

## Endpoints to confirm against the full v2 spec during planning

Confirmed present: `GET /contact-lists/{id}`, `POST /contact-lists`,
`POST /contact-lists/{listId}/contacts/{id}`, `DELETE /contact-lists/{listId}/contacts/{id}`,
full `/webhooks` CRUD. To confirm (drop the operation if absent):
`GET /contact-lists` (list), `GET /contact-lists/{listId}/contacts` (list),
`GET /contact-lists/{listId}/contacts/{id}` (single), `POST /contact-lists/{id}` (update list),
`DELETE /contact-lists/{id}` (delete list), `GET /art/{id}` (single artwork).

## Out of scope

- Echo operation. Order cancel (no v2 endpoint). Senders / fonts / writing-styles list
  endpoints (referenced only as IDs within style objects; no confirmed list endpoints).
