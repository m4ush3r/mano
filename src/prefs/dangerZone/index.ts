import Adw from '@girs/adw-1';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import { ClearHistoryRow } from '@mano/prefs/dangerZone/clearHistory';
import { SessionOnlyModeRow } from '@mano/prefs/dangerZone/sessionOnlyMode';
import { registerGObjectClass } from '@mano/utils/gjs';
import { gettext } from '@mano/utils/shell';
@registerGObjectClass
export class DangerZonePage extends Adw.PreferencesPage {
  constructor(ext: ExtensionBase) {
    const _ = gettext(ext);
    super({
      title: _('Danger Zone'),
      iconName: 'user-trash-symbolic',
    });

    const dangerZoneGroup = new Adw.PreferencesGroup();
    dangerZoneGroup.add(new SessionOnlyModeRow(ext));
    dangerZoneGroup.add(new ClearHistoryRow(ext));

    this.add(dangerZoneGroup);
  }
}
