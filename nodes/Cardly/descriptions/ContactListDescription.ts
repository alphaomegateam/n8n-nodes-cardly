import { INodeProperties } from 'n8n-workflow';

export const contactListOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['contactList'] } },
    options: [
      { name: 'Create', value: 'create', action: 'Create a contact list' },
      { name: 'Delete', value: 'delete', action: 'Delete a contact list' },
      { name: 'Get', value: 'get', action: 'Get a contact list' },
      { name: 'Get Many', value: 'getMany', action: 'Get many contact lists' },
    ],
    default: 'getMany',
  },
];

export const contactListFields: INodeProperties[] = [
  {
    displayName: 'Contact List ID',
    name: 'listId',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contactList'], operation: ['get', 'delete'] } },
  },
  {
    displayName: 'Name',
    name: 'name',
    type: 'string',
    default: '',
    required: true,
    displayOptions: { show: { resource: ['contactList'], operation: ['create'] } },
  },
  {
    displayName: 'Additional Fields',
    name: 'additionalFields',
    type: 'collection',
    placeholder: 'Add Field',
    default: {},
    displayOptions: { show: { resource: ['contactList'], operation: ['create'] } },
    options: [
      { displayName: 'Description', name: 'description', type: 'string', default: '' },
      {
        displayName: 'Custom Fields',
        name: 'fields',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        description: 'Custom fields to define on the list',
        options: [{ name: 'field', displayName: 'Field', values: [
          { displayName: 'Name', name: 'name', type: 'string', default: '' },
          { displayName: 'Type', name: 'type', type: 'options', default: 'text', options: [
            { name: 'Text', value: 'text' },
            { name: 'Date', value: 'date' },
            { name: 'Number', value: 'number' },
            { name: 'URL', value: 'url' },
          ] },
          { displayName: 'Description', name: 'description', type: 'string', default: '' },
        ] }],
      },
    ],
  },
  {
    displayName: 'Return All',
    name: 'returnAll',
    type: 'boolean',
    default: false,
    displayOptions: { show: { resource: ['contactList'], operation: ['getMany'] } },
    description: 'Whether to return all results or only up to a given limit',
  },
  {
    displayName: 'Limit',
    name: 'limit',
    type: 'number',
    default: 50,
    typeOptions: { minValue: 1 },
    displayOptions: { show: { resource: ['contactList'], operation: ['getMany'], returnAll: [false] } },
    description: 'Max number of results to return',
  },
];
