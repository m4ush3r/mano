import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import GObject from '@girs/gobject-2.0';
import Meta from '@girs/meta-17';
import Shell from '@girs/shell-17';
import St from '@girs/st-17';
import { registerGObjectClass, SignalRepresentationType } from '@mano/utils/gjs';
import { debounce, getCurrentExtensionSettings, logger } from '@mano/utils/shell';

const global = Shell.Global.get();

const debug = logger('clipboard-manager');

const MimeType = {
  TEXT: ['text/plain', 'text/plain;charset=utf-8', 'UTF8_STRING'],
  HTML: ['text/html'],
  IMAGE: ['image/png'],
  GNOME_FILE: ['x-special/gnome-copied-files'],
  SENSITIVE: ['x-kde-passwordManagerHint'],
} as const;

export const enum ContentType {
  IMAGE,
  FILE,
  TEXT,
}

export const FileOperation = {
  CUT: 'cut',
  COPY: 'copy',
};

/*
 * Some sources expose a copied file as plain text in addition to the FILE
 * representation (Nautilus, portals, Chromium). A text value that is nothing
 * but one or more existing local paths is a duplicate of a FILE item and is
 * not worth keeping in the history.
 *
 * Example text values that are ignored:
 *   /home/user/Downloads/document.pdf
 *   file:///home/user/Downloads/document.pdf
 *
 * Regular text is unaffected.
 */
export const isExistingLocalFilePathText = (text: string): boolean => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return false;
  }

  return lines.every((rawLine) => {
    let line = rawLine;

    if (
      line.length >= 2 &&
      ((line.startsWith('"') && line.endsWith('"')) || (line.startsWith("'") && line.endsWith("'")))
    ) {
      line = line.slice(1, -1);
    }

    try {
      let file: Gio.File;

      if (line.startsWith('file://')) {
        file = Gio.File.new_for_uri(line);
      } else if (line.startsWith('/')) {
        file = Gio.File.new_for_path(line);
      } else {
        return false;
      }

      return file.query_exists(null);
    } catch (_err) {
      return false;
    }
  });
};

export interface FileOperationValue {
  operation: string;
  fileList: string[];
}

type ClipboardContentType =
  | {
      type: ContentType.FILE;
      value: FileOperationValue;
    }
  | {
      type: ContentType.TEXT;
      value: string;
      // Optional rich-text (text/html) representation captured alongside the
      // plain text, so the user can choose to paste with formatting.
      html?: string;
    }
  | {
      type: ContentType.IMAGE;
      value: Uint8Array;
    };

@registerGObjectClass
export class ClipboardContent extends GObject.Object {
  static metaInfo: GObject.MetaInfo<Record<string, never>, Record<string, never>, Record<string, never>> = {
    GTypeName: 'ManoClipboardContent',
  };
  content: ClipboardContentType;

  constructor(content: ClipboardContentType) {
    super();
    this.content = content;
  }
}

const arraybufferEqual = (buf1: Uint8Array, buf2: Uint8Array) => {
  if (buf1 === buf2) {
    return true;
  }

  if (buf1.byteLength !== buf2.byteLength) {
    return false;
  }

  const view1 = new DataView(buf1.buffer);
  const view2 = new DataView(buf2.buffer);

  let i = buf1.byteLength;
  while (i--) {
    if (view1.getUint8(i) !== view2.getUint8(i)) {
      return false;
    }
  }

  return true;
};

const compareClipboardContent = (content1: ClipboardContentType, content2: ClipboardContentType | undefined) => {
  if (!content2) {
    return false;
  }
  if (content1.type !== content2.type) {
    return false;
  }
  if (content1.type === ContentType.TEXT) {
    return content1.value === content2.value;
  }
  if (content1.type === ContentType.IMAGE && content2.type === ContentType.IMAGE) {
    return arraybufferEqual(content1.value, content2.value);
  }
  if (content1.type === ContentType.FILE && content2.type === ContentType.FILE) {
    return (
      content1.value.operation === content2.value.operation &&
      content1.value.fileList.length === content2.value.fileList.length &&
      content1.value.fileList.every((file, index) => file === content2.value.fileList[index])
    );
  }
  return false;
};

interface ClipboardManagerSignals {
  changed: SignalRepresentationType<[GObject.GType<GObject.Object>]>;
}

@registerGObjectClass
export class ClipboardManager extends GObject.Object {
  static metaInfo: GObject.MetaInfo<Record<string, never>, Record<string, never>, ClipboardManagerSignals> = {
    GTypeName: 'ManoClipboardManager',
    Signals: {
      changed: {
        param_types: [ClipboardContent.$gtype],
        accumulator: 0,
      },
    },
  };

  private clipboard: St.Clipboard;
  private selection: Meta.Selection;
  private selectionChangedId: number | undefined;
  public isTracking: boolean | undefined;
  private settings: Gio.Settings;
  private lastCopiedContent: ClipboardContent | null;

  /*
   * Paths that were just captured as FILE, so a text-only representation of
   * the same copy does not produce a second history item.
   */
  private pendingFilePaths: Set<string>;

  constructor(ext: ExtensionBase) {
    super();
    this.settings = getCurrentExtensionSettings(ext);
    // Direct clipboard access is the core purpose of this extension: mano is a
    // clipboard manager, so it must read what's copied and restore selections.
    this.clipboard = St.Clipboard.get_default();
    this.selection = global.get_display().get_selection();
    this.lastCopiedContent = null;
    this.pendingFilePaths = new Set<string>();
  }

  private normalizeLocalFilePath(value: string): string | null {
    let trimmed = value.trim();

    if (
      trimmed.length >= 2 &&
      ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ) {
      trimmed = trimmed.slice(1, -1);
    }

    try {
      if (trimmed.startsWith('file://')) {
        return Gio.File.new_for_uri(trimmed).get_path();
      }

      if (trimmed.startsWith('/')) {
        return Gio.File.new_for_path(trimmed).get_path();
      }
    } catch (_err) {
      return null;
    }

    return null;
  }

  private rememberFilePaths(fileList: string[]): void {
    for (const uri of fileList) {
      const path = this.normalizeLocalFilePath(uri);

      if (path) {
        this.pendingFilePaths.add(path);
      }
    }

    // Defensive bound; several files are remembered, not just the last one.
    while (this.pendingFilePaths.size > 100) {
      const first = this.pendingFilePaths.values().next().value;

      if (typeof first !== 'string') {
        break;
      }

      this.pendingFilePaths.delete(first);
    }
  }

  /*
   * A path that was already captured as a FILE must not be captured again as
   * TEXT when the source offers both representations.
   */
  private consumeDuplicateFilePathText(text: string): boolean {
    if (!isExistingLocalFilePathText(text)) {
      return false;
    }

    const paths = text
      .split(/\r?\n/)
      .map((line) => this.normalizeLocalFilePath(line))
      .filter((path): path is string => path !== null);

    // Forget the paths: the FILE item replaces their text representation.
    for (const path of paths) {
      this.pendingFilePaths.delete(path);
    }

    debug(`ignored local file path represented as text: ${paths.join(', ')}`);

    return true;
  }

  startTracking() {
    this.lastCopiedContent = null;
    this.isTracking = true;
    const primaryTracker = debounce(async () => {
      const result = await this.getContent(St.ClipboardType.PRIMARY);
      if (!result) {
        return;
      }
      if (compareClipboardContent(result.content, this.lastCopiedContent?.content)) {
        return;
      }

      this.lastCopiedContent = result;
      this.emit('changed', result);
    }, 500);

    /*
     * Copying files in Nautilus makes the clipboard emit intermediate states;
     * one of them can look like plain text containing the file path. Waiting a
     * moment and reading only the settled state avoids storing those states.
     * getContent() already prefers FILE over IMAGE and TEXT.
     */
    const clipboardTracker = debounce(async () => {
      try {
        const result = await this.getContent(St.ClipboardType.CLIPBOARD);

        if (!result) {
          return;
        }

        if (compareClipboardContent(result.content, this.lastCopiedContent?.content)) {
          return;
        }

        this.lastCopiedContent = result;
        this.emit('changed', result);
      } catch (err) {
        debug(`error: ${err}`);
      }
    }, 150);

    this.selectionChangedId = this.selection.connect(
      'owner-changed',
      async (_selection: Meta.Selection, selectionType: Meta.SelectionType, _selectionSource: Meta.SelectionSource) => {
        if (this.settings.get_boolean('is-in-incognito')) {
          return;
        }
        const focussedWindow = Shell.Global.get().display.focusWindow;
        const wmClass = focussedWindow?.get_wm_class();
        if (
          wmClass &&
          this.settings.get_boolean('watch-exclusion-list') &&
          this.settings
            .get_strv('exclusion-list')
            .map((s) => s.toLowerCase())
            .indexOf(wmClass.toLowerCase()) >= 0
        ) {
          return;
        }
        if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
          // Do not record transient states produced while copying a file.
          clipboardTracker();
        } else if (selectionType === Meta.SelectionType.SELECTION_PRIMARY) {
          try {
            if (this.settings.get_boolean('sync-primary')) {
              primaryTracker();
            }
          } catch (err) {
            debug(`error: ${err}`);
          }
        }
      },
    );
  }

  stopTracking() {
    if (this.selectionChangedId) {
      this.selection.disconnect(this.selectionChangedId);
      // Clear so a second stopTracking() (e.g. switching between two excluded
      // apps) does not disconnect an already-removed handler id.
      this.selectionChangedId = undefined;
    }
    this.isTracking = false;
    this.lastCopiedContent = null;
  }

  setContent({ content }: ClipboardContent): void {
    const syncPrimary = this.settings.get_boolean('sync-primary');
    if (content.type === ContentType.TEXT) {
      if (syncPrimary) {
        this.clipboard.set_text(St.ClipboardType.PRIMARY, content.value);
      }
      this.clipboard.set_text(St.ClipboardType.CLIPBOARD, content.value);
    } else if (content.type === ContentType.IMAGE) {
      if (syncPrimary) {
        this.clipboard.set_content(St.ClipboardType.PRIMARY, MimeType.IMAGE[0], new GLib.Bytes(content.value));
      }
      this.clipboard.set_content(St.ClipboardType.CLIPBOARD, MimeType.IMAGE[0], new GLib.Bytes(content.value));
    } else if (content.type === ContentType.FILE) {
      /*
       * GNOME 50 / Wayland file restore.
       *
       * Mano only puts x-special/gnome-copied-files on the clipboard. That is
       * enough for Nautilus, but Chromium and other GFile/portal-aware
       * applications also need:
       *
       *   text/uri-list
       *   application/vnd.portal.files
       *   application/vnd.portal.filetransfer
       *
       * RFC: the reference implementation used here is an external helper
       * (shotclip) that recreates the multi-MIME representation Nautilus
       * produces. Before merging, this should move into the extension itself
       * (or ship with it) instead of depending on a user-installed binary.
       */

      if (content.value.operation === FileOperation.COPY) {
        const shotclipPath = `${GLib.get_home_dir()}/.local/bin/shotclip`;

        const filePaths = content.value.fileList
          .map((uri) => Gio.File.new_for_uri(uri).get_path())
          .filter((path): path is string => path !== null);

        if (filePaths.length > 0) {
          try {
            /*
             * Prevent the clipboard change generated by shotclip
             * from being treated as a brand-new history item.
             */
            this.lastCopiedContent = new ClipboardContent({
              type: ContentType.FILE,
              value: {
                operation: content.value.operation,
                fileList: [...content.value.fileList],
              },
            });

            /*
             * Preserve Mano's PRIMARY-selection behaviour when
             * that option is enabled.
             */
            if (syncPrimary) {
              this.clipboard.set_content(
                St.ClipboardType.PRIMARY,
                MimeType.GNOME_FILE[0],
                new GLib.Bytes(
                  new TextEncoder().encode([content.value.operation, ...content.value.fileList].join('\n')),
                ),
              );
            }

            Gio.Subprocess.new([shotclipPath, ...filePaths], Gio.SubprocessFlags.NONE);

            return;
          } catch (err) {
            debug(`shotclip failed; using Mano fallback: ${err}`);
          }
        }
      }

      // Original Mano behaviour; still used for CUT and whenever shotclip is
      // unavailable.
      if (syncPrimary) {
        this.clipboard.set_content(
          St.ClipboardType.PRIMARY,
          MimeType.GNOME_FILE[0],
          new GLib.Bytes(new TextEncoder().encode([content.value.operation, ...content.value.fileList].join('\n'))),
        );
      }

      this.clipboard.set_content(
        St.ClipboardType.CLIPBOARD,
        MimeType.GNOME_FILE[0],
        new GLib.Bytes(new TextEncoder().encode([content.value.operation, ...content.value.fileList].join('\n'))),
      );
    }
  }

  // Put a rich-text (text/html) representation on the clipboard so the next
  // paste keeps formatting in apps that support it.
  setHtml(html: string): void {
    const bytes = new GLib.Bytes(new TextEncoder().encode(html));
    if (this.settings.get_boolean('sync-primary')) {
      this.clipboard.set_content(St.ClipboardType.PRIMARY, MimeType.HTML[0], bytes);
    }
    this.clipboard.set_content(St.ClipboardType.CLIPBOARD, MimeType.HTML[0], bytes);
  }

  private haveMimeType(clipboardMimeTypes: string[], targetMimeTypes: readonly string[]): boolean {
    return clipboardMimeTypes.find((m) => targetMimeTypes.indexOf(m) >= 0) !== undefined;
  }

  private getCurrentMimeType(clipboardMimeTypes: string[], targetMimeTypes: readonly string[]): string | undefined {
    return clipboardMimeTypes.find((m) => targetMimeTypes.indexOf(m) >= 0);
  }

  private async getContent(clipboardType: St.ClipboardType): Promise<ClipboardContent | null> {
    return new Promise((resolve) => {
      const cbMimeTypes = this.clipboard.get_mimetypes(clipboardType);
      if (this.haveMimeType(cbMimeTypes, MimeType.SENSITIVE)) {
        resolve(null);
        return;
      } else if (this.haveMimeType(cbMimeTypes, MimeType.GNOME_FILE)) {
        const currentMimeType = this.getCurrentMimeType(cbMimeTypes, MimeType.GNOME_FILE);
        if (!currentMimeType) {
          resolve(null);
          return;
        }
        this.clipboard.get_content(clipboardType, currentMimeType, (_, bytes: GLib.Bytes | Uint8Array) => {
          const data = bytes instanceof GLib.Bytes ? bytes.get_data() : bytes;
          if (data && data.length > 0) {
            const content = new TextDecoder().decode(data);
            const fileContent = content.split('\n').filter((c) => !!c);
            const hasOperation = fileContent[0] === FileOperation.CUT || fileContent[0] === FileOperation.COPY;

            const fileList = hasOperation ? fileContent.slice(1) : fileContent;

            this.rememberFilePaths(fileList);

            resolve(
              new ClipboardContent({
                type: ContentType.FILE,
                value: {
                  operation: hasOperation ? fileContent[0]! : FileOperation.COPY,
                  fileList,
                },
              }),
            );
            return;
          }
          resolve(null);
        });
      } else if (this.haveMimeType(cbMimeTypes, MimeType.IMAGE)) {
        const currentMimeType = this.getCurrentMimeType(cbMimeTypes, MimeType.IMAGE);
        if (!currentMimeType) {
          resolve(null);
          return;
        }
        this.clipboard.get_content(clipboardType, currentMimeType, (_, bytes: GLib.Bytes | Uint8Array) => {
          const data = bytes instanceof GLib.Bytes ? bytes.get_data() : bytes;
          if (data && data.length > 0) {
            resolve(
              new ClipboardContent({
                type: ContentType.IMAGE,
                value: data,
              }),
            );
            return;
          }
          resolve(null);
        });
      } else if (this.haveMimeType(cbMimeTypes, MimeType.TEXT)) {
        this.clipboard.get_text(clipboardType, (_: St.Clipboard, text: string | null) => {
          if (!text || !text.trim()) {
            resolve(null);
            return;
          }

          /*
           * Se esse texto for apenas a representação textual
           * de um FILE já registrado, não criamos outro card.
           */
          if (this.consumeDuplicateFilePathText(text)) {
            resolve(null);
            return;
          }
          // If the source also offers a rich-text representation, capture it so
          // the user can later choose to paste with formatting.
          if (this.haveMimeType(cbMimeTypes, MimeType.HTML)) {
            this.clipboard.get_content(clipboardType, MimeType.HTML[0], (__, bytes: GLib.Bytes | Uint8Array) => {
              const data = bytes instanceof GLib.Bytes ? bytes.get_data() : bytes;
              const html = data && data.length > 0 ? new TextDecoder().decode(data) : undefined;
              resolve(
                new ClipboardContent(
                  html !== undefined
                    ? { type: ContentType.TEXT, value: text, html }
                    : { type: ContentType.TEXT, value: text },
                ),
              );
            });
          } else {
            resolve(new ClipboardContent({ type: ContentType.TEXT, value: text }));
          }
        });
      } else {
        resolve(null);
      }
    });
  }
}
