// Tracks whether any in-window popup (e.g. an item's quick-actions menu) is
// open. While one is, the mano window must not auto-dismiss itself — otherwise
// opening the menu's grab trips the window's click-away/focus dismissal and
// closes the menu again immediately (it just flashes). Reference-counted so
// nested/overlapping menus behave correctly.
let openPopupCount = 0;

export const setPopupOpen = (open: boolean): void => {
  openPopupCount = Math.max(0, openPopupCount + (open ? 1 : -1));
};

export const isPopupOpen = (): boolean => openPopupCount > 0;
