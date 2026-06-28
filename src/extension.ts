import './styles/stylesheet.css';

import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';
import { Extensions } from '@girs/gnome-shell';
import type { ExtensionMetadata } from '@girs/gnome-shell/dist/types/extension-metadata';
import Shell from '@girs/shell-17';
const { Extension } = Extensions.extension;
import PanoIndicator from '@mano/components/indicator';
import { PanoWindow } from '@mano/containers/panoWindow';
import { ClipboardContent, ClipboardManager, ContentType } from '@mano/utils/clipboardManager';
import { db } from '@mano/utils/db';
import { KeyManager } from '@mano/utils/keyManager';
import {
  debounceIds,
  deleteAppDirs,
  getCurrentExtensionSettings,
  getDbPath,
  loadInterfaceXML,
  logger,
  removeSoundContext,
  setupAppDirs,
} from '@mano/utils/shell';
import { addTopChrome, removeChrome, removeVirtualKeyboard } from '@mano/utils/ui';

import { setUnredirectForDisplay } from './utils/shell_compatibility';

const debug = logger('extension');

export default class PanoExtension extends Extension {
  private keyManager: KeyManager | null = null;
  private clipboardManager: ClipboardManager | null = null;
  private panoWindow: PanoWindow | null = null;
  private indicator: PanoIndicator | null = null;

  private dbus: Gio.DBusExportedObject | null = null;
  private settings: Gio.Settings | null = null;
  private windowTrackerId: number | null = null;
  private timeoutId: number | null = null;
  private shutdownSignalId: number | null = null;
  private logoutSignalId: number | null = null;
  private rebootSignalId: number | null = null;
  private systemdSignalId: number | null = null;
  private clipboardChangedSignalId: number | null = null;

  constructor(props: ExtensionMetadata) {
    super(props);
    debug('extension is initialized');
  }

  override enable() {
    this.settings = getCurrentExtensionSettings(this);
    this.setupResources();
    this.keyManager = new KeyManager(this);
    this.clipboardManager = new ClipboardManager(this);
    this.indicator = new PanoIndicator(this, this.clearHistory.bind(this), () => this.panoWindow?.toggle());
    this.start();
    this.indicator.enable();
    this.enableDbus();
    setUnredirectForDisplay(false);
    debug('extension is enabled');
  }

  override disable(): void {
    this.stop();
    this.disableDbus();
    this.indicator?.disable();
    this.settings = null;
    this.keyManager = null;
    this.clipboardManager = null;
    this.indicator = null;
    setUnredirectForDisplay(true);
    debug('extension is disabled');
  }

  // for dbus
  start() {
    if (this.clipboardManager !== null && this.keyManager !== null) {
      this.clipboardChangedSignalId = this.clipboardManager.connect('changed', () => this.indicator?.animate());
      this.connectSessionDbus();
      this.panoWindow = new PanoWindow(this, this.clipboardManager);
      this.trackWindow();
      addTopChrome(this.panoWindow);
      this.keyManager.listenFor('global-shortcut', () => this.panoWindow?.toggle());
      this.keyManager.listenFor('incognito-shortcut', () => {
        this.settings?.set_boolean('is-in-incognito', !this.settings?.get_boolean('is-in-incognito'));
      });

      this.clipboardManager.startTracking();
    }
  }

  // for dbus
  stop() {
    this.clipboardManager?.stopTracking();
    this.keyManager?.stopListening('incognito-shortcut');
    this.keyManager?.stopListening('global-shortcut');
    this.untrackWindow();
    if (this.panoWindow) {
      removeChrome(this.panoWindow);
    }
    this.panoWindow?.destroy();
    this.panoWindow = null;
    db.shutdown();
    this.disconnectSessionDbus();

    if (this.clipboardChangedSignalId) {
      this.clipboardManager?.disconnect(this.clipboardChangedSignalId);
      this.clipboardChangedSignalId = null;
    }

    debounceIds.forEach((debounceId) => {
      GLib.Source.remove(debounceId);
    });
    // Clear the list so a later stop() does not try to remove these (already
    // removed) ids again — GLib reuses source ids, so a stale id could kill an
    // unrelated source.
    debounceIds.length = 0;

    removeVirtualKeyboard();
    removeSoundContext();
  }

  // for dbus
  show() {
    this.panoWindow?.show();
  }

  // for dbus
  hide() {
    this.panoWindow?.hide();
  }

  // for dbus
  toggle() {
    this.panoWindow?.toggle();
  }

  private setupResources() {
    setupAppDirs(this);
    db.setup(getDbPath(this));
  }

  private async clearHistory() {
    this.stop();
    await deleteAppDirs(this);
    this.setupResources();
    this.start();
  }

  private async clearSessionHistory() {
    if (this.settings?.get_boolean('session-only-mode')) {
      debug('clearing session history');
      db.shutdown();
      this.clipboardManager?.stopTracking();
      await deleteAppDirs(this);
      debug('deleted session cache and db');
      this.clipboardManager?.setContent(
        new ClipboardContent({
          type: ContentType.TEXT,
          value: '',
        }),
      );
      debug('cleared last clipboard content');
    }
  }

  private enableDbus() {
    const iface = loadInterfaceXML(this, 'io.github.m4ush3r.Mano');
    this.dbus = Gio.DBusExportedObject.wrapJSObject(iface, this);
    this.dbus.export(Gio.DBus.session, '/io/github/m4ush3r/Mano');
  }

  private disableDbus() {
    this.dbus?.unexport();
    this.dbus = null;
  }

  private connectSessionDbus() {
    this.logoutSignalId = Gio.DBus.session.signal_subscribe(
      null,
      'org.gnome.SessionManager.EndSessionDialog',
      'ConfirmedLogout',
      '/org/gnome/SessionManager/EndSessionDialog',
      null,
      Gio.DBusSignalFlags.NONE,
      this.clearSessionHistory.bind(this),
    );

    this.rebootSignalId = Gio.DBus.session.signal_subscribe(
      null,
      'org.gnome.SessionManager.EndSessionDialog',
      'ConfirmedReboot',
      '/org/gnome/SessionManager/EndSessionDialog',
      null,
      Gio.DBusSignalFlags.NONE,
      this.clearSessionHistory.bind(this),
    );

    this.shutdownSignalId = Gio.DBus.session.signal_subscribe(
      null,
      'org.gnome.SessionManager.EndSessionDialog',
      'ConfirmedShutdown',
      '/org/gnome/SessionManager/EndSessionDialog',
      null,
      Gio.DBusSignalFlags.NONE,
      this.clearSessionHistory.bind(this),
    );
    this.systemdSignalId = Gio.DBus.system.signal_subscribe(
      null,
      'org.freedesktop.login1.Manager',
      'PrepareForShutdown',
      '/org/freedesktop/login1',
      null,
      Gio.DBusSignalFlags.NONE,
      (_conn, _sender, _path, _iface, _signal, parameters) => {
        // PrepareForShutdown carries a boolean: true when a shutdown is
        // starting, false when a pending shutdown is cancelled. Only clear on
        // true, otherwise a cancelled shutdown would wipe session history.
        const [starting] = (parameters?.deepUnpack?.() as [boolean] | undefined) ?? [false];
        if (starting) {
          void this.clearSessionHistory();
        }
      },
    );
  }

  private disconnectSessionDbus() {
    if (this.logoutSignalId) {
      Gio.DBus.session.signal_unsubscribe(this.logoutSignalId);
      this.logoutSignalId = null;
    }
    if (this.shutdownSignalId) {
      Gio.DBus.session.signal_unsubscribe(this.shutdownSignalId);
      this.shutdownSignalId = null;
    }
    if (this.rebootSignalId) {
      Gio.DBus.session.signal_unsubscribe(this.rebootSignalId);
      this.rebootSignalId = null;
    }
    if (this.systemdSignalId) {
      Gio.DBus.system.signal_unsubscribe(this.systemdSignalId);
      this.systemdSignalId = null;
    }
  }

  private trackWindow() {
    this.windowTrackerId = Shell.Global.get().display.connect('notify::focus-window', () => {
      const focussedWindow = Shell.Global.get().display.focusWindow;
      if (focussedWindow && this.panoWindow?.is_visible()) {
        this.panoWindow.hide();
      }
      const wmClass = focussedWindow?.get_wm_class();
      if (
        wmClass &&
        this.settings?.get_boolean('watch-exclusion-list') &&
        this.settings
          .get_strv('exclusion-list')
          .map((s) => s.toLowerCase())
          .indexOf(wmClass.toLowerCase()) >= 0
      ) {
        this.clipboardManager?.stopTracking();
      } else if (this.clipboardManager?.isTracking === false) {
        this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
          this.clipboardManager?.startTracking();
          if (this.timeoutId) {
            GLib.Source.remove(this.timeoutId);
          }
          this.timeoutId = null;
          return GLib.SOURCE_REMOVE;
        });
      }
    });
  }

  private untrackWindow() {
    if (this.windowTrackerId) {
      Shell.Global.get().display.disconnect(this.windowTrackerId);
      this.windowTrackerId = null;
    }
    if (this.timeoutId) {
      GLib.Source.remove(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
