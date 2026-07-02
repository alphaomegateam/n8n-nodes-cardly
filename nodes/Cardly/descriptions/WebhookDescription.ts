import { INodeProperties } from 'n8n-workflow';
import { CARDLY_WEBHOOK_EVENTS } from '../helpers/webhookBuilder';

export const webhookOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['webhook'] } },
    options: [
      { name: 'Create', value: 'create', action: 'Create a webhook' },
      { name: 'Delete', value: 'delete', action: 'Delete a webhook' },
      { name: 'Get', value: 'get', action: 'Get a webhook' },
      { name: 'Get Many', value: 'getMany', action: 'Get many webhooks' },
      { name: 'Update', value: 'update', action: 'Update a webhook' },
    ],
    default: 'getMany',
  },
];

export const webhookFields: INodeProperties[] = [
  {
    displayName: 'Webhook ID',
    name: 'webhookId',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['webhook'], operation: ['get', 'update', 'delete'] } },
  },
  {
    displayName: 'Target URL',
    name: 'targetUrl',
    type: 'string',
    default: '',
    required: true,
    description: 'URL that will receive the webhook POST callbacks',
    displayOptions: { show: { resource: ['webhook'], operation: ['create', 'update'] } },
  },
  {
    displayName: 'Events',
    name: 'events',
    type: 'multiOptions',
    default: [],
    description: 'Events this webhook subscribes to',
    options: CARDLY_WEBHOOK_EVENTS.map((e) => ({ name: e, value: e })),
    displayOptions: { show: { resource: ['webhook'], operation: ['create', 'update'] } },
  },
  {
    displayName: 'Additional Fields',
    name: 'additionalFields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: { show: { resource: ['webhook'], operation: ['create', 'update'] } },
    options: [
      { displayName: 'Description', name: 'description', type: 'string', default: '' },
      { displayName: 'Disabled', name: 'disabled', type: 'boolean', default: false, description: 'Whether the webhook is disabled (update only)' },
    ],
  },
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['webhook'], operation: ['getMany'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['webhook'], operation: ['getMany'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
];
