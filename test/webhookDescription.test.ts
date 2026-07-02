import { webhookOperations } from '../nodes/Cardly/descriptions/WebhookDescription';

describe('WebhookDescription', () => {
  it('declares full CRUD operations', () => {
    const op = webhookOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['getMany', 'get', 'create', 'update', 'delete']));
  });
});
