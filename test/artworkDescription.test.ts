import { artworkOperations } from '../nodes/Cardly/descriptions/ArtworkDescription';

describe('ArtworkDescription', () => {
  it('declares get and getMany', () => {
    const op = artworkOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['get', 'getMany']));
  });
});
