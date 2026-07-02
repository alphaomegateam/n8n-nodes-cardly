import {
  IHookFunctions,
  IWebhookFunctions,
  IDataObject,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  NodeOperationError,
} from 'n8n-workflow';

import { cardlyApiRequest, unwrap } from './GenericFunctions';
import { extractRawProperty, verifyCardlySignature } from './helpers/signature';

function isNotFound(error: any): boolean {
  const code = error?.httpCode ?? error?.statusCode ?? error?.cause?.statusCode;
  return String(code) === '404';
}

const CARDLY_EVENTS = [
  'contact.order.created',
  'contact.order.sent',
  'contact.order.refunded',
  'giftCard.redeemed',
  'qrCode.scanned',
  'contact.undeliverable',
  'contact.changeOfAddress',
  'consignment.undeliverable',
  'consignment.changeOfAddress',
];

export class CardlyTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Cardly Trigger',
    name: 'cardlyTrigger',
    icon: 'file:cardly.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts a workflow when Cardly fires a subscribed webhook event',
    defaults: { name: 'Cardly Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [{ name: 'cardlyApi', required: true }],
    webhooks: [
      { name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
    ],
    properties: [
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        required: true,
        default: [],
        description: 'Cardly events that will trigger this workflow',
        options: CARDLY_EVENTS.map((e) => ({ name: e, value: e })),
      },
      {
        displayName: 'Verify Signature',
        name: 'verifySignature',
        type: 'boolean',
        default: true,
        description:
          'Whether to reject postbacks whose signature does not match the webhook secret. Cardly signs each postback as md5(secret + "." + timestamp + "." + JSON data) and includes the result in the body\'s "signatures" array. Leave on to drop forged or unverifiable postbacks.',
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        if (!webhookData.webhookId) return false;
        try {
          await cardlyApiRequest.call(this, 'GET', `/webhooks/${webhookData.webhookId}`);
          return true;
        } catch (error) {
          if (isNotFound(error)) return false;
          throw error;
        }
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default') as string;
        const events = this.getNodeParameter('events') as string[];
        const response = await cardlyApiRequest.call(this, 'POST', '/webhooks', {
          targetUrl: webhookUrl,
          events,
          description: 'Created by n8n Cardly Trigger',
        });
        const data = unwrap(response);
        if (!data?.id) {
          throw new NodeOperationError(
            this.getNode(),
            'Cardly did not return a webhook ID; the webhook was not registered. (Note: test-mode API keys do not create webhooks — a live key is required.)',
          );
        }
        const webhookData = this.getWorkflowStaticData('node');
        webhookData.webhookId = data.id;
        webhookData.secret = data.secret; // only returned at creation
        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        if (!webhookData.webhookId) return true;
        try {
          await cardlyApiRequest.call(this, 'DELETE', `/webhooks/${webhookData.webhookId}`);
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
        delete webhookData.webhookId;
        delete webhookData.secret;
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const body = this.getBodyData() as IDataObject;
    const verify = this.getNodeParameter('verifySignature', true) as boolean;

    if (verify) {
      const secret = (this.getWorkflowStaticData('node').secret as string) || '';
      const timestamp = body.timestamp as string | number;
      const signatures = (body.signatures as string[]) ?? [];
      // Cardly signs the JSON-encoded `data` object as transmitted, so use the raw
      // request-body bytes when available to avoid re-serialization drift; fall back to
      // re-stringifying the parsed data only if the raw body is unavailable.
      const rawBody = (req as any).rawBody ? (req as any).rawBody.toString() : undefined;
      const dataJson =
        (rawBody && extractRawProperty(rawBody, 'data')) ?? JSON.stringify(body.data ?? null);
      if (!verifyCardlySignature(secret, timestamp, dataJson, signatures)) {
        // Acknowledge with a default 200 (no manual response) but do not run the workflow.
        return {};
      }
    }

    return {
      workflowData: [this.helpers.returnJsonArray([body])],
    };
  }
}
