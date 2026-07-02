import { IBinaryKeyData, IExecuteFunctions, INodeExecutionData, NodeOperationError } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';
import { buildPlaceBody, buildPreviewBody, OrderLineInput } from '../helpers/orderBuilder';
import { NodeItems } from './types';

function readOrderLineInput(ctx: IExecuteFunctions, i: number): OrderLineInput {
  const artwork = ctx.getNodeParameter('artwork', i) as string;
  const template = ctx.getNodeParameter('template', i, '') as string;
  const recipient = ctx.getNodeParameter('recipient.value', i, {}) as any;
  const sender = ctx.getNodeParameter('sender.value', i, {}) as any;
  const add = ctx.getNodeParameter('additionalFields', i, {}) as any;

  const variables: Record<string, string> = {};
  for (const v of add.variables?.variable ?? []) if (v.key) variables[v.key] = v.value;
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
  if (operation === 'downloadPreview') {
    const line = readOrderLineInput(this, i);
    const prop = this.getNodeParameter('binaryProperty', i) as string;
    const data = unwrap(await cardlyApiRequest.call(this, 'POST', '/orders/preview', buildPreviewBody(line)));
    const urls = data?.preview?.urls ?? {};
    if (data?.preview?.expires && new Date(data.preview.expires).getTime() < Date.now()) {
      throw new NodeOperationError(this.getNode(), 'Preview document already expired.', { itemIndex: i });
    }
    if (!urls.card && !urls.envelope) {
      throw new NodeOperationError(this.getNode(), 'Preview returned no document URLs to download.', { itemIndex: i });
    }
    const binary: IBinaryKeyData = {};
    const fetchPdf = async (url: string) => {
      const httpsUrl = url.replace(/^http:\/\//, 'https://');
      const buf = (await this.helpers.httpRequestWithAuthentication.call(this, 'cardlyApi', {
        method: 'GET',
        url: httpsUrl,
        encoding: 'arraybuffer',
        json: false,
      })) as Buffer;
      return this.helpers.prepareBinaryData(Buffer.from(buf), 'preview.pdf', 'application/pdf');
    };
    if (urls.card) binary[prop] = await fetchPdf(urls.card);
    if (urls.envelope) binary[`${prop}Envelope`] = await fetchPdf(urls.envelope);
    const item: INodeExecutionData = {
      json: { order: data.order ?? {}, preview: { expires: data?.preview?.expires ?? null } },
      binary,
    };
    return new NodeItems([item]);
  }
  throw new NodeOperationError(this.getNode(), `Unknown order operation: ${operation}`);
}
