import Clutter from '@girs/clutter-17';
import Gio from '@girs/gio-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import * as Main from '@girs/gnome-shell/dist/ui/main';
import * as PopupMenu from '@girs/gnome-shell/dist/ui/popupMenu';
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

// Types offered in the Filter menu / Tab cycling (Emoji and Color are excluded
// per user preference — those clips still appear under "All").
const FILTERABLE_TYPES: ItemType[] = ['LINK', 'TEXT', 'IMAGE', 'CODE', 'FILE'];

// window-position values: 0=top, 1=right, 2=bottom, 3=left.
const POSITION = { TOP: 0, RIGHT: 1, BOTTOM: 2, LEFT: 3 };

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
  private currentType: ItemType | null = null;
  private showFavorites = false;
  private settings: Gio.Settings;
  private ext: ExtensionBase;
  private onAddSnippet: (text: string) => void;
  private filterButton!: St.Button;
  private filterMenu: PopupMenu.PopupMenu | null = null;
  private filterMenuManager: PopupMenu.PopupMenuManager | null = null;
  private disconnectors: Array<() => void> = [];

  constructor(ext: ExtensionBase, onAddSnippet: (text: string) => void) {
    super({
      xAlign: Clutter.ActorAlign.CENTER,
      styleClass: 'search-entry-container',
      // Horizontal: shortcuts sit to the sides of the search entry.
      ...orientationCompatibility(false),
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
        this.currentType = null;
        this.updatePrimaryIcon();
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

    this.add_child(this.buildDpad());
    this.add_child(this.search);
    this.add_child(this.buildRightTools());
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

  // Position switcher laid out like a game-controller d-pad.
  private buildDpad(): St.BoxLayout {
    const dpad = new St.BoxLayout({
      styleClass: 'mano-dpad',
      ...orientationCompatibility(true),
      yAlign: Clutter.ActorAlign.CENTER,
      style: 'padding-right: 6px;',
    });
    const makeRow = () =>
      new St.BoxLayout({
        ...orientationCompatibility(false),
        xAlign: Clutter.ActorAlign.CENTER,
        style: 'spacing: 2px;',
      });

    const up = makeRow();
    up.add_child(
      this.createIconButton('pan-up-symbolic', () => this.settings.set_uint('window-position', POSITION.TOP)),
    );

    const mid = makeRow();
    mid.add_child(
      this.createIconButton('pan-start-symbolic', () => this.settings.set_uint('window-position', POSITION.LEFT)),
    );
    mid.add_child(
      this.createIconButton('pan-end-symbolic', () => this.settings.set_uint('window-position', POSITION.RIGHT)),
    );

    const down = makeRow();
    down.add_child(
      this.createIconButton('pan-down-symbolic', () => this.settings.set_uint('window-position', POSITION.BOTTOM)),
    );

    dpad.add_child(up);
    dpad.add_child(mid);
    dpad.add_child(down);
    return dpad;
  }

  // Filter (labeled menu), add-snippet and settings, to the right of the entry.
  private buildRightTools(): St.BoxLayout {
    const _ = gettext(this.ext);
    const tools = new St.BoxLayout({
      ...orientationCompatibility(false),
      yAlign: Clutter.ActorAlign.CENTER,
      style: 'spacing: 4px; padding-left: 6px;',
    });

    this.filterButton = this.createIconButton('view-filter-symbolic', () => this.openFilterMenu());
    tools.add_child(this.filterButton);

    tools.add_child(
      this.createIconButton('list-add-symbolic', () => {
        this.get_parent()?.hide();
        new TextInputDialog(this.ext, {
          title: _('New snippet'),
          hint: _('Type your snippet text…'),
          onSave: (text) => this.onAddSnippet(text),
        }).open();
      }),
    );

    tools.add_child(
      this.createIconButton('preferences-system-symbolic', () => {
        this.get_parent()?.hide();
        (this.ext as ExtensionBase & { openPreferences: () => void }).openPreferences();
      }),
    );

    return tools;
  }

  private openFilterMenu(): void {
    const _ = gettext(this.ext);
    if (!this.filterMenu) {
      this.filterMenu = new PopupMenu.PopupMenu(this.filterButton, 0.5, St.Side.TOP);
      Main.layoutManager.uiGroup.add_child(this.filterMenu.actor);
      this.filterMenuManager = new PopupMenu.PopupMenuManager(this.filterButton);
      this.filterMenuManager.addMenu(this.filterMenu);
    }
    this.filterMenu.removeAll();
    const panoItemTypes = getPanoItemTypes(this.ext);
    this.filterMenu.addAction(_('All'), () => this.setType(null));
    FILTERABLE_TYPES.forEach((type) => {
      this.filterMenu?.addAction(panoItemTypes[type].title, () => this.setType(type));
    });
    this.filterMenu.open();
  }

  private setType(type: ItemType | null): void {
    this.currentType = this.currentType === type ? null : type;
    this.updatePrimaryIcon();
    this.emitSearchTextChange();
  }

  private createIconButton(iconName: string, onClick: () => void): St.Button {
    const button = new St.Button({
      child: new St.Icon({ iconName, iconSize: 16, styleClass: 'mano-search-toolbar-icon' }),
      styleClass: 'mano-search-toolbar-button',
      style: 'padding: 2px;',
      trackHover: true,
    });
    button.connect('clicked', () => onClick());
    button.connect('enter-event', () => Shell.Global.get().display.set_cursor(MetaCursorPointer));
    button.connect('leave-event', () => Shell.Global.get().display.set_cursor(Meta.Cursor.DEFAULT));
    return button;
  }

  private setStyle() {
    const searchBarFontFamily = this.settings.get_string('search-bar-font-family');
    const searchBarFontSize = this.settings.get_int('search-bar-font-size');
    this.search.set_style(`font-family: ${searchBarFontFamily}; font-size: ${searchBarFontSize}px;`);
  }

  toggleItemType(hasShift: boolean) {
    const index = this.currentType ? FILTERABLE_TYPES.indexOf(this.currentType) : -1;
    const next = hasShift ? index - 1 : index + 1;
    if (next < 0 || next >= FILTERABLE_TYPES.length) {
      this.currentType = null;
    } else {
      this.currentType = FILTERABLE_TYPES[next] ?? null;
    }
    this.updatePrimaryIcon();
    this.emitSearchTextChange();
  }

  private updatePrimaryIcon() {
    if (!this.currentType) {
      this.search.set_primary_icon(this.createSearchEntryIcon('edit-find-symbolic', 'search-entry-icon'));
      return;
    }
    const panoItemTypes = getPanoItemTypes(this.ext);
    this.search.set_primary_icon(
      this.createSearchEntryIcon(
        Gio.icon_new_for_string(
          `${this.ext.path}/icons/hicolor/scalable/actions/${ICON_PACKS[this.settings.get_uint('icon-pack')]}-${
            panoItemTypes[this.currentType].iconPath
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
    this.emit('search-text-changed', this.search.text, this.currentType ?? '', this.showFavorites);
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
    if (this.filterMenu) {
      this.filterMenu.destroy();
      this.filterMenu = null;
      this.filterMenuManager = null;
    }
    this.disconnectors.forEach((disconnect) => disconnect());
    this.disconnectors = [];
    super.destroy();
  }
}
