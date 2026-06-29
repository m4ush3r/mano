import Adw from '@girs/adw-1';
import Gio from '@girs/gio-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import Gtk4 from '@girs/gtk-4.0';
import { registerGObjectClass } from '@mano/utils/gjs';
import { getCurrentExtensionSettings, gettext } from '@mano/utils/shell';

@registerGObjectClass
export class HistoryExpiryRow extends Adw.ActionRow {
  private settings: Gio.Settings;

  constructor(ext: ExtensionBase) {
    const _ = gettext(ext);
    super({
      title: _('History Expiry'),
      subtitle: _('Delete non-favorite items older than this many days at startup (0 = never)'),
    });

    this.settings = getCurrentExtensionSettings(ext);

    const expiryEntry = new Gtk4.SpinButton({
      adjustment: new Gtk4.Adjustment({ stepIncrement: 1, lower: 0, upper: 365 }),
      value: this.settings.get_int('history-expiry-days'),
      valign: Gtk4.Align.CENTER,
      halign: Gtk4.Align.CENTER,
    });

    this.settings.bind('history-expiry-days', expiryEntry, 'value', Gio.SettingsBindFlags.DEFAULT);

    this.add_suffix(expiryEntry);
    this.set_activatable_widget(expiryEntry);
  }
}
