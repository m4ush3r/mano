import Adw from '@girs/adw-1';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import { ExclusionGroup } from '@mano/prefs/general/exclusionGroup';
import { GeneralGroup } from '@mano/prefs/general/generalGroup';
import { TerminalListGroup } from '@mano/prefs/general/terminalListGroup';
import { registerGObjectClass } from '@mano/utils/gjs';
import { gettext } from '@mano/utils/shell';

@registerGObjectClass
export class GeneralPage extends Adw.PreferencesPage {
  constructor(ext: ExtensionBase) {
    const _ = gettext(ext);
    super({
      title: _('General'),
      iconName: 'preferences-system-symbolic',
    });

    this.add(new GeneralGroup(ext));
    this.add(new ExclusionGroup(ext));
    this.add(new TerminalListGroup(ext));
  }
}
