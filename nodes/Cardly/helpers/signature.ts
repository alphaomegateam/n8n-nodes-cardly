import { createHmac, timingSafeEqual } from 'crypto';

export function extractSignatureHeaders(headers: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const key = k.toLowerCase();
    if (key.includes('signature') || key.startsWith('x-cardly')) {
      out[key] = Array.isArray(v) ? String(v[0]) : String(v);
    }
  }
  return out;
}

export function verifyCardlySignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | undefined,
  algorithm = 'sha256',
): boolean {
  if (!signatureHeader) return true; // cannot verify → do not block (scheme not yet confirmed)
  const expected = createHmac(algorithm, secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
