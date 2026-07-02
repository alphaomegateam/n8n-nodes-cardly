jest.mock('../nodes/Cardly/GenericFunctions', () => ({
  cardlyApiRequest: jest.fn(),
  unwrap: (r: any) => (r && r.data !== undefined ? r.data : r),
}));

import { CardlyTrigger } from '../nodes/Cardly/CardlyTrigger.node';
import { cardlyApiRequest } from '../nodes/Cardly/GenericFunctions';

const mockRequest = cardlyApiRequest as jest.Mock;

describe('Cardly Trigger node', () => {
  const node = new CardlyTrigger();

  it('is a webhook trigger named cardlyTrigger', () => {
    expect(node.description.name).toBe('cardlyTrigger');
    expect(node.description.webhooks?.length).toBeGreaterThan(0);
  });

  it('exposes all 9 Cardly events', () => {
    const events = node.description.properties.find((p) => p.name === 'events')!;
    const values = (events.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining([
      'contact.order.created', 'contact.order.sent', 'contact.order.refunded',
      'giftCard.redeemed', 'qrCode.scanned', 'contact.undeliverable',
      'contact.changeOfAddress', 'consignment.undeliverable', 'consignment.changeOfAddress',
    ]));
  });

  it('implements the webhook lifecycle', () => {
    expect(node.webhookMethods?.default?.create).toBeInstanceOf(Function);
    expect(node.webhookMethods?.default?.checkExists).toBeInstanceOf(Function);
    expect(node.webhookMethods?.default?.delete).toBeInstanceOf(Function);
  });
});

describe('webhook lifecycle', () => {
  const node = new CardlyTrigger();

  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('create stores id + secret in static data and returns true', async () => {
    mockRequest.mockResolvedValue({ state: {}, data: { id: 'wh1', secret: 's1' } });
    const staticData: Record<string, any> = {};
    const fakeThis: any = {
      getNodeWebhookUrl: () => 'https://n8n/webhook',
      getNodeParameter: () => ['contact.order.sent'],
      getWorkflowStaticData: () => staticData,
    };

    const result = await node.webhookMethods.default.create.call(fakeThis);

    expect(result).toBe(true);
    expect(staticData.webhookId).toBe('wh1');
    expect(staticData.secret).toBe('s1');
  });

  it('checkExists returns false on 404', async () => {
    mockRequest.mockRejectedValue({ httpCode: '404' });
    const staticData: Record<string, any> = { webhookId: 'wh1' };
    const fakeThis: any = {
      getWorkflowStaticData: () => staticData,
    };

    const result = await node.webhookMethods.default.checkExists.call(fakeThis);

    expect(result).toBe(false);
  });

  it('checkExists rethrows on non-404 error', async () => {
    mockRequest.mockRejectedValue({ httpCode: '500' });
    const staticData: Record<string, any> = { webhookId: 'wh1' };
    const fakeThis: any = {
      getWorkflowStaticData: () => staticData,
    };

    await expect(node.webhookMethods.default.checkExists.call(fakeThis)).rejects.toEqual({
      httpCode: '500',
    });
  });

  it('delete clears static data and returns true on 404 (already gone)', async () => {
    mockRequest.mockRejectedValue({ httpCode: '404' });
    const staticData: Record<string, any> = { webhookId: 'wh1', secret: 's1' };
    const fakeThis: any = {
      getWorkflowStaticData: () => staticData,
    };

    const result = await node.webhookMethods.default.delete.call(fakeThis);

    expect(result).toBe(true);
    expect(staticData.webhookId).toBeUndefined();
    expect(staticData.secret).toBeUndefined();
  });

  it('delete rethrows on non-404 error', async () => {
    mockRequest.mockRejectedValue({ httpCode: '500' });
    const staticData: Record<string, any> = { webhookId: 'wh1', secret: 's1' };
    const fakeThis: any = {
      getWorkflowStaticData: () => staticData,
    };

    await expect(node.webhookMethods.default.delete.call(fakeThis)).rejects.toEqual({
      httpCode: '500',
    });
    expect(staticData.webhookId).toBe('wh1');
  });

  // A genuinely valid postback built from the docs' golden vector:
  // md5("secretabc.1234567890.{"test":true}") === 6ef4f0658ff7bb880fc3ae0cf7db3b2a
  const validRaw =
    '{"timestamp":1234567890,"data":{"test":true},"signatures":["6ef4f0658ff7bb880fc3ae0cf7db3b2a"]}';
  const validBody = { timestamp: 1234567890, data: { test: true }, signatures: ['6ef4f0658ff7bb880fc3ae0cf7db3b2a'] };
  const webhookThis = (opts: { raw: string; body: any; secret?: string; verify?: boolean }) => ({
    getRequestObject: () => ({ rawBody: Buffer.from(opts.raw) }),
    getBodyData: () => opts.body,
    getNodeParameter: (_name: string, def?: any) => (opts.verify ?? def),
    getWorkflowStaticData: () => (opts.secret !== undefined ? { secret: opts.secret } : {}),
    helpers: { returnJsonArray: (items: any[]) => items },
  });

  it('webhook() returns workflowData for a validly-signed postback (verify on by default)', async () => {
    const result = await node.webhook.call(webhookThis({ raw: validRaw, body: validBody, secret: 'secretabc' }) as any);
    expect(result.workflowData).toBeDefined();
  });

  it('webhook() returns {} when the signature does not match', async () => {
    const badBody = { ...validBody, signatures: ['deadbeef'] };
    const badRaw = '{"timestamp":1234567890,"data":{"test":true},"signatures":["deadbeef"]}';
    const result = await node.webhook.call(webhookThis({ raw: badRaw, body: badBody, secret: 'secretabc' }) as any);
    expect(result).toEqual({});
    expect(result.workflowData).toBeUndefined();
  });

  it('webhook() returns {} (fail-closed) when no secret is stored', async () => {
    const result = await node.webhook.call(webhookThis({ raw: validRaw, body: validBody, secret: '' }) as any);
    expect(result).toEqual({});
  });

  it('webhook() returns workflowData when verifySignature is OFF, even with a bad signature', async () => {
    const badBody = { ...validBody, signatures: ['deadbeef'] };
    const badRaw = '{"timestamp":1234567890,"data":{"test":true},"signatures":["deadbeef"]}';
    const result = await node.webhook.call(webhookThis({ raw: badRaw, body: badBody, secret: 'secretabc', verify: false }) as any);
    expect(result.workflowData).toBeDefined();
  });
});
