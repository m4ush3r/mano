import Clutter from '@girs/clutter-17';
import Gio from '@girs/gio-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import Pango from '@girs/pango-1.0';
import St from '@girs/st-17';
import { PanoItem } from '@mano/components/panoItem';
import { ClipboardContent, ClipboardManager, ContentType } from '@mano/utils/clipboardManager';
import { DBItem } from '@mano/utils/db';
import { registerGObjectClass } from '@mano/utils/gjs';
import { formatBytes, gettext } from '@mano/utils/shell';
import { orientationCompatibility } from '@mano/utils/shell_compatibility';

/*
 * Copied-file cards render a real preview instead of a plain list of paths.
 *
 * Images are rendered from the file itself, other types use the thumbnail
 * GNOME has already generated, and the card falls back to the file's MIME icon
 * when no thumbnail is available.
 */
@registerGObjectClass
export class FilePanoItem extends PanoItem {
  private fileList: string[];
  private operation: string;
  private fileItemSettings: Gio.Settings;

  private metaContainer: St.BoxLayout;
  private nameLabel: St.Label;
  private detailLabel: St.Label;

  constructor(ext: ExtensionBase, clipboardManager: ClipboardManager, dbItem: DBItem) {
    super(ext, clipboardManager, dbItem);

    this.fileList = JSON.parse(this.dbItem.content);
    this.operation = this.dbItem.metaData || 'copy';

    this.body.add_style_class_name('mano-item-body-file');
    this.fileItemSettings = this.settings.get_child('file-item');

    const firstUri = this.fileList[0] ?? '';

    const fileData = this.getFileData(firstUri);

    // Large preview area.
    const previewContainer = new St.BoxLayout({
      ...orientationCompatibility(true),
      xExpand: true,
      yExpand: true,
      xAlign: Clutter.ActorAlign.FILL,
      yAlign: Clutter.ActorAlign.FILL,
    });

    if (fileData.previewUri) {
      // Same mechanism Mano already uses for image and link previews.
      previewContainer.set_style(`background-image: url(${fileData.previewUri}); ` + 'background-size: contain;');
    } else {
      // No thumbnail available: show the file's MIME icon.
      const icon = new St.Icon({
        gicon: fileData.icon ?? Gio.ThemedIcon.new('text-x-generic-symbolic'),

        iconSize: 96,

        xExpand: true,
        yExpand: true,

        xAlign: Clutter.ActorAlign.CENTER,
        yAlign: Clutter.ActorAlign.CENTER,
      });

      previewContainer.add_child(icon);
    }

    // Caption bar with the file name and its size.
    this.metaContainer = new St.BoxLayout({
      ...orientationCompatibility(true),
      xExpand: true,
      yExpand: false,
      xAlign: Clutter.ActorAlign.FILL,
      yAlign: Clutter.ActorAlign.END,
    });

    this.nameLabel = new St.Label({
      text: fileData.displayName,
      xExpand: true,
      xAlign: Clutter.ActorAlign.START,
    });

    this.nameLabel.clutterText.ellipsize = Pango.EllipsizeMode.MIDDLE;

    let detail = fileData.detail;

    if (this.fileList.length > 1) {
      const _ = gettext(this.ext);

      detail = _('There are %s file(s)').format(this.fileList.length);
    }

    this.detailLabel = new St.Label({
      text: detail,
      xExpand: true,
      xAlign: Clutter.ActorAlign.START,
    });

    this.detailLabel.clutterText.ellipsize = Pango.EllipsizeMode.END;

    this.metaContainer.add_child(this.nameLabel);
    this.metaContainer.add_child(this.detailLabel);

    this.body.add_child(previewContainer);
    this.body.add_child(this.metaContainer);

    this.connect('activated', this.setClipboardContent.bind(this));

    this.setStyle();

    const settingsChangedId = this.fileItemSettings.connect('changed', this.setStyle.bind(this));

    this.disconnectors.push(() => this.fileItemSettings.disconnect(settingsChangedId));
  }

  private getFileData(uri: string): {
    displayName: string;
    detail: string;
    icon: Gio.Icon | null;
    previewUri: string | null;
  } {
    if (!uri) {
      const _ = gettext(this.ext);

      return {
        displayName: _('File'),
        detail: '',
        icon: null,
        previewUri: null,
      };
    }

    try {
      const file = Gio.File.new_for_uri(uri);

      const info = file.query_info(
        [
          'standard::display-name',
          'standard::icon',
          'standard::content-type',
          'standard::size',
          'thumbnail::path',
        ].join(','),
        Gio.FileQueryInfoFlags.NONE,
        null,
      );

      const displayName = info.get_display_name() || file.get_basename() || gettext(this.ext)('File');

      const icon = info.get_icon();

      const contentType = info.get_attribute_string('standard::content-type') || '';

      const size = info.get_size();

      let previewUri: string | null = null;

      // Images can be rendered straight from the file, no thumbnail needed.
      if (contentType.startsWith('image/')) {
        previewUri = file.get_uri();
      } else {
        // PDFs, videos, etc: reuse the thumbnail GNOME already generated.
        const thumbnailPath = info.get_attribute_byte_string('thumbnail::path');

        if (thumbnailPath) {
          const thumbnail = Gio.File.new_for_path(thumbnailPath);

          if (thumbnail.query_exists(null)) {
            previewUri = thumbnail.get_uri();
          }
        }
      }

      return {
        displayName,
        detail: size > 0 ? formatBytes(size) : '',
        icon,
        previewUri,
      };
    } catch (_error) {
      const decoded = decodeURIComponent(uri.split('/').pop() || gettext(this.ext)('File'));

      return {
        displayName: decoded,
        detail: '',
        icon: null,
        previewUri: null,
      };
    }
  }

  private setStyle() {
    const headerBgColor = this.fileItemSettings.get_string('header-bg-color');

    const headerColor = this.fileItemSettings.get_string('header-color');

    const bodyBgColor = this.fileItemSettings.get_string('body-bg-color');

    const bodyColor = this.fileItemSettings.get_string('body-color');

    const bodyFontFamily = this.fileItemSettings.get_string('body-font-family');

    const bodyFontSize = this.fileItemSettings.get_int('body-font-size');

    this.header.set_style(`background-color: ${headerBgColor}; ` + `color: ${headerColor};`);

    this.body.set_style(
      `background-color: ${bodyBgColor}; ` +
        `color: ${bodyColor}; ` +
        `font-family: ${bodyFontFamily}; ` +
        `font-size: ${bodyFontSize}px;`,
    );

    // Translucent caption bar so the text stays readable on any thumbnail.
    this.metaContainer.set_style('background-color: rgba(0,0,0,0.68); ' + 'padding: 8px 10px;');

    this.nameLabel.set_style('color: white; font-weight: bold;');

    this.detailLabel.set_style('color: rgba(255,255,255,0.78); ' + 'font-size: 11px;');
  }

  private setClipboardContent(): void {
    this.clipboardManager.setContent(
      new ClipboardContent({
        type: ContentType.FILE,
        value: {
          fileList: this.fileList,
          operation: this.operation,
        },
      }),
    );
  }
}
