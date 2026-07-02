import { IExecuteFunctions, NodeOperationError } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';
import { buildPlaceBody, buildPreviewBody, OrderLineInput } from '../helpers/orderBuilder';

function readOrderLineInput(ctx: IExecuteFunctions, i: number): OrderLineInput {
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

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'place') {
    const line = readOrderLineInput(this, i);
    const po = this.getNodeParameter('purchaseOrderNumber', i, '') as string;
    return unwrap(await cardlyApiRequest.call(this, 'POST', '/orders/place', buildPlaceBody([line], po || undefined)));
  }
  if (operation === 'preview') {
    const line = readOrderLineInput(this, i);
    return unwrap(await cardlyApiRequest.call(this, 'POST', '/orders/preview', buildPreviewBody(line)));
  }
  if (operation === 'get') {
    const orderId = this.getNodeParameter('orderId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/orders/${orderId}`));
  }
  if (operation === 'getMany') {
    const returnAll = this.getNodeParameter('returnAll', i) as boolean;
    if (returnAll) return await cardlyApiRequestAllItems.call(this, 'GET', '/orders', {});
    const limit = this.getNodeParameter('limit', i) as number;
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/orders', {}, { limit }))?.results ?? [];
  }
  throw new NodeOperationError(this.getNode(), `Unknown order operation: ${operation}`);
}
