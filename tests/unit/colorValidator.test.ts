import {
  cssRgbToHex,
  validateHTMLColorHex,
  validateHTMLColorName,
  validateHTMLColorRgb,
} from '../../src/utils/colorValidator';

describe('colorValidator', () => {
  describe('validateHTMLColorHex', () => {
    it('accepts 3/4/6/8-digit hex (case-insensitive)', () => {
      ['#fff', '#ffff', '#ffffff', '#ffffffff', '#AbC123'].forEach((c) => expect(validateHTMLColorHex(c)).toBe(true));
    });
    it('rejects malformed hex', () => {
      ['fff', '#ff', '#fffff', 'red', '#gggggg', ''].forEach((c) => expect(validateHTMLColorHex(c)).toBe(false));
    });
  });

  describe('validateHTMLColorRgb', () => {
    it('accepts rgb()/rgba() incl. percentages', () => {
      ['rgb(0,0,0)', 'rgb(255, 255, 255)', 'rgba(10, 20, 30, 0.5)', 'rgb(100%, 0%, 50%)'].forEach((c) =>
        expect(validateHTMLColorRgb(c)).toBe(true),
      );
    });
    it('rejects out-of-range or malformed values', () => {
      ['rgb(300, 0, 0)', 'rgb(0,0)', 'hsl(0,0,0)', 'rgb()'].forEach((c) =>
        expect(validateHTMLColorRgb(c)).toBe(false),
      );
    });
  });

  describe('validateHTMLColorName', () => {
    it('accepts CSS named colors case-insensitively', () => {
      ['red', 'RebeccaPurple', 'transparent', 'WHITE'].forEach((c) => expect(validateHTMLColorName(c)).toBe(true));
    });
    it('rejects unknown names', () => {
      ['reddish', 'notacolor', ''].forEach((c) => expect(validateHTMLColorName(c)).toBe(false));
    });
  });

  describe('cssRgbToHex', () => {
    it('converts rgb() to #rrggbb', () => {
      expect(cssRgbToHex('rgb(255, 0, 0)')).toBe('#ff0000');
      expect(cssRgbToHex('rgb(0, 128, 255)')).toBe('#0080ff');
    });
    it('converts rgba() to #rrggbbaa', () => {
      expect(cssRgbToHex('rgba(255, 0, 0, 1)')).toBe('#ff0000ff');
      expect(cssRgbToHex('rgba(0, 0, 0, 0)')).toBe('#00000000');
    });
    it('handles percentage channels', () => {
      expect(cssRgbToHex('rgb(100%, 0%, 0%)')).toBe('#ff0000');
    });
    it('returns null for non-rgb input', () => {
      expect(cssRgbToHex('#fff')).toBe(null);
      expect(cssRgbToHex('blue')).toBe(null);
    });
  });
});
