import { CardlyApi } from '../credentials/CardlyApi.credentials';

describe('CardlyApi credential', () => {
  const cred = new CardlyApi();

  it('is named cardlyApi and has an apiKey + baseUrl property', () => {
    expect(cred.name).toBe('cardlyApi');
    const names = cred.properties.map((p) => p.name);
    expect(names).toContain('apiKey');
    expect(names).toContain('baseUrl');
  });

  it('sends the API-Key header from apiKey', () => {
    expect(cred.authenticate.properties.headers?.['API-Key']).toBe('={{$credentials.apiKey}}');
  });

  it('tests against the balance endpoint', () => {
    expect(cred.test.request.url).toBe('/account/balance');
    expect(cred.test.request.baseURL).toBe('={{$credentials.baseUrl}}');
  });
});
