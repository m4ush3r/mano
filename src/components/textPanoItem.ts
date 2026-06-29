import Gio from '@girs/gio-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import * as PopupMenu from '@girs/gnome-shell/dist/ui/popupMenu';
import Pango from '@girs/pango-1.0';
import St from '@girs/st-17';
import { PanoItem } from '@mano/components/panoItem';
import { ClipboardContent, ClipboardManager, ContentType } from '@mano/utils/clipboardManager';
import { DBItem } from '@mano/utils/db';
import { registerGObjectClass } from '@mano/utils/gjs';

// Per-note colors (sticky-note style), applied only to plain text notes. Soft
// shades so the dark override text stays readable on any shell theme.
const NOTE_COLORS: Record<string, string> = {
  yellow: '#dbb13a',
  red: '#d35f5f',
  green: '#5fa873',
  orange: '#d4862e',
  purple: '#9d6bb8',
  white: '#dedede',
};
const NOTE_COLOR_KEYS = Object.keys(NOTE_COLORS);
const NOTE_COLOR_TEXT = '#2e2e2e';

// A small curated set of marker emojis to decorate notes (a full emoji picker
// is the OS's job via Ctrl+. — this is just for at-a-glance tagging).
const NOTE_EMOJIS = ['📌', '⭐', '❗', '✅', '💡', '🔥', '❤️', '📝'];

@registerGObjectClass
export class TextPanoItem extends PanoItem {
  private textItemSettings: Gio.Settings;
  private label: St.Label;
  private emojiBadge: St.Label;

  constructor(ext: ExtensionBase, clipboardManager: ClipboardManager, dbItem: DBItem) {
    super(ext, clipboardManager, dbItem);

    this.textItemSettings = this.settings.get_child('text-item');

    this.label = new St.Label({
      styleClass: 'mano-item-body-text-content',
    });
    this.label.clutterText.lineWrap = true;
    this.label.clutterText.lineWrapMode = Pango.WrapMode.WORD_CHAR;
    this.label.clutterText.ellipsize = Pango.EllipsizeMode.END;

    this.emojiBadge = new St.Label({ style: 'font-size: 20px;' });
    this.body.add_child(this.emojiBadge);
    this.body.add_child(this.label);

    this.connect('activated', this.setClipboardContent.bind(this));
    this.setStyle();
    this.applyEmoji();
    const settingsChangedId = this.textItemSettings.connect('changed', this.setStyle.bind(this));
    this.disconnectors.push(() => this.textItemSettings.disconnect(settingsChangedId));
  }

  private setStyle() {
    const headerBgColor = this.textItemSettings.get_string('header-bg-color');
    const headerColor = this.textItemSettings.get_string('header-color');
    const bodyBgColor = this.textItemSettings.get_string('body-bg-color');
    const bodyColor = this.textItemSettings.get_string('body-color');
    const bodyFontFamily = this.textItemSettings.get_string('body-font-family');
    const bodyFontSize = this.textItemSettings.get_int('body-font-size');
    const characterLength = this.textItemSettings.get_int('char-length');

    // Set header styles
    this.header.set_style(`background-color: ${headerBgColor}; color: ${headerColor};`);

    // A per-note color overrides the default body background (and forces a dark,
    // readable text color); otherwise the configured text-item style is used.
    const noteColor = this.getNoteColor();
    if (noteColor && NOTE_COLORS[noteColor]) {
      this.body.set_style(`background-color: ${NOTE_COLORS[noteColor]}`);
      this.label.set_style(`color: ${NOTE_COLOR_TEXT}; font-family: ${bodyFontFamily}; font-size: ${bodyFontSize}px;`);
    } else {
      this.body.set_style(`background-color: ${bodyBgColor}`);
      this.label.set_style(`color: ${bodyColor}; font-family: ${bodyFontFamily}; font-size: ${bodyFontSize}px;`);
    }

    this.label.set_text(this.dbItem.content.trim().slice(0, characterLength));
  }

  private getNoteColor(): string | undefined {
    if (!this.dbItem.metaData) {
      return undefined;
    }
    try {
      return (JSON.parse(this.dbItem.metaData) as { color?: string }).color;
    } catch (_err) {
      return undefined;
    }
  }

  private setNoteColor(color: string): void {
    let meta: Record<string, unknown> = {};
    if (this.dbItem.metaData) {
      try {
        meta = JSON.parse(this.dbItem.metaData) as Record<string, unknown>;
      } catch (_err) {
        meta = {};
      }
    }
    meta['color'] = color;
    this.dbItem = { ...this.dbItem, metaData: JSON.stringify(meta) };
    this.emit('on-update', JSON.stringify(this.dbItem));
    this.setStyle();
  }

  // Adds a row of color swatches to the right-click actions menu.
  override addExtraActions(menu: PopupMenu.PopupMenu): void {
    const row = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    const box = new St.BoxLayout({ style: 'spacing: 8px;' });
    NOTE_COLOR_KEYS.forEach((key) => {
      const swatch = new St.Button({
        style: `background-color: ${NOTE_COLORS[key]}; width: 24px; height: 24px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.35);`,
      });
      swatch.connect('clicked', () => {
        this.setNoteColor(key);
        menu.close();
      });
      box.add_child(swatch);
    });
    row.add_child(box);
    menu.addMenuItem(row);

    // Row of marker emojis + a clear button.
    const emojiRow = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    const emojiBox = new St.BoxLayout({ style: 'spacing: 6px;' });
    NOTE_EMOJIS.forEach((emoji) => {
      const button = new St.Button({ label: emoji, style: 'font-size: 18px; padding: 2px 5px;' });
      button.connect('clicked', () => {
        this.setNoteEmoji(emoji);
        menu.close();
      });
      emojiBox.add_child(button);
    });
    const clearButton = new St.Button({ label: '✕', style: 'font-size: 16px; padding: 2px 6px;' });
    clearButton.connect('clicked', () => {
      this.setNoteEmoji(null);
      menu.close();
    });
    emojiBox.add_child(clearButton);
    emojiRow.add_child(emojiBox);
    menu.addMenuItem(emojiRow);
  }

  private getNoteEmoji(): string | undefined {
    if (!this.dbItem.metaData) {
      return undefined;
    }
    try {
      return (JSON.parse(this.dbItem.metaData) as { emoji?: string }).emoji;
    } catch (_err) {
      return undefined;
    }
  }

  private setNoteEmoji(emoji: string | null): void {
    let meta: Record<string, unknown> = {};
    if (this.dbItem.metaData) {
      try {
        meta = JSON.parse(this.dbItem.metaData) as Record<string, unknown>;
      } catch (_err) {
        meta = {};
      }
    }
    if (emoji) {
      meta['emoji'] = emoji;
    } else {
      delete meta['emoji'];
    }
    this.dbItem = { ...this.dbItem, metaData: JSON.stringify(meta) };
    this.emit('on-update', JSON.stringify(this.dbItem));
    this.applyEmoji();
  }

  private applyEmoji(): void {
    const emoji = this.getNoteEmoji();
    if (emoji) {
      this.emojiBadge.set_text(emoji);
      this.emojiBadge.show();
    } else {
      this.emojiBadge.set_text('');
      this.emojiBadge.hide();
    }
  }

  private setClipboardContent(): void {
    this.clipboardManager.setContent(
      new ClipboardContent({
        type: ContentType.TEXT,
        value: this.dbItem.content,
      }),
    );
  }
}
