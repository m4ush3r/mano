import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import Soup from '@girs/soup-3.0';
import { getCachePath, logger } from '@mano/utils/shell';
import * as htmlparser2 from 'htmlparser2';

// Honest, identifiable User-Agent. The upstream project impersonated Googlebot,
// which is both deceptive and a way to bypass bot protection — we don't do that.
const DEFAULT_USER_AGENT =
  'mano-clipboard-manager (GNOME Shell extension link preview; +https://github.com/m4ush3r/mano)';

// Link previews fetch attacker-influenced URLs from inside the privileged
// gnome-shell process, so we guard against SSRF: only http(s), never private/
// loopback/link-local/metadata addresses, and a small bounded redirect chain
// that is re-validated at every hop.
const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const session = new Soup.Session();
session.timeout = 5;

const decoder = new TextDecoder();

const debug = logger('link-parser');

type DocumentMetadata = {
  title: string;
  description: string | undefined;
  imageUrl: string | undefined;
};

const isBlockedAddress = (address: Gio.InetAddress): boolean =>
  address.get_is_any() ||
  address.get_is_loopback() ||
  address.get_is_link_local() || // includes 169.254.0.0/16 (cloud metadata)
  address.get_is_site_local() || // 10/8, 172.16/12, 192.168/16 and IPv6 ULA
  address.get_is_multicast();

const resolveAddresses = async (host: string): Promise<Gio.InetAddress[]> => {
  const literal = Gio.InetAddress.new_from_string(host);
  if (literal) {
    return [literal];
  }
  const resolver = Gio.Resolver.get_default();
  // gjs auto-promisifies *_async; the result is a list of Gio.InetAddress.
  const addresses = (await (resolver as any).lookup_by_name_async(host, null)) as Gio.InetAddress[];
  return addresses ?? [];
};

const isSafeUrl = async (url: string): Promise<boolean> => {
  let uri: GLib.Uri;
  try {
    uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
  } catch (_err) {
    return false;
  }
  const scheme = uri.get_scheme()?.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    return false;
  }
  const host = uri.get_host();
  if (!host) {
    return false;
  }
  const lowerHost = host.toLowerCase();
  if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost') || lowerHost.endsWith('.local')) {
    return false;
  }
  try {
    const addresses = await resolveAddresses(host);
    if (addresses.length === 0) {
      return false;
    }
    // Refuse if *any* resolved address is internal (defends against a hostname
    // that resolves to several records, only some of which are public).
    return !addresses.some(isBlockedAddress);
  } catch (err) {
    debug(`could not resolve ${host}: ${err}`);
    return false;
  }
};

// Fetch a URL with SSRF protection and bounded, re-validated redirects.
const safeFetch = async (url: string, redirectsLeft = MAX_REDIRECTS): Promise<Uint8Array | null> => {
  if (!(await isSafeUrl(url))) {
    debug(`refusing to fetch unsafe url: ${url}`);
    return null;
  }

  const message = Soup.Message.new('GET', url);
  if (!message) {
    return null;
  }
  // Handle redirects ourselves so each hop is re-checked by isSafeUrl.
  message.set_flags(Soup.MessageFlags.NO_REDIRECT);
  message.requestHeaders.append('User-Agent', DEFAULT_USER_AGENT);

  const response = (await session.send_and_read_async(
    message,
    GLib.PRIORITY_DEFAULT,
    null,
  )) as any as GLib.Bytes | null;

  const status = message.get_status();
  if (status >= 300 && status < 400) {
    if (redirectsLeft <= 0) {
      debug(`too many redirects for ${url}`);
      return null;
    }
    const location = message.responseHeaders.get_one('Location');
    if (!location) {
      return null;
    }
    const next = GLib.Uri.resolve_relative(url, location, GLib.UriFlags.NONE);
    if (!next) {
      return null;
    }
    return safeFetch(next, redirectsLeft - 1);
  }

  if (response == null) {
    return null;
  }
  const data = response.get_data();
  return data ?? null;
};

const looksLikeImage = (data: Uint8Array): boolean => {
  if (data.length < 12) {
    return false;
  }
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => data[offset + i] === b);
  return (
    startsWith([0x89, 0x50, 0x4e, 0x47]) || // PNG
    startsWith([0xff, 0xd8, 0xff]) || // JPEG
    startsWith([0x47, 0x49, 0x46, 0x38]) || // GIF
    startsWith([0x42, 0x4d]) || // BMP
    (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) // WEBP (RIFF....WEBP)
  );
};

export const getDocument = async (url: string): Promise<DocumentMetadata> => {
  const defaultResult = {
    title: '',
    description: '',
    imageUrl: '',
  };
  try {
    const bytes = await safeFetch(url);
    if (bytes == null) {
      debug(`no usable response from ${url}`);
      return defaultResult;
    }

    const data = decoder.decode(bytes);

    let titleMatch = false;
    let titleTag = '';
    let title: string | undefined;
    let description: string | undefined;
    let imageUrl: string | undefined;
    const p = new htmlparser2.Parser(
      {
        onopentag(name, attribs) {
          if (name === 'meta') {
            if (
              !title &&
              (attribs['property'] === 'og:title' ||
                attribs['property'] === 'twitter:title' ||
                attribs['property'] === 'title' ||
                attribs['name'] === 'og:title' ||
                attribs['name'] === 'twitter:title' ||
                attribs['name'] === 'title')
            ) {
              title = attribs['content'];
            } else if (
              !description &&
              (attribs['property'] === 'og:description' ||
                attribs['property'] === 'twitter:description' ||
                attribs['property'] === 'description' ||
                attribs['name'] === 'og:description' ||
                attribs['name'] === 'twitter:description' ||
                attribs['name'] === 'description')
            ) {
              description = attribs['content'];
            } else if (
              !imageUrl &&
              (attribs['property'] === 'og:image' ||
                attribs['property'] === 'twitter:image' ||
                attribs['property'] === 'image' ||
                attribs['name'] === 'og:image' ||
                attribs['name'] === 'twitter:image' ||
                attribs['name'] === 'image')
            ) {
              imageUrl = attribs['content'];
              if (imageUrl && imageUrl.startsWith('/')) {
                const uri = GLib.uri_parse(url, GLib.UriFlags.NONE);
                imageUrl = `${uri.get_scheme()}://${uri.get_host()}${imageUrl}`;
              }
            }
          }
          if (name === 'title') {
            titleMatch = true;
          }
        },
        ontext(data) {
          if (titleMatch && !title) {
            titleTag += data;
          }
        },
        onclosetag(name) {
          if (name === 'title') {
            titleMatch = false;
          }
        },
      },
      {
        decodeEntities: true,
        lowerCaseTags: true,
        lowerCaseAttributeNames: true,
      },
    );
    p.write(data);
    p.end();

    title = title || titleTag;

    return {
      title,
      description,
      imageUrl,
    };
  } catch (err) {
    debug(`failed to parse link ${url}. err: ${err}`);
  }

  return defaultResult;
};

export const getImage = async (
  ext: ExtensionBase,
  imageUrl: string | undefined,
): Promise<[string | null, Gio.File | null]> => {
  if (imageUrl && imageUrl.startsWith('http')) {
    try {
      const checksum = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, imageUrl, imageUrl.length);
      const cachedImage = Gio.File.new_for_path(`${getCachePath(ext)}/${checksum}.png`);

      if (cachedImage.query_exists(null)) {
        return [checksum, cachedImage];
      }

      const data = await safeFetch(imageUrl);
      if (!data || data.length == 0) {
        debug('empty or refused response while fetching the image');
        return [null, null];
      }

      // The bytes are attacker-controlled and get decoded by GdkPixbuf inside
      // gnome-shell, so bound the size and require a known image signature.
      if (data.length > MAX_IMAGE_BYTES) {
        debug('refusing oversized link-preview image');
        return [null, null];
      }
      if (!looksLikeImage(data)) {
        debug('refusing link-preview response that is not a recognized image');
        return [null, null];
      }

      cachedImage.replace_contents(data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

      return [checksum, cachedImage];
    } catch (err) {
      debug(`failed to load image: ${imageUrl}. err: ${err}`);
    }
  }

  return [null, null];
};
