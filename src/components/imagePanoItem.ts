import Clutter from '@girs/clutter-17';
import Gio from '@girs/gio-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import St from '@girs/st-17';
import { PanoItem } from '@mano/components/panoItem';
import { ClipboardContent, ClipboardManager, ContentType } from '@mano/utils/clipboardManager';
import { DBItem } from '@mano/utils/db';
import { registerGObjectClass } from '@mano/utils/gjs';
import { formatBytes, getImagesPath } from '@mano/utils/shell';
import { orientationCompatibility } from '@mano/utils/shell_compatibility';

const NO_IMAGE_FOUND_FILE_NAME = 'no-image-found.svg';

@registerGObjectClass
export class ImagePanoItem extends PanoItem {
  private imageItemSettings: Gio.Settings;
  private metaContainer: St.BoxLayout;
  private resolutionTitle: St.Label;
  private resolutionValue: St.Label;
  private sizeLabel: St.Label;
  private sizeValue: St.Label;

  constructor(ext: ExtensionBase, clipboardManager: ClipboardManager, dbItem: DBItem) {
    super(ext, clipboardManager, dbItem);

    this.body.add_style_class_name('mano-item-body-image');

    this.imageItemSettings = this.settings.get_child('image-item');

    const { width, height, size }: { width: number; height: number; size: number } = JSON.parse(
      dbItem.metaData || '{}',
    );

    this.metaContainer = new St.BoxLayout({
      styleClass: 'mano-item-body-meta-container',
      ...orientationCompatibility(true),
      xExpand: true,
      yExpand: true,
      yAlign: Clutter.ActorAlign.END,
      xAlign: Clutter.ActorAlign.FILL,
    });

    const resolutionContainer = new St.BoxLayout({
      ...orientationCompatibility(false),
      xExpand: true,
      yAlign: Clutter.ActorAlign.FILL,
      xAlign: Clutter.ActorAlign.FILL,
      styleClass: 'mano-item-body-image-resolution-container',
    });

    this.resolutionTitle = new St.Label({
      text: 'Resolution',
      xAlign: Clutter.ActorAlign.START,
      xExpand: true,
      styleClass: 'mano-item-body-image-meta-title',
    });
    this.resolutionValue = new St.Label({
      text: `${width} x ${height}`,
      xAlign: Clutter.ActorAlign.END,
      xExpand: false,
      styleClass: 'mano-item-body-image-meta-value',
    });
    resolutionContainer.add_child(this.resolutionTitle);
    resolutionContainer.add_child(this.resolutionValue);

    const sizeContainer = new St.BoxLayout({
      ...orientationCompatibility(false),
      xExpand: true,
      yAlign: Clutter.ActorAlign.FILL,
      xAlign: Clutter.ActorAlign.FILL,
      styleClass: 'mano-item-body-image-size-container',
    });

    this.sizeLabel = new St.Label({
      text: 'Size',
      xAlign: Clutter.ActorAlign.START,
      xExpand: true,
      styleClass: 'mano-item-body-image-meta-title',
    });
    this.sizeValue = new St.Label({
      text: formatBytes(size),
      xAlign: Clutter.ActorAlign.END,
      xExpand: false,
      styleClass: 'mano-item-body-image-meta-value',
    });
    sizeContainer.add_child(this.sizeLabel);
    sizeContainer.add_child(this.sizeValue);

    this.metaContainer.add_child(resolutionContainer);
    this.metaContainer.add_child(sizeContainer);
    this.metaContainer.add_constraint(
      new Clutter.AlignConstraint({
        source: this,
        alignAxis: Clutter.AlignAxis.Y_AXIS,
        factor: 0.001,
      }),
    );

    this.body.add_child(this.metaContainer);

    this.connect('activated', this.setClipboardContent.bind(this));
    this.setStyle();
    const settingsChangedId = this.imageItemSettings.connect('changed', this.setStyle.bind(this));
    this.disconnectors.push(() => this.imageItemSettings.disconnect(settingsChangedId));
  }

  private setStyle() {
    const headerBgColor = this.imageItemSettings.get_string('header-bg-color');
    const headerColor = this.imageItemSettings.get_string('header-color');
    const bodyBgColor = this.imageItemSettings.get_string('body-bg-color');
    const metadataBgColor = this.imageItemSettings.get_string('metadata-bg-color');
    const metadataColor = this.imageItemSettings.get_string('metadata-color');
    const metadataFontFamily = this.imageItemSettings.get_string('metadata-font-family');
    const metadataFontSize = this.imageItemSettings.get_int('metadata-font-size');

    let imageFilePath = `file://${getImagesPath(this.ext)}/${this.dbItem.content}.png`;
    let backgroundSize = 'contain';
    const imageFile = Gio.File.new_for_uri(imageFilePath);
    if (!imageFile.query_exists(null)) {
      imageFilePath = `file://${this.ext.path}/images/${NO_IMAGE_FOUND_FILE_NAME}`;
      backgroundSize = 'cover';
    }

    this.body.set_style(
      `background-color: ${bodyBgColor}; background-image: url(${imageFilePath}); background-size: ${backgroundSize};`,
    );

    this.header.set_style(`background-color: ${headerBgColor}; color: ${headerColor};`);
    this.resolutionTitle.set_style(
      `color: ${metadataColor}; font-family: ${metadataFontFamily}; font-size: ${metadataFontSize}px;`,
    );
    this.resolutionValue.set_style(
      `color: ${metadataColor}; font-family: ${metadataFontFamily}; font-size: ${metadataFontSize}px; font-weight: bold;`,
    );
    this.sizeLabel.set_style(
      `color: ${metadataColor}; font-family: ${metadataFontFamily}; font-size: ${metadataFontSize}px;`,
    );
    this.sizeValue.set_style(
      `color: ${metadataColor}; font-family: ${metadataFontFamily}; font-size: ${metadataFontSize}px; font-weight: bold;`,
    );
    this.metaContainer.set_style(`background-color: ${metadataBgColor};`);
  }

  private setClipboardContent(): void {
    const imageFile = Gio.File.new_for_path(`${getImagesPath(this.ext)}/${this.dbItem.content}.png`);
    // Read the PNG asynchronously so a large image never blocks the shell's main
    // loop while it's put on the clipboard. A missing/unreadable file just
    // throws in the finish call and is ignored.
    imageFile.load_bytes_async(null, (_file, result) => {
      try {
        const [bytes] = imageFile.load_bytes_finish(result);
        const data = bytes.get_data();
        if (!data) {
          return;
        }
        this.clipboardManager.setContent(
          new ClipboardContent({
            type: ContentType.IMAGE,
            value: data,
          }),
        );
      } catch (_error) {
        // Image file missing or unreadable — nothing to copy.
      }
    });
  }
}
