import { IExecuteFunctions, NodeOperationError } from 'n8n-workflow';
import { cardlyApiRequest, unwrap } from '../GenericFunctions';

export async function execute(this: IExecuteFunctions, operation: string, i: number): Promise<any> {
  if (operation === 'getBalance') {
    return unwrap(await cardlyApiRequest.call(this, 'GET', '/account/balance'));
  }
  throw new NodeOperationError(this.getNode(), `Unknown account operation: ${operation}`);
}
