import { parsePrice } from '../../utils/price-parser';

describe('parsePrice', () => {
  it.each([
    ['$0.01', 0.01],
    ['€10.50', 10.5],
    ['£2', 2],
    ['¥100', 100],
    ['0.001', 0.001],
    ['10000', 10000],
    ['.5', 0.5],
    ['  $1.25  ', 1.25],
    ['0.001 USDC', 0.001],
    ['$10 USD', 10],
    ['5.', 5],
  ])('parses %p as %p', (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it('accepts positive numbers', () => {
    expect(parsePrice(0.01)).toBe(0.01);
    expect(parsePrice(5)).toBe(5);
  });

  it.each([
    '1,000',
    '1,000.50',
    '1e3',
    '1_000',
    '10USD',
    '10 US$',
    '10 USDC extra',
    '1 000',
    '$1.2.3',
    '1$2',
    '$$1',
    '+1',
    '-1',
    '0',
    '$0',
    '0.0',
    '',
    '   ',
    '$',
    'abc',
    'NaN',
    'Infinity',
    '0x10',
  ])('rejects %p', (input) => {
    expect(() => parsePrice(input)).toThrow('Invalid price value');
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('rejects numeric %p', (input) => {
    expect(() => parsePrice(input)).toThrow('Invalid price value');
  });
});
