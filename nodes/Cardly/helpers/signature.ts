import { createHash, timingSafeEqual } from 'crypto';

/**
 * Scan from `rawBody[valueStart]` (which must be `{` or `[`) and return the raw
 * text of that balanced object/array, respecting JSON strings and escapes.
 * Returns undefined if the structure is unbalanced.
 */
function captureBalanced(rawBody: string, valueStart: number): string | undefined {
  const open = rawBody[valueStart];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let k = valueStart; k < rawBody.length; k++) {
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
      if (depth === 0) return rawBody.slice(valueStart, k + 1);
    }
  }
  return undefined;
}

/**
 * Extract the exact raw JSON text of a **top-level** object- or array-valued
 * property from a JSON body string, preserving the original serialization
 * (key order, whitespace). Cardly signs the JSON-encoded `data` object as it
 * transmits it, so re-serializing could change the bytes and break the hash —
 * this returns the untouched slice instead.
 *
 * The scan is depth-aware: it only matches the property as a key of the root
 * object (depth 1), so a same-named key nested inside another value cannot be
 * mistaken for it. Returns undefined if the raw body is empty or the property
 * isn't found as a top-level object/array value.
 */
export function extractRawProperty(rawBody: string, property: string): string | undefined {
  if (!rawBody) return undefined;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let strStart = -1;
  for (let i = 0; i < rawBody.length; i++) {
    const ch = rawBody[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
        // A string that closes at depth 1 and is immediately followed by ':' is a
        // key of the root object.
        if (depth === 1) {
          let j = i + 1;
          while (j < rawBody.length && /\s/.test(rawBody[j])) j++;
          if (rawBody[j] === ':' && rawBody.slice(strStart + 1, i) === property) {
            j++;
            while (j < rawBody.length && /\s/.test(rawBody[j])) j++;
            if (rawBody[j] === '{' || rawBody[j] === '[') {
              return captureBalanced(rawBody, j);
            }
            return undefined; // top-level property exists but isn't object/array valued
          }
        }
      }
    } else if (ch === '"') {
      inStr = true;
      strStart = i;
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
    }
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
 * matches any entry in the postback's `signatures` array (compared timing-safely).
 * `dataJson` must be the exact JSON text of the postback's `data` object — use
 * `extractRawProperty` on the raw request body, falling back to
 * `JSON.stringify(body.data)`.
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
  const expectedBuf = Buffer.from(expected);
  return signatures.some((s) => {
    if (typeof s !== 'string' || s.length !== expected.length) return false;
    return timingSafeEqual(expectedBuf, Buffer.from(s));
  });
}
