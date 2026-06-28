// Local replacement for the `validate-color` package, which was previously
// pulled from a third-party `gitpkg.now.sh` URL that no longer resolves
// (returns HTTP 402), breaking `yarn install`. These helpers cover the same
// surface the extension uses: CSS hex, rgb()/rgba() and named colors.

// #rgb, #rgba, #rrggbb, #rrggbbaa
const HEX_REGEX = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

// rgb(r, g, b) / rgba(r, g, b, a) with integer or percentage channels.
const RGB_REGEX = /^rgb\(\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*\)$/i;
const RGBA_REGEX = /^rgba\(\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*,\s*(\d{1,3}%?)\s*,\s*(0|1|0?\.\d+|1\.0+)\s*\)$/i;

// CSS Level 4 named colors (plus `transparent`), lower-cased for lookup.
const NAMED_COLORS = new Set([
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'transparent',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
]);

function channelInRange(channel: string): boolean {
  if (channel.endsWith('%')) {
    return Number(channel.slice(0, -1)) <= 100;
  }
  return Number(channel) <= 255;
}

export function validateHTMLColorHex(color: string): boolean {
  return HEX_REGEX.test(color.trim());
}

export function validateHTMLColorRgb(color: string): boolean {
  const value = color.trim();
  const match = RGB_REGEX.exec(value) ?? RGBA_REGEX.exec(value);
  if (!match) {
    return false;
  }
  return [match[1], match[2], match[3]].every((channel) => channelInRange(channel!));
}

export function validateHTMLColorName(color: string): boolean {
  return NAMED_COLORS.has(color.trim().toLowerCase());
}

// Convert an rgb()/rgba() string to #rrggbb / #rrggbbaa (replaces the
// hex-color-converter dependency). Returns null if it is not an rgb(a) color.
export function cssRgbToHex(color: string): string | null {
  const value = color.trim();
  const match = RGB_REGEX.exec(value) ?? RGBA_REGEX.exec(value);
  if (!match) {
    return null;
  }
  const toByte = (channel: string): number =>
    channel.endsWith('%') ? Math.round((Number(channel.slice(0, -1)) / 100) * 255) : Number(channel);
  const hex = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  let result = `#${hex(toByte(match[1]!))}${hex(toByte(match[2]!))}${hex(toByte(match[3]!))}`;
  if (match[4] !== undefined) {
    result += hex(Math.round(Number(match[4]) * 255));
  }
  return result;
}
