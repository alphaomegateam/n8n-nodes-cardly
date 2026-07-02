import {
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from './GenericFunctions';
import { accountOperations } from './descriptions/AccountDescription';
import { artworkOperations, artworkFields } from './descriptions/ArtworkDescription';
import { orderOperations, orderFields } from './descriptions/OrderDescription';
import { contactOperations, contactFields } from './descriptions/ContactDescription';
import { buildPlaceBody, buildPreviewBody, OrderLineInput } from './helpers/orderBuilder';
import { buildContactBody, ContactInput } from './helpers/contactBuilder';

export class Cardly implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Cardly',
    name: 'cardly',
    icon: 'file:cardly.svg',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Send physical cards, sync contacts, and read data via the Cardly API',
    defaults: { name: 'Cardly' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'cardlyApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Account', value: 'account' },
          { name: 'Artwork', value: 'artwork' },
          { name: 'Contact', value: 'contact' },
          { name: 'Order', value: 'order' },
        ],
        default: 'order',
      },
      ...accountOperations,
      ...artworkOperations,
      ...artworkFields,
      ...orderOperations,
      ...orderFields,
      ...contactOperations,
      ...contactFields,
    ],
  };

  methods = {
    loadOptions: {
      async getArtwork(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const items = await cardlyApiRequestAllItems.call(this, 'GET', '/art', { limit: 100 });
        return items.map((a: any) => ({ name: a.name ?? a.slug ?? a.id, value: a.id }));
      },
    },
  };

  private static readOrderLineInput(ctx: IExecuteFunctions, i: number): OrderLineInput {
    const artwork = ctx.getNodeParameter('artwork', i) as string;
    const template = ctx.getNodeParameter('template', i, '') as string;
    const recipient = ctx.getNodeParameter('recipient.value', i, {}) as any;
    const sender = ctx.getNodeParameter('sender.value', i, {}) as any;
    const add = ctx.getNodeParameter('additionalFields', i, {}) as any;

    const variables: Record<string, string> = {};
    for (const v of add.variables?.variable ?? []) variables[v.key] = v.value;

    const messagePages = (add.messagePages?.page ?? []).map((p: any) => ({ page: p.page, text: p.text }));

    return {
      artwork,
      template: template || undefined,
      quantity: add.quantity,
      shippingMethod: add.shippingMethod,
      shipToMe: add.shipToMe,
      requestedArrival: add.requestedArrival || undefined,
      variables: Object.keys(variables).length ? variables : undefined,
      messagePages: messagePages.length ? messagePages : undefined,
      recipient,
      sender,
    };
  }

  private static readContactInput(ctx: IExecuteFunctions, i: number): ContactInput {
    const add = ctx.getNodeParameter('additionalFields', i, {}) as any;
    const fields: Record<string, string> = {};
    for (const f of add.fields?.field ?? []) fields[f.key] = f.value;

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

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        let responseData: any;

        if (resource === 'account' && operation === 'getBalance') {
          responseData = unwrap(await cardlyApiRequest.call(this, 'GET', '/account/balance'));
        } else if (resource === 'artwork' && operation === 'getMany') {
          const returnAll = this.getNodeParameter('returnAll', i) as boolean;
          const ownOnly = this.getNodeParameter('ownOnly', i) as boolean;
          const qs: any = {};
          if (ownOnly) qs.ownOnly = true;
          if (returnAll) {
            responseData = await cardlyApiRequestAllItems.call(this, 'GET', '/art', qs);
          } else {
            qs.limit = this.getNodeParameter('limit', i) as number;
            responseData = unwrap(await cardlyApiRequest.call(this, 'GET', '/art', {}, qs))?.results ?? [];
          }
        } else if (resource === 'order' && operation === 'place') {
          const line = Cardly.readOrderLineInput(this, i);
          const po = this.getNodeParameter('purchaseOrderNumber', i, '') as string;
          const body = buildPlaceBody([line], po || undefined);
          responseData = unwrap(await cardlyApiRequest.call(this, 'POST', '/orders/place', body));
        } else if (resource === 'order' && operation === 'preview') {
          const line = Cardly.readOrderLineInput(this, i);
          const body = buildPreviewBody(line);
          responseData = unwrap(await cardlyApiRequest.call(this, 'POST', '/orders/preview', body));
        } else if (resource === 'order' && operation === 'get') {
          const orderId = this.getNodeParameter('orderId', i) as string;
          responseData = unwrap(await cardlyApiRequest.call(this, 'GET', `/orders/${orderId}`));
        } else if (resource === 'order' && operation === 'getMany') {
          const returnAll = this.getNodeParameter('returnAll', i) as boolean;
          if (returnAll) {
            responseData = await cardlyApiRequestAllItems.call(this, 'GET', '/orders', {});
          } else {
            const limit = this.getNodeParameter('limit', i) as number;
            responseData = unwrap(await cardlyApiRequest.call(this, 'GET', '/orders', {}, { limit }))?.results ?? [];
          }
        } else if (resource === 'contact' && (operation === 'create' || operation === 'sync')) {
          const listId = this.getNodeParameter('listId', i) as string;
          const input = Cardly.readContactInput(this, i);
          const body = buildContactBody(input, operation as 'create' | 'sync');
          const endpoint =
            operation === 'sync'
              ? `/contact-lists/${listId}/contacts/sync`
              : `/contact-lists/${listId}/contacts`;
          responseData = unwrap(await cardlyApiRequest.call(this, 'POST', endpoint, body));
        } else {
          throw new NodeOperationError(this.getNode(), `Unsupported operation ${resource}:${operation}`);
        }

        const asArray = Array.isArray(responseData) ? responseData : [responseData];
        for (const entry of asArray) {
          returnData.push({ json: entry, pairedItem: { item: i } });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
