import { IExecuteFunctions, NodeOperationError } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';
import { buildContactListBody, ContactListInput } from '../helpers/contactListBuilder';

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'getMany') {
    const returnAll = this.getNodeParameter('returnAll', i) as boolean;
    if (returnAll) return await cardlyApiRequestAllItems.call(this, 'GET', '/contact-lists', {});
    const limit = this.getNodeParameter('limit', i) as number;
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/contact-lists', {}, { limit }))?.results ?? [];
  }
  if (operation === 'get') {
    const listId = this.getNodeParameter('listId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/contact-lists/${listId}`));
  }
  if (operation === 'create') {
    const add = this.getNodeParameter('additionalFields', i, {}) as any;
    const fields = (add.fields?.field ?? []).map((f: any) => ({ name: f.name, type: f.type, description: f.description }));
    const input: ContactListInput = {
      name: this.getNodeParameter('name', i) as string,
      description: add.description || undefined,
      fields: fields.length ? fields : undefined,
    };
    return unwrap(await cardlyApiRequest.call(this, 'POST', '/contact-lists', buildContactListBody(input)));
  }
  if (operation === 'delete') {
    const listId = this.getNodeParameter('listId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'DELETE', `/contact-lists/${listId}`));
  }
  throw new NodeOperationError(this.getNode(), `Unknown contactList operation: ${operation}`);
}
