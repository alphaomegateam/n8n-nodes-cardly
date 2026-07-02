import { buildWebhookBody } from '../nodes/Cardly/helpers/webhookBuilder';

describe('buildWebhookBody', () => {
  it('create requires targetUrl and non-empty events', () => {
    expect(() => buildWebhookBody({ targetUrl: '', events: ['contact.order.sent'] } as any, 'create')).toThrow(/targetUrl/i);
    expect(() => buildWebhookBody({ targetUrl: 'https://x', events: [] } as any, 'create')).toThrow(/events/i);
  });
  it('update requires targetUrl and allows disabled', () => {
    expect(() => buildWebhookBody({ targetUrl: '' } as any, 'update')).toThrow(/targetUrl/i);
    const body = buildWebhookBody({ targetUrl: 'https://x', disabled: true }, 'update');
    expect(body.targetUrl).toBe('https://x');
    expect(body.disabled).toBe(true);
  });
  it('omits empty optional fields', () => {
    const body = buildWebhookBody({ targetUrl: 'https://x', events: ['contact.order.sent'], description: '' }, 'create');
    expect(body.description).toBeUndefined();
  });
});
