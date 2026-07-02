import { IDataObject } from 'n8n-workflow';

export const CARDLY_WEBHOOK_EVENTS = [
  'contact.order.created', 'contact.order.sent', 'contact.order.refunded',
  'giftCard.redeemed', 'qrCode.scanned', 'contact.undeliverable',
  'contact.changeOfAddress', 'consignment.undeliverable', 'consignment.changeOfAddress',
];

export interface WebhookInput {
  targetUrl: string;
  events?: string[];
  description?: string;
  metadata?: IDataObject;
  disabled?: boolean;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

export function buildWebhookBody(input: WebhookInput, mode: 'create' | 'update'): IDataObject {
  if (isEmpty(input.targetUrl)) throw new Error('Webhook requires a targetUrl.');
  if (mode === 'create' && (!input.events || input.events.length === 0)) {
    throw new Error('Webhook create requires at least one event in events.');
  }
  const body: IDataObject = { targetUrl: input.targetUrl };
  if (input.events && input.events.length > 0) body.events = input.events;
  if (!isEmpty(input.description)) body.description = input.description;
  if (input.metadata && Object.keys(input.metadata).length > 0) body.metadata = input.metadata;
  if (mode === 'update' && input.disabled !== undefined) body.disabled = input.disabled;
  return body;
}
