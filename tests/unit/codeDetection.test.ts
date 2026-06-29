import { looksLikeCode } from '../../src/utils/codeDetection';

describe('looksLikeCode', () => {
  it('detects obvious code', () => {
    expect(looksLikeCode('function foo() {\n  return 1;\n}')).toBe(true);
    expect(looksLikeCode('const add = (a, b) => { return a && b; }')).toBe(true);
    expect(looksLikeCode('import os\nfrom sys import argv')).toBe(true);
  });

  it('treats prose as not code', () => {
    expect(looksLikeCode('This is a normal sentence about cats and dogs.')).toBe(false);
    expect(looksLikeCode('Buy milk, eggs, and bread on the way home.')).toBe(false);
  });

  it('returns false for very short text', () => {
    expect(looksLikeCode('hi')).toBe(false);
    expect(looksLikeCode('{}')).toBe(false);
  });
});
