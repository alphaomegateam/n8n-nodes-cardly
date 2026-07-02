# Cardly n8n Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `n8n-nodes-cardly`, a community node package with a programmatic `Cardly` action node (Orders, Contacts, Artwork, Account), a `Cardly Trigger` webhook node, and a shared `cardlyApi` credential.

**Architecture:** Pure, unit-tested helper modules build request bodies and map errors; thin n8n node classes wire n8n properties to those helpers and to a shared `cardlyApiRequest` transport. TDD covers the helpers (where the real logic and bugs live); node wiring is verified by lint plus live smoke tests against a test-mode API key.

**Tech Stack:** TypeScript, n8n-workflow (peer dep), Jest + ts-jest (unit tests), ESLint + eslint-plugin-n8n-nodes-base, Gulp (icon build), `op` CLI (retrieve test key from 1Password).

## Global Constraints

- Package name: `n8n-nodes-cardly`. Public npm community package.
- Base URL: `https://api.card.ly/v2`. Auth header: `API-Key: <key>`.
- Response envelope on every call: `{ state: { status: 'OK'|'WARN'|'ERROR', messages: string[], version: number }, data: {...} }`. Node output returns `data` by default.
- n8n peer dependency: `n8n-workflow` (do NOT add it to `dependencies`; it is `peerDependencies` + `devDependencies`). No runtime `dependencies` unless unavoidable.
- Node style: **programmatic** (`execute()` / `webhook()`), not declarative routing.
- One order per input item: `Order: Place` wraps a single recipient as `lines: [ {...} ]`.
- Test-mode keys (prefix `test_`) validate but perform NO mutations; place responses carry `testMode: true`. Safe to call `/orders/place` in tests.
- Webhook lifecycle + signature scheme require a LIVE key to validate (test keys likely no-op webhook creation).
- Test/dev key: `op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key"` — never echo the value into logs/context.
- Node minimum version target: n8n Nodes API version 1 (`INodeType` with `version: 1`).
- Spec of record: `docs/superpowers/specs/2026-07-02-cardly-n8n-node-design.md`.

---

## File Structure

- `package.json` — package manifest + `n8n` block registering the credential and both nodes.
- `tsconfig.json` — TS build config (outputs to `dist/`).
- `jest.config.js` — ts-jest config for `*.test.ts`.
- `.eslintrc.js` / `.eslintrc.prepublish.js` — lint config using `eslint-plugin-n8n-nodes-base`.
- `gulpfile.js` — copies node icons into `dist/`.
- `credentials/CardlyApi.credentials.ts` — `cardlyApi` credential type + credential test.
- `nodes/Cardly/GenericFunctions.ts` — `cardlyApiRequest`, `cardlyApiRequestAllItems`, `unwrap`, `mapCardlyError`.
- `nodes/Cardly/helpers/orderBuilder.ts` — `validateSender`, `buildOrderLine`, `buildPlaceBody`, `buildPreviewBody`.
- `nodes/Cardly/helpers/contactBuilder.ts` — `buildContactBody`.
- `nodes/Cardly/helpers/signature.ts` — `extractSignatureHeaders`, `verifyCardlySignature` (best-effort).
- `nodes/Cardly/descriptions/OrderDescription.ts` — Order operations + fields.
- `nodes/Cardly/descriptions/ContactDescription.ts` — Contact operations + fields.
- `nodes/Cardly/descriptions/ArtworkDescription.ts` — Artwork operation + fields.
- `nodes/Cardly/descriptions/AccountDescription.ts` — Account operation.
- `nodes/Cardly/Cardly.node.ts` — action node: properties, `loadOptions`, `execute` router.
- `nodes/Cardly/CardlyTrigger.node.ts` — trigger node: properties + `webhookMethods` + `webhook`.
- `nodes/Cardly/cardly.svg` — node icon.
- `test/*.test.ts` — unit tests colocated under `test/`.
- `README.md` — install, credential setup, operations, webhook/security notes.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `jest.config.js`, `.eslintrc.js`, `gulpfile.js`, `.npmignore`
- Create: `nodes/Cardly/cardly.svg`
- Create: `test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `build`, `lint`, `test`, `dev`; a compiling TS project.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "n8n-nodes-cardly",
  "version": "0.1.0",
  "description": "n8n community node for the Cardly API — send physical cards, sync contacts, and react to webhook events.",
  "keywords": ["n8n-community-node-package", "cardly", "direct-mail", "greeting-cards"],
  "license": "MIT",
  "homepage": "https://github.com/alphaomegateam/n8n-nodes-cardly",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/alphaomegateam/n8n-nodes-cardly.git"
  },
  "engines": { "node": ">=18.10" },
  "main": "index.js",
  "scripts": {
    "build": "tsc && gulp build:icons",
    "dev": "tsc --watch",
    "lint": "eslint nodes credentials package.json",
    "lintfix": "eslint nodes credentials package.json --fix",
    "test": "jest",
    "prepublishOnly": "npm run build && eslint -c .eslintrc.prepublish.js nodes credentials package.json"
  },
  "files": ["dist"],
  "n8n": {
    "n8nNodesApiVersion": 1,
    "credentials": ["dist/credentials/CardlyApi.credentials.js"],
    "nodes": [
      "dist/nodes/Cardly/Cardly.node.js",
      "dist/nodes/Cardly/CardlyTrigger.node.js"
    ]
  },
  "peerDependencies": { "n8n-workflow": "*" },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^18.19.0",
    "@typescript-eslint/parser": "^7.18.0",
    "eslint": "^8.57.0",
    "eslint-plugin-n8n-nodes-base": "^1.16.3",
    "gulp": "^5.0.0",
    "jest": "^29.7.0",
    "n8n-workflow": "*",
    "ts-jest": "^29.2.5",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "commonjs",
    "moduleResolution": "node",
    "target": "es2021",
    "lib": ["es2021"],
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": ".",
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "useUnknownInCatchVariables": false
  },
  "include": ["credentials/**/*", "nodes/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create `jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
};
```

- [ ] **Step 4: Create `.eslintrc.js`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', extraFileExtensions: ['.json'] },
  ignorePatterns: ['dist/**', 'node_modules/**', 'test/**', '*.js'],
  overrides: [
    {
      files: ['package.json'],
      plugins: ['eslint-plugin-n8n-nodes-base'],
      extends: ['plugin:n8n-nodes-base/community'],
      rules: { 'n8n-nodes-base/community-package-json-name-still-default': 'off' },
    },
    {
      files: ['./credentials/**/*.ts', './nodes/**/*.ts'],
      plugins: ['eslint-plugin-n8n-nodes-base'],
      extends: ['plugin:n8n-nodes-base/nodes'],
    },
  ],
};
```

- [ ] **Step 5: Create `.eslintrc.prepublish.js`**

```js
module.exports = {
  extends: './.eslintrc.js',
  overrides: [
    {
      files: ['./credentials/**/*.ts', './nodes/**/*.ts'],
      plugins: ['eslint-plugin-n8n-nodes-base'],
      extends: ['plugin:n8n-nodes-base/community'],
    },
  ],
};
```

- [ ] **Step 6: Create `gulpfile.js`**

```js
const { src, dest } = require('gulp');

function buildIcons() {
  return src('nodes/**/*.{png,svg}').pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;
```

- [ ] **Step 7: Create `.npmignore`**

```
*
!dist/**
```

- [ ] **Step 8: Create `nodes/Cardly/cardly.svg`** (simple placeholder envelope mark; replace with brand art later)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="60" height="60">
  <rect width="60" height="60" rx="12" fill="#0a2540"/>
  <rect x="12" y="18" width="36" height="26" rx="3" fill="#fff"/>
  <path d="M12 21 L30 34 L48 21" fill="none" stroke="#0a2540" stroke-width="2.5"/>
</svg>
```

- [ ] **Step 9: Create `test/smoke.test.ts`**

```ts
describe('scaffold', () => {
  it('runs the jest toolchain', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 10: Install deps and verify toolchain**

Run: `npm install && npm run build && npm run lint && npm test`
Expected: install succeeds; `tsc` produces `dist/` (only the icon copy for now — no TS yet is fine, `tsc` exits 0 with no input files); `eslint` exits 0 (package.json rules pass); Jest prints `1 passed`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold n8n-nodes-cardly package (build, lint, test toolchain)"
```

---

### Task 2: `cardlyApi` credential

**Files:**
- Create: `credentials/CardlyApi.credentials.ts`
- Test: `test/credential.test.ts`

**Interfaces:**
- Produces: credential name `cardlyApi`; injects header `API-Key`; `test` request hits `GET {baseUrl}/account/balance`. Exposes `baseUrl` property (default `https://api.card.ly/v2`).

- [ ] **Step 1: Write the failing test**

```ts
import { CardlyApi } from '../credentials/CardlyApi.credentials';

describe('CardlyApi credential', () => {
  const cred = new CardlyApi();

  it('is named cardlyApi and has an apiKey + baseUrl property', () => {
    expect(cred.name).toBe('cardlyApi');
    const names = cred.properties.map((p) => p.name);
    expect(names).toContain('apiKey');
    expect(names).toContain('baseUrl');
  });

  it('sends the API-Key header from apiKey', () => {
    expect(cred.authenticate.properties.headers?.['API-Key']).toBe('={{$credentials.apiKey}}');
  });

  it('tests against the balance endpoint', () => {
    expect(cred.test.request.url).toBe('/account/balance');
    expect(cred.test.request.baseURL).toBe('={{$credentials.baseUrl}}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/credential.test.ts`
Expected: FAIL — cannot find module `../credentials/CardlyApi.credentials`.

- [ ] **Step 3: Write the credential**

```ts
import {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class CardlyApi implements ICredentialType {
  name = 'cardlyApi';

  displayName = 'Cardly API';

  documentationUrl = 'https://api.card.ly';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Your Cardly API key. Test-mode keys are prefixed with "test_".',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://api.card.ly/v2',
      description: 'Override only if directed to by Cardly.',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        'API-Key': '={{$credentials.apiKey}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.baseUrl}}',
      url: '/account/balance',
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/credential.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: exits 0; `dist/credentials/CardlyApi.credentials.js` exists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add cardlyApi credential with balance credential test"
```

---

### Task 3: Transport & error mapping (`GenericFunctions.ts`)

**Files:**
- Create: `nodes/Cardly/GenericFunctions.ts`
- Test: `test/genericFunctions.test.ts`

**Interfaces:**
- Consumes: n8n `this` context (`IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions | IWebhookFunctions`).
- Produces:
  - `unwrap(response: any): any` → returns `response.data` if the `{state,data}` envelope is present, else `response`.
  - `mapCardlyError(this: IExecuteFunctions, error: any): Error` → returns a `NodeApiError` with a friendly message; special-cases HTTP 402 (credit) and 422 (field validation).
  - `cardlyApiRequest(this, method, endpoint, body?, qs?): Promise<any>` → calls `this.helpers.httpRequestWithAuthentication('cardlyApi', ...)` against `{baseUrl}{endpoint}`, returns the parsed JSON (full envelope).
  - `cardlyApiRequestAllItems(this, method, endpoint, qs?): Promise<any[]>` → offset/limit paginates `GET` list endpoints, returns the concatenated `data.results` array.

- [ ] **Step 1: Write the failing tests**

```ts
import { unwrap, mapCardlyError } from '../nodes/Cardly/GenericFunctions';

describe('unwrap', () => {
  it('returns data when the envelope is present', () => {
    expect(unwrap({ state: { status: 'OK' }, data: { balance: 5 } })).toEqual({ balance: 5 });
  });
  it('returns the response unchanged when there is no envelope', () => {
    expect(unwrap({ balance: 5 })).toEqual({ balance: 5 });
  });
});

describe('mapCardlyError', () => {
  const ctx = { getNode: () => ({ name: 'Cardly' }) } as any;

  it('special-cases 402 insufficient credit', () => {
    const err: any = { statusCode: 402, response: { body: { state: { messages: ['Need 2 credits'] } } } };
    const mapped = mapCardlyError.call(ctx, err);
    expect(mapped.message).toMatch(/credit/i);
  });

  it('special-cases 422 with field detail', () => {
    const err: any = {
      statusCode: 422,
      response: { body: { data: { email: 'This value should be a valid email address.' } } },
    };
    const mapped = mapCardlyError.call(ctx, err);
    expect(mapped.message).toMatch(/email/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/genericFunctions.test.ts`
Expected: FAIL — cannot find module `../nodes/Cardly/GenericFunctions`.

- [ ] **Step 3: Write the implementation**

```ts
import {
  IDataObject,
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
  IWebhookFunctions,
  IHttpRequestMethods,
  NodeApiError,
} from 'n8n-workflow';

type CardlyContext =
  | IExecuteFunctions
  | ILoadOptionsFunctions
  | IHookFunctions
  | IWebhookFunctions;

export function unwrap(response: any): any {
  if (response && typeof response === 'object' && 'state' in response && 'data' in response) {
    return response.data;
  }
  return response;
}

export function mapCardlyError(this: { getNode: () => any }, error: any): Error {
  const status = error.statusCode ?? error.httpCode;
  const body = error.response?.body ?? error.error ?? {};
  const messages: string[] = body?.state?.messages ?? [];

  if (status === 402) {
    const detail = messages.join(' ') || 'Your account requires additional credit to place this order.';
    return new NodeApiError(this.getNode(), error, {
      message: `Insufficient credit: ${detail}`,
      description: 'Add credit to your Cardly account or use a smaller order.',
    });
  }

  if (status === 422 && body?.data && typeof body.data === 'object') {
    const fields = Object.entries(body.data as IDataObject)
      .map(([field, reason]) => `${field}: ${reason}`)
      .join('; ');
    return new NodeApiError(this.getNode(), error, {
      message: `Validation failed — ${fields}`,
    });
  }

  return new NodeApiError(this.getNode(), error, {
    message: messages.join(' ') || undefined,
  });
}

export async function cardlyApiRequest(
  this: CardlyContext,
  method: IHttpRequestMethods,
  endpoint: string,
  body: IDataObject = {},
  qs: IDataObject = {},
): Promise<any> {
  const credentials = await this.getCredentials('cardlyApi');
  const baseUrl = (credentials.baseUrl as string) || 'https://api.card.ly/v2';

  const options = {
    method,
    url: `${baseUrl}${endpoint}`,
    body,
    qs,
    json: true,
  };
  if (method === 'GET' || Object.keys(body).length === 0) {
    delete (options as IDataObject).body;
  }

  try {
    return await this.helpers.httpRequestWithAuthentication.call(this, 'cardlyApi', options);
  } catch (error) {
    throw mapCardlyError.call(this, error);
  }
}

export async function cardlyApiRequestAllItems(
  this: CardlyContext,
  method: IHttpRequestMethods,
  endpoint: string,
  qs: IDataObject = {},
): Promise<any[]> {
  const results: any[] = [];
  let offset = 0;
  const limit = (qs.limit as number) || 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await cardlyApiRequest.call(this, method, endpoint, {}, { ...qs, limit, offset });
    const data = unwrap(response);
    const page: any[] = data?.results ?? [];
    results.push(...page);
    const total: number = data?.meta?.totalRecords ?? results.length;
    offset += limit;
    if (page.length === 0 || results.length >= total) break;
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/genericFunctions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Cardly transport helper, pagination, and error mapping"
```

---

### Task 4: Order body builders (`helpers/orderBuilder.ts`)

**Files:**
- Create: `nodes/Cardly/helpers/orderBuilder.ts`
- Test: `test/orderBuilder.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces:
  - `interface RecipientInput { firstName; lastName?; company?; address; address2?; city; region?; postcode?; country }`
  - `interface SenderInput { firstName; lastName?; company?; address; address2?; city; region?; postcode?; country }`
  - `interface OrderLineInput { artwork; template?; quantity?; style?; messagePages?; variables?; recipient: RecipientInput; sender?: Partial<SenderInput>; shippingMethod?; shipToMe?; requestedArrival? }`
  - `validateSender(sender?: Partial<SenderInput>): SenderInput | undefined` — throws `Error` if partially filled; returns undefined if empty.
  - `buildOrderLine(input: OrderLineInput): IDataObject` — assembles one `lines[]` entry (recipient uses `city`).
  - `buildPlaceBody(lines: OrderLineInput[], purchaseOrderNumber?: string): IDataObject` — `{ lines: [...], purchaseOrderNumber? }`.
  - `buildPreviewBody(input: OrderLineInput): IDataObject` — FLAT single-card body (no `lines` array).

- [ ] **Step 1: Write the failing tests**

```ts
import {
  validateSender,
  buildOrderLine,
  buildPlaceBody,
  buildPreviewBody,
} from '../nodes/Cardly/helpers/orderBuilder';

const recipient = {
  firstName: 'Thor',
  address: '1 Main Street',
  city: 'Brooklyn',
  region: 'NY',
  postcode: '12345',
  country: 'US',
};

describe('validateSender', () => {
  it('returns undefined when no sender fields are set', () => {
    expect(validateSender(undefined)).toBeUndefined();
    expect(validateSender({})).toBeUndefined();
  });
  it('throws when the sender is partially filled', () => {
    expect(() => validateSender({ firstName: 'Bruce' })).toThrow(/all sender/i);
  });
  it('returns the sender when fully filled', () => {
    const sender = { firstName: 'Bruce', address: '1 Main', city: 'Brooklyn', country: 'US' };
    expect(validateSender(sender)).toEqual(sender);
  });
});

describe('buildOrderLine', () => {
  it('nests the recipient with a city field and omits empty sender', () => {
    const line = buildOrderLine({ artwork: 'happy-birthday', recipient });
    expect(line.artwork).toBe('happy-birthday');
    expect((line.recipient as any).city).toBe('Brooklyn');
    expect(line.sender).toBeUndefined();
  });
  it('places shipping fields inside the line', () => {
    const line = buildOrderLine({ artwork: 'x', recipient, shippingMethod: 'express', shipToMe: true });
    expect(line.shippingMethod).toBe('express');
    expect(line.shipToMe).toBe(true);
  });
  it('maps message pages using the page key (not name)', () => {
    const line = buildOrderLine({
      artwork: 'x',
      recipient,
      messagePages: [{ page: 3, text: 'Hi' }],
    });
    expect((line.messages as any).pages[0].page).toBe(3);
    expect((line.messages as any).pages[0].text).toBe('Hi');
  });
});

describe('buildPlaceBody', () => {
  it('wraps lines and keeps purchaseOrderNumber top-level', () => {
    const body = buildPlaceBody([{ artwork: 'x', recipient }], 'PO1');
    expect(Array.isArray(body.lines)).toBe(true);
    expect((body.lines as any).length).toBe(1);
    expect(body.purchaseOrderNumber).toBe('PO1');
  });
});

describe('buildPreviewBody', () => {
  it('produces a flat body with no lines array', () => {
    const body = buildPreviewBody({ artwork: 'x', recipient });
    expect(body.lines).toBeUndefined();
    expect(body.artwork).toBe('x');
    expect((body.recipient as any).city).toBe('Brooklyn');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/orderBuilder.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
import { IDataObject } from 'n8n-workflow';

export interface AddressInput {
  firstName: string;
  lastName?: string;
  company?: string;
  address: string;
  address2?: string;
  city: string;
  region?: string;
  postcode?: string;
  country: string;
}

export interface MessagePageInput {
  page: number;
  text?: string;
  style?: IDataObject;
}

export interface OrderLineInput {
  artwork: string;
  template?: string;
  quantity?: number;
  style?: IDataObject;
  messagePages?: MessagePageInput[];
  variables?: IDataObject;
  recipient: AddressInput;
  sender?: Partial<AddressInput>;
  shippingMethod?: 'standard' | 'tracked' | 'express';
  shipToMe?: boolean;
  requestedArrival?: string;
}

const SENDER_KEYS: (keyof AddressInput)[] = [
  'firstName', 'lastName', 'company', 'address', 'address2', 'city', 'region', 'postcode', 'country',
];
const SENDER_REQUIRED: (keyof AddressInput)[] = ['firstName', 'address', 'city', 'country'];

function compact(obj: IDataObject): IDataObject {
  const out: IDataObject = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

function buildAddress(a: AddressInput): IDataObject {
  return compact({
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    address: a.address,
    address2: a.address2,
    city: a.city,
    region: a.region,
    postcode: a.postcode,
    country: a.country,
  });
}

export function validateSender(sender?: Partial<AddressInput>): AddressInput | undefined {
  if (!sender) return undefined;
  const filled = SENDER_KEYS.filter((k) => {
    const v = sender[k];
    return v !== undefined && v !== null && v !== '';
  });
  if (filled.length === 0) return undefined;
  const missing = SENDER_REQUIRED.filter((k) => {
    const v = sender[k];
    return v === undefined || v === null || v === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `Sender is partially filled — if any sender field is set, all sender fields are required. Missing: ${missing.join(', ')}.`,
    );
  }
  return sender as AddressInput;
}

function lineCommon(input: OrderLineInput): IDataObject {
  const line: IDataObject = compact({
    artwork: input.artwork,
    template: input.template,
    quantity: input.quantity,
    style: input.style,
    variables: input.variables,
    recipient: buildAddress(input.recipient),
    shippingMethod: input.shippingMethod,
    shipToMe: input.shipToMe,
    requestedArrival: input.requestedArrival,
  });

  const sender = validateSender(input.sender);
  if (sender) line.sender = buildAddress(sender);

  if (input.messagePages && input.messagePages.length > 0) {
    line.messages = {
      pages: input.messagePages.map((p) => compact({ page: p.page, text: p.text, style: p.style })),
    };
  }
  return line;
}

export function buildOrderLine(input: OrderLineInput): IDataObject {
  return lineCommon(input);
}

export function buildPlaceBody(lines: OrderLineInput[], purchaseOrderNumber?: string): IDataObject {
  return compact({
    lines: lines.map((l) => buildOrderLine(l)),
    purchaseOrderNumber,
  });
}

export function buildPreviewBody(input: OrderLineInput): IDataObject {
  // Preview is a flat, single-card body — NOT wrapped in `lines`.
  return lineCommon(input);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/orderBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add order body builders (place lines + flat preview) with sender validation"
```

---

### Task 5: Contact body builder (`helpers/contactBuilder.ts`)

**Files:**
- Create: `nodes/Cardly/helpers/contactBuilder.ts`
- Test: `test/contactBuilder.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `interface ContactInput { externalId?; firstName; lastName?; email?; company?; address; address2?; locality; region?; country; postcode?; fields?: IDataObject }`
  - `buildContactBody(input: ContactInput, mode: 'create' | 'sync'): IDataObject` — uses `locality` (NOT `city`); for `sync`, throws if neither `externalId` nor `email` is set; for `create`, requires `firstName`, `address`, `locality`, `country`.

- [ ] **Step 1: Write the failing tests**

```ts
import { buildContactBody } from '../nodes/Cardly/helpers/contactBuilder';

const base = {
  firstName: 'Thor',
  address: '1 Main Street',
  locality: 'Brooklyn',
  region: 'NY',
  postcode: '12345',
  country: 'US',
};

describe('buildContactBody', () => {
  it('uses locality (not city) and passes custom fields through', () => {
    const body = buildContactBody({ ...base, email: 't@x.com', fields: { birthday: '2020-01-01' } }, 'create');
    expect(body.locality).toBe('Brooklyn');
    expect((body as any).city).toBeUndefined();
    expect((body.fields as any).birthday).toBe('2020-01-01');
  });

  it('create requires firstName, address, locality, country', () => {
    expect(() => buildContactBody({ ...base, firstName: '' } as any, 'create')).toThrow(/firstName/);
  });

  it('sync requires at least one of externalId or email', () => {
    expect(() => buildContactBody(base as any, 'sync')).toThrow(/externalId.*email|email.*externalId/i);
    expect(() => buildContactBody({ ...base, externalId: 'thor1' } as any, 'sync')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/contactBuilder.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
import { IDataObject } from 'n8n-workflow';

export interface ContactInput {
  externalId?: string;
  firstName: string;
  lastName?: string;
  email?: string;
  company?: string;
  address: string;
  address2?: string;
  locality: string;
  region?: string;
  country: string;
  postcode?: string;
  fields?: IDataObject;
}

const CREATE_REQUIRED: (keyof ContactInput)[] = ['firstName', 'address', 'locality', 'country'];

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

export function buildContactBody(input: ContactInput, mode: 'create' | 'sync'): IDataObject {
  const missing = CREATE_REQUIRED.filter((k) => isEmpty(input[k]));
  if (missing.length > 0) {
    throw new Error(`Contact is missing required field(s): ${missing.join(', ')}.`);
  }
  if (mode === 'sync' && isEmpty(input.externalId) && isEmpty(input.email)) {
    throw new Error('Sync requires at least one of externalId or email to match on.');
  }

  const body: IDataObject = {};
  const assign = (k: keyof ContactInput) => {
    if (!isEmpty(input[k])) body[k] = input[k];
  };
  (['externalId', 'firstName', 'lastName', 'email', 'company', 'address', 'address2', 'locality', 'region', 'country', 'postcode'] as (keyof ContactInput)[])
    .forEach(assign);

  if (input.fields && Object.keys(input.fields).length > 0) {
    body.fields = input.fields;
  }
  return body;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/contactBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add contact body builder (locality mapping, create/sync validation)"
```

---

### Task 6: Action node skeleton — Account & Artwork

**Files:**
- Create: `nodes/Cardly/descriptions/AccountDescription.ts`
- Create: `nodes/Cardly/descriptions/ArtworkDescription.ts`
- Create: `nodes/Cardly/Cardly.node.ts`
- Test: `test/cardlyNode.test.ts`

**Interfaces:**
- Consumes: `cardlyApiRequest`, `cardlyApiRequestAllItems`, `unwrap` (Task 3).
- Produces: node type `cardly` with `resource` options including `account` and `artwork`; `execute()` router handling `account:getBalance` and `artwork:getMany`; a `loadOptions` method `getArtwork` returning `{name,value}[]` from `GET /art`.

- [ ] **Step 1: Write the failing test**

```ts
import { Cardly } from '../nodes/Cardly/Cardly.node';

describe('Cardly action node', () => {
  const node = new Cardly();

  it('declares node type cardly with resource property', () => {
    expect(node.description.name).toBe('cardly');
    const resource = node.description.properties.find((p) => p.name === 'resource');
    expect(resource).toBeDefined();
    const values = (resource!.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['account', 'artwork', 'order', 'contact']));
  });

  it('exposes a getArtwork loadOptions method', () => {
    expect(node.methods?.loadOptions?.getArtwork).toBeInstanceOf(Function);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/cardlyNode.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `AccountDescription.ts`**

```ts
import { INodeProperties } from 'n8n-workflow';

export const accountOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['account'] } },
    options: [
      {
        name: 'Get Balance',
        value: 'getBalance',
        action: 'Get account balance',
        description: 'Retrieve current credit and gift-credit balances',
      },
    ],
    default: 'getBalance',
  },
];
```

- [ ] **Step 4: Write `ArtworkDescription.ts`**

```ts
import { INodeProperties } from 'n8n-workflow';

export const artworkOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['artwork'] } },
    options: [
      {
        name: 'Get Many',
        value: 'getMany',
        action: 'Get many artworks',
        description: 'List available artwork for your organisation',
      },
    ],
    default: 'getMany',
  },
];

export const artworkFields: INodeProperties[] = [
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['artwork'], operation: ['getMany'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['artwork'], operation: ['getMany'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
  {
    displayName: 'Own Only',
    name: 'ownOnly',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['artwork'], operation: ['getMany'] } },
    description: 'Whether to return only artwork belonging to your organisation',
  },
];
```

- [ ] **Step 5: Write `Cardly.node.ts` (skeleton with account + artwork)**

```ts
import {
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
  NodeConnectionType,
} from 'n8n-workflow';

import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from './GenericFunctions';
import { accountOperations } from './descriptions/AccountDescription';
import { artworkOperations, artworkFields } from './descriptions/ArtworkDescription';

export class Cardly implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Cardly',
    name: 'cardly',
    icon: 'file:cardly.svg',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Send physical cards, sync contacts, and read data via the Cardly API',
    defaults: { name: 'Cardly' },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [{ name: 'cardlyApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Account', value: 'account' },
          { name: 'Artwork', value: 'artwork' },
          { name: 'Contact', value: 'contact' },
          { name: 'Order', value: 'order' },
        ],
        default: 'order',
      },
      ...accountOperations,
      ...artworkOperations,
      ...artworkFields,
    ],
  };

  methods = {
    loadOptions: {
      async getArtwork(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const items = await cardlyApiRequestAllItems.call(this, 'GET', '/art', { limit: 100 });
        return items.map((a: any) => ({ name: a.name ?? a.slug ?? a.id, value: a.id }));
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        let responseData: any;

        if (resource === 'account' && operation === 'getBalance') {
          responseData = unwrap(await cardlyApiRequest.call(this, 'GET', '/account/balance'));
        } else if (resource === 'artwork' && operation === 'getMany') {
          const returnAll = this.getNodeParameter('returnAll', i) as boolean;
          const ownOnly = this.getNodeParameter('ownOnly', i) as boolean;
          const qs: any = {};
          if (ownOnly) qs.ownOnly = true;
          if (returnAll) {
            responseData = await cardlyApiRequestAllItems.call(this, 'GET', '/art', qs);
          } else {
            qs.limit = this.getNodeParameter('limit', i) as number;
            responseData = unwrap(await cardlyApiRequest.call(this, 'GET', '/art', {}, qs))?.results ?? [];
          }
        } else {
          throw new Error(`Unsupported operation ${resource}:${operation}`);
        }

        const asArray = Array.isArray(responseData) ? responseData : [responseData];
        for (const entry of asArray) {
          returnData.push({ json: entry, pairedItem: { item: i } });
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
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest test/cardlyNode.test.ts`
Expected: PASS (2 tests). (Order/Contact resource options already declared though their operations arrive in Tasks 7–8.)

- [ ] **Step 7: Lint and build**

Run: `npm run lint && npm run build`
Expected: exits 0.

- [ ] **Step 8: Live smoke test (test key) — account balance**

Run:
```bash
KEY=$(op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key")
curl -s -H "API-Key: $KEY" https://api.card.ly/v2/account/balance | head -c 400; echo
unset KEY
```
Expected: a `{"state":{"status":"OK",...},"data":{"balance":...}}` envelope. Confirms auth header + endpoint shape used by the node.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Cardly action node with account balance and artwork list"
```

---

### Task 7: Order operations on the action node

**Files:**
- Create: `nodes/Cardly/descriptions/OrderDescription.ts`
- Modify: `nodes/Cardly/Cardly.node.ts` (import order descriptions; add order branches to `execute`)
- Test: `test/orderDescription.test.ts`

**Interfaces:**
- Consumes: `buildPlaceBody`, `buildPreviewBody`, `OrderLineInput` (Task 4); `cardlyApiRequest`, `cardlyApiRequestAllItems`, `unwrap` (Task 3).
- Produces: order operations `place`, `preview`, `get`, `getMany`; a private helper `readOrderLineInput(this, i): OrderLineInput` collecting the node fields into the builder input shape.

- [ ] **Step 1: Write the failing test**

```ts
import { orderOperations } from '../nodes/Cardly/descriptions/OrderDescription';

describe('OrderDescription', () => {
  it('declares place, preview, get, getMany operations', () => {
    const op = orderOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['place', 'preview', 'get', 'getMany']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/orderDescription.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `OrderDescription.ts`**

```ts
import { INodeProperties } from 'n8n-workflow';

export const orderOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['order'] } },
    options: [
      { name: 'Place', value: 'place', action: 'Place a card order', description: 'Place a real card order (test keys validate only)' },
      { name: 'Preview', value: 'preview', action: 'Preview a card', description: 'Generate a watermarked preview and cost/delivery estimate' },
      { name: 'Get', value: 'get', action: 'Get an order' },
      { name: 'Get Many', value: 'getMany', action: 'Get many orders' },
    ],
    default: 'place',
  },
];

const cardFields: INodeProperties[] = [
  {
    displayName: 'Artwork Name or ID',
    name: 'artwork',
    type: 'options',
    typeOptions: { loadOptionsMethod: 'getArtwork' },
    default: '',
    required: true,
    description: 'Artwork to use. Choose from the list, or specify an ID/slug using an expression. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    displayOptions: { show: { resource: ['order'], operation: ['place', 'preview'] } },
  },
  {
    displayName: 'Template ID',
    name: 'template',
    type: 'string',
    default: '',
    description: 'Optional template ID to populate the card',
    displayOptions: { show: { resource: ['order'], operation: ['place', 'preview'] } },
  },
  {
    displayName: 'Recipient',
    name: 'recipient',
    type: 'fixedCollection',
    default: {},
    typeOptions: { multipleValues: false },
    displayOptions: { show: { resource: ['order'], operation: ['place', 'preview'] } },
    options: [
      {
        name: 'value',
        displayName: 'Recipient',
        values: [
          { displayName: 'First Name', name: 'firstName', type: 'string', default: '', required: true },
          { displayName: 'Last Name', name: 'lastName', type: 'string', default: '' },
          { displayName: 'Company', name: 'company', type: 'string', default: '' },
          { displayName: 'Address', name: 'address', type: 'string', default: '', required: true },
          { displayName: 'Address 2', name: 'address2', type: 'string', default: '' },
          { displayName: 'City', name: 'city', type: 'string', default: '', required: true },
          { displayName: 'Region', name: 'region', type: 'string', default: '', description: 'State/province. Conditionally required by country.' },
          { displayName: 'Postcode', name: 'postcode', type: 'string', default: '', description: 'Conditionally required by country.' },
          { displayName: 'Country', name: 'country', type: 'string', default: '', required: true, description: '2-character ISO country code, e.g. US' },
        ],
      },
    ],
  },
  {
    displayName: 'Additional Fields',
    name: 'additionalFields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: { show: { resource: ['order'], operation: ['place', 'preview'] } },
    options: [
      { displayName: 'Quantity', name: 'quantity', type: 'number', default: 1, typeOptions: { minValue: 1 } },
      {
        displayName: 'Shipping Method',
        name: 'shippingMethod',
        type: 'options',
        default: 'standard',
        options: [
          { name: 'Standard (all regions)', value: 'standard' },
          { name: 'Tracked (Australia only)', value: 'tracked' },
          { name: 'Express (Australia & US only)', value: 'express' },
        ],
      },
      { displayName: 'Ship To Me', name: 'shipToMe', type: 'boolean', default: false, description: 'Whether to send the card to the sender (adds a blank envelope; small extra credit cost)' },
      { displayName: 'Requested Arrival', name: 'requestedArrival', type: 'dateTime', default: '', description: 'Future requested arrival date' },
      {
        displayName: 'Template Variables',
        name: 'variables',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        options: [{ name: 'variable', displayName: 'Variable', values: [
          { displayName: 'Key', name: 'key', type: 'string', default: '' },
          { displayName: 'Value', name: 'value', type: 'string', default: '' },
        ] }],
      },
      {
        displayName: 'Message Pages',
        name: 'messagePages',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        description: 'Override text on specific card pages',
        options: [{ name: 'page', displayName: 'Page', values: [
          { displayName: 'Page Number', name: 'page', type: 'number', default: 1, description: '1-based page (1 = front)' },
          { displayName: 'Text', name: 'text', type: 'string', typeOptions: { rows: 3 }, default: '' },
        ] }],
      },
    ],
  },
  {
    displayName: 'Sender (all fields required if any set)',
    name: 'sender',
    type: 'fixedCollection',
    default: {},
    typeOptions: { multipleValues: false },
    displayOptions: { show: { resource: ['order'], operation: ['place', 'preview'] } },
    options: [
      {
        name: 'value',
        displayName: 'Sender',
        values: [
          { displayName: 'First Name', name: 'firstName', type: 'string', default: '' },
          { displayName: 'Last Name', name: 'lastName', type: 'string', default: '' },
          { displayName: 'Company', name: 'company', type: 'string', default: '' },
          { displayName: 'Address', name: 'address', type: 'string', default: '' },
          { displayName: 'Address 2', name: 'address2', type: 'string', default: '' },
          { displayName: 'City', name: 'city', type: 'string', default: '' },
          { displayName: 'Region', name: 'region', type: 'string', default: '' },
          { displayName: 'Postcode', name: 'postcode', type: 'string', default: '' },
          { displayName: 'Country', name: 'country', type: 'string', default: '' },
        ],
      },
    ],
  },
  {
    displayName: 'Purchase Order Number',
    name: 'purchaseOrderNumber',
    type: 'string',
    default: '',
    displayOptions: { show: { resource: ['order'], operation: ['place'] } },
    description: 'Reference stored against the whole order',
  },
];

const getFields: INodeProperties[] = [
  {
    displayName: 'Order ID',
    name: 'orderId',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['order'], operation: ['get'] } },
  },
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['order'], operation: ['getMany'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['order'], operation: ['getMany'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
];

export const orderFields: INodeProperties[] = [...cardFields, ...getFields];
```

- [ ] **Step 4: Wire orders into `Cardly.node.ts`**

Add imports near the other description imports:

```ts
import { buildPlaceBody, buildPreviewBody, OrderLineInput } from './helpers/orderBuilder';
import { orderOperations, orderFields } from './descriptions/OrderDescription';
```

Add to the `properties` array (after `...artworkFields`):

```ts
      ...orderOperations,
      ...orderFields,
```

Add this private method to the class (above `execute`):

```ts
  private static readOrderLineInput(ctx: IExecuteFunctions, i: number): OrderLineInput {
    const artwork = ctx.getNodeParameter('artwork', i) as string;
    const template = ctx.getNodeParameter('template', i, '') as string;
    const recipient = (ctx.getNodeParameter('recipient.value', i, {}) as any);
    const sender = (ctx.getNodeParameter('sender.value', i, {}) as any);
    const add = ctx.getNodeParameter('additionalFields', i, {}) as any;

    const variables: Record<string, string> = {};
    for (const v of (add.variables?.variable ?? [])) variables[v.key] = v.value;

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
```

Add these branches inside the `execute` per-item `try`, before the final `else throw`:

```ts
        } else if (resource === 'order' && operation === 'place') {
          const line = Cardly.readOrderLineInput(this, i);
          const po = this.getNodeParameter('purchaseOrderNumber', i, '') as string;
          const body = buildPlaceBody([line], po || undefined);
          responseData = unwrap(await cardlyApiRequest.call(this, 'POST', '/orders/place', body));
        } else if (resource === 'order' && operation === 'preview') {
          const line = Cardly.readOrderLineInput(this, i);
          const body = buildPreviewBody(line);
          responseData = unwrap(await cardlyApiRequest.call(this, 'POST', '/orders/preview', body));
        } else if (resource === 'order' && operation === 'get') {
          const orderId = this.getNodeParameter('orderId', i) as string;
          responseData = unwrap(await cardlyApiRequest.call(this, 'GET', `/orders/${orderId}`));
        } else if (resource === 'order' && operation === 'getMany') {
          const returnAll = this.getNodeParameter('returnAll', i) as boolean;
          if (returnAll) {
            responseData = await cardlyApiRequestAllItems.call(this, 'GET', '/orders', {});
          } else {
            const limit = this.getNodeParameter('limit', i) as number;
            responseData = unwrap(await cardlyApiRequest.call(this, 'GET', '/orders', {}, { limit }))?.results ?? [];
          }
```

- [ ] **Step 5: Run tests**

Run: `npx jest`
Expected: PASS (all suites, including the new `orderDescription.test.ts`).

- [ ] **Step 6: Lint and build**

Run: `npm run lint && npm run build`
Expected: exits 0.

- [ ] **Step 7: Live smoke test (test key) — preview + place(testMode)**

Run:
```bash
KEY=$(op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key")
BODY='{"artwork":"happy-birthday","recipient":{"firstName":"Thor","address":"1 Main Street","city":"Brooklyn","region":"NY","postcode":"12345","country":"US"}}'
echo "--- preview ---"
curl -s -H "API-Key: $KEY" -H "Content-Type: application/json" -d "$BODY" https://api.card.ly/v2/orders/preview | head -c 500; echo
echo "--- place (should be testMode:true, no charge) ---"
curl -s -H "API-Key: $KEY" -H "Content-Type: application/json" -d "{\"lines\":[$BODY]}" https://api.card.ly/v2/orders/place | head -c 500; echo
unset KEY BODY
```
Expected: preview returns `data.preview.urls.card` + `data.order.creditCost`; place returns an order with `testMode: true` and no credit deducted. If `happy-birthday` slug is not on the org, substitute an artwork ID from the balance/art smoke test.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add order place/preview/get/list operations to Cardly node"
```

---

### Task 8: Contact operations on the action node

**Files:**
- Create: `nodes/Cardly/descriptions/ContactDescription.ts`
- Modify: `nodes/Cardly/Cardly.node.ts` (import contact descriptions + builder; add contact branches)
- Test: `test/contactDescription.test.ts`

**Interfaces:**
- Consumes: `buildContactBody`, `ContactInput` (Task 5); `cardlyApiRequest`, `unwrap` (Task 3).
- Produces: contact operations `create`, `sync`; a private helper `readContactInput(this, i): ContactInput`.

- [ ] **Step 1: Write the failing test**

```ts
import { contactOperations } from '../nodes/Cardly/descriptions/ContactDescription';

describe('ContactDescription', () => {
  it('declares create and sync operations and a listId field', () => {
    const op = contactOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['create', 'sync']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/contactDescription.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `ContactDescription.ts`**

```ts
import { INodeProperties } from 'n8n-workflow';

export const contactOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['contact'] } },
    options: [
      { name: 'Create', value: 'create', action: 'Create a contact', description: 'Add a contact (rejects duplicates by externalId/email)' },
      { name: 'Sync', value: 'sync', action: 'Sync a contact', description: 'Create or update by externalId/email' },
    ],
    default: 'create',
  },
];

export const contactFields: INodeProperties[] = [
  {
    displayName: 'Contact List ID',
    name: 'listId',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contact'] } },
    description: 'The Cardly contact list to add to. Find the ID in the list URL in the Cardly portal.',
  },
  {
    displayName: 'First Name',
    name: 'firstName',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contact'] } },
  },
  {
    displayName: 'Address',
    name: 'address',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contact'] } },
  },
  {
    displayName: 'Locality (City/Suburb)',
    name: 'locality',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contact'] } },
  },
  {
    displayName: 'Country',
    name: 'country',
    type: 'string',
    default: '',
    required: true,
    description: '2-character ISO country code, e.g. US',
    displayOptions: { show: { resource: ['contact'] } },
  },
  {
    displayName: 'Additional Fields',
    name: 'additionalFields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: { show: { resource: ['contact'] } },
    options: [
      { displayName: 'External ID', name: 'externalId', type: 'string', default: '' },
      { displayName: 'Last Name', name: 'lastName', type: 'string', default: '' },
      { displayName: 'Email', name: 'email', type: 'string', default: '' },
      { displayName: 'Company', name: 'company', type: 'string', default: '' },
      { displayName: 'Address 2', name: 'address2', type: 'string', default: '' },
      { displayName: 'Region', name: 'region', type: 'string', default: '', description: 'State/province. Conditionally required by country.' },
      { displayName: 'Postcode', name: 'postcode', type: 'string', default: '', description: 'Conditionally required by country.' },
      {
        displayName: 'Custom Fields',
        name: 'fields',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        description: 'Custom list fields keyed by Cardly field code',
        options: [{ name: 'field', displayName: 'Field', values: [
          { displayName: 'Field Code', name: 'key', type: 'string', default: '' },
          { displayName: 'Value', name: 'value', type: 'string', default: '' },
        ] }],
      },
    ],
  },
];
```

- [ ] **Step 4: Wire contacts into `Cardly.node.ts`**

Add imports:

```ts
import { buildContactBody, ContactInput } from './helpers/contactBuilder';
import { contactOperations, contactFields } from './descriptions/ContactDescription';
```

Add to `properties` (after `...orderFields`):

```ts
      ...contactOperations,
      ...contactFields,
```

Add a private method:

```ts
  private static readContactInput(ctx: IExecuteFunctions, i: number): ContactInput {
    const add = ctx.getNodeParameter('additionalFields', i, {}) as any;
    const fields: Record<string, string> = {};
    for (const f of (add.fields?.field ?? [])) fields[f.key] = f.value;
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
```

Add branches in `execute` (before final `else throw`):

```ts
        } else if (resource === 'contact' && (operation === 'create' || operation === 'sync')) {
          const listId = this.getNodeParameter('listId', i) as string;
          const input = Cardly.readContactInput(this, i);
          const body = buildContactBody(input, operation as 'create' | 'sync');
          const endpoint = operation === 'sync'
            ? `/contact-lists/${listId}/contacts/sync`
            : `/contact-lists/${listId}/contacts`;
          responseData = unwrap(await cardlyApiRequest.call(this, 'POST', endpoint, body));
```

- [ ] **Step 5: Run tests**

Run: `npx jest`
Expected: PASS (all suites).

- [ ] **Step 6: Lint and build**

Run: `npm run lint && npm run build`
Expected: exits 0.

- [ ] **Step 7: Live smoke test (test key) — contact create (no mutation in test mode)**

Run:
```bash
KEY=$(op read "op://Creative People Inc/Cardly/api_keys_contracts/development_key")
# Replace LIST with a real contact list ID from your Cardly portal:
LIST="REPLACE_WITH_LIST_ID"
curl -s -H "API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"firstName":"Thor","email":"thor@example.com","address":"1 Main Street","locality":"Brooklyn","region":"NY","postcode":"12345","country":"US"}' \
  "https://api.card.ly/v2/contact-lists/$LIST/contacts" | head -c 500; echo
unset KEY LIST
```
Expected: an envelope with `data.locality === "Brooklyn"` and `adminAreaLevel1 === "NY"` (test key validates without persisting). A `404` means the list ID is wrong; a `422` prints the offending field.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add contact create/sync operations to Cardly node"
```

---

### Task 9: Webhook signature helper (best-effort)

**Files:**
- Create: `nodes/Cardly/helpers/signature.ts`
- Test: `test/signature.test.ts`

**Interfaces:**
- Consumes: nothing (pure crypto over Node's `crypto`).
- Produces:
  - `extractSignatureHeaders(headers: Record<string, any>): Record<string, string>` — returns any header whose lowercased name contains `signature` or starts with `x-cardly` (so postbacks expose whatever Cardly actually sends, for empirical discovery).
  - `verifyCardlySignature(rawBody: string, secret: string, signatureHeader: string | undefined, algorithm?: string): boolean` — computes `HMAC-<algorithm||sha256>(rawBody, secret)` hex digest and compares (timing-safe) to `signatureHeader`; returns `true` when `signatureHeader` is undefined/empty (cannot verify → do not block) so v1 never silently drops events.

- [ ] **Step 1: Write the failing tests**

```ts
import { createHmac } from 'crypto';
import { extractSignatureHeaders, verifyCardlySignature } from '../nodes/Cardly/helpers/signature';

describe('extractSignatureHeaders', () => {
  it('picks out signature-ish headers case-insensitively', () => {
    const out = extractSignatureHeaders({ 'X-Cardly-Signature': 'abc', 'Content-Type': 'application/json' });
    expect(out['x-cardly-signature']).toBe('abc');
    expect(out['content-type']).toBeUndefined();
  });
});

describe('verifyCardlySignature', () => {
  const secret = 's3cr3t';
  const body = '{"event":"contact.order.sent"}';
  const good = createHmac('sha256', secret).update(body).digest('hex');

  it('returns true for a matching sha256 hmac', () => {
    expect(verifyCardlySignature(body, secret, good)).toBe(true);
  });
  it('returns false for a wrong signature', () => {
    expect(verifyCardlySignature(body, secret, 'deadbeef')).toBe(false);
  });
  it('returns true (does not block) when no signature header is present', () => {
    expect(verifyCardlySignature(body, secret, undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest test/signature.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
import { createHmac, timingSafeEqual } from 'crypto';

export function extractSignatureHeaders(headers: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const key = k.toLowerCase();
    if (key.includes('signature') || key.startsWith('x-cardly')) {
      out[key] = Array.isArray(v) ? String(v[0]) : String(v);
    }
  }
  return out;
}

export function verifyCardlySignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | undefined,
  algorithm = 'sha256',
): boolean {
  if (!signatureHeader) return true; // cannot verify → do not block (scheme not yet confirmed)
  const expected = createHmac(algorithm, secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest test/signature.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add best-effort webhook signature helper (HMAC-SHA256, non-blocking)"
```

---

### Task 10: `Cardly Trigger` node

**Files:**
- Create: `nodes/Cardly/CardlyTrigger.node.ts`
- Test: `test/cardlyTrigger.test.ts`

**Interfaces:**
- Consumes: `cardlyApiRequest`, `unwrap` (Task 3); `extractSignatureHeaders`, `verifyCardlySignature` (Task 9).
- Produces: node type `cardlyTrigger` with a `webhook` default entry, an `events` multi-options property (9 events), `webhookMethods.default.{checkExists,create,delete}`, and a `webhook()` returning the postback body.

- [ ] **Step 1: Write the failing test**

```ts
import { CardlyTrigger } from '../nodes/Cardly/CardlyTrigger.node';

describe('Cardly Trigger node', () => {
  const node = new CardlyTrigger();

  it('is a webhook trigger named cardlyTrigger', () => {
    expect(node.description.name).toBe('cardlyTrigger');
    expect(node.description.webhooks?.length).toBeGreaterThan(0);
  });

  it('exposes all 9 Cardly events', () => {
    const events = node.description.properties.find((p) => p.name === 'events')!;
    const values = (events.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining([
      'contact.order.created', 'contact.order.sent', 'contact.order.refunded',
      'giftCard.redeemed', 'qrCode.scanned', 'contact.undeliverable',
      'contact.changeOfAddress', 'consignment.undeliverable', 'consignment.changeOfAddress',
    ]));
  });

  it('implements the webhook lifecycle', () => {
    expect(node.webhookMethods?.default?.create).toBeInstanceOf(Function);
    expect(node.webhookMethods?.default?.checkExists).toBeInstanceOf(Function);
    expect(node.webhookMethods?.default?.delete).toBeInstanceOf(Function);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/cardlyTrigger.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `CardlyTrigger.node.ts`**

```ts
import {
  IHookFunctions,
  IWebhookFunctions,
  IDataObject,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  NodeConnectionType,
} from 'n8n-workflow';

import { cardlyApiRequest, unwrap } from './GenericFunctions';
import { extractSignatureHeaders, verifyCardlySignature } from './helpers/signature';

const CARDLY_EVENTS = [
  'contact.order.created',
  'contact.order.sent',
  'contact.order.refunded',
  'giftCard.redeemed',
  'qrCode.scanned',
  'contact.undeliverable',
  'contact.changeOfAddress',
  'consignment.undeliverable',
  'consignment.changeOfAddress',
];

export class CardlyTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Cardly Trigger',
    name: 'cardlyTrigger',
    icon: 'file:cardly.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts a workflow when Cardly fires a subscribed webhook event',
    defaults: { name: 'Cardly Trigger' },
    inputs: [],
    outputs: [NodeConnectionType.Main],
    credentials: [{ name: 'cardlyApi', required: true }],
    webhooks: [
      { name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
    ],
    properties: [
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        required: true,
        default: [],
        description: 'Cardly events that will trigger this workflow',
        options: CARDLY_EVENTS.map((e) => ({ name: e, value: e })),
      },
      {
        displayName: 'Verify Signature',
        name: 'verifySignature',
        type: 'boolean',
        default: false,
        description:
          'Whether to reject postbacks that fail HMAC-SHA256 verification. Off by default until the Cardly signature scheme is confirmed; signature headers are always passed through on the output regardless.',
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        if (!webhookData.webhookId) return false;
        try {
          await cardlyApiRequest.call(this, 'GET', `/webhooks/${webhookData.webhookId}`);
          return true;
        } catch (error) {
          return false;
        }
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default') as string;
        const events = this.getNodeParameter('events') as string[];
        const response = await cardlyApiRequest.call(this, 'POST', '/webhooks', {
          targetUrl: webhookUrl,
          events,
          description: 'Created by n8n Cardly Trigger',
        });
        const data = unwrap(response);
        if (!data?.id) return false;
        const webhookData = this.getWorkflowStaticData('node');
        webhookData.webhookId = data.id;
        webhookData.secret = data.secret; // only returned at creation
        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        if (!webhookData.webhookId) return true;
        try {
          await cardlyApiRequest.call(this, 'DELETE', `/webhooks/${webhookData.webhookId}`);
        } catch (error) {
          return false;
        }
        delete webhookData.webhookId;
        delete webhookData.secret;
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const headers = this.getHeaderData() as IDataObject;
    const body = this.getBodyData() as IDataObject;
    const verify = this.getNodeParameter('verifySignature', false) as boolean;

    const signatureHeaders = extractSignatureHeaders(headers as Record<string, any>);

    if (verify) {
      const secret = (this.getWorkflowStaticData('node').secret as string) || '';
      const rawBody = (req as any).rawBody ? (req as any).rawBody.toString() : JSON.stringify(body);
      const sig = Object.values(signatureHeaders)[0];
      if (secret && !verifyCardlySignature(rawBody, secret, sig)) {
        return { noWebhookResponse: true };
      }
    }

    return {
      workflowData: [this.helpers.returnJsonArray([{ ...body, _signatureHeaders: signatureHeaders }])],
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/cardlyTrigger.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: exits 0.

- [ ] **Step 6: Manual live-key test (documented, not automated)**

This step requires a LIVE key and a public n8n instance URL. Record findings in the README.
1. Set the `cardlyApi` credential to a live key in a local/public n8n.
2. Add a `Cardly Trigger`, select `contact.order.sent`, activate the workflow.
3. Confirm via `GET /webhooks` (live key) that a webhook now points at the n8n URL.
4. Place a real small order (or trigger a test event if Cardly support can) and inspect the received item — note the actual signature header name(s) surfaced in `_signatureHeaders`.
5. Deactivate the workflow; confirm the webhook is deleted.
6. If a signature header is present, capture its name/format and open a follow-up task to finalize `verifyCardlySignature` (algorithm + which header) and flip the default to on.

Expected: webhook auto-registers on activate and is removed on deactivate; `_signatureHeaders` reveals the real scheme.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Cardly Trigger node with webhook lifecycle and passthrough signature headers"
```

---

### Task 11: README, index, and publish prep

**Files:**
- Create: `README.md`
- Create: `index.js`
- Create: `LICENSE`
- Modify: `package.json` (only if any script/field needs correcting after build)

**Interfaces:**
- Consumes: everything built. Produces: an installable, documented package.

- [ ] **Step 1: Create `index.js`** (community packages load from the `n8n` manifest; a minimal entry keeps `main` valid)

```js
module.exports = {};
```

- [ ] **Step 2: Create `LICENSE`** (MIT, current year, "Alpha Omega Team")

```
MIT License

Copyright (c) 2026 Alpha Omega Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: Create `README.md`**

````markdown
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
````

- [ ] **Step 4: Full verification pass**

Run: `npm run build && npm run lint && npm test`
Expected: all exit 0; Jest reports all suites passing.

- [ ] **Step 5: Package dry-run**

Run: `npm pack --dry-run`
Expected: the tarball lists only `dist/**`, `README.md`, `LICENSE`, `package.json` (no `test/`, `nodes/**/*.ts` sources leaking beyond `dist`).

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "docs: add README, license, and publish metadata"
git push origin main
```

---

## Notes for the executor

- Do NOT run `npm publish` — publishing is a separate, explicit decision by the maintainer.
- The two live smoke tests that mutate nothing (balance, preview, place-in-test-mode, contact-in-test-mode) can run in CI-less local verification with the test key. The Trigger node's live test (Task 10 Step 6) needs a live key and a publicly reachable n8n URL — run it manually.
- If lint flags n8n-nodes-base rules (e.g. alphabetical option ordering, `displayName` casing, missing `description`), fix per the rule message; these are style rules and the fixes are mechanical.
- If `happy-birthday` artwork slug is unavailable on the test org, pull a real artwork ID from `GET /art` first and substitute it in the order smoke tests.
