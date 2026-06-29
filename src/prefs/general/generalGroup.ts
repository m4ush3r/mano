import Adw from '@girs/adw-1';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import { DBLocationRow } from '@mano/prefs/general/dbLocation';
import { HistoryExpiryRow } from '@mano/prefs/general/historyExpiry';
import { HistoryLengthRow } from '@mano/prefs/general/historyLength';
import { IncognitoShortcutRow } from '@mano/prefs/general/incognitoShortcutRow';
import { KeepSearchEntryRow } from '@mano/prefs/general/keepSearchEntryOnHide';
import { LinkPreviewsRow } from '@mano/prefs/general/linkPreviews';
import { OpenLinksInBrowserRow } from '@mano/prefs/general/openLinksInBrowser';
import { PasteOnSelectRow } from '@mano/prefs/general/pasteOnSelect';
import { PlayAudioOnCopyRow } from '@mano/prefs/general/playAudioOnCopy';
import { SendNotificationOnCopyRow } from '@mano/prefs/general/sendNotificationOnCopy';
import { ShortcutRow } from '@mano/prefs/general/shortcutRow';
import { ShowIndicatorRow } from '@mano/prefs/general/showIndicator';
import { SyncPrimaryRow } from '@mano/prefs/general/syncPrimary';
import { WatchExclusionsRow } from '@mano/prefs/general/watchExclusions';
import { WiggleIndicatorRow } from '@mano/prefs/general/wiggleIndicator';
import { registerGObjectClass } from '@mano/utils/gjs';
import { gettext } from '@mano/utils/shell';

@registerGObjectClass
export class GeneralGroup extends Adw.PreferencesGroup {
  constructor(ext: ExtensionBase) {
    const _ = gettext(ext);
    super({
      title: _('General Options'),
    });

    this.add(new DBLocationRow(ext));
    this.add(new HistoryLengthRow(ext));
    this.add(new HistoryExpiryRow(ext));
    this.add(new ShortcutRow(ext));
    this.add(new IncognitoShortcutRow(ext));
    this.add(new SyncPrimaryRow(ext));
    this.add(new PasteOnSelectRow(ext));
    this.add(new SendNotificationOnCopyRow(ext));
    this.add(new PlayAudioOnCopyRow(ext));
    this.add(new KeepSearchEntryRow(ext));
    this.add(new ShowIndicatorRow(ext));
    this.add(new WiggleIndicatorRow(ext));
    this.add(new LinkPreviewsRow(ext));
    this.add(new OpenLinksInBrowserRow(ext));
    this.add(new WatchExclusionsRow(ext));
  }
}
