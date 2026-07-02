import { IExecuteFunctions, NodeOperationError } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';
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
  if (operation === 'get') {
    const contactId = this.getNodeParameter('contactId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/contact-lists/${listId}/contacts/${contactId}`));
  }
  if (operation === 'find') {
    const query = this.getNodeParameter('query', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/contact-lists/${listId}/contacts/find`, {}, { query }));
  }
  if (operation === 'getMany') {
    const returnAll = this.getNodeParameter('returnAll', i) as boolean;
    if (returnAll) return await cardlyApiRequestAllItems.call(this, 'GET', `/contact-lists/${listId}/contacts`, {});
    const limit = this.getNodeParameter('limit', i) as number;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/contact-lists/${listId}/contacts`, {}, { limit }))?.results ?? [];
  }
  throw new NodeOperationError(this.getNode(), `Unknown contact operation: ${operation}`);
}
