import { IExecuteFunctions, NodeOperationError } from 'n8n-workflow';
import { cardlyApiRequest, cardlyApiRequestAllItems, unwrap } from '../GenericFunctions';
import { buildWebhookBody, WebhookInput } from '../helpers/webhookBuilder';

function readWebhookInput(ctx: IExecuteFunctions, i: number): WebhookInput {
  const add = ctx.getNodeParameter('additionalFields', i, {}) as any;
  return {
    targetUrl: ctx.getNodeParameter('targetUrl', i) as string,
    events: ctx.getNodeParameter('events', i, []) as string[],
    description: add.description || undefined,
    disabled: add.disabled,
  };
}

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'getMany') {
    const returnAll = this.getNodeParameter('returnAll', i) as boolean;
    if (returnAll) return await cardlyApiRequestAllItems.call(this, 'GET', '/webhooks', {});
    const limit = this.getNodeParameter('limit', i) as number;
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/webhooks', {}, { limit }))?.results ?? [];
  }
  if (operation === 'get') {
    const id = this.getNodeParameter('webhookId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'GET', `/webhooks/${id}`));
  }
  if (operation === 'create') {
    return unwrap(await cardlyApiRequest.call(this, 'POST', '/webhooks', buildWebhookBody(readWebhookInput(this, i), 'create')));
  }
  if (operation === 'update') {
    const id = this.getNodeParameter('webhookId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'POST', `/webhooks/${id}`, buildWebhookBody(readWebhookInput(this, i), 'update')));
  }
  if (operation === 'delete') {
    const id = this.getNodeParameter('webhookId', i) as string;
    return unwrap(await cardlyApiRequest.call(this, 'DELETE', `/webhooks/${id}`));
  }
  throw new NodeOperationError(this.getNode(), `Unknown webhook operation: ${operation}`);
}
