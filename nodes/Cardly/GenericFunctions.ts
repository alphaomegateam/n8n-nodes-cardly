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

// httpRequestWithAuthentication usually throws an error that is ALREADY a NodeApiError, and the
// NodeApiError constructor returns an existing NodeApiError unchanged — so `new NodeApiError(node,
// error, { message })` would silently keep n8n's generic per-status text. Rewrite it in place instead.
// Duck-typed too, in case the community package resolves its own copy of n8n-workflow.
function withMessage(
  node: any,
  error: any,
  opts: { message: string; description?: string },
): Error {
  if (error instanceof NodeApiError || error?.name === 'NodeApiError') {
    error.message = opts.message;
    if (opts.description) error.description = opts.description;
    return error;
  }
  return new NodeApiError(node, error, opts);
}

export function mapCardlyError(this: { getNode: () => any }, error: any): Error {
  // n8n surfaces a failed HTTP response in several shapes depending on version and
  // code path: n8n's older shape (error.statusCode / error.response.body), the
  // axios shape (error.response.status / error.response.data), a NodeApiError that
  // n8n-core already built (httpCode / context.data), or a wrapped error whose
  // original response lives under error.cause. The Cardly envelope
  // ({ state: { messages }, data }) and the status must be read defensively from
  // all of them — otherwise a real 401/404/422 collapses into a generic message
  // with no status and no field detail (which is exactly what happened in prod:
  // the node reported "invalid or could not be processed" for every failure).
  const status =
    error?.statusCode ??
    error?.httpCode ??
    error?.response?.status ??
    error?.response?.statusCode ??
    error?.cause?.response?.status ??
    error?.cause?.statusCode;

  const parseMaybe = (b: any): any => {
    if (typeof b !== 'string') return b;
    try {
      return JSON.parse(b);
    } catch {
      return { state: { messages: [b] } };
    }
  };

  const body =
    parseMaybe(
      error?.response?.body ??
        error?.response?.data ??
        error?.cause?.response?.data ??
        error?.cause?.response?.body ??
        error?.error ??
        error?.context?.data,
    ) ?? {};

  const messages: string[] = Array.isArray(body?.state?.messages) ? body.state.messages : [];
  const statusStr = status != null ? String(status) : '';

  if (statusStr === '402') {
    const detail = messages.join(' ') || 'Your account requires additional credit to place this order.';
    return withMessage(this.getNode(), error, {
      message: `Insufficient credit: ${detail}`,
      description: 'Add credit to your Cardly account or use a smaller order.',
    });
  }

  const fieldData =
    body?.data && typeof body.data === 'object' && !Array.isArray(body.data) ? (body.data as IDataObject) : {};
  if (Object.keys(fieldData).length > 0) {
    const fields = Object.entries(fieldData)
      .map(([field, reason]) => `${field}: ${reason}`)
      .join('; ');
    return withMessage(this.getNode(), error, {
      message: `Validation failed — ${fields}`,
    });
  }

  const detail =
    messages.join(' ') || (typeof error?.message === 'string' ? error.message : '') || 'Unknown Cardly error';
  return withMessage(this.getNode(), error, {
    message: statusStr ? `Cardly request failed (HTTP ${statusStr}): ${detail}` : detail,
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
