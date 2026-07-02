import { IExecuteFunctions } from 'n8n-workflow';
import { cardlyApiRequest, unwrap } from '../GenericFunctions';
import { buildContactBody, ContactInput } from '../helpers/contactBuilder';

function readContactInput(ctx: IExecuteFunctions, i: number): ContactInput {
  const add = ctx.getNodeParameter('additionalFields', i, {}) as any;
  const fields: Record<string, string> = {};
  for (const f of add.fields?.field ?? []) if (f.key) fields[f.key] = f.value;
  return {
    firstName: ctx.getNodeParameter('firstName', i) as string,
    address: ctx.getNodeParameter('address', i) as string,
    locality: ctx.getNodeParameter('locality', i) as string,
    country: ctx.getNodeParameter('country', i) as string,
    externalId: add.externalId || undefined,
    lastName: add.lastName || undefined,
    email: add.email || undefined,
    company: add.company || undefined,
    address2: add.address2 || undefined,
    region: add.region || undefined,
    postcode: add.postcode || undefined,
    fields: Object.keys(fields).length ? fields : undefined,
  };
}

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  const listId = this.getNodeParameter('listId', i) as string;
  if (operation === 'create' || operation === 'sync') {
    const body = buildContactBody(readContactInput(this, i), operation as 'create' | 'sync');
    const endpoint = operation === 'sync'
      ? `/contact-lists/${listId}/contacts/sync`
      : `/contact-lists/${listId}/contacts`;
    return unwrap(await cardlyApiRequest.call(this, 'POST', endpoint, body));
  }
  throw new Error(`Unknown contact operation: ${operation}`);
}
