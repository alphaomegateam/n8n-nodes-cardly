import { INodeProperties } from 'n8n-workflow';

export const referenceOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['reference'] } },
    options: [
      { name: 'Get Doodles', value: 'getDoodles', action: 'Get many doodles' },
      { name: 'Get Fonts', value: 'getFonts', action: 'Get many fonts' },
      { name: 'Get Media', value: 'getMedia', action: 'Get many media products' },
      { name: 'Get Templates', value: 'getTemplates', action: 'Get many templates' },
      { name: 'Get Writing Styles', value: 'getWritingStyles', action: 'Get many writing styles' },
    ],
    default: 'getFonts',
  },
];

export const referenceFields: INodeProperties[] = [
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['reference'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['reference'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
  {
    displayName: 'Organisation Only',
    name: 'organisationOnly',
    type: 'boolean',
    default: false,
    description: 'Whether to return only items exclusive to your organisation (applies to fonts, doodles, and media)',
    displayOptions: { show: { resource: ['reference'], operation: ['getFonts', 'getDoodles', 'getMedia'] } },
  },
];
