import { orderOperations } from '../nodes/Cardly/descriptions/OrderDescription';

describe('OrderDescription', () => {
  it('declares place, preview, get, getMany operations', () => {
    const op = orderOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['place', 'preview', 'get', 'getMany']));
  });
});
