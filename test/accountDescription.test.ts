import { accountOperations } from '../nodes/Cardly/descriptions/AccountDescription';

describe('AccountDescription', () => {
  it('declares balance and credit-history operations', () => {
    const op = accountOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['getBalance', 'getCreditHistory', 'getGiftCreditHistory']));
  });
});
