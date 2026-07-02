import { INodeProperties } from 'n8n-workflow';

export const accountOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['account'] } },
    options: [
      {
        name: 'Get Balance',
        value: 'getBalance',
        action: 'Get account balance',
        description: 'Retrieve current credit and gift-credit balances',
      },
      {
        name: 'Get Credit History',
        value: 'getCreditHistory',
        action: 'Get credit history',
      },
      {
        name: 'Get Gift Credit History',
        value: 'getGiftCreditHistory',
        action: 'Get gift credit history',
      },
    ],
    default: 'getBalance',
  },
];

export const accountFields: INodeProperties[] = [
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['account'], operation: ['getCreditHistory', 'getGiftCreditHistory'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['account'], operation: ['getCreditHistory', 'getGiftCreditHistory'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
  {
    displayName: 'Filters',
    name: 'filters',
    type: 'collection',
    placeholder: 'Add Filter',
    default: {},
    displayOptions: { show: { resource: ['account'], operation: ['getCreditHistory', 'getGiftCreditHistory'] } },
    options: [
      { displayName: 'Effective After', name: 'effectiveAfter', type: 'dateTime', default: '', description: 'Only entries at or after this time' },
      { displayName: 'Effective Before', name: 'effectiveBefore', type: 'dateTime', default: '', description: 'Only entries at or before this time' },
    ],
  },
];
