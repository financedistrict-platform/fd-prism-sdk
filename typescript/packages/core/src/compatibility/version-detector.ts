/**
 * Protocol Version Detection
 * 
 * Automatically detects x402 protocol version from payloads
 */

/**
 * Detect protocol version from a payment payload or response
 * 
 * @param payload - Raw payload (object, string, or base64)
 * @returns Protocol version (1 or 2), or null if cannot be determined
 */
export function detectProtocolVersion(payload: unknown): 1 | 2 | null {
  try {
    let obj: any;

    // If string, try to decode from base64
    if (typeof payload === 'string') {
      try {
        const decoded = Buffer.from(payload, 'base64').toString('utf-8');
        obj = JSON.parse(decoded);
      } catch {
        // Try parsing directly as JSON
        obj = JSON.parse(payload);
      }
    } else {
      obj = payload;
    }

    // Check for x402Version field
    if (obj && typeof obj === 'object' && 'x402Version' in obj) {
      const version = obj.x402Version;

      if (version === 1) return 1;
      if (version === 2) return 2;

      // Future versions default to latest supported (v2)
      if (typeof version === 'number' && version > 2) return 2;
    }

    // Default to v2 if version not specified
    return 2;
  } catch {
    return null;
  }
}

/**
 * Check if a payload is v1 protocol
 */
export function isV1Payload(payload: unknown): boolean {
  return detectProtocolVersion(payload) === 1;
}

/**
 * Check if a payload is v2 protocol
 */
export function isV2Payload(payload: unknown): boolean {
  return detectProtocolVersion(payload) === 2;
}

/**
 * Validate protocol version number
 */
export function isValidProtocolVersion(version: unknown): version is 1 | 2 {
  return version === 1 || version === 2;
}

/**
 * Get default protocol version (v2)
 */
export function getDefaultProtocolVersion(): 2 {
  return 2;
}
