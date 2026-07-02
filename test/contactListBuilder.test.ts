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
