import {
  IHookFunctions,
  IWebhookFunctions,
  IDataObject,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
} from 'n8n-workflow';

import { cardlyApiRequest, unwrap } from './GenericFunctions';
import { extractSignatureHeaders, verifyCardlySignature } from './helpers/signature';

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
        default: false,
        description:
          'Whether to reject postbacks that fail HMAC-SHA256 verification. Off by default until the Cardly signature scheme is confirmed; signature headers are always passed through on the output regardless.',
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
          return false;
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
        if (!data?.id) return false;
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
          return false;
        }
        delete webhookData.webhookId;
        delete webhookData.secret;
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const headers = this.getHeaderData() as IDataObject;
    const body = this.getBodyData() as IDataObject;
    const verify = this.getNodeParameter('verifySignature', false) as boolean;

    const signatureHeaders = extractSignatureHeaders(headers as Record<string, any>);

    if (verify) {
      const secret = (this.getWorkflowStaticData('node').secret as string) || '';
      const rawBody = (req as any).rawBody ? (req as any).rawBody.toString() : JSON.stringify(body);
      const sig = Object.values(signatureHeaders)[0];
      if (secret && !verifyCardlySignature(rawBody, secret, sig)) {
        return { noWebhookResponse: true };
      }
    }

    return {
      workflowData: [this.helpers.returnJsonArray([{ ...body, _signatureHeaders: signatureHeaders }])],
    };
  }
}
