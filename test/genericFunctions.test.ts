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
