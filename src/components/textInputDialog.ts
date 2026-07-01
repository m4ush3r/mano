import Clutter from '@girs/clutter-17';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import { ModalDialog } from '@girs/gnome-shell/dist/ui/modalDialog';
import Pango from '@girs/pango-1.0';
import St from '@girs/st-17';
import { scrollViewAddChild } from '@mano/utils/compatibility';
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
      yExpand: true,
    });
    entry.clutterText.set_single_line_mode(false);
    entry.clutterText.set_activatable(false);
    // Wrap long lines and break within over-long words so nothing spills out of
    // the dialog horizontally; the scroll view below caps the height.
    entry.clutterText.set_line_wrap(true);
    entry.clutterText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
    if (options.text) {
      entry.set_text(options.text);
    }

    // Keep the editable text contained: it wraps to the fixed width and, once it
    // grows past max-height, scrolls inside the box instead of pushing the
    // dialog (and its buttons) off-screen.
    const entryBox = new St.BoxLayout({
      ...orientationCompatibility(true),
      xExpand: true,
      yExpand: true,
    });
    entryBox.add_child(entry);

    const scrollView = new St.ScrollView({
      xExpand: true,
      yExpand: true,
      style: 'min-height: 120px; max-height: 360px; width: 480px;',
    });
    scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
    scrollViewAddChild(scrollView, entryBox);

    const box = new St.BoxLayout({
      ...orientationCompatibility(true),
      xExpand: true,
      style: 'spacing: 12px; padding: 12px;',
    });
    box.add_child(title);
    box.add_child(scrollView);
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
