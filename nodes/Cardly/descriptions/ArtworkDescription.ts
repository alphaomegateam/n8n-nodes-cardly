import { INodeProperties } from 'n8n-workflow';

export const artworkOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['artwork'] } },
    options: [
      {
        name: 'Get Many',
        value: 'getMany',
        action: 'Get many artworks',
        description: 'List available artwork for your organisation',
      },
    ],
    default: 'getMany',
  },
];

export const artworkFields: INodeProperties[] = [
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['artwork'], operation: ['getMany'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['artwork'], operation: ['getMany'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
  {
    displayName: 'Own Only',
    name: 'ownOnly',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['artwork'], operation: ['getMany'] } },
    description: 'Whether to return only artwork belonging to your organisation',
  },
];
