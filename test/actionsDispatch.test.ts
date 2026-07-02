import { NodeItems } from '../nodes/Cardly/actions/types';
import { Cardly } from '../nodes/Cardly/Cardly.node';

describe('action dispatch', () => {
  it('NodeItems wraps a list of execution items', () => {
    const n = new NodeItems([{ json: { a: 1 } }]);
    expect(n.items[0].json.a).toBe(1);
  });

  it('the node maps every declared resource to a handler', () => {
    const node = new Cardly();
    const resourceProp = node.description.properties.find((p) => p.name === 'resource')!;
    const resources = (resourceProp.options as any[]).map((o) => o.value);
    for (const r of resources) {
      expect(Cardly.RESOURCE_HANDLERS[r]).toBeInstanceOf(Function);
    }
  });
});
