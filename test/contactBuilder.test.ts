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
});
