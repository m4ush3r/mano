import Clutter from '@girs/clutter-17';
import Gio from '@girs/gio-2.0';
import type { Extension } from '@girs/gnome-shell/dist/extensions/extension';
import { Button as PanelMenuButton } from '@girs/gnome-shell/dist/ui/panelMenu';
import {
  PopupDummyMenu,
  PopupMenuItem,
  PopupSeparatorMenuItem,
  PopupSwitchMenuItem,
} from '@girs/gnome-shell/dist/ui/popupMenu';
import GObject from '@girs/gobject-2.0';
import St from '@girs/st-17';
import { ClearHistoryDialog } from '@mano/components/indicator/clearHistoryDialog';
import { TextInputDialog } from '@mano/components/textInputDialog';
import { registerGObjectClass, SignalRepresentationType, SignalsDefinition } from '@mano/utils/gjs';
import { ICON_PACKS } from '@mano/utils/panoItemType';
import { getCurrentExtensionSettings, gettext, logger } from '@mano/utils/shell';
import { openExtensionPreferences, wiggle } from '@mano/utils/ui';

export type SettingsMenuSignalType = 'item-selected' | 'menu-state-changed';

interface SettingsMenuSignals extends SignalsDefinition<SettingsMenuSignalType> {
  'item-selected': Record<string, never>;
  'menu-state-changed': SignalRepresentationType<[GObject.GType<boolean>]>;
}

const debug = logger('settings-menu');

@registerGObjectClass
export class SettingsMenu extends PanelMenuButton {
  static metaInfo: GObject.MetaInfo<Record<string, never>, Record<string, never>, SettingsMenuSignals> = {
    GTypeName: 'ManoSettingsButton',
    Signals: {
      'item-selected': {},
      'menu-state-changed': {
        param_types: [GObject.TYPE_BOOLEAN],
        accumulator: 0,
      },
    },
  };

  private settings: Gio.Settings;
  private incognitoChangeId: number | null;
  private iconPackChangeId: number | null = null;
  private icon: St.Icon;
  private ext: Extension;
  private onToggle: () => void;

  constructor(
    ext: Extension,
    onClear: () => Promise<void>,
    onToggle: () => void,
    onAddSnippet: (text: string) => void,
  ) {
    const _ = gettext(ext);
    super(0.5, 'Mano Indicator', false);

    this.ext = ext;
    this.onToggle = onToggle;
    this.settings = getCurrentExtensionSettings(this.ext);
    const isInIncognito = this.settings.get_boolean('is-in-incognito');

    this.icon = new St.Icon({
      gicon: Gio.icon_new_for_string(
        `${this.ext.path}/icons/hicolor/scalable/actions/${ICON_PACKS[this.settings.get_uint('icon-pack')]}-indicator${
          isInIncognito ? '-incognito-symbolic' : '-symbolic'
        }.svg`,
      ),
      styleClass: 'system-status-icon indicator-icon',
    });

    this.add_child(this.icon);

    const switchMenuItem = new PopupSwitchMenuItem(_('Incognito Mode'), this.settings.get_boolean('is-in-incognito'));

    switchMenuItem.connect('toggled', (item) => {
      this.settings.set_boolean('is-in-incognito', item.state);
    });

    this.incognitoChangeId = this.settings.connect('changed::is-in-incognito', () => {
      const isInIncognito = this.settings.get_boolean('is-in-incognito');
      switchMenuItem.setToggleState(isInIncognito);
      this.icon.set_gicon(
        Gio.icon_new_for_string(
          `${this.ext.path}/icons/hicolor/scalable/actions/${
            ICON_PACKS[this.settings.get_uint('icon-pack')]
          }-indicator${isInIncognito ? '-incognito-symbolic' : '-symbolic'}.svg`,
        ),
      );
    });

    this.iconPackChangeId = this.settings.connect('changed::icon-pack', () => {
      const isInIncognito = this.settings.get_boolean('is-in-incognito');
      this.icon.set_gicon(
        Gio.icon_new_for_string(
          `${this.ext.path}/icons/hicolor/scalable/actions/${
            ICON_PACKS[this.settings.get_uint('icon-pack')]
          }-indicator${isInIncognito ? '-incognito-symbolic' : '-symbolic'}.svg`,
        ),
      );
    });

    if (this.menu instanceof PopupDummyMenu) {
      debug('error: menu us PopupDummyMenu, but it should be a normal menu!');
    } else {
      this.menu.addMenuItem(switchMenuItem);
      this.menu.addMenuItem(new PopupSeparatorMenuItem());
      const addSnippetItem = new PopupMenuItem(_('Add snippet…'));
      addSnippetItem.connect('activate', () => {
        new TextInputDialog(this.ext, {
          title: _('New snippet'),
          hint: _('Type your snippet text…'),
          onSave: onAddSnippet,
        }).open();
      });
      this.menu.addMenuItem(addSnippetItem);
      this.menu.addMenuItem(new PopupSeparatorMenuItem());
      const clearHistoryItem = new PopupMenuItem(_('Clear History'));
      clearHistoryItem.connect('activate', () => {
        const dialog = new ClearHistoryDialog(this.ext, onClear);
        dialog.open();
      });
      this.menu.addMenuItem(clearHistoryItem);
      this.menu.addMenuItem(new PopupSeparatorMenuItem());
      const settingsItem = new PopupMenuItem(_('Settings'));
      settingsItem.connect('activate', () => {
        openExtensionPreferences(this.ext);
      });
      this.menu.addMenuItem(settingsItem);
    }
  }

  animate() {
    if (this.settings.get_boolean('wiggle-indicator')) {
      wiggle(this.icon, { duration: 100, offset: 2, wiggleCount: 3 });
    }
  }

  override vfunc_event(event: Clutter.Event) {
    if (event.type() === Clutter.EventType.BUTTON_PRESS) {
      if ([Clutter.BUTTON_PRIMARY, Clutter.BUTTON_MIDDLE].includes(event.get_button())) {
        this.onToggle();
        return Clutter.EVENT_STOP;
      } else if (this.menu && event.get_button() === Clutter.BUTTON_SECONDARY) {
        this.menu.toggle();
        return Clutter.EVENT_STOP;
      }
    }

    return super.vfunc_event(event);
  }

  override destroy() {
    if (this.incognitoChangeId) {
      this.settings.disconnect(this.incognitoChangeId);
      this.incognitoChangeId = null;
    }
    if (this.iconPackChangeId) {
      this.settings.disconnect(this.iconPackChangeId);
      this.iconPackChangeId = null;
    }
    super.destroy();
  }
}
