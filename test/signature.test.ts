import {
  computeCardlySignature,
  extractRawProperty,
  verifyCardlySignature,
} from '../nodes/Cardly/helpers/signature';

describe('computeCardlySignature', () => {
  // Golden vector straight from Cardly's docs ("Verify Postback Signatures"):
  // md5("secretabc.1234567890.{\"test\":true}") === 6ef4f0658ff7bb880fc3ae0cf7db3b2a
  it('matches the documented MD5 test vector', () => {
    expect(computeCardlySignature('secretabc', 1234567890, '{"test":true}')).toBe(
      '6ef4f0658ff7bb880fc3ae0cf7db3b2a',
    );
  });

  it('accepts a string timestamp identically to a numeric one', () => {
    expect(computeCardlySignature('secretabc', '1234567890', '{"test":true}')).toBe(
      '6ef4f0658ff7bb880fc3ae0cf7db3b2a',
    );
  });
});

describe('extractRawProperty', () => {
  it('extracts the exact raw JSON text of a top-level object property', () => {
    const raw = '{"timestamp":1234567890,"data":{"test":true},"signatures":["x"]}';
    expect(extractRawProperty(raw, 'data')).toBe('{"test":true}');
  });

  it('preserves whitespace and key order inside the property value', () => {
    const raw = '{"data":{ "b": 2,  "a": 1 },"timestamp":1}';
    expect(extractRawProperty(raw, 'data')).toBe('{ "b": 2,  "a": 1 }');
  });

  it('handles nested braces and braces inside strings', () => {
    const raw = '{"data":{"nested":{"k":"}"},"s":"a{b}c"},"timestamp":1}';
    expect(extractRawProperty(raw, 'data')).toBe('{"nested":{"k":"}"},"s":"a{b}c"}');
  });

  it('handles backslash-escaped quotes inside string values', () => {
    const raw = '{"data":{"s":"a\\"b}c"},"timestamp":1}';
    expect(extractRawProperty(raw, 'data')).toBe('{"s":"a\\"b}c"}');
  });

  it('matches the TOP-LEVEL key, not a same-named key nested in an earlier value', () => {
    const raw = '{"metadata":{"data":{"decoy":1}},"data":{"real":true},"timestamp":1}';
    expect(extractRawProperty(raw, 'data')).toBe('{"real":true}');
  });

  it('returns undefined when the top-level property is a scalar, not an object', () => {
    expect(extractRawProperty('{"data":"scalar","timestamp":1}', 'data')).toBeUndefined();
  });

  it('extracts an array-valued property', () => {
    const raw = '{"data":[1,2,{"x":3}],"timestamp":1}';
    expect(extractRawProperty(raw, 'data')).toBe('[1,2,{"x":3}]');
  });

  it('returns undefined when the property is absent or raw body is empty', () => {
    expect(extractRawProperty('{"timestamp":1}', 'data')).toBeUndefined();
    expect(extractRawProperty('', 'data')).toBeUndefined();
  });
});

describe('verifyCardlySignature', () => {
  const secret = 'secretabc';
  const timestamp = 1234567890;
  const dataJson = '{"test":true}';
  const good = '6ef4f0658ff7bb880fc3ae0cf7db3b2a';

  it('returns true when the computed hash is in the signatures array', () => {
    expect(verifyCardlySignature(secret, timestamp, dataJson, ['other', good])).toBe(true);
  });

  it('returns false when no signature matches', () => {
    expect(verifyCardlySignature(secret, timestamp, dataJson, ['deadbeef'])).toBe(false);
  });

  it('returns false when the secret is empty', () => {
    expect(verifyCardlySignature('', timestamp, dataJson, [good])).toBe(false);
  });

  it('returns false when the signatures array is empty or missing', () => {
    expect(verifyCardlySignature(secret, timestamp, dataJson, [])).toBe(false);
    expect(verifyCardlySignature(secret, timestamp, dataJson, undefined as any)).toBe(false);
  });

  it('returns false when dataJson is empty (fail-closed)', () => {
    expect(verifyCardlySignature(secret, timestamp, '', [good])).toBe(false);
  });

  it('does not throw and returns false on a signature entry of a different length', () => {
    expect(verifyCardlySignature(secret, timestamp, dataJson, ['short', good])).toBe(true);
    expect(verifyCardlySignature(secret, timestamp, dataJson, ['short'])).toBe(false);
  });
});
