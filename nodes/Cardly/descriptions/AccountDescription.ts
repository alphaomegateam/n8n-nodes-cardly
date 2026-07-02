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
    ],
    default: 'getBalance',
  },
];
