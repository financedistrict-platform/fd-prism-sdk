const PRICE_PATTERN = /^[$€£¥]?\s*(\d+(?:\.\d*)?|\.\d+)(?:\s+[A-Za-z]{2,10})?$/;

/**
 * Parse price from string or number format
 *
 * Supports:
 * - Number: 0.01
 * - String with one leading currency symbol: "$0.01", "€0.01", "£0.01", "¥0.01"
 * - String with a trailing currency code: "0.001 USDC"
 * - String without currency: "0.01"
 *
 * Anything else is rejected, including thousands separators ("1,000"),
 * exponents ("1e3"), signs and embedded currency symbols.
 *
 * @param price - Price in various formats
 * @returns Parsed price as number
 * @throws Error if price format is invalid
 *
 * @example
 * ```typescript
 * parsePrice(0.01)        // 0.01
 * parsePrice("$0.01")     // 0.01
 * parsePrice("€10.50")    // 10.5
 * parsePrice("0.001")     // 0.001
 * parsePrice("1,000")     // throws
 * ```
 */
export function parsePrice(price: string | number): number {
  let parsed: number;

  if (typeof price === 'number') {
    parsed = price;
  } else if (typeof price === 'string') {
    const match = PRICE_PATTERN.exec(price.trim());
    parsed = match ? Number(match[1]) : NaN;
  } else {
    parsed = NaN;
  }

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid price value: ${price}`);
  }

  return parsed;
}
