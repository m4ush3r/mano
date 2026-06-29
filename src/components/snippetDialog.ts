import Clutter from '@girs/clutter-17';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import { ModalDialog } from '@girs/gnome-shell/dist/ui/modalDialog';
import St from '@girs/st-17';
import { registerGObjectClass } from '@mano/utils/gjs';
import { gettext } from '@mano/utils/shell';
import { orientationCompatibility } from '@mano/utils/shell_compatibility';

// Small dialog to author a reusable text snippet. Multi-line: Enter inserts a
// newline; the user saves with the Save button (so Enter is not bound to it).
@registerGObjectClass
export class SnippetDialog extends ModalDialog {
  constructor(ext: ExtensionBase, onSave: (text: string) => void) {
    super();
    const _ = gettext(ext);

    const title = new St.Label({
      text: _('New snippet'),
      styleClass: 'mano-snippet-dialog-title',
    });

    const entry = new St.Entry({
      hintText: _('Type your snippet text…'),
      canFocus: true,
      xExpand: true,
      style: 'min-height: 120px; min-width: 440px;',
    });
    entry.clutterText.set_single_line_mode(false);
    entry.clutterText.set_activatable(false);
    entry.clutterText.set_line_wrap(true);

    const box = new St.BoxLayout({
      ...orientationCompatibility(true),
      xExpand: true,
      style: 'spacing: 12px; padding: 12px;',
    });
    box.add_child(title);
    box.add_child(entry);
    this.contentLayout.add_child(box);

    this.addButton({
      label: _('Cancel'),
      action: () => this.close(),
      key: Clutter.KEY_Escape,
    });
    // Not the default button on purpose: Enter inserts a newline in the body.
    this.addButton({
      label: _('Save'),
      action: () => {
        const text = entry.get_text();
        if (text && text.trim() !== '') {
          onSave(text);
        }
        this.close();
      },
    });

    this.connect('opened', () => entry.grab_key_focus());
  }
}
