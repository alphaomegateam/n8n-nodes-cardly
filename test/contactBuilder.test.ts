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

  it('omits optional fields that are empty or undefined', () => {
    const body = buildContactBody({ ...base, email: 't@x.com', lastName: '', company: undefined } as any, 'create');
    expect(Object.keys(body)).not.toContain('lastName');
    expect(Object.keys(body)).not.toContain('company');
    expect(Object.keys(body)).not.toContain('address2');
    expect(Object.keys(body)).not.toContain('externalId');
  });

  it('omits the fields key when custom fields are empty or absent', () => {
    const noFields = buildContactBody({ ...base, email: 't@x.com' } as any, 'create');
    expect(noFields.fields).toBeUndefined();
    const emptyFields = buildContactBody({ ...base, email: 't@x.com', fields: {} } as any, 'create');
    expect(emptyFields.fields).toBeUndefined();
  });
});
