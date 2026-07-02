import { IExecuteFunctions, IDataObject, NodeOperationError } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';

function historyQs(ctx: IExecuteFunctions, i: number): IDataObject {
  const f = ctx.getNodeParameter('filters', i, {}) as any;
  const qs: IDataObject = {};
  if (f.effectiveBefore) qs['effectiveTime.lte'] = String(f.effectiveBefore).replace('T', ' ').slice(0, 19);
  if (f.effectiveAfter) qs['effectiveTime.gte'] = String(f.effectiveAfter).replace('T', ' ').slice(0, 19);
  return qs;
}

async function history(ctx: IExecuteFunctions, i: number, endpoint: string): Promise<any> {
  const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
  const qs = historyQs(ctx, i);
  if (returnAll) return await cardlyApiRequestAllItems.call(ctx, 'GET', endpoint, qs);
  qs.limit = ctx.getNodeParameter('limit', i) as number;
  return unwrap(await cardlyApiRequest.call(ctx, 'GET', endpoint, {}, qs))?.results ?? [];
}

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'getBalance') {
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/account/balance'));
  }
  if (operation === 'getCreditHistory') return await history(this, i, '/account/credit-history');
  if (operation === 'getGiftCreditHistory') return await history(this, i, '/account/gift-credit-history');
  throw new NodeOperationError(this.getNode(), `Unknown account operation: ${operation}`);
}
