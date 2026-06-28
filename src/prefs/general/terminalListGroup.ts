import Adw from '@girs/adw-1';
import Gio from '@girs/gio-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import Gtk4 from '@girs/gtk-4.0';
import { registerGObjectClass } from '@mano/utils/gjs';
import { getCurrentExtensionSettings, gettext } from '@mano/utils/shell';

// Editable list of terminal window classes. When "paste on select" pastes into
// a window whose class contains one of these entries, Mano sends Ctrl+Shift+V
// (the terminal paste shortcut) instead of Ctrl+V. Mirrors ExclusionGroup.
@registerGObjectClass
export class TerminalListGroup extends Adw.PreferencesGroup {
  private terminalRow: Adw.ExpanderRow;
  private addButton: Gtk4.Button;
  private settings: Gio.Settings;

  constructor(ext: ExtensionBase) {
    const _ = gettext(ext);
    super({
      title: _('Terminal Paste'),
      marginTop: 20,
    });

    this.settings = getCurrentExtensionSettings(ext);

    this.terminalRow = new Adw.ExpanderRow({
      title: _('Terminal Apps'),
      subtitle: _('Mano pastes with Ctrl+Shift+V into apps whose window class contains one of these'),
    });

    this.addButton = new Gtk4.Button({
      iconName: 'list-add-symbolic',
      cssClasses: ['flat'],
      valign: Gtk4.Align.CENTER,
      halign: Gtk4.Align.CENTER,
    });

    this.addButton.connect('clicked', () => {
      this.terminalRow.set_expanded(true);
      this.addButton.set_sensitive(false);
      this.terminalRow.add_row(this.createEntryRow(ext));
    });

    this.set_header_suffix(this.addButton);
    this.add(this.terminalRow);
    const saved = this.settings.get_strv('terminal-list');
    saved.forEach((w) => this.terminalRow.add_row(this.createTerminalRow(w)));
    if (saved.length > 0) {
      this.terminalRow.set_expanded(true);
    }
  }

  private createEntryRow(ext: ExtensionBase): Adw.ActionRow {
    const entryRow = new Adw.ActionRow();
    const _ = gettext(ext);
    const entry = new Gtk4.Entry({
      placeholderText: _('Window class name'),
      halign: Gtk4.Align.FILL,
      valign: Gtk4.Align.CENTER,
      hexpand: true,
    });

    entry.connect('map', () => {
      entry.grab_focus();
    });

    const okButton = new Gtk4.Button({
      cssClasses: ['flat'],
      iconName: 'emblem-ok-symbolic',
      valign: Gtk4.Align.CENTER,
      halign: Gtk4.Align.CENTER,
    });

    okButton.connect('clicked', () => {
      const text = entry.get_text();
      if (text !== null && text.trim() !== '') {
        this.terminalRow.remove(entryRow);
        this.terminalRow.add_row(this.createTerminalRow(text.trim()));
        this.addButton.set_sensitive(true);
        this.settings.set_strv('terminal-list', [...this.settings.get_strv('terminal-list'), text.trim()]);
      }
    });

    entry.connect('activate', () => {
      okButton.emit('clicked');
    });

    const cancelButton = new Gtk4.Button({
      cssClasses: ['flat'],
      iconName: 'window-close-symbolic',
      valign: Gtk4.Align.CENTER,
      halign: Gtk4.Align.CENTER,
    });

    cancelButton.connect('clicked', () => {
      this.terminalRow.remove(entryRow);
      this.addButton.set_sensitive(true);
    });

    entryRow.add_prefix(entry);
    entryRow.add_suffix(okButton);
    entryRow.add_suffix(cancelButton);

    return entryRow;
  }

  private createTerminalRow(appClassName: string): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title: appClassName,
    });

    const removeButton = new Gtk4.Button({
      cssClasses: ['destructive-action'],
      iconName: 'edit-delete-symbolic',
      valign: Gtk4.Align.CENTER,
      halign: Gtk4.Align.CENTER,
    });
    removeButton.connect('clicked', () => {
      this.terminalRow.remove(row);
      this.settings.set_strv(
        'terminal-list',
        this.settings.get_strv('terminal-list').filter((w) => w !== appClassName),
      );
    });

    row.add_suffix(removeButton);

    return row;
  }
}
