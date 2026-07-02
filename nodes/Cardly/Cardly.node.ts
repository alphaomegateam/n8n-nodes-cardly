import {
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

import { cardlyApiRequestAllItems } from './GenericFunctions';
import { accountOperations } from './descriptions/AccountDescription';
import { artworkOperations, artworkFields } from './descriptions/ArtworkDescription';
import { orderOperations, orderFields } from './descriptions/OrderDescription';
import { contactOperations, contactFields } from './descriptions/ContactDescription';
import * as orderActions from './actions/order';
import * as contactActions from './actions/contact';
import * as artworkActions from './actions/artwork';
import * as accountActions from './actions/account';
import { NodeItems, ResourceHandler } from './actions/types';

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
      async getContactLists(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const items = await cardlyApiRequestAllItems.call(this, 'GET', '/contact-lists', { limit: 100 });
        return items.map((l: any) => ({ name: l.name ?? l.id, value: l.id }));
      },
    },
  };

  static RESOURCE_HANDLERS: Record<string, ResourceHandler> = {
    order: orderActions.execute,
    contact: contactActions.execute,
    artwork: artworkActions.execute,
    account: accountActions.execute,
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;
    const handler = Cardly.RESOURCE_HANDLERS[resource];
    if (!handler) throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`);

    for (let i = 0; i < items.length; i++) {
      try {
        const result = await handler.call(this, operation, i);
        if (result instanceof NodeItems) {
          for (const item of result.items) returnData.push({ ...item, pairedItem: { item: i } });
        } else {
          const asArray = Array.isArray(result) ? result : [result];
          for (const entry of asArray) returnData.push({ json: entry, pairedItem: { item: i } });
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
