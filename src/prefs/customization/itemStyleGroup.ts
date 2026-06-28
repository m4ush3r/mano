import Adw from '@girs/adw-1';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import { CodeItemStyleRow } from '@mano/prefs/customization/codeItemStyle';
import { ColorItemStyleRow } from '@mano/prefs/customization/colorItemStyle';
import { EmojiItemStyleRow } from '@mano/prefs/customization/emojiItemStyle';
import { FileItemStyleRow } from '@mano/prefs/customization/fileItemStyle';
import { ImageItemStyleRow } from '@mano/prefs/customization/imageItemStyle';
import { LinkItemStyleRow } from '@mano/prefs/customization/linkItemStyle';
import { TextItemStyleRow } from '@mano/prefs/customization/textItemStyle';
import { registerGObjectClass } from '@mano/utils/gjs';
import { gettext } from '@mano/utils/shell';

@registerGObjectClass
export class ItemStyleGroup extends Adw.PreferencesGroup {
  constructor(ext: ExtensionBase) {
    const _ = gettext(ext);
    super({
      title: _('Item Style'),
      marginTop: 10,
    });

    this.add(new LinkItemStyleRow(ext));
    this.add(new TextItemStyleRow(ext));
    this.add(new EmojiItemStyleRow(ext));
    this.add(new FileItemStyleRow(ext));
    this.add(new ImageItemStyleRow(ext));
    this.add(new CodeItemStyleRow(ext));
    this.add(new ColorItemStyleRow(ext));
  }
}
