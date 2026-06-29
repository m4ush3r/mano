import Clutter from '@girs/clutter-17';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import { ModalDialog } from '@girs/gnome-shell/dist/ui/modalDialog';
import St from '@girs/st-17';
import { registerGObjectClass } from '@mano/utils/gjs';
import { gettext } from '@mano/utils/shell';
import { orientationCompatibility } from '@mano/utils/shell_compatibility';

export type TextInputDialogOptions = {
  title: string;
  hint?: string;
  text?: string;
  onSave: (text: string) => void;
};

// A small multi-line text dialog, reused for authoring snippets and editing an
// item before copying. Enter inserts a newline; the user saves with the button
// (so Enter is not bound to Save).
@registerGObjectClass
export class TextInputDialog extends ModalDialog {
  constructor(ext: ExtensionBase, options: TextInputDialogOptions) {
    super();
    const _ = gettext(ext);

    const title = new St.Label({
      text: options.title,
      styleClass: 'mano-text-input-dialog-title',
    });

    const entry = new St.Entry({
      hintText: options.hint ?? '',
      canFocus: true,
      xExpand: true,
      style: 'min-height: 120px; min-width: 440px;',
    });
    entry.clutterText.set_single_line_mode(false);
    entry.clutterText.set_activatable(false);
    entry.clutterText.set_line_wrap(true);
    if (options.text) {
      entry.set_text(options.text);
    }

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
    this.addButton({
      label: _('Save'),
      action: () => {
        const text = entry.get_text();
        if (text && text.trim() !== '') {
          options.onSave(text);
        }
        this.close();
      },
    });

    this.connect('opened', () => entry.grab_key_focus());
  }
}
