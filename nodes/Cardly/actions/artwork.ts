import { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'getMany') {
    const returnAll = this.getNodeParameter('returnAll', i) as boolean;
    const ownOnly = this.getNodeParameter('ownOnly', i) as boolean;
    const qs: IDataObject = {};
    if (ownOnly) qs.ownOnly = true;
    if (returnAll) {
      return await cardlyApiRequestAllItems.call(this, 'GET', '/art', qs);
    }
    qs.limit = this.getNodeParameter('limit', i) as number;
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/art', {}, qs))?.results ?? [];
  }
  throw new Error(`Unknown artwork operation: ${operation}`);
}
