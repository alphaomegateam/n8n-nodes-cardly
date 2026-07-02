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
