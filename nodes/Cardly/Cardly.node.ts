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
