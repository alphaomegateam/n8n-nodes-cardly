import { NodeApiError } from 'n8n-workflow';
import {
  unwrap,
  mapCardlyError,
  cardlyApiRequestAllItems,
} from '../nodes/Cardly/GenericFunctions';

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

  // Regression: n8n's httpRequestWithAuthentication throws the axios shape
  // (response.status / response.data), NOT the older statusCode / response.body
  // shape the earlier tests mocked. mapCardlyError must read both, or every real
  // failure collapses to a generic message with no status/detail.
  it('reads the axios error shape (response.status / response.data)', () => {
    const err: any = {
      response: {
        status: 401,
        data: { state: { messages: ['Authentication failed: Invalid API-Key header supplied.'] } },
      },
    };
    const mapped = mapCardlyError.call(ctx, err);
    expect(mapped.message).toMatch(/Authentication failed/);
    expect(mapped.message).toMatch(/401/);
  });

  it('surfaces field validation from the axios shape regardless of status field name', () => {
    const err: any = {
      response: { status: 422, data: { data: { 'recipient.postcode': 'This value is required.' } } },
    };
    const mapped = mapCardlyError.call(ctx, err);
    expect(mapped.message).toMatch(/recipient\.postcode/);
  });

  it('falls back to a status-bearing message when no Cardly envelope is present', () => {
    const err: any = { response: { status: 404 }, message: 'Not Found' };
    const mapped = mapCardlyError.call(ctx, err);
    expect(mapped.message).toMatch(/404/);
  });
});

describe('mapCardlyError with an error n8n-core already wrapped', () => {
  // In production, httpRequestWithAuthentication throws a NodeApiError (with the axios
  // response body in context.data) BEFORE mapCardlyError sees it. The NodeApiError
  // constructor returns an existing NodeApiError unchanged, so building a new one with a
  // custom message silently keeps n8n's generic "Your request is invalid..." text.
  const node = { name: 'Cardly', type: 'cardly', typeVersion: 1, position: [0, 0], parameters: {} } as any;
  const ctx = { getNode: () => node } as any;
  const wrap = (status: number, data: any) =>
    new NodeApiError(node, {
      message: `Request failed with status code ${status}`,
      response: { status, data },
    } as any);

  it('surfaces 422 field detail', () => {
    const mapped = mapCardlyError.call(
      ctx,
      wrap(422, {
        state: { messages: ['One or more of your request parameters failed validation.'] },
        data: { 'variables.contractorName': 'This value is required.' },
      }),
    );
    expect(mapped.message).toMatch(/variables\.contractorName: This value is required/);
  });

  it('surfaces the status and Cardly message when there is no field detail', () => {
    const mapped = mapCardlyError.call(
      ctx,
      wrap(404, { state: { messages: ['The requested artwork could not be found.'] } }),
    );
    expect(mapped.message).toMatch(/404/);
    expect(mapped.message).toMatch(/artwork could not be found/);
  });
});

describe('cardlyApiRequestAllItems', () => {
  // Build a mock context whose httpRequest returns one page per call, driven by
  // the `page` query param — mirroring Cardly's real, page-based pagination.
  function makeCtx(pages: any[][]) {
    const calls: Array<Record<string, any>> = [];
    const total = pages.reduce((n, p) => n + p.length, 0);
    return {
      calls,
      ctx: {
        getNode: () => ({ name: 'Cardly' }),
        getCredentials: async () => ({ baseUrl: 'https://api.card.ly/v2' }),
        helpers: {
          async httpRequestWithAuthentication(_cred: string, options: any) {
            calls.push({ ...options.qs });
            const page = (options.qs.page as number) ?? 1;
            const limit = options.qs.limit as number;
            const results = pages[page - 1] ?? [];
            const lastRecord = results.length
              ? (page - 1) * limit + results.length
              : (page - 1) * limit;
            return { state: { status: 'OK' }, data: { results, meta: { totalRecords: total, lastRecord } } };
          },
        },
      } as any,
    };
  }

  it('walks pages by incrementing `page`, never sending `offset`', async () => {
    const p1 = Array.from({ length: 2 }, (_, i) => ({ id: `a${i}` }));
    const p2 = Array.from({ length: 2 }, (_, i) => ({ id: `b${i}` }));
    const p3 = [{ id: 'c0' }];
    const { ctx, calls } = makeCtx([p1, p2, p3]);

    const out = await cardlyApiRequestAllItems.call(ctx, 'GET', '/doodles', { limit: 2 });

    expect(out).toHaveLength(5);
    expect(calls.map((c) => c.page)).toEqual([1, 2, 3]);
    expect(calls.every((c) => c.offset === undefined)).toBe(true);
  });

  it('stops on the first short page', async () => {
    const { ctx, calls } = makeCtx([[{ id: 'a' }]]);
    const out = await cardlyApiRequestAllItems.call(ctx, 'GET', '/doodles', { limit: 100 });
    expect(out).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('stops once lastRecord reaches totalRecords even on a full final page', async () => {
    // Two full pages of 2 that exactly cover totalRecords=4 — must not request page 3.
    const { ctx, calls } = makeCtx([[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }, { id: 'd' }]]);
    const out = await cardlyApiRequestAllItems.call(ctx, 'GET', '/doodles', { limit: 2 });
    expect(out).toHaveLength(4);
    expect(calls.map((c) => c.page)).toEqual([1, 2]);
  });
});
