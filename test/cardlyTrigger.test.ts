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

  it('webhook() returns {} (no workflowData) when verification fails', async () => {
    const staticData: Record<string, any> = { secret: 'shh' };
    const fakeThis: any = {
      getRequestObject: () => ({ rawBody: Buffer.from('{"foo":"bar"}') }),
      getHeaderData: () => ({ 'x-cardly-signature': 'not-a-valid-signature' }),
      getBodyData: () => ({ foo: 'bar' }),
      getNodeParameter: () => true,
      getWorkflowStaticData: () => staticData,
      helpers: { returnJsonArray: (items: any[]) => items },
    };

    const result = await node.webhook.call(fakeThis);

    expect(result).toEqual({});
    expect(result.workflowData).toBeUndefined();
  });

  it('webhook() returns workflowData when verifySignature is OFF', async () => {
    const staticData: Record<string, any> = { secret: 'shh' };
    const fakeThis: any = {
      getRequestObject: () => ({ rawBody: Buffer.from('{"foo":"bar"}') }),
      getHeaderData: () => ({ 'x-cardly-signature': 'not-a-valid-signature' }),
      getBodyData: () => ({ foo: 'bar' }),
      getNodeParameter: () => false,
      getWorkflowStaticData: () => staticData,
      helpers: { returnJsonArray: (items: any[]) => items },
    };

    const result = await node.webhook.call(fakeThis);

    expect(result.workflowData).toBeDefined();
  });
});
