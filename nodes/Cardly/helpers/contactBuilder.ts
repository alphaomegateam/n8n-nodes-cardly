import { IDataObject } from 'n8n-workflow';

export interface ContactInput {
  externalId?: string;
  firstName: string;
  lastName?: string;
  email?: string;
  company?: string;
  address: string;
  address2?: string;
  locality: string;
  region?: string;
  country: string;
  postcode?: string;
  fields?: IDataObject;
}

const CREATE_REQUIRED: (keyof ContactInput)[] = ['firstName', 'address', 'locality', 'country'];

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

export function buildContactBody(input: ContactInput, mode: 'create' | 'sync'): IDataObject {
  const missing = CREATE_REQUIRED.filter((k) => isEmpty(input[k]));
  if (missing.length > 0) {
    throw new Error(`Contact is missing required field(s): ${missing.join(', ')}.`);
  }
  if (mode === 'sync' && isEmpty(input.externalId) && isEmpty(input.email)) {
    throw new Error('Sync requires at least one of externalId or email to match on.');
  }

  const body: IDataObject = {};
  const assign = (k: keyof ContactInput) => {
    if (!isEmpty(input[k])) body[k] = input[k];
  };
  (['externalId', 'firstName', 'lastName', 'email', 'company', 'address', 'address2', 'locality', 'region', 'country', 'postcode'] as (keyof ContactInput)[])
    .forEach(assign);

  if (input.fields && Object.keys(input.fields).length > 0) {
    body.fields = input.fields;
  }
  return body;
}
