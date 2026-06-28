import Clutter from '@girs/clutter-17';
import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import GObject from '@girs/gobject-2.0';
import Shell from '@girs/shell-17';
import St from '@girs/st-17';
import { registerGObjectClass, SignalsDefinition } from '@mano/utils/gjs';
import { ICON_PACKS, IPanoItemType } from '@mano/utils/panoItemType';
import { getCurrentExtensionSettings } from '@mano/utils/shell';
import { orientationCompatibility } from '@mano/utils/shell_compatibility';

// Native relative-time formatting (replaces date-fns, which bundled every
// locale). Derive a BCP-47 locale (e.g. "en_US.UTF-8" -> "en-US"), falling back
// to the runtime default if it is not recognized.
const RELATIVE_TIME_LOCALE = ((): string | undefined => {
  for (const lang of GLib.get_language_names_with_category('LC_MESSAGES')) {
    const candidate = lang.split('.')[0]?.replace('_', '-');
    if (!candidate || candidate === 'C' || candidate === 'POSIX') {
      continue;
    }
    try {
      new Intl.RelativeTimeFormat(candidate); // throws RangeError if unsupported
      return candidate;
    } catch (_err) {
      // try the next candidate
    }
  }
  return undefined;
})();

const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat(RELATIVE_TIME_LOCALE, { numeric: 'auto' });

const TIME_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 30, unit: 'day' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

const formatRelativeTime = (date: Date): string => {
  let value = (date.getTime() - Date.now()) / 1000;
  for (const division of TIME_DIVISIONS) {
    if (Math.abs(value) < division.amount) {
      return RELATIVE_TIME_FORMAT.format(Math.round(value), division.unit);
    }
    value /= division.amount;
  }
  return RELATIVE_TIME_FORMAT.format(Math.round(value), 'year');
};

export type PanoItemHeaderSignalType = 'on-remove' | 'on-favorite';
interface PanoItemHeaderSignals extends SignalsDefinition<PanoItemHeaderSignalType> {
  'on-remove': Record<string, never>;
  'on-favorite': Record<string, never>;
}

@registerGObjectClass
export class PanoItemHeader extends St.BoxLayout {
  static metaInfo: GObject.MetaInfo<Record<string, never>, Record<string, never>, PanoItemHeaderSignals> = {
    GTypeName: 'ManoItemHeader',
    Signals: {
      'on-remove': {},
      'on-favorite': {},
    },
  };

  private dateUpdateIntervalId: any;
  private disconnectors: Array<() => void> = [];
  private favoriteButton: St.Button;
  private settings: Gio.Settings;
  private titleLabel: St.Label;
  private dateLabel: St.Label;
  actionContainer: St.BoxLayout;
  titleContainer: St.BoxLayout;
  iconContainer: St.BoxLayout;
  itemType: IPanoItemType;

  constructor(ext: ExtensionBase, itemType: IPanoItemType, date: Date) {
    super({
      styleClass: `mano-item-header mano-item-header-${itemType.classSuffix}`,
      ...orientationCompatibility(false),
    });
    this.itemType = itemType;
    this.titleContainer = new St.BoxLayout({
      styleClass: 'mano-item-title-container',
      ...orientationCompatibility(true),
      xExpand: true,
    });
    this.iconContainer = new St.BoxLayout({
      styleClass: 'mano-icon-container',
    });

    this.settings = getCurrentExtensionSettings(ext);

    const themeContext = St.ThemeContext.get_for_stage(Shell.Global.get().get_stage());

    this.set_height(56 * themeContext.scaleFactor);

    const scaleFactorId = themeContext.connect('notify::scale-factor', () => {
      this.set_height(56 * themeContext.scaleFactor);
    });
    this.disconnectors.push(() => themeContext.disconnect(scaleFactorId));

    const icon = new St.Icon({
      styleClass: 'mano-item-title-icon',
      gicon: Gio.icon_new_for_string(
        `${ext.path}/icons/hicolor/scalable/actions/${ICON_PACKS[this.settings.get_uint('icon-pack')]}-${
          itemType.iconPath
        }`,
      ),
    });
    this.iconContainer.add_child(icon);
    const iconPackId = this.settings.connect('changed::icon-pack', () => {
      icon.set_gicon(
        Gio.icon_new_for_string(
          `${ext.path}/icons/hicolor/scalable/actions/${ICON_PACKS[this.settings.get_uint('icon-pack')]}-${
            itemType.iconPath
          }`,
        ),
      );
    });
    this.disconnectors.push(() => this.settings.disconnect(iconPackId));

    this.titleLabel = new St.Label({
      text: itemType.title,
      styleClass: 'mano-item-title',
      xExpand: true,
    });

    this.titleContainer.add_child(this.titleLabel);

    this.dateLabel = new St.Label({
      text: formatRelativeTime(date),
      styleClass: 'mano-item-date',
      xExpand: true,
      yExpand: true,
      xAlign: Clutter.ActorAlign.FILL,
      yAlign: Clutter.ActorAlign.CENTER,
    });

    this.dateUpdateIntervalId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
      this.dateLabel.set_text(formatRelativeTime(date));

      return GLib.SOURCE_CONTINUE;
    });

    this.titleContainer.add_child(this.dateLabel);

    this.actionContainer = new St.BoxLayout({
      styleClass: 'mano-item-actions',
      xExpand: true,
      yExpand: true,
      xAlign: Clutter.ActorAlign.END,
      yAlign: Clutter.ActorAlign.START,
    });

    const favoriteIcon = new St.Icon({
      styleClass: 'mano-item-action-button-icon',
      iconName: 'starred-symbolic',
    });

    this.favoriteButton = new St.Button({
      styleClass: 'mano-item-action-button mano-item-favorite-button',
      child: favoriteIcon,
    });

    this.favoriteButton.connect('clicked', () => {
      this.emit('on-favorite');
      return Clutter.EVENT_PROPAGATE;
    });

    const removeIcon = new St.Icon({
      styleClass: 'mano-item-action-button-icon mano-item-action-button-remove-icon',
      iconName: 'window-close-symbolic',
    });

    const removeButton = new St.Button({
      styleClass: 'mano-item-action-button mano-item-remove-button',
      child: removeIcon,
    });

    removeButton.connect('clicked', () => {
      this.emit('on-remove');
      return Clutter.EVENT_PROPAGATE;
    });

    this.actionContainer.add_child(this.favoriteButton);
    this.actionContainer.add_child(removeButton);

    this.add_child(this.iconContainer);
    this.add_child(this.titleContainer);
    this.add_child(this.actionContainer);

    this.setStyle();
    this.disconnectors.push(
      ...(
        [
          'changed::item-title-font-family',
          'changed::item-title-font-size',
          'changed::item-date-font-family',
          'changed::item-date-font-size',
        ] as const
      ).map((signal) => {
        const id = this.settings.connect(signal, this.setStyle.bind(this));
        return () => this.settings.disconnect(id);
      }),
    );
  }

  private setStyle() {
    const itemTitleFontFamily = this.settings.get_string('item-title-font-family');
    const itemTitleFontSize = this.settings.get_int('item-title-font-size');
    const itemDateFontFamily = this.settings.get_string('item-date-font-family');
    const itemDateFontSize = this.settings.get_int('item-date-font-size');
    this.titleLabel.set_style(`font-family: ${itemTitleFontFamily}; font-size: ${itemTitleFontSize}px;`);
    this.dateLabel.set_style(`font-family: ${itemDateFontFamily}; font-size: ${itemDateFontSize}px;`);
  }

  setFavorite(isFavorite: boolean): void {
    if (isFavorite) {
      this.favoriteButton.add_style_pseudo_class('active');
    } else {
      this.favoriteButton.remove_style_pseudo_class('active');
    }
  }

  override destroy(): void {
    if (this.dateUpdateIntervalId) {
      GLib.source_remove(this.dateUpdateIntervalId);
      this.dateUpdateIntervalId = null;
    }
    this.disconnectors.forEach((disconnect) => disconnect());
    this.disconnectors = [];
    super.destroy();
  }
}
