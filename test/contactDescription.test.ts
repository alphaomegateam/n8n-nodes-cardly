import { contactOperations } from '../nodes/Cardly/descriptions/ContactDescription';

describe('ContactDescription', () => {
  it('declares create and sync operations and a listId field', () => {
    const op = contactOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['create', 'sync']));
  });

  it('declares get, getMany, and find operations', () => {
    const op = contactOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['get', 'getMany', 'find']));
  });
});
