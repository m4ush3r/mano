import Clutter from '@girs/clutter-17';
import type { ExtensionBase } from '@girs/gnome-shell/dist/extensions/sharedInternals';
import { ModalDialog } from '@girs/gnome-shell/dist/ui/modalDialog';
import St from '@girs/st-17';
import { registerGObjectClass } from '@mano/utils/gjs';
import { gettext } from '@mano/utils/shell';
import { orientationCompatibility } from '@mano/utils/shell_compatibility';
import qrcode from 'qrcode-generator';

const QR_SIZE = 280;
const QUIET_ZONE = 4; // modules of white border, per the QR spec

@registerGObjectClass
export class QrCodeDialog extends ModalDialog {
  constructor(ext: ExtensionBase, text: string) {
    super();
    const _ = gettext(ext);

    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const moduleCount = qr.getModuleCount();
    const total = moduleCount + QUIET_ZONE * 2;

    const area = new St.DrawingArea({
      width: QR_SIZE,
      height: QR_SIZE,
      xAlign: Clutter.ActorAlign.CENTER,
    });
    area.connect('repaint', () => {
      // Cairo context from the drawing area; typed loosely as gjs exposes it.
      const cr = area.get_context() as any;
      const cell = QR_SIZE / total;
      // White background (keeps the code scannable regardless of shell theme).
      cr.setSourceRGB(1, 1, 1);
      cr.rectangle(0, 0, QR_SIZE, QR_SIZE);
      cr.fill();
      // Black modules.
      cr.setSourceRGB(0, 0, 0);
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            cr.rectangle((col + QUIET_ZONE) * cell, (row + QUIET_ZONE) * cell, cell, cell);
          }
        }
      }
      cr.fill();
      cr.$dispose();
    });

    const box = new St.BoxLayout({
      ...orientationCompatibility(true),
      xExpand: true,
      style: 'spacing: 12px; padding: 12px;',
    });
    box.add_child(
      new St.Label({
        text: _('Scan this QR code with your phone'),
        xAlign: Clutter.ActorAlign.CENTER,
      }),
    );
    box.add_child(area);
    this.contentLayout.add_child(box);
    area.queue_repaint();

    this.addButton({
      label: _('Close'),
      action: () => this.close(),
      key: Clutter.KEY_Escape,
      default: true,
    });
  }
}
