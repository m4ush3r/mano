import Clutter from '@girs/clutter-17';
import Gio from '@girs/gio-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import GObject from '@girs/gobject-2.0';
import Meta from '@girs/meta-17';
import Shell from '@girs/shell-17';
import St from '@girs/st-17';
import { TextInputDialog } from '@mano/components/textInputDialog';
import { ItemType } from '@mano/utils/db';
import { registerGObjectClass, SignalRepresentationType, SignalsDefinition } from '@mano/utils/gjs';
import { getPanoItemTypes, ICON_PACKS } from '@mano/utils/panoItemType';
import { getCurrentExtensionSettings, gettext } from '@mano/utils/shell';
import { MetaCursorPointer, orientationCompatibility } from '@mano/utils/shell_compatibility';

export type SearchBoxSignalType =
  | 'search-text-changed'
  | 'search-item-select-shortcut'
  | 'search-focus-out'
  | 'search-submit';

interface SearchBoxSignals extends SignalsDefinition<SearchBoxSignalType> {
  'search-text-changed': SignalRepresentationType<
    [GObject.GType<string>, GObject.GType<string>, GObject.GType<boolean>]
  >;
  'search-item-select-shortcut': SignalRepresentationType<[GObject.GType<number>]>;
  'search-focus-out': Record<string, never>;
  'search-submit': Record<string, never>;
}
@registerGObjectClass
export class SearchBox extends St.BoxLayout {
  static metaInfo: GObject.MetaInfo<Record<string, never>, Record<string, never>, SearchBoxSignals> = {
    GTypeName: 'ManoSearchBox',
    Signals: {
      'search-text-changed': {
        param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING, GObject.TYPE_BOOLEAN],
        accumulator: 0,
      },
      'search-item-select-shortcut': {
        param_types: [GObject.TYPE_INT],
        accumulator: 0,
      },
      'search-focus-out': {},
      'search-submit': {},
    },
  };

  private search: St.Entry;
  private currentIndex: number | null = null;
  private showFavorites = false;
  private settings: Gio.Settings;
  private ext: ExtensionBase;
  private onAddSnippet: (text: string) => void;
  private disconnectors: Array<() => void> = [];

  constructor(ext: ExtensionBase, onAddSnippet: (text: string) => void) {
    super({
      xAlign: Clutter.ActorAlign.CENTER,
      styleClass: 'search-entry-container',
      // Vertical so the shortcuts toolbar sits above the search entry.
      ...orientationCompatibility(true),
      trackHover: true,
      reactive: true,
    });

    this.ext = ext;
    this.onAddSnippet = onAddSnippet;
    const _ = gettext(ext);

    this.settings = getCurrentExtensionSettings(ext);

    const themeContext = St.ThemeContext.get_for_stage(Shell.Global.get().get_stage());

    this.search = new St.Entry({
      canFocus: true,
      hintText: _('Type to search, Tab to cycle'),
      naturalWidth: 300 * themeContext.scaleFactor,
      height: 40 * themeContext.scaleFactor,
      trackHover: true,
      primaryIcon: this.createSearchEntryIcon('edit-find-symbolic', 'search-entry-icon'),
      secondaryIcon: this.createSearchEntryIcon('starred-symbolic', 'search-entry-fav-icon'),
    });

    const scaleFactorId = themeContext.connect('notify::scale-factor', () => {
      this.search.naturalWidth = 300 * themeContext.scaleFactor;
      this.search.set_height(40 * themeContext.scaleFactor);
    });
    this.disconnectors.push(() => themeContext.disconnect(scaleFactorId));

    this.search.connect('primary-icon-clicked', () => {
      this.focus();
      this.toggleItemType(false);
    });

    this.search.connect('secondary-icon-clicked', () => {
      this.focus();
      this.toggleFavorites();
    });

    this.search.clutterText.connect('text-changed', () => {
      this.emitSearchTextChange();
    });

    this.search.clutterText.connect('key-press-event', (_: St.Entry, event: Clutter.Event) => {
      if (
        event.get_key_symbol() === Clutter.KEY_Down ||
        (event.get_key_symbol() === Clutter.KEY_Right &&
          (this.search.clutterText.cursorPosition === -1 || this.search.text?.length === 0))
      ) {
        this.emit('search-focus-out');
        return Clutter.EVENT_STOP;
      } else if (
        event.get_key_symbol() === Clutter.KEY_Right &&
        this.search.clutterText.get_selection() !== null &&
        this.search.clutterText.get_selection() === this.search.text
      ) {
        this.search.clutterText.set_cursor_position(this.search.text?.length ?? 0);
        return Clutter.EVENT_STOP;
      }
      if (
        event.get_key_symbol() === Clutter.KEY_Return ||
        event.get_key_symbol() === Clutter.KEY_ISO_Enter ||
        event.get_key_symbol() === Clutter.KEY_KP_Enter
      ) {
        this.emit('search-submit');
        return Clutter.EVENT_STOP;
      }

      if (event.has_control_modifier() && event.get_key_symbol() >= 49 && event.get_key_symbol() <= 57) {
        this.emit('search-item-select-shortcut', event.get_key_symbol() - 49);
        return Clutter.EVENT_STOP;
      }

      if (
        event.get_key_symbol() === Clutter.KEY_Tab ||
        event.get_key_symbol() === Clutter.KEY_ISO_Left_Tab ||
        event.get_key_symbol() === Clutter.KEY_KP_Tab
      ) {
        this.toggleItemType(event.has_shift_modifier());

        return Clutter.EVENT_STOP;
      }
      if (event.get_key_symbol() === Clutter.KEY_BackSpace && this.search.text?.length === 0) {
        this.search.set_primary_icon(this.createSearchEntryIcon('edit-find-symbolic', 'search-entry-icon'));
        this.currentIndex = null;
        this.emitSearchTextChange();

        return Clutter.EVENT_STOP;
      }

      if (event.get_key_symbol() === Clutter.KEY_Alt_L || event.get_key_symbol() === Clutter.KEY_Alt_R) {
        this.toggleFavorites();
        this.emitSearchTextChange();

        return Clutter.EVENT_STOP;
      }

      return Clutter.EVENT_PROPAGATE;
    });
    this.add_child(this.buildToolbar());
    this.search.set_x_align(Clutter.ActorAlign.CENTER);
    this.add_child(this.search);
    this.setStyle();

    // Connect once in the constructor (previously re-connected on every Tab
    // press inside toggleItemType, leaking a handler per keystroke).
    const iconPackId = this.settings.connect('changed::icon-pack', () => this.updatePrimaryIcon());
    const fontFamilyId = this.settings.connect('changed::search-bar-font-family', this.setStyle.bind(this));
    const fontSizeId = this.settings.connect('changed::search-bar-font-size', this.setStyle.bind(this));
    this.disconnectors.push(
      () => this.settings.disconnect(iconPackId),
      () => this.settings.disconnect(fontFamilyId),
      () => this.settings.disconnect(fontSizeId),
    );
  }

  // In-window "shortcuts" so users can tweak mano without opening Settings:
  // a position switcher, item-type filters, add-snippet and a settings shortcut.
  private buildToolbar(): St.BoxLayout {
    const _ = gettext(this.ext);
    const toolbar = new St.BoxLayout({
      styleClass: 'mano-search-toolbar',
      ...orientationCompatibility(false),
      xAlign: Clutter.ActorAlign.CENTER,
      style: 'spacing: 4px; padding-bottom: 6px;',
    });

    // Position switcher. window-position values: 0=top, 1=right, 2=bottom, 3=left.
    const positions: Array<[string, number]> = [
      ['go-up-symbolic', 0],
      ['go-previous-symbolic', 3],
      ['go-down-symbolic', 2],
      ['go-next-symbolic', 1],
    ];
    positions.forEach(([icon, value]) => {
      toolbar.add_child(this.createToolbarButton(icon, () => this.settings.set_uint('window-position', value)));
    });

    // Item-type filters.
    const panoItemTypes = getPanoItemTypes(this.ext);
    Object.keys(panoItemTypes).forEach((key, index) => {
      const type = panoItemTypes[key as ItemType];
      const gicon = Gio.icon_new_for_string(
        `${this.ext.path}/icons/hicolor/scalable/actions/${ICON_PACKS[this.settings.get_uint('icon-pack')]}-${type.iconPath}`,
      );
      toolbar.add_child(this.createToolbarButton(gicon, () => this.selectItemType(index)));
    });

    // Add snippet — hide the window first so the dialog gets mouse events.
    toolbar.add_child(
      this.createToolbarButton('list-add-symbolic', () => {
        this.get_parent()?.hide();
        new TextInputDialog(this.ext, {
          title: _('New snippet'),
          hint: _('Type your snippet text…'),
          onSave: (text) => this.onAddSnippet(text),
        }).open();
      }),
    );

    // Settings.
    toolbar.add_child(
      this.createToolbarButton('preferences-system-symbolic', () => {
        this.get_parent()?.hide();
        (this.ext as ExtensionBase & { openPreferences: () => void }).openPreferences();
      }),
    );

    return toolbar;
  }

  private createToolbarButton(iconNameOrProto: string | Gio.Icon, onClick: () => void): St.Button {
    const icon = new St.Icon({ iconSize: 16, styleClass: 'mano-search-toolbar-icon' });
    if (typeof iconNameOrProto === 'string') {
      icon.set_icon_name(iconNameOrProto);
    } else {
      icon.set_gicon(iconNameOrProto);
    }
    const button = new St.Button({
      child: icon,
      styleClass: 'mano-search-toolbar-button',
      style: 'padding: 4px;',
      trackHover: true,
    });
    button.connect('clicked', () => onClick());
    button.connect('enter-event', () => Shell.Global.get().display.set_cursor(MetaCursorPointer));
    button.connect('leave-event', () => Shell.Global.get().display.set_cursor(Meta.Cursor.DEFAULT));
    return button;
  }

  private selectItemType(index: number) {
    // Click the active type again to clear the filter.
    this.currentIndex = this.currentIndex === index ? null : index;
    this.updatePrimaryIcon();
    this.emitSearchTextChange();
  }

  private setStyle() {
    const searchBarFontFamily = this.settings.get_string('search-bar-font-family');
    const searchBarFontSize = this.settings.get_int('search-bar-font-size');
    this.search.set_style(`font-family: ${searchBarFontFamily}; font-size: ${searchBarFontSize}px;`);
  }

  toggleItemType(hasShift: boolean) {
    const panoItemTypes = getPanoItemTypes(this.ext);
    // increment or decrement the current index based on the shift modifier
    if (hasShift) {
      this.currentIndex = this.currentIndex === null ? Object.keys(panoItemTypes).length - 1 : this.currentIndex - 1;
    } else {
      this.currentIndex = this.currentIndex === null ? 0 : this.currentIndex + 1;
    }
    // if the index is out of bounds, set it to the other end
    if (this.currentIndex < 0 || this.currentIndex >= Object.keys(panoItemTypes).length) {
      this.currentIndex = null;
    }

    this.updatePrimaryIcon();
    this.emitSearchTextChange();
  }

  private updatePrimaryIcon() {
    if (this.currentIndex === null) {
      this.search.set_primary_icon(this.createSearchEntryIcon('edit-find-symbolic', 'search-entry-icon'));
      return;
    }
    const panoItemTypes = getPanoItemTypes(this.ext);
    this.search.set_primary_icon(
      this.createSearchEntryIcon(
        Gio.icon_new_for_string(
          `${this.ext.path}/icons/hicolor/scalable/actions/${ICON_PACKS[this.settings.get_uint('icon-pack')]}-${
            panoItemTypes[Object.keys(panoItemTypes)[this.currentIndex] as ItemType].iconPath
          }`,
        ),
        'search-entry-icon',
      ),
    );
  }

  private createSearchEntryIcon(iconNameOrProto: string | Gio.Icon, styleClass: string) {
    const icon = new St.Icon({
      styleClass: styleClass,
      iconSize: 13,
      trackHover: true,
    });

    if (typeof iconNameOrProto === 'string') {
      icon.set_icon_name(iconNameOrProto);
    } else {
      icon.set_gicon(iconNameOrProto);
    }

    icon.connect('enter-event', () => {
      Shell.Global.get().display.set_cursor(MetaCursorPointer);
    });
    icon.connect('motion-event', () => {
      Shell.Global.get().display.set_cursor(MetaCursorPointer);
    });
    icon.connect('leave-event', () => {
      Shell.Global.get().display.set_cursor(Meta.Cursor.DEFAULT);
    });

    return icon;
  }

  toggleFavorites() {
    const icon = this.search.get_secondary_icon() as St.Icon;
    if (this.showFavorites) {
      icon.remove_style_class_name('active');
    } else {
      icon.add_style_class_name('active');
    }
    this.showFavorites = !this.showFavorites;
    this.emitSearchTextChange();
  }

  emitSearchTextChange() {
    const panoItemTypes = getPanoItemTypes(this.ext);
    let itemType: string | null = null;
    if (this.currentIndex !== null) {
      itemType = Object.keys(panoItemTypes)[this.currentIndex] ?? null;
    }
    this.emit('search-text-changed', this.search.text, itemType || '', this.showFavorites);
  }

  focus() {
    this.search.grab_key_focus();
  }

  removeChar() {
    this.search.text = this.search.text?.slice(0, -1) ?? '';
  }

  appendText(text: string) {
    this.search.text += text;
  }

  selectAll() {
    this.search.clutterText.set_selection(0, this.search.text?.length ?? 0);
  }

  clear() {
    this.search.text = '';
  }

  getText(): string {
    return this.search.text || '';
  }

  override destroy(): void {
    this.disconnectors.forEach((disconnect) => disconnect());
    this.disconnectors = [];
    super.destroy();
  }
}
