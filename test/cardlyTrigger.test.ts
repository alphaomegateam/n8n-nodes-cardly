import { CardlyTrigger } from '../nodes/Cardly/CardlyTrigger.node';

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
