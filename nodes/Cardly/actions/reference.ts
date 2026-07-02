import { IExecuteFunctions, IDataObject, NodeOperationError } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';

const ENDPOINTS: Record<string, string> = {
  getFonts: '/fonts',
  getWritingStyles: '/writing-styles',
  getDoodles: '/doodles',
  getTemplates: '/templates',
  getMedia: '/media',
};
const SUPPORTS_ORG_FILTER = new Set(['getFonts', 'getDoodles', 'getMedia']);

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  const endpoint = ENDPOINTS[operation];
  if (!endpoint) throw new NodeOperationError(this.getNode(), `Unknown reference operation: ${operation}`);
  const qs: IDataObject = {};
  if (SUPPORTS_ORG_FILTER.has(operation) && (this.getNodeParameter('organisationOnly', i, false) as boolean)) {
    qs.organisationOnly = true;
  }
  const returnAll = this.getNodeParameter('returnAll', i) as boolean;
  if (returnAll) return await cardlyApiRequestAllItems.call(this, 'GET', endpoint, qs);
  qs.limit = this.getNodeParameter('limit', i) as number;
  return unwrap(await cardlyApiRequest.call(this, 'GET', endpoint, {}, qs))?.results ?? [];
}
