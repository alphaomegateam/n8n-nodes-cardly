import { IDataObject } from 'n8n-workflow';

export interface ContactListFieldInput {
  name: string;
  description?: string;
  type: 'text' | 'date' | 'number' | 'url';
}

export interface ContactListInput {
  name: string;
  description?: string;
  fields?: ContactListFieldInput[];
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

export function buildContactListBody(input: ContactListInput): IDataObject {
  if (isEmpty(input.name)) throw new Error('Contact list requires a name.');
  const body: IDataObject = { name: input.name };
  if (!isEmpty(input.description)) body.description = input.description;
  if (input.fields && input.fields.length > 0) {
    body.fields = input.fields.map((f) => {
      const field: IDataObject = { name: f.name, type: f.type };
      if (!isEmpty(f.description)) field.description = f.description;
      return field;
    });
  }
  return body;
}
