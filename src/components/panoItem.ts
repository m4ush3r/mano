import Clutter from '@girs/clutter-17';
import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import * as Main from '@girs/gnome-shell/dist/ui/main';
import * as PopupMenu from '@girs/gnome-shell/dist/ui/popupMenu';
import GObject from '@girs/gobject-2.0';
import Graphene from '@girs/graphene-1.0';
import Meta from '@girs/meta-17';
import Shell from '@girs/shell-17';
import St from '@girs/st-17';
import { PanoItemHeader } from '@mano/components/panoItemHeader';
import { QrCodeDialog } from '@mano/components/qrCodeDialog';
import { TextInputDialog } from '@mano/components/textInputDialog';
import { ClipboardContent, ClipboardManager, ContentType } from '@mano/utils/clipboardManager';
import { DBItem } from '@mano/utils/db';
import { registerGObjectClass, SignalRepresentationType, SignalsDefinition } from '@mano/utils/gjs';
import { getPanoItemTypes } from '@mano/utils/panoItemType';
import { getQuickActions, QuickAction } from '@mano/utils/quickActions';
import { getCurrentExtensionSettings, openLinkInBrowser } from '@mano/utils/shell';
import { MetaCursorPointer, orientationCompatibility } from '@mano/utils/shell_compatibility';
import { getVirtualKeyboard, isTerminalWindow, notify, WINDOW_POSITIONS } from '@mano/utils/ui';
import { setPopupOpen } from '@mano/utils/windowState';

export type PanoItemSignalType = 'on-remove' | 'on-favorite' | 'on-update' | 'activated';

interface PanoItemSignals extends SignalsDefinition<PanoItemSignalType> {
  activated: Record<string, never>;
  'on-remove': SignalRepresentationType<[GObject.GType<string>]>;
  'on-favorite': SignalRepresentationType<[GObject.GType<string>]>;
  // Emitted when an item mutates itself (e.g. a per-note color) and needs the
  // change persisted to the database.
  'on-update': SignalRepresentationType<[GObject.GType<string>]>;
}

@registerGObjectClass
export class PanoItem extends St.BoxLayout {
  static metaInfo: GObject.MetaInfo<Record<string, never>, Record<string, never>, PanoItemSignals> = {
    GTypeName: 'ManoItem',
    Signals: {
      activated: {},
      'on-remove': {
        param_types: [GObject.TYPE_STRING],
        accumulator: 0,
      },
      'on-favorite': {
        param_types: [GObject.TYPE_STRING],
        accumulator: 0,
      },
      'on-update': {
        param_types: [GObject.TYPE_STRING],
        accumulator: 0,
      },
    },
  };

  protected header: PanoItemHeader;
  private timeoutId: number | undefined;
  protected body: St.BoxLayout;
  protected clipboardManager: ClipboardManager;
  public dbItem: DBItem;
  protected settings: Gio.Settings;
  private selected: boolean | null = null;
  // Each entry releases one signal connection; all are run on destroy() so we
  // never leak handlers on long-lived objects (settings, the theme context).
  protected disconnectors: Array<() => void> = [];
  protected ext: ExtensionBase;
  // Lazily created the first time the quick-actions menu is opened.
  private actionsMenu: PopupMenu.PopupMenu | null = null;
  private actionsMenuManager: PopupMenu.PopupMenuManager | null = null;

  constructor(ext: ExtensionBase, clipboardManager: ClipboardManager, dbItem: DBItem) {
    super({
      name: 'mano-item',
      visible: true,
      pivotPoint: Graphene.Point.alloc().init(0.5, 0.5),
      reactive: true,
      styleClass: 'mano-item',
      ...orientationCompatibility(true),
      trackHover: true,
    });

    this.ext = ext;
    this.clipboardManager = clipboardManager;
    this.dbItem = dbItem;

    this.settings = getCurrentExtensionSettings(ext);

    this.connect('key-focus-in', () => this.setSelected(true));
    this.connect('key-focus-out', () => this.setSelected(false));
    this.connect('enter-event', () => {
      Shell.Global.get().display.set_cursor(MetaCursorPointer);
      if (!this.selected) {
        this.set_style(`border: 4px solid ${this.settings.get_string('hovered-item-border-color')}`);
      }
    });
    this.connect('leave-event', () => {
      Shell.Global.get().display.set_cursor(Meta.Cursor.DEFAULT);
      if (!this.selected) {
        this.set_style('');
      }
    });

    this.connect('activated', () => {
      this.get_parent()?.get_parent()?.get_parent()?.hide();

      if (this.dbItem.itemType === 'LINK' && this.settings.get_boolean('open-links-in-browser')) {
        return;
      }

      if (this.settings.get_boolean('paste-on-select') && this.clipboardManager.isTracking) {
        // Delay so focus has returned to the target window before we inject the
        // paste shortcut. See
        // https://github.com/SUPERCILEX/gnome-clipboard-history/blob/master/extension.js#L606
        this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
          const wmClass = Shell.Global.get().display.focusWindow?.get_wm_class();
          const useShift = isTerminalWindow(wmClass, this.settings.get_strv('terminal-list'));
          this.sendPasteShortcut(useShift);
          if (this.timeoutId) {
            GLib.Source.remove(this.timeoutId);
          }
          this.timeoutId = undefined;
          return GLib.SOURCE_REMOVE;
        });
      }
    });

    this.header = new PanoItemHeader(ext, getPanoItemTypes(ext)[dbItem.itemType], dbItem.copyDate);
    this.header.setFavorite(this.dbItem.isFavorite);
    this.header.connect('on-remove', () => {
      this.emit('on-remove', JSON.stringify(this.dbItem));
      return Clutter.EVENT_PROPAGATE;
    });

    this.header.connect('on-favorite', () => {
      this.dbItem = { ...this.dbItem, isFavorite: !this.dbItem.isFavorite };
      this.emit('on-favorite', JSON.stringify(this.dbItem));
      return Clutter.EVENT_PROPAGATE;
    });

    this.connect('on-favorite', () => {
      this.header.setFavorite(this.dbItem.isFavorite);
      return Clutter.EVENT_PROPAGATE;
    });

    this.body = new St.BoxLayout({
      styleClass: 'mano-item-body',
      clipToAllocation: true,
      ...orientationCompatibility(true),
      xAlign: Clutter.ActorAlign.FILL,
      yAlign: Clutter.ActorAlign.FILL,
      xExpand: true,
      yExpand: true,
    });

    this.add_child(this.header);
    this.add_child(this.body);

    const themeContext = St.ThemeContext.get_for_stage(Shell.Global.get().get_stage());

    const scaleFactorId = themeContext.connect('notify::scale-factor', () => {
      this.setBodyDimensions();
    });
    const itemSizeId = this.settings.connect('changed::item-size', () => {
      this.setBodyDimensions();
    });
    const windowPositionId = this.settings.connect('changed::window-position', () => {
      this.setBodyDimensions();
    });
    this.disconnectors.push(
      () => themeContext.disconnect(scaleFactorId),
      () => this.settings.disconnect(itemSizeId),
      () => this.settings.disconnect(windowPositionId),
    );

    this.setBodyDimensions();
  }

  private setBodyDimensions() {
    const pos = this.settings.get_uint('window-position');
    if (pos === WINDOW_POSITIONS.LEFT || pos === WINDOW_POSITIONS.RIGHT) {
      this.set_x_align(Clutter.ActorAlign.FILL);
      this.set_y_align(Clutter.ActorAlign.START);
    } else {
      this.set_x_align(Clutter.ActorAlign.START);
      this.set_y_align(Clutter.ActorAlign.FILL);
    }
    const { scaleFactor } = St.ThemeContext.get_for_stage(Shell.Global.get().get_stage());
    this.body.set_height(this.settings.get_int('item-size') * scaleFactor - this.header.get_height());
    this.body.set_width(this.settings.get_int('item-size') * scaleFactor);
  }

  private setSelected(selected: boolean) {
    if (selected) {
      const activeItemBorderColor = this.settings.get_string('active-item-border-color');
      this.set_style(`border: 4px solid ${activeItemBorderColor} !important;`);
      this.grab_key_focus();
    } else {
      this.set_style('');
    }
    this.selected = selected;
  }
  // Inject the paste shortcut via the virtual keyboard: Ctrl+V normally, or
  // Ctrl+Shift+V for terminals (which is how they paste).
  private sendPasteShortcut(useShift: boolean): void {
    const keyboard = getVirtualKeyboard();
    keyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
    if (useShift) {
      keyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
    }
    keyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_v, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_v, Clutter.KeyState.RELEASED);
    if (useShift) {
      keyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
    }
    keyboard.notify_keyval(Clutter.get_current_event_time(), Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
  }

  override vfunc_key_press_event(event: Clutter.Event): boolean {
    if (
      event.get_key_symbol() === Clutter.KEY_Return ||
      event.get_key_symbol() === Clutter.KEY_ISO_Enter ||
      event.get_key_symbol() === Clutter.KEY_KP_Enter
    ) {
      this.emit('activated');
      return Clutter.EVENT_STOP;
    }
    if (event.get_key_symbol() === Clutter.KEY_Delete || event.get_key_symbol() === Clutter.KEY_KP_Delete) {
      this.emit('on-remove', JSON.stringify(this.dbItem));
      return Clutter.EVENT_STOP;
    }
    if (
      (event.get_key_symbol() === Clutter.KEY_S || event.get_key_symbol() === Clutter.KEY_s) &&
      event.get_state() === Clutter.ModifierType.CONTROL_MASK
    ) {
      this.dbItem = { ...this.dbItem, isFavorite: !this.dbItem.isFavorite };
      this.emit('on-favorite', JSON.stringify(this.dbItem));
      return Clutter.EVENT_STOP;
    }
    if (event.get_key_symbol() === Clutter.KEY_Menu) {
      this.openActionsMenu();
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
  }

  override vfunc_button_release_event(event: Clutter.Event): boolean {
    if (event.get_button() === 1) {
      this.emit('activated');
      return Clutter.EVENT_STOP;
    }
    if (event.get_button() === 3) {
      this.openActionsMenu();
      return Clutter.EVENT_STOP;
    }

    return Clutter.EVENT_PROPAGATE;
  }

  // Quick actions: right-click an item or press the Menu key to transform/act on
  // its text (case change, base64, JSON, QR code, etc.).
  private openActionsMenu(): void {
    const actions = getQuickActions(this.dbItem);
    if (actions.length === 0) {
      return;
    }
    if (!this.actionsMenu) {
      this.actionsMenu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
      // mano's own window is tracked top-chrome (high in uiGroup); a plain
      // uiGroup child stacks below it and gets occluded (GNOME 49). Add the
      // menu as top-chrome too so it sits above the window.
      Main.layoutManager.addTopChrome(this.actionsMenu.actor);
      this.actionsMenuManager = new PopupMenu.PopupMenuManager(this);
      this.actionsMenuManager.addMenu(this.actionsMenu);
      // While the menu is open, mano's window must not auto-dismiss itself
      // (otherwise the menu just flashes and closes).
      this.actionsMenu.connect('open-state-changed', (_menu, isOpen): undefined => {
        setPopupOpen(isOpen);
        return undefined;
      });
    }
    this.actionsMenu.removeAll();
    this.actionsMenu.addAction('Edit…', () => this.openEditDialog());
    actions.forEach((action) => {
      this.actionsMenu?.addAction(action.label, () => this.runQuickAction(action));
    });
    // If this item captured a rich-text representation, let the user choose the
    // format to put on the clipboard (one format at a time).
    const html = this.getItemHtml();
    if (html) {
      this.actionsMenu.addAction('Copy as plain text', () =>
        this.clipboardManager.setContent(new ClipboardContent({ type: ContentType.TEXT, value: this.dbItem.content })),
      );
      this.actionsMenu.addAction('Copy with formatting (HTML)', () => this.clipboardManager.setHtml(html));
    }
    this.addExtraActions(this.actionsMenu);
    // Defer the open to the next idle so the button-release event that triggered
    // it finishes first. Opening (and grabbing) synchronously during the release
    // makes the new grab swallow the tail of that event and close the menu again
    // immediately, so it never appears.
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      const menu = this.actionsMenu;
      if (!menu) {
        return GLib.SOURCE_REMOVE;
      }
      Main.layoutManager.uiGroup.set_child_above_sibling(menu.actor, null);
      menu.open();
      // Keep the menu on-screen on short displays (the box pointer can place a
      // tall menu off the bottom edge).
      const wa = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.findIndexForActor(this));
      const [mx, my] = menu.actor.get_position();
      const mh = menu.actor.get_height();
      if (wa) {
        const ny = Math.max(wa.y, Math.min(my, wa.y + wa.height - mh));
        if (ny !== my) {
          menu.actor.set_position(mx, ny);
        }
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  // Extension point: subclasses add their own entries to the actions menu
  // (e.g. TextPanoItem adds the per-note color swatches). No-op by default.
  protected addExtraActions(_menu: PopupMenu.PopupMenu): void {}

  private getItemHtml(): string | undefined {
    if (!this.dbItem.metaData) {
      return undefined;
    }
    try {
      return (JSON.parse(this.dbItem.metaData) as { html?: string }).html;
    } catch (_err) {
      return undefined;
    }
  }

  // Open a modal dialog after the actions menu has fully closed. The menu holds
  // an input grab; if we push the dialog's modal grab before that one is
  // released, pushModal fails and the dialog renders but never becomes modal —
  // its buttons then ignore clicks. So we wait for the menu's close, then hide
  // mano's window (which our isPopupOpen guard only allows once the menu is
  // gone), then open the dialog on the next idle.
  private openDialogDeferred(createAndOpen: () => void): void {
    const proceed = () => {
      this.get_parent()?.get_parent()?.get_parent()?.hide();
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        createAndOpen();
        return GLib.SOURCE_REMOVE;
      });
    };

    const menu = this.actionsMenu;
    if (menu?.isOpen) {
      const handlerId = menu.connect('open-state-changed', (_menu, isOpen): undefined => {
        if (!isOpen) {
          menu.disconnect(handlerId);
          proceed();
        }
        return undefined;
      });
      menu.close();
    } else {
      proceed();
    }
  }

  // Edit the item's text in a dialog, then copy the edited version (the original
  // item is left untouched; the edit becomes a new clipboard entry).
  private openEditDialog(): void {
    this.openDialogDeferred(() =>
      new TextInputDialog(this.ext, {
        title: 'Edit item',
        text: this.dbItem.content,
        onSave: (text) =>
          this.clipboardManager.setContent(new ClipboardContent({ type: ContentType.TEXT, value: text })),
      }).open(),
    );
  }

  private runQuickAction(action: QuickAction): void {
    const result = action.run(this.dbItem.content);
    switch (result.kind) {
      case 'copy':
        this.clipboardManager.setContent(new ClipboardContent({ type: ContentType.TEXT, value: result.text }));
        break;
      case 'notify':
        notify(this.ext, result.title, result.body);
        break;
      case 'open':
        openLinkInBrowser(result.url);
        break;
      case 'qr':
        this.openDialogDeferred(() => new QrCodeDialog(this.ext, result.text).open());
        break;
    }
  }

  override vfunc_touch_event(event: Clutter.Event): boolean {
    if (event.type() === Clutter.EventType.TOUCH_END) {
      this.emit('activated');
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
  }

  override destroy(): void {
    if (this.timeoutId) {
      GLib.Source.remove(this.timeoutId);
      this.timeoutId = undefined;
    }
    if (this.actionsMenu) {
      this.actionsMenu.destroy();
      this.actionsMenu = null;
      this.actionsMenuManager = null;
    }
    this.disconnectors.forEach((disconnect) => disconnect());
    this.disconnectors = [];
    this.header.destroy();
    super.destroy();
  }
}
