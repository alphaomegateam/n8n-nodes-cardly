import { createHmac } from 'crypto';
import { extractSignatureHeaders, verifyCardlySignature } from '../nodes/Cardly/helpers/signature';

describe('extractSignatureHeaders', () => {
  it('picks out signature-ish headers case-insensitively', () => {
    const out = extractSignatureHeaders({ 'X-Cardly-Signature': 'abc', 'Content-Type': 'application/json' });
    expect(out['x-cardly-signature']).toBe('abc');
    expect(out['content-type']).toBeUndefined();
  });
});

describe('verifyCardlySignature', () => {
  const secret = 's3cr3t';
  const body = '{"event":"contact.order.sent"}';
  const good = createHmac('sha256', secret).update(body).digest('hex');

  it('returns true for a matching sha256 hmac', () => {
    expect(verifyCardlySignature(body, secret, good)).toBe(true);
  });
  it('returns false for a wrong signature', () => {
    expect(verifyCardlySignature(body, secret, 'deadbeef')).toBe(false);
  });
  it('returns true (does not block) when no signature header is present', () => {
    expect(verifyCardlySignature(body, secret, undefined)).toBe(true);
  });
});
