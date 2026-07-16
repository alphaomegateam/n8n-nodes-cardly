import {
  IDataObject,
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
  IWebhookFunctions,
  IHttpRequestMethods,
  NodeApiError,
} from 'n8n-workflow';

type CardlyContext =
  | IExecuteFunctions
  | ILoadOptionsFunctions
  | IHookFunctions
  | IWebhookFunctions;

export function unwrap(response: any): any {
  if (response && typeof response === 'object' && 'state' in response && 'data' in response) {
    return response.data;
  }
  return response;
}

export function mapCardlyError(this: { getNode: () => any }, error: any): Error {
  const status = error.statusCode ?? error.httpCode;
  const body = error.response?.body ?? error.error ?? {};
  const messages: string[] = body?.state?.messages ?? [];

  if (status === 402) {
    const detail = messages.join(' ') || 'Your account requires additional credit to place this order.';
    return new NodeApiError(this.getNode(), error, {
      message: `Insufficient credit: ${detail}`,
      description: 'Add credit to your Cardly account or use a smaller order.',
    });
  }

  if (status === 422 && body?.data && typeof body.data === 'object') {
    const fields = Object.entries(body.data as IDataObject)
      .map(([field, reason]) => `${field}: ${reason}`)
      .join('; ');
    return new NodeApiError(this.getNode(), error, {
      message: `Validation failed — ${fields}`,
    });
  }

  return new NodeApiError(this.getNode(), error, {
    message: messages.join(' ') || undefined,
  });
}

export async function cardlyApiRequest(
  this: CardlyContext,
  method: IHttpRequestMethods,
  endpoint: string,
  body: IDataObject = {},
  qs: IDataObject = {},
): Promise<any> {
  const credentials = await this.getCredentials('cardlyApi');
  const baseUrl = (credentials.baseUrl as string) || 'https://api.card.ly/v2';

  const options = {
    method,
    url: `${baseUrl}${endpoint}`,
    body,
    qs,
    json: true,
  };
  if (method === 'GET' || Object.keys(body).length === 0) {
    delete (options as IDataObject).body;
  }

  try {
    return await this.helpers.httpRequestWithAuthentication.call(this, 'cardlyApi', options);
  } catch (error) {
    throw mapCardlyError.call(this, error);
  }
}

export async function cardlyApiRequestAllItems(
  this: CardlyContext,
  method: IHttpRequestMethods,
  endpoint: string,
  qs: IDataObject = {},
): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  const limit = (qs.limit as number) || 100;

  // Cardly paginates by `page`, NOT `offset`. Their docs (api.card.ly/v2/docs)
  // say to walk lists by incrementing `offset` — that is WRONG: `offset` is a
  // read-only *response* field ((page-1) * limit) and is ignored as a request
  // param, so sending it always returns page 1. Do not "fix" this back to offset.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await cardlyApiRequest.call(this, method, endpoint, {}, { ...qs, limit, page });
    const data = unwrap(response);
    const pageResults: any[] = data?.results ?? [];
    if (pageResults.length === 0) break;
    results.push(...pageResults);

    const meta = data?.meta;
    const lastRecord: number | undefined = meta?.lastRecord;
    const totalRecords: number | undefined = meta?.totalRecords ?? data?.totalRecords;
    if (lastRecord != null && totalRecords != null && lastRecord >= totalRecords) break;
    if (pageResults.length < limit) break;
    page += 1;
  }

  return results;
}
