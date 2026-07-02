import { IDataObject } from 'n8n-workflow';

export interface AddressInput {
  firstName: string;
  lastName?: string;
  company?: string;
  address: string;
  address2?: string;
  city: string;
  region?: string;
  postcode?: string;
  country: string;
}

export interface MessagePageInput {
  page: number;
  text?: string;
  style?: IDataObject;
}

export interface OrderLineInput {
  artwork: string;
  template?: string;
  quantity?: number;
  style?: IDataObject;
  messagePages?: MessagePageInput[];
  variables?: IDataObject;
  recipient: AddressInput;
  sender?: Partial<AddressInput>;
  shippingMethod?: 'standard' | 'tracked' | 'express';
  shipToMe?: boolean;
  requestedArrival?: string;
}

const SENDER_KEYS: (keyof AddressInput)[] = [
  'firstName', 'lastName', 'company', 'address', 'address2', 'city', 'region', 'postcode', 'country',
];
const SENDER_REQUIRED: (keyof AddressInput)[] = ['firstName', 'address', 'city', 'country'];

function compact(obj: IDataObject): IDataObject {
  const out: IDataObject = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

function buildAddress(a: AddressInput): IDataObject {
  return compact({
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    address: a.address,
    address2: a.address2,
    city: a.city,
    region: a.region,
    postcode: a.postcode,
    country: a.country,
  });
}

export function validateSender(sender?: Partial<AddressInput>): AddressInput | undefined {
  if (!sender) return undefined;
  const filled = SENDER_KEYS.filter((k) => {
    const v = sender[k];
    return v !== undefined && v !== null && v !== '';
  });
  if (filled.length === 0) return undefined;
  const missing = SENDER_REQUIRED.filter((k) => {
    const v = sender[k];
    return v === undefined || v === null || v === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `Sender is partially filled — if any sender field is set, all sender fields are required. Missing: ${missing.join(', ')}.`,
    );
  }
  return sender as AddressInput;
}

function lineCommon(input: OrderLineInput): IDataObject {
  const line: IDataObject = compact({
    artwork: input.artwork,
    template: input.template,
    quantity: input.quantity,
    style: input.style,
    variables: input.variables,
    recipient: buildAddress(input.recipient),
    shippingMethod: input.shippingMethod,
    shipToMe: input.shipToMe,
    requestedArrival: input.requestedArrival,
  });

  const sender = validateSender(input.sender);
  if (sender) line.sender = buildAddress(sender);

  if (input.messagePages && input.messagePages.length > 0) {
    line.messages = {
      pages: input.messagePages.map((p) => compact({ page: p.page, text: p.text, style: p.style })),
    };
  }
  return line;
}

export function buildOrderLine(input: OrderLineInput): IDataObject {
  return lineCommon(input);
}

export function buildPlaceBody(lines: OrderLineInput[], purchaseOrderNumber?: string): IDataObject {
  return compact({
    lines: lines.map((l) => buildOrderLine(l)),
    purchaseOrderNumber,
  });
}

export function buildPreviewBody(input: OrderLineInput): IDataObject {
  // Preview is a flat, single-card body — NOT wrapped in `lines`.
  return lineCommon(input);
}
