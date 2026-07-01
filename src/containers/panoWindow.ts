import '@girs/gnome-shell/dist/extensions/global';

import Clutter from '@girs/clutter-17';
import Gio from '@girs/gio-2.0';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import Shell from '@girs/shell-17';
import St from '@girs/st-17';
import { MonitorBox } from '@mano/components/monitorBox';
import { PanoScrollView } from '@mano/components/panoScrollView';
import { SearchBox } from '@mano/components/searchBox';
import { ClipboardManager } from '@mano/utils/clipboardManager';
import { ItemType } from '@mano/utils/db';
import { registerGObjectClass } from '@mano/utils/gjs';
import { getCurrentExtensionSettings } from '@mano/utils/shell';
import { orientationCompatibility } from '@mano/utils/shell_compatibility';
import { getAlignment, getMonitorConstraint, isVertical } from '@mano/utils/ui';
import { isPopupOpen } from '@mano/utils/windowState';

@registerGObjectClass
export class PanoWindow extends St.BoxLayout {
  private scrollView: PanoScrollView;
  private searchBox: SearchBox;
  private monitorBox: MonitorBox;
  private settings: Gio.Settings;
  private disconnectors: Array<() => void> = [];

  constructor(ext: ExtensionBase, clipboardManager: ClipboardManager) {
    super({
      name: 'mano-window',
      constraints: getMonitorConstraint(),
      styleClass: 'mano-window',
      visible: false,
      ...orientationCompatibility(true),
      reactive: true,
      opacity: 0,
      canFocus: true,
    });

    this.settings = getCurrentExtensionSettings(ext);
    this.setAlignment();

    const themeContext = St.ThemeContext.get_for_stage(Shell.Global.get().get_stage());

    this.setWindowDimensions(themeContext.scaleFactor);
    const scaleFactorId = themeContext.connect('notify::scale-factor', () => {
      this.setWindowDimensions(themeContext.scaleFactor);
    });
    const itemSizeId = this.settings.connect('changed::item-size', () => {
      this.setWindowDimensions(themeContext.scaleFactor);
    });
    const windowPositionId = this.settings.connect('changed::window-position', () => {
      this.setWindowDimensions(themeContext.scaleFactor);
      this.setAlignment();
    });

    const bgColorId = this.settings.connect('changed::window-background-color', () => {
      if (this.settings.get_boolean('is-in-incognito')) {
        this.set_style(
          `background-color: ${this.settings.get_string('incognito-window-background-color')} !important;`,
        );
      } else {
        this.set_style(`background-color: ${this.settings.get_string('window-background-color')}`);
      }
    });
    const incognitoBgColorId = this.settings.connect('changed::incognito-window-background-color', () => {
      if (this.settings.get_boolean('is-in-incognito')) {
        this.set_style(
          `background-color: ${this.settings.get_string('incognito-window-background-color')} !important;`,
        );
      } else {
        this.set_style(`background-color: ${this.settings.get_string('window-background-color')}`);
      }
    });
    this.disconnectors.push(
      () => themeContext.disconnect(scaleFactorId),
      () => this.settings.disconnect(itemSizeId),
      () => this.settings.disconnect(windowPositionId),
      () => this.settings.disconnect(bgColorId),
      () => this.settings.disconnect(incognitoBgColorId),
    );
    this.monitorBox = new MonitorBox();
    this.searchBox = new SearchBox(ext, (text: string) => this.addSnippet(text));
    this.scrollView = new PanoScrollView(ext, clipboardManager, this.searchBox);

    this.setupMonitorBox();
    this.setupScrollView();
    this.setupSearchBox();

    this.add_child(this.searchBox);
    this.add_child(this.scrollView);

    const incognitoId = this.settings.connect('changed::is-in-incognito', () => {
      if (this.settings.get_boolean('is-in-incognito')) {
        this.add_style_class_name('incognito');
        this.set_style(
          `background-color: ${this.settings.get_string('incognito-window-background-color')} !important;`,
        );
      } else {
        this.remove_style_class_name('incognito');
        this.set_style(`background-color: ${this.settings.get_string('window-background-color')}`);
      }
    });
    this.disconnectors.push(() => this.settings.disconnect(incognitoId));

    if (this.settings.get_boolean('is-in-incognito')) {
      this.add_style_class_name('incognito');
      this.set_style(`background-color: ${this.settings.get_string('incognito-window-background-color')} !important;`);
    } else {
      this.set_style(`background-color: ${this.settings.get_string('window-background-color')}`);
    }
  }

  private setWindowDimensions(scaleFactor: number) {
    this.remove_style_class_name('vertical');
    if (isVertical(this.settings.get_uint('window-position'))) {
      this.add_style_class_name('vertical');
      this.set_width((this.settings.get_int('item-size') + 20) * scaleFactor);
    } else {
      this.set_height((this.settings.get_int('item-size') + 90) * scaleFactor);
    }
  }

  private setAlignment() {
    const [x_align, y_align] = getAlignment(this.settings.get_uint('window-position'));
    this.set_x_align(x_align);
    this.set_y_align(y_align);
  }

  private setupMonitorBox() {
    this.monitorBox.connect('hide_window', () => this.hide());
  }

  private setupSearchBox() {
    this.searchBox.connect('search-focus-out', () => {
      this.scrollView.focusOnClosest();
      this.scrollView.scrollToFocussedItem();
    });
    this.searchBox.connect('search-submit', () => {
      this.scrollView.selectFirstItem();
    });
    this.searchBox.connect(
      'search-text-changed',
      (_: any, text: string, itemType: ItemType, showFavorites: boolean) => {
        this.scrollView.filter(text, itemType, showFavorites);
      },
    );
    this.searchBox.connect('search-item-select-shortcut', (_: any, index: number) => {
      this.scrollView.selectItemByIndex(index);
    });
  }

  private setupScrollView() {
    this.scrollView.connect('scroll-update-list', () => {
      this.searchBox.focus();
      this.searchBox.emitSearchTextChange();
      this.scrollView.focusOnClosest();
      this.scrollView.scrollToFocussedItem();
    });
    this.scrollView.connect('scroll-focus-out', () => {
      this.searchBox.focus();
    });

    this.scrollView.connect('scroll-backspace-press', () => {
      this.searchBox.removeChar();
      this.searchBox.focus();
    });

    this.scrollView.connect('scroll-alt-press', () => {
      this.searchBox.focus();
      this.searchBox.toggleFavorites();
      this.scrollView.focusAndScrollToFirst();
    });

    this.scrollView.connect('scroll-tab-press', (_: any, hasShift: boolean) => {
      this.searchBox.focus();
      this.searchBox.toggleItemType(hasShift);
      this.scrollView.focusAndScrollToFirst();
    });

    this.scrollView.connect('scroll-key-press', (_: any, text: string) => {
      this.searchBox.focus();
      this.searchBox.appendText(text);
    });
  }

  toggle(): void {
    this.is_visible() ? this.hide() : this.show();
  }

  addSnippet(text: string): void {
    this.scrollView.addSnippet(text);
  }

  override show() {
    this.clear_constraints();
    this.setAlignment();
    this.add_constraint(getMonitorConstraint());
    super.show();
    if (this.settings.get_boolean('keep-search-entry')) {
      this.searchBox.selectAll();
    } else {
      this.searchBox.clear();
    }
    this.searchBox.focus();
    this.ease({
      opacity: 255,
      duration: 250,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
    this.monitorBox.open();

    return Clutter.EVENT_PROPAGATE;
  }

  override hide() {
    // Don't dismiss the window while an in-window popup (e.g. an item's
    // quick-actions menu) is open; otherwise the menu just flashes and closes.
    if (isPopupOpen()) {
      return Clutter.EVENT_PROPAGATE;
    }
    this.monitorBox.close();
    this.ease({
      opacity: 0,
      duration: 200,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      onComplete: () => {
        if (!this.settings.get_boolean('keep-search-entry')) {
          this.searchBox.clear();
        }
        this.scrollView.beforeHide();
        super.hide();
      },
    });

    return Clutter.EVENT_PROPAGATE;
  }

  override vfunc_key_press_event(event: Clutter.Event): boolean {
    if (event.get_key_symbol() === Clutter.KEY_Escape) {
      this.hide();
    }

    return Clutter.EVENT_PROPAGATE;
  }

  override destroy(): void {
    this.disconnectors.forEach((disconnect) => disconnect());
    this.disconnectors = [];
    this.monitorBox.destroy();
    this.searchBox.destroy();
    this.scrollView.destroy();
    super.destroy();
  }
}
