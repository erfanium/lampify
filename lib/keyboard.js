// Keyboard backlight through UPower, the same D-Bus API GNOME uses.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_NAME = 'org.freedesktop.UPower';
const OBJECT_PATH = '/org/freedesktop/UPower/KbdBacklight';
const IFACE = 'org.freedesktop.UPower.KbdBacklight';

function call(method, params = null) {
    return new Promise((resolve, reject) => {
        Gio.DBus.system.call(BUS_NAME, OBJECT_PATH, IFACE, method, params, null,
            Gio.DBusCallFlags.NONE, 2000, null, (conn, res) => {
                try {
                    resolve(conn.call_finish(res).deepUnpack());
                } catch (e) {
                    reject(e);
                }
            });
    });
}

// Turns the keyboard backlight fully on or off. Does nothing on machines
// without a controllable keyboard backlight.
export async function setKeyboardBacklight(on) {
    let level = 0;
    if (on) {
        try {
            [level] = await call('GetMaxBrightness');
        } catch {
            return;
        }
    }
    await call('SetBrightness', new GLib.Variant('(i)', [level])).catch(() => {});
}
