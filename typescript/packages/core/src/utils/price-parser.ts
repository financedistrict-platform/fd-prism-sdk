/**
 * Parse price from string or number format
 * 
 * Supports:
 * - Number: 0.01
 * - String with currency: "$0.01", "€0.01", "£0.01", "¥0.01"
 * - String without currency: "0.01"
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
 * ```
 */
export function parsePrice(price: string | number): number {
  if (typeof price === 'number') {
    return price;
  }

  // Remove currency symbols and parse
  const numericPrice = price.replace(/[$€£¥]/g, '').trim();
  const parsed = parseFloat(numericPrice);

  if (isNaN(parsed)) {
    throw new Error(`Invalid price format: ${price}`);
  }

  return parsed;
}
