import { Cardly } from '../nodes/Cardly/Cardly.node';

describe('Cardly action node', () => {
  const node = new Cardly();

  it('declares node type cardly with resource property', () => {
    expect(node.description.name).toBe('cardly');
    const resource = node.description.properties.find((p) => p.name === 'resource');
    expect(resource).toBeDefined();
    const values = (resource!.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['account', 'artwork', 'order', 'contact']));
  });

  it('exposes a getArtwork loadOptions method', () => {
    expect(node.methods?.loadOptions?.getArtwork).toBeInstanceOf(Function);
  });
});

describe('Cardly contact-list dropdown', () => {
  const node = new Cardly();
  it('exposes a getContactLists loadOptions method', () => {
    expect(node.methods?.loadOptions?.getContactLists).toBeInstanceOf(Function);
  });
});
