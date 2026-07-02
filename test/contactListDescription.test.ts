import { contactListOperations } from '../nodes/Cardly/descriptions/ContactListDescription';

describe('ContactListDescription', () => {
  it('declares getMany/get/create/delete and NO update', () => {
    const op = contactListOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['getMany', 'get', 'create', 'delete']));
    expect(values).not.toContain('update');
  });
});
