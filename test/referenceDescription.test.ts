import { referenceOperations } from '../nodes/Cardly/descriptions/ReferenceDescription';

describe('ReferenceDescription', () => {
  it('declares the five reference list operations', () => {
    const op = referenceOperations.find((p) => p.name === 'operation')!;
    const values = (op.options as any[]).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['getFonts', 'getWritingStyles', 'getDoodles', 'getTemplates', 'getMedia']));
  });
});
