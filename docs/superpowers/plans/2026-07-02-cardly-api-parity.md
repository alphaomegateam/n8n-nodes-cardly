# Cardly API Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `@alphaomega-team/n8n-nodes-cardly` to broad Cardly v2 coverage — complete Contact CRUD + Find, a Contact List resource, Webhook management, single-artwork Get, account credit-history, a Reference read resource (fonts/writing-styles/doodles/templates/media), and Download Preview PDF (binary) — behind a per-resource handler refactor.

**Architecture:** First refactor the monolithic `execute()` into one handler module per resource under `nodes/Cardly/actions/`, dispatched by resource, with a `NodeItems` marker so a handler can emit pre-formed items (binary). Then add operations resource-by-resource: pure unit-tested builders assemble bodies, thin handlers call the shared transport, descriptions define the UI. The existing 42 tests must stay green throughout.

**Tech Stack:** TypeScript, n8n-workflow, Jest + ts-jest, existing `GenericFunctions` transport (`cardlyApiRequest`, `cardlyApiRequestAllItems`, `unwrap`).

## Global Constraints

- Base URL `https://api.card.ly/v2`; auth header `API-Key` (owned by the `cardlyApi` credential; transport layer sets it — handlers never touch headers).
- Response envelope `{ state, data }`; return unwrapped `data`. List endpoints return `data.{meta,results}`; use `cardlyApiRequestAllItems` for "Return All" and `unwrap(...).results ?? []` for limited.
- Node conventions (from v0.1.0, do NOT reintroduce `NodeConnectionType`): inputs/outputs are the string `'main'`; throws use `NodeOperationError` (imported from `n8n-workflow`).
- **Address fields:** Order recipient/sender use `city`; **Contact uses `locality`** (responses return `adminAreaLevel1` for region). Never mix them.
- ESLint `eslint-plugin-n8n-nodes-base` is strict: fix any flagged rule (alphabetical option ordering, "Name or ID" display names for loadOptions fields, required descriptions, boolean defaults) per the rule message — mechanical.
- Test keys (`test_` prefix) validate without mutating — mutating ops are safe to smoke-test. Retrieve the dev key with `op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key"`; NEVER echo the value (do not use `curl -v`).
- Existing test count is 42 and must never regress.
- Spec of record: `docs/superpowers/specs/2026-07-02-cardly-api-parity-design.md`.

### Verified endpoints (paths + notable params)

- Contact: Get `GET /contact-lists/{listId}/contacts/{id}`; Get Many `GET /contact-lists/{listId}/contacts`; **Find** `GET /contact-lists/{listId}/contacts/find?query=<email|externalId>` (`query` required); Update `POST /contact-lists/{listId}/contacts/{id}` (body identical to create; required firstName/address/locality/country + conditional region/postcode); Delete `DELETE /contact-lists/{listId}/contacts/{id}`.
- Contact List: Get Many `GET /contact-lists`; Get `GET /contact-lists/{id}`; Create `POST /contact-lists` (body `{name (req), description?, fields?[]}`, each field `{name, description?, type: text|date|number|url}`); Delete `DELETE /contact-lists/{id}`. **No update endpoint.**
- Webhook: Get Many `GET /webhooks`; Get `GET /webhooks/{id}`; Create `POST /webhooks` (`{targetUrl (req), events (req)[9-enum], description?, metadata?}`); Update `POST /webhooks/{id}` (`{targetUrl (req), events?, description?, disabled?, metadata?}`); Delete `DELETE /webhooks/{id}`.
- Artwork: Get `GET /art/{id}`.
- Account: `GET /account/credit-history`, `GET /account/gift-credit-history` — both paginated, optional filters `effectiveTime.lt|lte|gt|gte` (`YYYY-MM-DD HH:ii:ss`).
- Reference (all paginated `{meta,results}` with id+name): `GET /fonts` (filter `organisationOnly`), `GET /writing-styles`, `GET /doodles` (filter `organisationOnly`), `GET /templates`, `GET /media` (filter `organisationOnly`).
- Order: Download Preview PDF — `POST /orders/preview` then fetch `data.preview.urls.card` / `.envelope`.
- The 9 webhook events: `contact.order.created`, `contact.order.sent`, `contact.order.refunded`, `giftCard.redeemed`, `qrCode.scanned`, `contact.undeliverable`, `contact.changeOfAddress`, `consignment.undeliverable`, `consignment.changeOfAddress`.

---

## File Structure

- `nodes/Cardly/actions/types.ts` — `NodeItems` marker class + `ResourceHandler` type.
- `nodes/Cardly/actions/{order,contact,contactList,webhook,artwork,account,reference}.ts` — one `execute(this, operation, i)` per resource.
- `nodes/Cardly/Cardly.node.ts` — properties (all resources/ops) + `loadOptions` (`getArtwork`, `getContactLists`) + thin dispatch `execute()`.
- `nodes/Cardly/helpers/contactBuilder.ts` — add `update` mode.
- `nodes/Cardly/helpers/contactListBuilder.ts` — NEW: create body + `fields[]`.
- `nodes/Cardly/helpers/webhookBuilder.ts` — NEW: create/update body.
- `nodes/Cardly/descriptions/{Contact,Artwork,Order,Account}Description.ts` — extend.
- `nodes/Cardly/descriptions/{ContactList,Webhook,Reference}Description.ts` — NEW.
- `test/*.test.ts` — colocated unit tests.
- `README.md` — document new operations.

---

### Task 1: Per-resource handler refactor

Move the existing `execute()` logic into per-resource modules dispatched by resource, with a `NodeItems` marker enabling binary output later. No behavior change; the 42 existing tests must stay green.

**Files:**
- Create: `nodes/Cardly/actions/types.ts`, `nodes/Cardly/actions/order.ts`, `nodes/Cardly/actions/contact.ts`, `nodes/Cardly/actions/artwork.ts`, `nodes/Cardly/actions/account.ts`
- Modify: `nodes/Cardly/Cardly.node.ts`
- Test: `test/actionsDispatch.test.ts`

**Interfaces:**
- Consumes: existing `cardlyApiRequest`, `cardlyApiRequestAllItems`, `unwrap`; existing `buildPlaceBody`, `buildPreviewBody`, `buildContactBody`; the existing `readOrderLineInput`/`readContactInput` param-reading logic.
- Produces:
  - `class NodeItems { constructor(readonly items: INodeExecutionData[]) {} }`
  - `type ResourceHandler = (this: IExecuteFunctions, operation: string, i: number) => Promise<any>` (a handler returns plain data, a plain array of data, or a `NodeItems`).
  - Per-resource modules each exporting `export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any>`.
  - `Cardly.node.ts` keeps a `RESOURCE_HANDLERS: Record<string, ResourceHandler>` map and a dispatch loop.

- [ ] **Step 1: Write the failing dispatch test**

Create `test/actionsDispatch.test.ts`:

```ts
import { NodeItems } from '../nodes/Cardly/actions/types';
import { Cardly } from '../nodes/Cardly/Cardly.node';

describe('action dispatch', () => {
  it('NodeItems wraps a list of execution items', () => {
    const n = new NodeItems([{ json: { a: 1 } }]);
    expect(n.items[0].json.a).toBe(1);
  });

  it('the node maps every declared resource to a handler', () => {
    const node = new Cardly();
    const resourceProp = node.description.properties.find((p) => p.name === 'resource')!;
    const resources = (resourceProp.options as any[]).map((o) => o.value);
    for (const r of resources) {
      expect(Cardly.RESOURCE_HANDLERS[r]).toBeInstanceOf(Function);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/actionsDispatch.test.ts`
Expected: FAIL — cannot find module `../nodes/Cardly/actions/types`.

- [ ] **Step 3: Create `nodes/Cardly/actions/types.ts`**

```ts
import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

/** Marker so a handler can emit pre-formed execution items (e.g. binary output)
 *  instead of plain JSON data that the dispatcher would wrap. */
export class NodeItems {
  constructor(readonly items: INodeExecutionData[]) {}
}

export type ResourceHandler = (
  this: IExecuteFunctions,
  operation: string,
  i: number,
) => Promise<any>;
```

- [ ] **Step 4: Create `nodes/Cardly/actions/account.ts`** (move the balance branch)

```ts
import { IExecuteFunctions } from 'n8n-workflow';
import { cardlyApiRequest, unwrap } from '../GenericFunctions';

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'getBalance') {
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/account/balance'));
  }
  throw new Error(`Unknown account operation: ${operation}`);
}
```

- [ ] **Step 5: Create `nodes/Cardly/actions/artwork.ts`** (move the artwork getMany branch)

```ts
import { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'getMany') {
    const returnAll = this.getNodeParameter('returnAll', i) as boolean;
    const ownOnly = this.getNodeParameter('ownOnly', i) as boolean;
    const qs: IDataObject = {};
    if (ownOnly) qs.ownOnly = true;
    if (returnAll) {
      return await cardlyApiRequestAllItems.call(this, 'GET', '/art', qs);
    }
    qs.limit = this.getNodeParameter('limit', i) as number;
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/art', {}, qs))?.results ?? [];
  }
  throw new Error(`Unknown artwork operation: ${operation}`);
}
```

- [ ] **Step 6: Create `nodes/Cardly/actions/order.ts`** (move the four order branches + the `readOrderLineInput` helper)

Move the current `Cardly.readOrderLineInput` static into this module as a local function `readOrderLineInput(ctx, i)` (identical body), and port the place/preview/get/getMany branches:

```ts
import { IExecuteFunctions } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';
import { buildPlaceBody, buildPreviewBody, OrderLineInput } from '../helpers/orderBuilder';

function readOrderLineInput(ctx: IExecuteFunctions, i: number): OrderLineInput {
  const artwork = ctx.getNodeParameter('artwork', i) as string;
  const template = ctx.getNodeParameter('template', i, '') as string;
  const recipient = ctx.getNodeParameter('recipient.value', i, {}) as any;
  const sender = ctx.getNodeParameter('sender.value', i, {}) as any;
  const add = ctx.getNodeParameter('additionalFields', i, {}) as any;

  const variables: Record<string, string> = {};
  for (const v of add.variables?.variable ?? []) variables[v.key] = v.value;
  const messagePages = (add.messagePages?.page ?? []).map((p: any) => ({ page: p.page, text: p.text }));

  return {
    artwork,
    template: template || undefined,
    quantity: add.quantity,
    shippingMethod: add.shippingMethod,
    shipToMe: add.shipToMe,
    requestedArrival: add.requestedArrival || undefined,
    variables: Object.keys(variables).length ? variables : undefined,
    messagePages: messagePages.length ? messagePages : undefined,
    recipient,
    sender,
  };
}

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'place') {
    const line = readOrderLineInput(this, i);
    const po = this.getNodeParameter('purchaseOrderNumber', i, '') as string;
    return unwrap(await cardlyApiRequest.call(this, 'POST', '/orders/place', buildPlaceBody([line], po || undefined)));
  }
  if (operation === 'preview') {
    const line = readOrderLineInput(this, i);
    return unwrap(await cardlyApiRequest.call(this, 'POST', '/orders/preview', buildPreviewBody(line)));
  }
  if (operation === 'get') {
    const orderId = this.getNodeParameter('orderId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/orders/${orderId}`));
  }
  if (operation === 'getMany') {
    const returnAll = this.getNodeParameter('returnAll', i) as boolean;
    if (returnAll) return await cardlyApiRequestAllItems.call(this, 'GET', '/orders', {});
    const limit = this.getNodeParameter('limit', i) as number;
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/orders', {}, { limit }))?.results ?? [];
  }
  throw new Error(`Unknown order operation: ${operation}`);
}
```

- [ ] **Step 7: Create `nodes/Cardly/actions/contact.ts`** (move the create/sync branches + `readContactInput`)

```ts
import { IExecuteFunctions } from 'n8n-workflow';
import { cardlyApiRequest, unwrap } from '../GenericFunctions';
import { buildContactBody, ContactInput } from '../helpers/contactBuilder';

function readContactInput(ctx: IExecuteFunctions, i: number): ContactInput {
  const add = ctx.getNodeParameter('additionalFields', i, {}) as any;
  const fields: Record<string, string> = {};
  for (const f of add.fields?.field ?? []) if (f.key) fields[f.key] = f.value;
  return {
    firstName: ctx.getNodeParameter('firstName', i) as string,
    address: ctx.getNodeParameter('address', i) as string,
    locality: ctx.getNodeParameter('locality', i) as string,
    country: ctx.getNodeParameter('country', i) as string,
    externalId: add.externalId || undefined,
    lastName: add.lastName || undefined,
    email: add.email || undefined,
    company: add.company || undefined,
    address2: add.address2 || undefined,
    region: add.region || undefined,
    postcode: add.postcode || undefined,
    fields: Object.keys(fields).length ? fields : undefined,
  };
}

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  const listId = this.getNodeParameter('listId', i) as string;
  if (operation === 'create' || operation === 'sync') {
    const body = buildContactBody(readContactInput(this, i), operation as 'create' | 'sync');
    const endpoint = operation === 'sync'
      ? `/contact-lists/${listId}/contacts/sync`
      : `/contact-lists/${listId}/contacts`;
    return unwrap(await cardlyApiRequest.call(this, 'POST', endpoint, body));
  }
  throw new Error(`Unknown contact operation: ${operation}`);
}
```

> Note: `readContactInput` now guards `if (f.key)` on custom-field keys (fixes a v0.1.0 minor). `readOrderLineInput` keeps its existing behavior.

- [ ] **Step 8: Rewrite `Cardly.node.ts` `execute()` to dispatch, and remove the moved statics**

Replace the imports of the builders/descriptions-execute logic with handler imports, delete the `readOrderLineInput`/`readContactInput` statics (now in the modules), and set up the dispatch. Keep the `description` (properties) and `methods.loadOptions` exactly as they are. New top section:

```ts
import * as orderActions from './actions/order';
import * as contactActions from './actions/contact';
import * as artworkActions from './actions/artwork';
import * as accountActions from './actions/account';
import { NodeItems, ResourceHandler } from './actions/types';
```

Add a static handler map on the class:

```ts
  static RESOURCE_HANDLERS: Record<string, ResourceHandler> = {
    order: orderActions.execute,
    contact: contactActions.execute,
    artwork: artworkActions.execute,
    account: accountActions.execute,
  };
```

Replace the body of `execute()` with the dispatch loop:

```ts
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;
    const handler = Cardly.RESOURCE_HANDLERS[resource];
    if (!handler) throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`);

    for (let i = 0; i < items.length; i++) {
      try {
        const result = await handler.call(this, operation, i);
        if (result instanceof NodeItems) {
          for (const item of result.items) returnData.push({ ...item, pairedItem: { item: i } });
        } else {
          const asArray = Array.isArray(result) ? result : [result];
          for (const entry of asArray) returnData.push({ json: entry, pairedItem: { item: i } });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
          continue;
        }
        throw error;
      }
    }
    return [returnData];
  }
```

Ensure `NodeItems` and `ResourceHandler` are imported and `INodeExecutionData`, `NodeOperationError`, `IExecuteFunctions` remain imported. Remove now-unused imports (`buildPlaceBody`, etc.) from the node file — the modules own them.

- [ ] **Step 9: Run the dispatch test + full suite**

Run: `npx jest test/actionsDispatch.test.ts && npm test`
Expected: dispatch test passes; full suite still **42 passing** (the refactor is behavior-preserving — the existing node/order/contact tests exercise the same paths through the new modules).

- [ ] **Step 10: Lint + build**

Run: `npm run lint && npm run build`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add nodes/Cardly/actions test/actionsDispatch.test.ts nodes/Cardly/Cardly.node.ts
git commit -m "refactor: split Cardly execute() into per-resource handler modules"
```

---

### Task 2: Contact-list dropdown (loadOptions)

Add a `getContactLists` loadOptions method and switch the contact `listId` field from a plain string to an expression-friendly dropdown.

**Files:**
- Modify: `nodes/Cardly/Cardly.node.ts` (add loadOptions method)
- Modify: `nodes/Cardly/descriptions/ContactDescription.ts` (listId field)
- Test: `test/cardlyNode.test.ts` (extend)

**Interfaces:**
- Consumes: `cardlyApiRequestAllItems`.
- Produces: `methods.loadOptions.getContactLists` returning `{name, value}[]`; `listId` becomes `type: 'options'` with `loadOptionsMethod: 'getContactLists'`.

- [ ] **Step 1: Write the failing test** (append to `test/cardlyNode.test.ts`)

```ts
describe('Cardly contact-list dropdown', () => {
  const node = new Cardly();
  it('exposes a getContactLists loadOptions method', () => {
    expect(node.methods?.loadOptions?.getContactLists).toBeInstanceOf(Function);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/cardlyNode.test.ts -t "getContactLists"`
Expected: FAIL — `getContactLists` is undefined.

- [ ] **Step 3: Add the loadOptions method** in `Cardly.node.ts` (inside `methods.loadOptions`, next to `getArtwork`):

```ts
      async getContactLists(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const items = await cardlyApiRequestAllItems.call(this, 'GET', '/contact-lists', { limit: 100 });
        return items.map((l: any) => ({ name: l.name ?? l.id, value: l.id }));
      },
```

Ensure `cardlyApiRequestAllItems` is imported in the node file (it already is via GenericFunctions).

- [ ] **Step 4: Change the `listId` field** in `ContactDescription.ts` from a string to a dropdown:

```ts
  {
    displayName: 'Contact List Name or ID',
    name: 'listId',
    type: 'options',
    typeOptions: { loadOptionsMethod: 'getContactLists' },
    default: '',
    required: true,
    description: 'The Cardly contact list. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    displayOptions: { show: { resource: ['contact'] } },
  },
```

- [ ] **Step 5: Run tests + lint + build**

Run: `npx jest test/cardlyNode.test.ts && npm run lint && npm run build`
Expected: pass; lint 0 (the "Name or ID" display name + expression hint satisfy the loadOptions rules).

- [ ] **Step 6: Live smoke test** (test key)

```bash
KEY=$(op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key")
curl -s -H "API-Key: $KEY" "https://api.card.ly/v2/contact-lists?limit=5" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('status',j.state.status,'lists',(j.data.results||[]).map(r=>({id:r.id,name:r.name})).slice(0,3))})"
unset KEY
```
Expected: `status OK` and a few `{id,name}` lists (confirms the endpoint + the `{id,name}` shape the dropdown maps). Do NOT use `curl -v`.

- [ ] **Step 7: Commit**

```bash
git add nodes/Cardly/Cardly.node.ts nodes/Cardly/descriptions/ContactDescription.ts test/cardlyNode.test.ts
git commit -m "feat: contact-list dropdown via getContactLists loadOptions"
```

---

### Task 3: Contact reads — Get, Get Many, Find

**Files:**
- Modify: `nodes/Cardly/descriptions/ContactDescription.ts` (operations + fields)
- Modify: `nodes/Cardly/actions/contact.ts` (branches)
- Test: `test/contactDescription.test.ts` (extend)

**Interfaces:**
- Consumes: `cardlyApiRequest`, `cardlyApiRequestAllItems`, `unwrap`.
- Produces: contact operations `get`, `getMany`, `find`. Fields: `contactId` (for get), `query` (for find), `returnAll`/`limit` (for getMany), all scoped by operation.

- [ ] **Step 1: Write the failing test** (extend `test/contactDescription.test.ts`)

```ts
it('declares get, getMany, and find operations', () => {
  const op = contactOperations.find((p) => p.name === 'operation')!;
  const values = (op.options as any[]).map((o) => o.value);
  expect(values).toEqual(expect.arrayContaining(['get', 'getMany', 'find']));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/contactDescription.test.ts -t "get, getMany, and find"`
Expected: FAIL — missing operations.

- [ ] **Step 3: Add the operations** to the `contactOperations` options array (keep alphabetical per lint):

```ts
      { name: 'Find', value: 'find', action: 'Find a contact', description: 'Find a contact by email or external ID' },
      { name: 'Get', value: 'get', action: 'Get a contact' },
      { name: 'Get Many', value: 'getMany', action: 'Get many contacts' },
```

- [ ] **Step 4: Add the fields** to `contactFields` in `ContactDescription.ts`:

```ts
  {
    displayName: 'Contact ID',
    name: 'contactId',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contact'], operation: ['get'] } },
  },
  {
    displayName: 'Query',
    name: 'query',
    type: 'string',
    default: '',
    required: true,
    description: 'Email address or external ID to search for',
    displayOptions: { show: { resource: ['contact'], operation: ['find'] } },
  },
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['contact'], operation: ['getMany'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['contact'], operation: ['getMany'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
```

> The existing required contact fields (firstName/address/locality/country + additionalFields) must NOT show for read ops. Add `operation` scoping to them: change their `displayOptions.show` from `{ resource: ['contact'] }` to `{ resource: ['contact'], operation: ['create', 'sync', 'update'] }`. (Update arrives in Task 4; listing it now is harmless and avoids a second edit.)

- [ ] **Step 5: Add the read branches** in `actions/contact.ts` (before the final throw; note `listId` is already read at the top of `execute`):

```ts
  if (operation === 'get') {
    const contactId = this.getNodeParameter('contactId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/contact-lists/${listId}/contacts/${contactId}`));
  }
  if (operation === 'find') {
    const query = this.getNodeParameter('query', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/contact-lists/${listId}/contacts/find`, {}, { query }));
  }
  if (operation === 'getMany') {
    const returnAll = this.getNodeParameter('returnAll', i) as boolean;
    if (returnAll) return await cardlyApiRequestAllItems.call(this, 'GET', `/contact-lists/${listId}/contacts`, {});
    const limit = this.getNodeParameter('limit', i) as number;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/contact-lists/${listId}/contacts`, {}, { limit }))?.results ?? [];
  }
```

Add `cardlyApiRequestAllItems` to the imports in `actions/contact.ts`.

- [ ] **Step 6: Run tests + lint + build**

Run: `npx jest && npm run lint && npm run build`
Expected: all green (42 + new).

- [ ] **Step 7: Live smoke test** (test key — needs a real list ID; substitute `LIST`)

```bash
KEY=$(op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key"); LIST="REPLACE_WITH_LIST_ID"
curl -s -H "API-Key: $KEY" "https://api.card.ly/v2/contact-lists/$LIST/contacts?limit=2" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('getMany status',j.state.status,'count',(j.data.results||[]).length)})"
unset KEY LIST
```
Expected: `getMany status OK`. A `find` check: append `/find?query=<an email in the list>` and confirm `status OK`. (If no list ID is handy, skip and note it — the unit test is the gate.)

- [ ] **Step 8: Commit**

```bash
git add nodes/Cardly/descriptions/ContactDescription.ts nodes/Cardly/actions/contact.ts test/contactDescription.test.ts
git commit -m "feat: add contact Get, Get Many, and Find operations"
```

---

### Task 4: Contact writes — Update, Delete

**Files:**
- Modify: `nodes/Cardly/helpers/contactBuilder.ts` (add `update` mode)
- Modify: `nodes/Cardly/descriptions/ContactDescription.ts` (operations + reuse create fields for update)
- Modify: `nodes/Cardly/actions/contact.ts` (branches)
- Test: `test/contactBuilder.test.ts`, `test/contactDescription.test.ts` (extend)

**Interfaces:**
- Consumes: existing `buildContactBody`, `ContactInput`, `readContactInput`.
- Produces: `buildContactBody(input, 'update')` (same required set as create, no externalId/email requirement); contact ops `update`, `delete`.

- [ ] **Step 1: Write the failing builder test** (extend `test/contactBuilder.test.ts`)

```ts
it('update mode requires the same fields as create and needs no externalId/email', () => {
  expect(() => buildContactBody({ ...base, firstName: '' } as any, 'update')).toThrow(/firstName/);
  expect(() => buildContactBody(base as any, 'update')).not.toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/contactBuilder.test.ts -t "update mode"`
Expected: FAIL — `'update'` not an accepted mode (TS/type or runtime).

- [ ] **Step 3: Widen the mode** in `contactBuilder.ts`

Change the signature and the sync-only guard:

```ts
export function buildContactBody(input: ContactInput, mode: 'create' | 'sync' | 'update'): IDataObject {
  const missing = CREATE_REQUIRED.filter((k) => isEmpty(input[k]));
  if (missing.length > 0) {
    throw new Error(`Contact is missing required field(s): ${missing.join(', ')}.`);
  }
  if (mode === 'sync' && isEmpty(input.externalId) && isEmpty(input.email)) {
    throw new Error('Sync requires at least one of externalId or email to match on.');
  }
  // ...unchanged body assembly...
```

(Only the type union and — implicitly — the fact that `update` skips the sync guard change; the rest is identical.)

- [ ] **Step 4: Add operations + delete field** to `ContactDescription.ts`

Add to `contactOperations` options (alphabetical): `{ name: 'Delete', value: 'delete', action: 'Delete a contact' }`, `{ name: 'Update', value: 'update', action: 'Update a contact' }`. Add a delete/update ID field (reuse `contactId` — extend its `displayOptions.show.operation` to include `get`, `update`, `delete`):

```ts
  {
    displayName: 'Contact ID',
    name: 'contactId',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contact'], operation: ['get', 'update', 'delete'] } },
  },
```

(Replace the Task-3 `contactId` field definition with this one.) The create-form fields already include `update` in their operation scope (Task 3 Step 4 note), so Update reuses them.

- [ ] **Step 5: Write the failing description test** (extend `test/contactDescription.test.ts`)

```ts
it('declares update and delete operations', () => {
  const op = contactOperations.find((p) => p.name === 'operation')!;
  const values = (op.options as any[]).map((o) => o.value);
  expect(values).toEqual(expect.arrayContaining(['update', 'delete']));
});
```

- [ ] **Step 6: Add the write branches** in `actions/contact.ts`:

```ts
  if (operation === 'update') {
    const contactId = this.getNodeParameter('contactId', i) as string;
    const body = buildContactBody(readContactInput(this, i), 'update');
    return unwrap(await cardlyApiRequest.call(this, 'POST', `/contact-lists/${listId}/contacts/${contactId}`, body));
  }
  if (operation === 'delete') {
    const contactId = this.getNodeParameter('contactId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'DELETE', `/contact-lists/${listId}/contacts/${contactId}`));
  }
```

- [ ] **Step 7: Run tests + lint + build**

Run: `npx jest && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add nodes/Cardly/helpers/contactBuilder.ts nodes/Cardly/descriptions/ContactDescription.ts nodes/Cardly/actions/contact.ts test/contactBuilder.test.ts test/contactDescription.test.ts
git commit -m "feat: add contact Update and Delete operations"
```

---

### Task 5: Contact List resource

**Files:**
- Create: `nodes/Cardly/helpers/contactListBuilder.ts`, `nodes/Cardly/descriptions/ContactListDescription.ts`, `nodes/Cardly/actions/contactList.ts`
- Modify: `nodes/Cardly/Cardly.node.ts` (register resource + handler + properties)
- Test: `test/contactListBuilder.test.ts`, `test/contactListDescription.test.ts`

**Interfaces:**
- Produces:
  - `interface ContactListFieldInput { name: string; description?: string; type: 'text'|'date'|'number'|'url' }`
  - `interface ContactListInput { name: string; description?: string; fields?: ContactListFieldInput[] }`
  - `buildContactListBody(input: ContactListInput): IDataObject` — requires `name`; includes `fields[]` only when non-empty.
  - `contactListOperations`, `contactListFields` (INodeProperties[]).
  - `actions/contactList.ts` `execute` handling `getMany`, `get`, `create`, `delete`.

- [ ] **Step 1: Write the failing builder test** — `test/contactListBuilder.test.ts`

```ts
import { buildContactListBody } from '../nodes/Cardly/helpers/contactListBuilder';

describe('buildContactListBody', () => {
  it('requires a name', () => {
    expect(() => buildContactListBody({ name: '' } as any)).toThrow(/name/);
  });
  it('includes fields only when present', () => {
    expect(buildContactListBody({ name: 'A' }).fields).toBeUndefined();
    const body = buildContactListBody({ name: 'A', fields: [{ name: 'Birthday', type: 'date' }] });
    expect((body.fields as any)[0]).toEqual({ name: 'Birthday', type: 'date' });
  });
  it('drops empty description', () => {
    expect(buildContactListBody({ name: 'A', description: '' }).description).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/contactListBuilder.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `contactListBuilder.ts`**

```ts
import { IDataObject } from 'n8n-workflow';

export interface ContactListFieldInput {
  name: string;
  description?: string;
  type: 'text' | 'date' | 'number' | 'url';
}

export interface ContactListInput {
  name: string;
  description?: string;
  fields?: ContactListFieldInput[];
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

export function buildContactListBody(input: ContactListInput): IDataObject {
  if (isEmpty(input.name)) throw new Error('Contact list requires a name.');
  const body: IDataObject = { name: input.name };
  if (!isEmpty(input.description)) body.description = input.description;
  if (input.fields && input.fields.length > 0) {
    body.fields = input.fields.map((f) => {
      const field: IDataObject = { name: f.name, type: f.type };
      if (!isEmpty(f.description)) field.description = f.description;
      return field;
    });
  }
  return body;
}
```

- [ ] **Step 4: Run builder test to pass**

Run: `npx jest test/contactListBuilder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `ContactListDescription.ts`**

```ts
import { INodeProperties } from 'n8n-workflow';

export const contactListOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['contactList'] } },
    options: [
      { name: 'Create', value: 'create', action: 'Create a contact list' },
      { name: 'Delete', value: 'delete', action: 'Delete a contact list' },
      { name: 'Get', value: 'get', action: 'Get a contact list' },
      { name: 'Get Many', value: 'getMany', action: 'Get many contact lists' },
    ],
    default: 'getMany',
  },
];

export const contactListFields: INodeProperties[] = [
  {
    displayName: 'Contact List ID',
    name: 'listId',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contactList'], operation: ['get', 'delete'] } },
  },
  {
    displayName: 'Name',
    name: 'name',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contactList'], operation: ['create'] } },
  },
  {
    displayName: 'Additional Fields',
    name: 'additionalFields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: { show: { resource: ['contactList'], operation: ['create'] } },
    options: [
      { displayName: 'Description', name: 'description', type: 'string', default: '' },
      {
        displayName: 'Custom Fields',
        name: 'fields',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        description: 'Custom fields to define on the list',
        options: [{ name: 'field', displayName: 'Field', values: [
          { displayName: 'Name', name: 'name', type: 'string', default: '' },
          { displayName: 'Type', name: 'type', type: 'options', default: 'text', options: [
            { name: 'Text', value: 'text' },
            { name: 'Date', value: 'date' },
            { name: 'Number', value: 'number' },
            { name: 'URL', value: 'url' },
          ] },
          { displayName: 'Description', name: 'description', type: 'string', default: '' },
        ] }],
      },
    ],
  },
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['contactList'], operation: ['getMany'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['contactList'], operation: ['getMany'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
];
```

- [ ] **Step 6: Write `actions/contactList.ts`**

```ts
import { IExecuteFunctions } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';
import { buildContactListBody, ContactListInput } from '../helpers/contactListBuilder';

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'getMany') {
    const returnAll = this.getNodeParameter('returnAll', i) as boolean;
    if (returnAll) return await cardlyApiRequestAllItems.call(this, 'GET', '/contact-lists', {});
    const limit = this.getNodeParameter('limit', i) as number;
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/contact-lists', {}, { limit }))?.results ?? [];
  }
  if (operation === 'get') {
    const listId = this.getNodeParameter('listId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/contact-lists/${listId}`));
  }
  if (operation === 'create') {
    const add = this.getNodeParameter('additionalFields', i, {}) as any;
    const fields = (add.fields?.field ?? []).map((f: any) => ({ name: f.name, type: f.type, description: f.description }));
    const input: ContactListInput = {
      name: this.getNodeParameter('name', i) as string,
      description: add.description || undefined,
      fields: fields.length ? fields : undefined,
    };
    return unwrap(await cardlyApiRequest.call(this, 'POST', '/contact-lists', buildContactListBody(input)));
  }
  if (operation === 'delete') {
    const listId = this.getNodeParameter('listId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'DELETE', `/contact-lists/${listId}`));
  }
  throw new Error(`Unknown contactList operation: ${operation}`);
}
```

- [ ] **Step 7: Write the failing description test** — `test/contactListDescription.test.ts`

```ts
import { contactListOperations } from '../nodes/Cardly/descriptions/ContactListDescription';

describe('ContactListDescription', () => {
  it('declares getMany/get/create/delete and NO update', () => {
    const op = contactListOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['getMany', 'get', 'create', 'delete']));
    expect(values).not.toContain('update');
  });
});
```

- [ ] **Step 8: Register the resource in `Cardly.node.ts`**

- Add `{ name: 'Contact List', value: 'contactList' }` to the `resource` options (alphabetical).
- Add `import * as contactListActions from './actions/contactList';` and `import { contactListOperations, contactListFields } from './descriptions/ContactListDescription';`.
- Add `...contactListOperations, ...contactListFields` to the `properties` array.
- Add `contactList: contactListActions.execute,` to `RESOURCE_HANDLERS`.

- [ ] **Step 9: Run tests + lint + build**

Run: `npx jest && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 10: Live smoke test** (test key)

```bash
KEY=$(op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key")
curl -s -H "API-Key: $KEY" "https://api.card.ly/v2/contact-lists?limit=3" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('list status',j.state.status,'count',(j.data.results||[]).length)})"
unset KEY
```
Expected: `list status OK`.

- [ ] **Step 11: Commit**

```bash
git add nodes/Cardly/helpers/contactListBuilder.ts nodes/Cardly/descriptions/ContactListDescription.ts nodes/Cardly/actions/contactList.ts nodes/Cardly/Cardly.node.ts test/contactListBuilder.test.ts test/contactListDescription.test.ts
git commit -m "feat: add Contact List resource (get many/get/create/delete)"
```

---

### Task 6: Webhook resource (action management)

**Files:**
- Create: `nodes/Cardly/helpers/webhookBuilder.ts`, `nodes/Cardly/descriptions/WebhookDescription.ts`, `nodes/Cardly/actions/webhook.ts`
- Modify: `nodes/Cardly/Cardly.node.ts`
- Test: `test/webhookBuilder.test.ts`, `test/webhookDescription.test.ts`

**Interfaces:**
- Produces:
  - `const CARDLY_WEBHOOK_EVENTS: string[]` (the 9 events — copy from `CardlyTrigger.node.ts`).
  - `interface WebhookInput { targetUrl: string; events?: string[]; description?: string; metadata?: IDataObject; disabled?: boolean }`
  - `buildWebhookBody(input: WebhookInput, mode: 'create'|'update'): IDataObject` — both modes require `targetUrl`; create requires non-empty `events`; `disabled` only in update.
  - `webhookOperations`, `webhookFields`; `actions/webhook.ts` `execute` (getMany/get/create/update/delete).

- [ ] **Step 1: Write the failing builder test** — `test/webhookBuilder.test.ts`

```ts
import { buildWebhookBody } from '../nodes/Cardly/helpers/webhookBuilder';

describe('buildWebhookBody', () => {
  it('create requires targetUrl and non-empty events', () => {
    expect(() => buildWebhookBody({ targetUrl: '', events: ['contact.order.sent'] } as any, 'create')).toThrow(/targetUrl/i);
    expect(() => buildWebhookBody({ targetUrl: 'https://x', events: [] } as any, 'create')).toThrow(/events/i);
  });
  it('update requires targetUrl and allows disabled', () => {
    expect(() => buildWebhookBody({ targetUrl: '' } as any, 'update')).toThrow(/targetUrl/i);
    const body = buildWebhookBody({ targetUrl: 'https://x', disabled: true }, 'update');
    expect(body.targetUrl).toBe('https://x');
    expect(body.disabled).toBe(true);
  });
  it('omits empty optional fields', () => {
    const body = buildWebhookBody({ targetUrl: 'https://x', events: ['contact.order.sent'], description: '' }, 'create');
    expect(body.description).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/webhookBuilder.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `webhookBuilder.ts`**

```ts
import { IDataObject } from 'n8n-workflow';

export const CARDLY_WEBHOOK_EVENTS = [
  'contact.order.created', 'contact.order.sent', 'contact.order.refunded',
  'giftCard.redeemed', 'qrCode.scanned', 'contact.undeliverable',
  'contact.changeOfAddress', 'consignment.undeliverable', 'consignment.changeOfAddress',
];

export interface WebhookInput {
  targetUrl: string;
  events?: string[];
  description?: string;
  metadata?: IDataObject;
  disabled?: boolean;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

export function buildWebhookBody(input: WebhookInput, mode: 'create' | 'update'): IDataObject {
  if (isEmpty(input.targetUrl)) throw new Error('Webhook requires a targetUrl.');
  if (mode === 'create' && (!input.events || input.events.length === 0)) {
    throw new Error('Webhook create requires at least one event.');
  }
  const body: IDataObject = { targetUrl: input.targetUrl };
  if (input.events && input.events.length > 0) body.events = input.events;
  if (!isEmpty(input.description)) body.description = input.description;
  if (input.metadata && Object.keys(input.metadata).length > 0) body.metadata = input.metadata;
  if (mode === 'update' && input.disabled !== undefined) body.disabled = input.disabled;
  return body;
}
```

- [ ] **Step 4: Run builder test to pass**

Run: `npx jest test/webhookBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `WebhookDescription.ts`** (events multiOptions from the shared constant)

```ts
import { INodeProperties } from 'n8n-workflow';
import { CARDLY_WEBHOOK_EVENTS } from '../helpers/webhookBuilder';

export const webhookOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['webhook'] } },
    options: [
      { name: 'Create', value: 'create', action: 'Create a webhook' },
      { name: 'Delete', value: 'delete', action: 'Delete a webhook' },
      { name: 'Get', value: 'get', action: 'Get a webhook' },
      { name: 'Get Many', value: 'getMany', action: 'Get many webhooks' },
      { name: 'Update', value: 'update', action: 'Update a webhook' },
    ],
    default: 'getMany',
  },
];

export const webhookFields: INodeProperties[] = [
  {
    displayName: 'Webhook ID',
    name: 'webhookId',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['webhook'], operation: ['get', 'update', 'delete'] } },
  },
  {
    displayName: 'Target URL',
    name: 'targetUrl',
    type: 'string',
    default: '',
    required: true,
    description: 'URL that will receive the webhook POST callbacks',
    displayOptions: { show: { resource: ['webhook'], operation: ['create', 'update'] } },
  },
  {
    displayName: 'Events',
    name: 'events',
    type: 'multiOptions',
    default: [],
    description: 'Events this webhook subscribes to',
    options: CARDLY_WEBHOOK_EVENTS.map((e) => ({ name: e, value: e })),
    displayOptions: { show: { resource: ['webhook'], operation: ['create', 'update'] } },
  },
  {
    displayName: 'Additional Fields',
    name: 'additionalFields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: { show: { resource: ['webhook'], operation: ['create', 'update'] } },
    options: [
      { displayName: 'Description', name: 'description', type: 'string', default: '' },
      { displayName: 'Disabled', name: 'disabled', type: 'boolean', default: false, description: 'Whether the webhook is disabled (update only)' },
    ],
  },
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['webhook'], operation: ['getMany'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['webhook'], operation: ['getMany'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
];
```

- [ ] **Step 6: Write `actions/webhook.ts`**

```ts
import { IExecuteFunctions } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';
import { buildWebhookBody, WebhookInput } from '../helpers/webhookBuilder';

function readWebhookInput(ctx: IExecuteFunctions, i: number): WebhookInput {
  const add = ctx.getNodeParameter('additionalFields', i, {}) as any;
  return {
    targetUrl: ctx.getNodeParameter('targetUrl', i) as string,
    events: ctx.getNodeParameter('events', i, []) as string[],
    description: add.description || undefined,
    disabled: add.disabled,
  };
}

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'getMany') {
    const returnAll = this.getNodeParameter('returnAll', i) as boolean;
    if (returnAll) return await cardlyApiRequestAllItems.call(this, 'GET', '/webhooks', {});
    const limit = this.getNodeParameter('limit', i) as number;
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/webhooks', {}, { limit }))?.results ?? [];
  }
  if (operation === 'get') {
    const id = this.getNodeParameter('webhookId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/webhooks/${id}`));
  }
  if (operation === 'create') {
    return unwrap(await cardlyApiRequest.call(this, 'POST', '/webhooks', buildWebhookBody(readWebhookInput(this, i), 'create')));
  }
  if (operation === 'update') {
    const id = this.getNodeParameter('webhookId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'POST', `/webhooks/${id}`, buildWebhookBody(readWebhookInput(this, i), 'update')));
  }
  if (operation === 'delete') {
    const id = this.getNodeParameter('webhookId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'DELETE', `/webhooks/${id}`));
  }
  throw new Error(`Unknown webhook operation: ${operation}`);
}
```

- [ ] **Step 7: Write the failing description test** — `test/webhookDescription.test.ts`

```ts
import { webhookOperations } from '../nodes/Cardly/descriptions/WebhookDescription';

describe('WebhookDescription', () => {
  it('declares full CRUD operations', () => {
    const op = webhookOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['getMany', 'get', 'create', 'update', 'delete']));
  });
});
```

- [ ] **Step 8: Register the resource in `Cardly.node.ts`** (as in Task 5 Step 8, for `webhook`): add resource option `{ name: 'Webhook', value: 'webhook' }`, imports, `...webhookOperations, ...webhookFields`, and `webhook: webhookActions.execute`.

- [ ] **Step 9: Run tests + lint + build**

Run: `npx jest && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add nodes/Cardly/helpers/webhookBuilder.ts nodes/Cardly/descriptions/WebhookDescription.ts nodes/Cardly/actions/webhook.ts nodes/Cardly/Cardly.node.ts test/webhookBuilder.test.ts test/webhookDescription.test.ts
git commit -m "feat: add Webhook management resource (CRUD)"
```

---

### Task 7: Artwork Get (single)

**Files:**
- Modify: `nodes/Cardly/descriptions/ArtworkDescription.ts` (op + id field)
- Modify: `nodes/Cardly/actions/artwork.ts` (branch)
- Test: `test/artworkDescription.test.ts` (create)

**Interfaces:**
- Produces: artwork operation `get`; field `artworkId`.

- [ ] **Step 1: Write the failing test** — `test/artworkDescription.test.ts`

```ts
import { artworkOperations } from '../nodes/Cardly/descriptions/ArtworkDescription';

describe('ArtworkDescription', () => {
  it('declares get and getMany', () => {
    const op = artworkOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['get', 'getMany']));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/artworkDescription.test.ts`
Expected: FAIL — `get` missing.

- [ ] **Step 3: Add the op + field** in `ArtworkDescription.ts`

Add to `artworkOperations` options (alphabetical): `{ name: 'Get', value: 'get', action: 'Get an artwork' }`. Add to `artworkFields`:

```ts
  {
    displayName: 'Artwork ID',
    name: 'artworkId',
    type: 'string',
    default: '',
    required: true,
    description: 'Artwork UUID or slug',
    displayOptions: { show: { resource: ['artwork'], operation: ['get'] } },
  },
```

Also scope the existing `returnAll`/`limit`/`ownOnly` fields to `operation: ['getMany']` (add `operation: ['getMany']` to their `displayOptions.show`) so they don't render for Get.

- [ ] **Step 4: Add the branch** in `actions/artwork.ts` (before the throw):

```ts
  if (operation === 'get') {
    const artworkId = this.getNodeParameter('artworkId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/art/${artworkId}`));
  }
```

- [ ] **Step 5: Run tests + lint + build**

Run: `npx jest && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 6: Live smoke test** (test key — grab an ID from the list first)

```bash
KEY=$(op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key")
ID=$(curl -s -H "API-Key: $KEY" "https://api.card.ly/v2/art?limit=1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).data.results[0].id)})")
curl -s -H "API-Key: $KEY" "https://api.card.ly/v2/art/$ID" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('get status',j.state.status,'name',j.data.name)})"
unset KEY ID
```
Expected: `get status OK` and an artwork name.

- [ ] **Step 7: Commit**

```bash
git add nodes/Cardly/descriptions/ArtworkDescription.ts nodes/Cardly/actions/artwork.ts test/artworkDescription.test.ts
git commit -m "feat: add Artwork Get (single) operation"
```

---

### Task 8: Account credit-history operations

**Files:**
- Modify: `nodes/Cardly/descriptions/AccountDescription.ts` (ops + date filters)
- Modify: `nodes/Cardly/actions/account.ts` (branches)
- Test: `test/accountDescription.test.ts` (create)

**Interfaces:**
- Produces: account operations `getCreditHistory`, `getGiftCreditHistory`; optional filter fields `effectiveTimeBefore` / `effectiveTimeAfter` mapping to `effectiveTime.lte` / `effectiveTime.gte`; returnAll/limit.

- [ ] **Step 1: Write the failing test** — `test/accountDescription.test.ts`

```ts
import { accountOperations } from '../nodes/Cardly/descriptions/AccountDescription';

describe('AccountDescription', () => {
  it('declares balance and credit-history operations', () => {
    const op = accountOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['getBalance', 'getCreditHistory', 'getGiftCreditHistory']));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/accountDescription.test.ts`
Expected: FAIL — new ops missing.

- [ ] **Step 3: Add ops + fields** in `AccountDescription.ts`

Add to the operations options (alphabetical): `{ name: 'Get Credit History', value: 'getCreditHistory', action: 'Get credit history' }`, `{ name: 'Get Gift Credit History', value: 'getGiftCreditHistory', action: 'Get gift credit history' }`. Append fields:

```ts
export const accountFields: INodeProperties[] = [
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['account'], operation: ['getCreditHistory', 'getGiftCreditHistory'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['account'], operation: ['getCreditHistory', 'getGiftCreditHistory'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
  {
    displayName: 'Filters',
    name: 'filters',
    type: 'collection',
    placeholder: 'Add Filter',
    default: {},
    displayOptions: { show: { resource: ['account'], operation: ['getCreditHistory', 'getGiftCreditHistory'] } },
    options: [
      { displayName: 'Effective After', name: 'effectiveAfter', type: 'dateTime', default: '', description: 'Only entries at or after this time' },
      { displayName: 'Effective Before', name: 'effectiveBefore', type: 'dateTime', default: '', description: 'Only entries at or before this time' },
    ],
  },
];
```

Ensure `Cardly.node.ts` spreads `...accountFields` (add the import + spread; `accountOperations` is already spread).

- [ ] **Step 4: Add branches** in `actions/account.ts`

```ts
import { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';

function historyQs(ctx: IExecuteFunctions, i: number): IDataObject {
  const f = ctx.getNodeParameter('filters', i, {}) as any;
  const qs: IDataObject = {};
  if (f.effectiveBefore) qs['effectiveTime.lte'] = String(f.effectiveBefore).replace('T', ' ').slice(0, 19);
  if (f.effectiveAfter) qs['effectiveTime.gte'] = String(f.effectiveAfter).replace('T', ' ').slice(0, 19);
  return qs;
}

async function history(ctx: IExecuteFunctions, i: number, endpoint: string): Promise<any> {
  const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
  const qs = historyQs(ctx, i);
  if (returnAll) return await cardlyApiRequestAllItems.call(ctx, 'GET', endpoint, qs);
  qs.limit = ctx.getNodeParameter('limit', i) as number;
  return unwrap(await cardlyApiRequest.call(ctx, 'GET', endpoint, {}, qs))?.results ?? [];
}

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'getBalance') {
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/account/balance'));
  }
  if (operation === 'getCreditHistory') return await history(this, i, '/account/credit-history');
  if (operation === 'getGiftCreditHistory') return await history(this, i, '/account/gift-credit-history');
  throw new Error(`Unknown account operation: ${operation}`);
}
```

(This replaces the Task-1 `actions/account.ts` body.)

- [ ] **Step 5: Run tests + lint + build**

Run: `npx jest && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 6: Live smoke test** (test key)

```bash
KEY=$(op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key")
curl -s -H "API-Key: $KEY" "https://api.card.ly/v2/account/credit-history?limit=2" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('credit-history status',j.state.status,'count',(j.data.results||[]).length)})"
unset KEY
```
Expected: `credit-history status OK`. (Confirms the non-gift path exists and paginates.)

- [ ] **Step 7: Commit**

```bash
git add nodes/Cardly/descriptions/AccountDescription.ts nodes/Cardly/actions/account.ts nodes/Cardly/Cardly.node.ts test/accountDescription.test.ts
git commit -m "feat: add account credit-history and gift-credit-history operations"
```

---

### Task 9: Reference resource (fonts/writing-styles/doodles/templates/media)

**Files:**
- Create: `nodes/Cardly/descriptions/ReferenceDescription.ts`, `nodes/Cardly/actions/reference.ts`
- Modify: `nodes/Cardly/Cardly.node.ts`
- Test: `test/referenceDescription.test.ts`

**Interfaces:**
- Produces: resource `reference` with operations `getFonts`, `getWritingStyles`, `getDoodles`, `getTemplates`, `getMedia`, each a paginated Get Many; a shared returnAll/limit and an `organisationOnly` toggle (applies to fonts/doodles/media only).

- [ ] **Step 1: Write the failing test** — `test/referenceDescription.test.ts`

```ts
import { referenceOperations } from '../nodes/Cardly/descriptions/ReferenceDescription';

describe('ReferenceDescription', () => {
  it('declares the five reference list operations', () => {
    const op = referenceOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['getFonts', 'getWritingStyles', 'getDoodles', 'getTemplates', 'getMedia']));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/referenceDescription.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `ReferenceDescription.ts`**

```ts
import { INodeProperties } from 'n8n-workflow';

export const referenceOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['reference'] } },
    options: [
      { name: 'Get Doodles', value: 'getDoodles', action: 'Get many doodles' },
      { name: 'Get Fonts', value: 'getFonts', action: 'Get many fonts' },
      { name: 'Get Media', value: 'getMedia', action: 'Get many media products' },
      { name: 'Get Templates', value: 'getTemplates', action: 'Get many templates' },
      { name: 'Get Writing Styles', value: 'getWritingStyles', action: 'Get many writing styles' },
    ],
    default: 'getFonts',
  },
];

export const referenceFields: INodeProperties[] = [
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['reference'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['reference'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
  {
    displayName: 'Organisation Only',
    name: 'organisationOnly',
    type: 'boolean',
    default: false,
    description: 'Whether to return only items exclusive to your organisation (applies to fonts, doodles, and media)',
    displayOptions: { show: { resource: ['reference'], operation: ['getFonts', 'getDoodles', 'getMedia'] } },
  },
];
```

- [ ] **Step 4: Write `actions/reference.ts`**

```ts
import { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';

const ENDPOINTS: Record<string, string> = {
  getFonts: '/fonts',
  getWritingStyles: '/writing-styles',
  getDoodles: '/doodles',
  getTemplates: '/templates',
  getMedia: '/media',
};
const SUPPORTS_ORG_FILTER = new Set(['getFonts', 'getDoodles', 'getMedia']);

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  const endpoint = ENDPOINTS[operation];
  if (!endpoint) throw new Error(`Unknown reference operation: ${operation}`);
  const qs: IDataObject = {};
  if (SUPPORTS_ORG_FILTER.has(operation) && (this.getNodeParameter('organisationOnly', i, false) as boolean)) {
    qs.organisationOnly = true;
  }
  const returnAll = this.getNodeParameter('returnAll', i) as boolean;
  if (returnAll) return await cardlyApiRequestAllItems.call(this, 'GET', endpoint, qs);
  qs.limit = this.getNodeParameter('limit', i) as number;
  return unwrap(await cardlyApiRequest.call(this, 'GET', endpoint, {}, qs))?.results ?? [];
}
```

- [ ] **Step 5: Register the resource in `Cardly.node.ts`** (as before, for `reference`): resource option `{ name: 'Reference', value: 'reference' }`, imports, `...referenceOperations, ...referenceFields`, `reference: referenceActions.execute`.

- [ ] **Step 6: Run tests + lint + build**

Run: `npx jest && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 7: Live smoke test** (test key — hits all five)

```bash
KEY=$(op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key")
for ep in fonts writing-styles doodles templates media; do
  st=$(curl -s -H "API-Key: $KEY" "https://api.card.ly/v2/$ep?limit=1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).state.status)}catch(e){console.log('PARSE_ERR')}})")
  echo "$ep -> $st"
done
unset KEY
```
Expected: each prints `OK` (confirms all five endpoints + shapes).

- [ ] **Step 8: Commit**

```bash
git add nodes/Cardly/descriptions/ReferenceDescription.ts nodes/Cardly/actions/reference.ts nodes/Cardly/Cardly.node.ts test/referenceDescription.test.ts
git commit -m "feat: add Reference resource (fonts/writing-styles/doodles/templates/media)"
```

---

### Task 10: Order — Download Preview PDF (binary)

**Files:**
- Modify: `nodes/Cardly/descriptions/OrderDescription.ts` (op + binary property name field)
- Modify: `nodes/Cardly/actions/order.ts` (branch, returns `NodeItems`)
- Test: `test/orderDescription.test.ts` (extend)

**Interfaces:**
- Consumes: `buildPreviewBody`, `readOrderLineInput` (local), `NodeItems`, `cardlyApiRequest`, `unwrap`.
- Produces: order operation `downloadPreview`; a `binaryProperty` field (default `data`); handler returns `NodeItems` with a binary item.

- [ ] **Step 1: Write the failing test** (extend `test/orderDescription.test.ts`)

```ts
it('declares a downloadPreview operation', () => {
  const op = orderOperations.find((p) => p.name === 'operation')!;
  const values = (op.options as any[]).map((o) => o.value);
  expect(values).toContain('downloadPreview');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest test/orderDescription.test.ts -t "downloadPreview"`
Expected: FAIL.

- [ ] **Step 3: Add op + field** in `OrderDescription.ts`

Add to `orderOperations` options: `{ name: 'Download Preview PDF', value: 'downloadPreview', action: 'Download a preview PDF', description: 'Generate a preview and download the card (and envelope) PDF as binary' }`. The `downloadPreview` op reuses the same card form as `preview` — extend the card fields' `displayOptions.show.operation` arrays to include `'downloadPreview'` alongside `'place', 'preview'`. Add a binary-property field:

```ts
  {
    displayName: 'Put Output In Field',
    name: 'binaryProperty',
    type: 'string',
    default: 'data',
    required: true,
    description: 'Name of the binary field to write the preview PDF(s) to (envelope, if any, uses "<field>Envelope")',
    displayOptions: { show: { resource: ['order'], operation: ['downloadPreview'] } },
  },
```

- [ ] **Step 4: Add the handler branch** in `actions/order.ts`

Add imports: `import { NodeItems } from './types'; import { INodeExecutionData, IDataObject } from 'n8n-workflow';` (merge with existing). Add before the throw:

```ts
  if (operation === 'downloadPreview') {
    const line = readOrderLineInput(this, i);
    const prop = this.getNodeParameter('binaryProperty', i) as string;
    const data = unwrap(await cardlyApiRequest.call(this, 'POST', '/orders/preview', buildPreviewBody(line)));
    const urls = data?.preview?.urls ?? {};
    if (data?.preview?.expires && new Date(data.preview.expires).getTime() < Date.now()) {
      throw new Error('Preview document already expired.');
    }
    const binary: IDataObject = {};
    const fetchPdf = async (url: string) => {
      const httpsUrl = url.replace(/^http:\/\//, 'https://');
      const buf = (await this.helpers.httpRequestWithAuthentication.call(this, 'cardlyApi', {
        method: 'GET', url: httpsUrl, encoding: 'arraybuffer', json: false,
      })) as Buffer;
      return this.helpers.prepareBinaryData(Buffer.from(buf), 'preview.pdf', 'application/pdf');
    };
    if (urls.card) binary[prop] = await fetchPdf(urls.card);
    if (urls.envelope) binary[`${prop}Envelope`] = await fetchPdf(urls.envelope);
    const item: INodeExecutionData = { json: { order: data.order ?? {}, preview: { expires: data?.preview?.expires ?? null } }, binary };
    return new NodeItems([item]);
  }
```

- [ ] **Step 5: Run tests + lint + build**

Run: `npx jest && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 6: Live smoke test** (test key — preview is non-mutating; verify a PDF is fetched)

```bash
KEY=$(op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key")
ART=$(curl -s -H "API-Key: $KEY" "https://api.card.ly/v2/art?limit=1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).data.results[0].id)})")
BODY='{"artwork":"'"$ART"'","recipient":{"firstName":"Thor","address":"1 Main Street","city":"Brooklyn","region":"NY","postcode":"12345","country":"US"}}'
URL=$(curl -s -H "API-Key: $KEY" -H "Content-Type: application/json" -d "$BODY" "https://api.card.ly/v2/orders/preview" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).data.preview.urls.card)})")
echo "preview card url: $URL"
curl -s -H "API-Key: $KEY" "${URL/http:/https:}" -o /tmp/cardly-preview.pdf -w "http_code=%{http_code} bytes=%{size_download}\n"
file /tmp/cardly-preview.pdf; rm -f /tmp/cardly-preview.pdf
unset KEY ART BODY URL
```
Expected: `http_code=200` with non-zero bytes and `file` reporting a PDF — confirms the authenticated PDF fetch works. If it returns 401/403 without the header, that confirms auth is required (the handler already sends it).

- [ ] **Step 7: Commit**

```bash
git add nodes/Cardly/descriptions/OrderDescription.ts nodes/Cardly/actions/order.ts test/orderDescription.test.ts
git commit -m "feat: add Order Download Preview PDF (binary output)"
```

---

### Task 11: README operations update + prepare-script fix + final verification

**Files:**
- Modify: `README.md`, `package.json`
- Test: full suite + build + pack

**Interfaces:** none new.

- [ ] **Step 1: Add a `prepare` script so from-source installs build automatically**

The README's "install from GitHub" line (`npm install alphaomegateam/n8n-nodes-cardly`) currently does NOT work: a git/local install runs the `prepare` lifecycle script to build, but this package has no `prepare` (only `prepublishOnly`, which runs on publish), and `dist/` is git-ignored — so a from-source install would ship no built node. Add a `prepare` script. In `package.json` `scripts`, add (alongside the existing `build`):

```json
    "prepare": "npm run build",
```

This runs on git/local installs and dev `npm install` (so from-source installs build), but NOT for registry consumers (they receive the prebuilt `dist/` in the tarball). Verify it's valid + present:

Run: `node -p "require('./package.json').scripts.prepare"`
Expected: prints `npm run build`.

Run: `npm run build`
Expected: build succeeds (the `prepare` script is just an alias; confirm nothing regressed).

- [ ] **Step 2: Update the "Nodes" operations list** in `README.md`

Replace the `### Cardly (action)` operations list with the full set:

```markdown
### Cardly (action)
- **Order** — Place, Preview, Get, Get Many, Download Preview PDF
- **Contact** — Create, Sync, Update, Delete, Get, Get Many, Find (into a contact list; pick the list from the dropdown)
- **Contact List** — Get Many, Get, Create, Delete
- **Webhook** — Get Many, Get, Create, Update, Delete
- **Artwork** — Get Many, Get
- **Reference** — Get Many for Fonts, Writing Styles, Doodles, Templates, Media
- **Account** — Get Balance, Get Credit History, Get Gift Credit History
```

- [ ] **Step 3: Verify README mentions the new resources**

Run: `node -e "const s=require('fs').readFileSync('README.md','utf8'); for(const t of ['Contact List','Webhook','Reference','Download Preview PDF','Get Credit History']){ if(!s.includes(t)) throw new Error('missing: '+t);} console.log('README ops ok')"`
Expected: prints `README ops ok`.

- [ ] **Step 4: Full verification pass**

Run: `npm run lint && npm run build && npm test`
Expected: all exit 0; Jest reports the full suite green (42 original + all new tests).

- [ ] **Step 5: Package dry-run** (ensure no leakage)

Run: `npm pack --dry-run 2>&1 | grep -iE "actions/|stub|test/|\.ts\.map" | head`
Expected: `dist/nodes/Cardly/actions/*.js` present; NO `test/`, NO stray `stub`, NO raw `.ts` sources outside dist. Also confirm the `prepare` script does not cause dev/CI-relevant issues — `npm ci` in CI runs `prepare`, which just builds (fine).

- [ ] **Step 6: Commit**

```bash
git add README.md package.json
git commit -m "docs: document full operation set; add prepare script for from-source installs"
```

---

## Notes for the executor

- Do NOT bump `package.json` `version` or create tags — releasing is the maintainer's separate step (via the CI pipeline).
- Register-the-resource edits to `Cardly.node.ts` recur in Tasks 5, 6, 8, 9 — each is: add a `resource` option, an actions import + a `RESOURCE_HANDLERS` entry, a descriptions import + a `...ops, ...fields` spread. Keep the `resource` options alphabetical to satisfy lint.
- Every live smoke test uses `op read` and must NEVER print the key (no `curl -v`). If `op` or the network is unavailable, note it and rely on the unit tests, which are the gate.
- Keep the 42 pre-existing tests green after every task; the refactor (Task 1) is the one most likely to disturb them — if any fail there, the dispatch wiring is wrong, not the tests.
