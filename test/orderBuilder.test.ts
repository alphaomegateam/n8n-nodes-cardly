import {
  validateSender,
  buildOrderLine,
  buildPlaceBody,
  buildPreviewBody,
} from '../nodes/Cardly/helpers/orderBuilder';

const recipient = {
  firstName: 'Thor',
  address: '1 Main Street',
  city: 'Brooklyn',
  region: 'NY',
  postcode: '12345',
  country: 'US',
};

describe('validateSender', () => {
  it('returns undefined when no sender fields are set', () => {
    expect(validateSender(undefined)).toBeUndefined();
    expect(validateSender({})).toBeUndefined();
  });
  it('throws when the sender is partially filled', () => {
    expect(() => validateSender({ firstName: 'Bruce' })).toThrow(/all sender/i);
  });
  it('returns the sender when fully filled', () => {
    const sender = { firstName: 'Bruce', address: '1 Main', city: 'Brooklyn', country: 'US' };
    expect(validateSender(sender)).toEqual(sender);
  });
});

describe('buildOrderLine', () => {
  it('nests the recipient with a city field and omits empty sender', () => {
    const line = buildOrderLine({ artwork: 'happy-birthday', recipient });
    expect(line.artwork).toBe('happy-birthday');
    expect((line.recipient as any).city).toBe('Brooklyn');
    expect(line.sender).toBeUndefined();
  });
  it('places shipping fields inside the line', () => {
    const line = buildOrderLine({ artwork: 'x', recipient, shippingMethod: 'express', shipToMe: true });
    expect(line.shippingMethod).toBe('express');
    expect(line.shipToMe).toBe(true);
  });
  it('maps message pages using the page key (not name)', () => {
    const line = buildOrderLine({
      artwork: 'x',
      recipient,
      messagePages: [{ page: 3, text: 'Hi' }],
    });
    expect((line.messages as any).pages[0].page).toBe(3);
    expect((line.messages as any).pages[0].text).toBe('Hi');
  });
});

describe('buildPlaceBody', () => {
  it('wraps lines and keeps purchaseOrderNumber top-level', () => {
    const body = buildPlaceBody([{ artwork: 'x', recipient }], 'PO1');
    expect(Array.isArray(body.lines)).toBe(true);
    expect((body.lines as any).length).toBe(1);
    expect(body.purchaseOrderNumber).toBe('PO1');
  });
});

describe('buildPreviewBody', () => {
  it('produces a flat body with no lines array', () => {
    const body = buildPreviewBody({ artwork: 'x', recipient });
    expect(body.lines).toBeUndefined();
    expect(body.artwork).toBe('x');
    expect((body.recipient as any).city).toBe('Brooklyn');
  });
});
