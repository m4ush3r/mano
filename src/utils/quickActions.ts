import GLib from '@girs/glib-2.0';
import { DBItem, ItemType } from '@mano/utils/db';

// Quick actions transform or act on a selected item. Item types that carry text
// the user might want to manipulate.
const TEXT_TYPES: ItemType[] = ['TEXT', 'CODE', 'LINK', 'COLOR', 'EMOJI'];

// What the caller should do with an action's outcome. Keeping this a plain
// descriptor means the action logic stays pure and easy to reason about; the UI
// layer (panoItem) performs the side effect.
export type QuickActionResult =
  | { kind: 'copy'; text: string }
  | { kind: 'notify'; title: string; body: string }
  | { kind: 'open'; url: string }
  | { kind: 'qr'; text: string };

export type QuickAction = {
  id: string;
  label: string;
  run: (text: string) => QuickActionResult;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const safe = (label: string, fn: () => QuickActionResult): QuickActionResult => {
  try {
    return fn();
  } catch (_err) {
    return { kind: 'notify', title: label, body: "This action can't be applied to the selected item." };
  }
};

const ACTIONS: QuickAction[] = [
  { id: 'upper', label: 'UPPERCASE', run: (t) => ({ kind: 'copy', text: t.toUpperCase() }) },
  { id: 'lower', label: 'lowercase', run: (t) => ({ kind: 'copy', text: t.toLowerCase() }) },
  { id: 'trim', label: 'Trim whitespace', run: (t) => ({ kind: 'copy', text: t.trim() }) },
  {
    id: 'base64-encode',
    label: 'Base64 encode',
    run: (t) => ({ kind: 'copy', text: GLib.base64_encode(encoder.encode(t)) }),
  },
  {
    id: 'base64-decode',
    label: 'Base64 decode',
    run: (t) => safe('Base64 decode', () => ({ kind: 'copy', text: decoder.decode(GLib.base64_decode(t.trim())) })),
  },
  { id: 'url-encode', label: 'URL encode', run: (t) => ({ kind: 'copy', text: encodeURIComponent(t) }) },
  {
    id: 'url-decode',
    label: 'URL decode',
    run: (t) => safe('URL decode', () => ({ kind: 'copy', text: decodeURIComponent(t) })),
  },
  {
    id: 'json',
    label: 'Pretty-print JSON',
    run: (t) => safe('Pretty-print JSON', () => ({ kind: 'copy', text: JSON.stringify(JSON.parse(t), null, 2) })),
  },
  { id: 'reverse', label: 'Reverse text', run: (t) => ({ kind: 'copy', text: [...t].reverse().join('') }) },
  {
    id: 'sort-lines',
    label: 'Sort lines (A→Z)',
    run: (t) => ({
      kind: 'copy',
      text: t
        .split('\n')
        .sort((a, b) => a.localeCompare(b))
        .join('\n'),
    }),
  },
  {
    id: 'dedupe-lines',
    label: 'Remove duplicate lines',
    run: (t) => ({ kind: 'copy', text: [...new Set(t.split('\n'))].join('\n') }),
  },
  {
    id: 'slugify',
    label: 'Slugify (url-friendly)',
    run: (t) => ({
      kind: 'copy',
      text: t
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-+|-+$)/g, ''),
    }),
  },
  {
    id: 'sha256',
    label: 'SHA-256 hash',
    run: (t) => ({ kind: 'copy', text: GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, t, -1) ?? '' }),
  },
  {
    id: 'md5',
    label: 'MD5 hash',
    run: (t) => ({ kind: 'copy', text: GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, t, -1) ?? '' }),
  },
  {
    id: 'count',
    label: 'Count characters & words',
    run: (t) => ({
      kind: 'notify',
      title: 'Count',
      body: `${[...t].length} characters · ${t.trim() ? t.trim().split(/\s+/).length : 0} words`,
    }),
  },
  { id: 'qr', label: 'Show QR code', run: (t) => ({ kind: 'qr', text: t }) },
  { id: 'open', label: 'Open as link', run: (t) => ({ kind: 'open', url: t.trim() }) },
];

const looksLikeUrl = (text: string): boolean => /^https?:\/\/\S+$/i.test(text.trim());

// The actions applicable to a given item, in menu order.
export const getQuickActions = (item: DBItem): QuickAction[] => {
  if (!TEXT_TYPES.includes(item.itemType)) {
    return [];
  }
  return ACTIONS.filter((action) => {
    if (action.id === 'open') {
      return item.itemType === 'LINK' || looksLikeUrl(item.content);
    }
    return true;
  });
};
