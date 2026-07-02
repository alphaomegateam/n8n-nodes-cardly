import { createHash } from 'crypto';

/**
 * Extract the exact raw JSON text of a top-level object- or array-valued
 * property from a JSON body string, preserving the original serialization
 * (key order, whitespace). Cardly signs the JSON-encoded `data` object as it
 * transmits it, so re-serializing could change the bytes and break the hash —
 * this returns the untouched slice instead.
 *
 * Returns undefined if the raw body is empty or the property isn't found as an
 * object/array value.
 */
export function extractRawProperty(rawBody: string, property: string): string | undefined {
  if (!rawBody) return undefined;
  const keyToken = `"${property}"`;
  let idx = rawBody.indexOf(keyToken);
  while (idx !== -1) {
    let j = idx + keyToken.length;
    while (j < rawBody.length && /\s/.test(rawBody[j])) j++;
    if (rawBody[j] === ':') {
      j++;
      while (j < rawBody.length && /\s/.test(rawBody[j])) j++;
      const open = rawBody[j];
      if (open === '{' || open === '[') {
        const close = open === '{' ? '}' : ']';
        let depth = 0;
        let inStr = false;
        let esc = false;
        for (let k = j; k < rawBody.length; k++) {
          const ch = rawBody[k];
          if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
          } else if (ch === '"') {
            inStr = true;
          } else if (ch === open) {
            depth++;
          } else if (ch === close) {
            depth--;
            if (depth === 0) return rawBody.slice(j, k + 1);
          }
        }
      }
    }
    idx = rawBody.indexOf(keyToken, idx + keyToken.length);
  }
  return undefined;
}

/**
 * Compute a Cardly postback signature:
 *   md5(secret + '.' + timestamp + '.' + <json-encoded data>)
 * per the "Verify Postback Signatures" section of the Cardly API docs.
 */
export function computeCardlySignature(
  secret: string,
  timestamp: string | number,
  dataJson: string,
): string {
  return createHash('md5').update(`${secret}.${timestamp}.${dataJson}`).digest('hex');
}

/**
 * Verify a Cardly webhook postback. Returns true only if the computed signature
 * matches any entry in the postback's `signatures` array. `dataJson` must be the
 * exact JSON text of the postback's `data` object — use `extractRawProperty` on
 * the raw request body, falling back to `JSON.stringify(body.data)`.
 */
export function verifyCardlySignature(
  secret: string,
  timestamp: string | number,
  dataJson: string,
  signatures: string[],
): boolean {
  if (!secret || !dataJson || !Array.isArray(signatures) || signatures.length === 0) {
    return false;
  }
  const expected = computeCardlySignature(secret, timestamp, dataJson);
  return signatures.includes(expected);
}
