import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

/** Marker so a handler can emit pre-formed execution items (e.g. binary output)
 *  instead of plain JSON data that the dispatcher would wrap. */
export class NodeItems {
  constructor(readonly items: INodeExecutionData[]) {}
}

export type ResourceHandler = (
  this: IExecuteFunctions,
  operation: string,
  i: number,
) => Promise<any>;
