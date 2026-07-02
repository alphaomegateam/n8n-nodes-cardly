import { INodeProperties } from 'n8n-workflow';

export const contactOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['contact'] } },
    options: [
      {
        name: 'Create',
        value: 'create',
        action: 'Create a contact',
        description: 'Add a contact (rejects duplicates by externalId/email)',
      },
      {
        name: 'Sync',
        value: 'sync',
        action: 'Sync a contact',
        description: 'Create or update by externalId/email',
      },
    ],
    default: 'create',
  },
];

export const contactFields: INodeProperties[] = [
  {
    displayName: 'Contact List ID',
    name: 'listId',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contact'] } },
    description: 'The Cardly contact list to add to. Find the ID in the list URL in the Cardly portal.',
  },
  {
    displayName: 'First Name',
    name: 'firstName',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contact'] } },
    description: 'First name of the contact',
  },
  {
    displayName: 'Address',
    name: 'address',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contact'] } },
    description: 'Street address of the contact',
  },
  {
    displayName: 'Locality (City/Suburb)',
    name: 'locality',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contact'] } },
    description: 'City or suburb of the contact',
  },
  {
    displayName: 'Country',
    name: 'country',
    type: 'string',
    default: '',
    required: true,
    description: '2-character ISO country code, e.g. US',
    displayOptions: { show: { resource: ['contact'] } },
  },
  {
    displayName: 'Additional Fields',
    name: 'additionalFields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: { show: { resource: ['contact'] } },
    options: [
      { displayName: 'Address 2', name: 'address2', type: 'string', default: '', description: 'Second address line' },
      { displayName: 'Company', name: 'company', type: 'string', default: '', description: 'Company name of the contact' },
      {
        displayName: 'Custom Fields',
        name: 'fields',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        placeholder: 'Add Field',
        description: 'Custom list fields keyed by Cardly field code',
        options: [
          {
            name: 'field',
            displayName: 'Field',
            values: [
              { displayName: 'Field Code', name: 'key', type: 'string', default: '' },
              { displayName: 'Value', name: 'value', type: 'string', default: '' },
            ],
          },
        ],
      },
      {
        displayName: 'Email',
        name: 'email',
        type: 'string',
        default: '',
        placeholder: 'name@email.com',
        description: 'Email address of the contact',
      },
      { displayName: 'External ID', name: 'externalId', type: 'string', default: '', description: 'External identifier to match on for sync' },
      { displayName: 'Last Name', name: 'lastName', type: 'string', default: '', description: 'Last name of the contact' },
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
];
