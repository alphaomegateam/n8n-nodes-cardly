import { INodeProperties } from 'n8n-workflow';

export const orderOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['order'] } },
    options: [
      {
        name: 'Download Preview PDF',
        value: 'downloadPreview',
        action: 'Download a preview PDF',
        description: 'Generate a preview and download the card (and envelope) PDF as binary',
      },
      {
        name: 'Get',
        value: 'get',
        action: 'Get an order',
        description: 'Retrieve a single order by ID',
      },
      {
        name: 'Get Many',
        value: 'getMany',
        action: 'Get many orders',
        description: 'List orders',
      },
      {
        name: 'Place',
        value: 'place',
        action: 'Place a card order',
        description: 'Place a real card order (test keys validate only)',
      },
      {
        name: 'Preview',
        value: 'preview',
        action: 'Preview a card',
        description: 'Generate a watermarked preview and cost/delivery estimate',
      },
    ],
    default: 'place',
  },
];

const cardFields: INodeProperties[] = [
  {
    displayName: 'Artwork Name or ID',
    name: 'artwork',
    type: 'options',
    typeOptions: { loadOptionsMethod: 'getArtwork' },
    default: '',
    required: true,
    description:
      'Artwork to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    displayOptions: { show: { resource: ['order'], operation: ['place', 'preview', 'downloadPreview'] } },
  },
  {
    displayName: 'Template ID',
    name: 'template',
    type: 'string',
    default: '',
    description: 'Optional template ID to populate the card',
    displayOptions: { show: { resource: ['order'], operation: ['place', 'preview', 'downloadPreview'] } },
  },
  {
    displayName: 'Recipient',
    name: 'recipient',
    type: 'fixedCollection',
    default: {},
    typeOptions: { multipleValues: false },
    displayOptions: { show: { resource: ['order'], operation: ['place', 'preview', 'downloadPreview'] } },
    options: [
      {
        name: 'value',
        displayName: 'Recipient',
        values: [
          { displayName: 'Address', name: 'address', type: 'string', default: '', required: true },
          { displayName: 'Address 2', name: 'address2', type: 'string', default: '' },
          { displayName: 'City', name: 'city', type: 'string', default: '', required: true },
          { displayName: 'Company', name: 'company', type: 'string', default: '' },
          {
            displayName: 'Country',
            name: 'country',
            type: 'string',
            default: '',
            required: true,
            description: '2-character ISO country code, e.g. US',
          },
          { displayName: 'First Name', name: 'firstName', type: 'string', default: '', required: true },
          { displayName: 'Last Name', name: 'lastName', type: 'string', default: '' },
          {
            displayName: 'Postcode',
            name: 'postcode',
            type: 'string',
            default: '',
            description: 'Conditionally required by country',
          },
          {
            displayName: 'Region',
            name: 'region',
            type: 'string',
            default: '',
            description: 'State/province. Conditionally required by country.',
          },
        ],
      },
    ],
  },
  {
    displayName: 'Additional Fields',
    name: 'additionalFields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: { show: { resource: ['order'], operation: ['place', 'preview', 'downloadPreview'] } },
    options: [
      {
        displayName: 'Message Pages',
        name: 'messagePages',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        description: 'Override text on specific card pages',
        placeholder: 'Add Page',
        options: [
          {
            name: 'page',
            displayName: 'Page',
            values: [
              {
                displayName: 'Page Number',
                name: 'page',
                type: 'number',
                default: 1,
                description: '1-based page (1 = front)',
              },
              { displayName: 'Text', name: 'text', type: 'string', typeOptions: { rows: 3 }, default: '' },
            ],
          },
        ],
      },
      { displayName: 'Quantity', name: 'quantity', type: 'number', default: 1, typeOptions: { minValue: 1 } },
      {
        displayName: 'Requested Arrival',
        name: 'requestedArrival',
        type: 'dateTime',
        default: '',
        description: 'Future requested arrival date',
      },
      {
        displayName: 'Ship to Me',
        name: 'shipToMe',
        type: 'boolean',
        default: false,
        description:
          'Whether to send the card to the sender (adds a blank envelope; small extra credit cost)',
      },
      {
        displayName: 'Shipping Method',
        name: 'shippingMethod',
        type: 'options',
        default: 'standard',
        options: [
          { name: 'Standard (All Regions)', value: 'standard' },
          { name: 'Tracked (Australia Only)', value: 'tracked' },
          { name: 'Express (Australia & US Only)', value: 'express' },
        ],
      },
      {
        displayName: 'Template Variables',
        name: 'variables',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        placeholder: 'Add Variable',
        options: [
          {
            name: 'variable',
            displayName: 'Variable',
            values: [
              { displayName: 'Key', name: 'key', type: 'string', default: '' },
              { displayName: 'Value', name: 'value', type: 'string', default: '' },
            ],
          },
        ],
      },
    ],
  },
  {
    displayName: 'Sender (All Fields Required if Any Set)',
    name: 'sender',
    type: 'fixedCollection',
    default: {},
    typeOptions: { multipleValues: false },
    displayOptions: { show: { resource: ['order'], operation: ['place', 'preview', 'downloadPreview'] } },
    options: [
      {
        name: 'value',
        displayName: 'Sender',
        values: [
          { displayName: 'Address', name: 'address', type: 'string', default: '' },
          { displayName: 'Address 2', name: 'address2', type: 'string', default: '' },
          { displayName: 'City', name: 'city', type: 'string', default: '' },
          { displayName: 'Company', name: 'company', type: 'string', default: '' },
          { displayName: 'Country', name: 'country', type: 'string', default: '' },
          { displayName: 'First Name', name: 'firstName', type: 'string', default: '' },
          { displayName: 'Last Name', name: 'lastName', type: 'string', default: '' },
          { displayName: 'Postcode', name: 'postcode', type: 'string', default: '' },
          { displayName: 'Region', name: 'region', type: 'string', default: '' },
        ],
      },
    ],
  },
  {
    displayName: 'Purchase Order Number',
    name: 'purchaseOrderNumber',
    type: 'string',
    default: '',
    displayOptions: { show: { resource: ['order'], operation: ['place'] } },
    description: 'Reference stored against the whole order',
  },
];

const getFields: INodeProperties[] = [
  {
    displayName: 'Order ID',
    name: 'orderId',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['order'], operation: ['get'] } },
  },
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['order'], operation: ['getMany'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['order'], operation: ['getMany'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
  {
    displayName: 'Put Output In Field',
    name: 'binaryProperty',
    type: 'string',
    default: 'data',
    required: true,
    description: 'Name of the binary field to write the preview PDF(s) to (envelope, if any, uses "&lt;field&gt;Envelope")',
    displayOptions: { show: { resource: ['order'], operation: ['downloadPreview'] } },
  },
];

export const orderFields: INodeProperties[] = [...cardFields, ...getFields];
