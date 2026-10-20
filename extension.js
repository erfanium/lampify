import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Lamp, lampConfig} from './lib/lamp.js';
import {PRESETS, findPreset} from './lib/presets.js';
import {PresetBar} from './lib/presetBar.js';
import {setKeyboardBacklight} from './lib/keyboard.js';

// Don't repeat the same error notification more often than this, in ms.
const NOTIFY_INTERVAL = 30000;

function errorHint(error) {
    const message = error.message ?? String(error);
    if (message.includes('Failed to register advertisement'))
        return 'The Bluetooth controller refused to advertise. Turn Bluetooth off and on again. Running the old lampify tool causes this.';
    return message.replace(/^GDBus\.Error:[\w.]+:\s*/, '');
}

const LampToggle = GObject.registerClass(
class LampToggle extends QuickMenuToggle {
    _init(extension) {
        const gicon = Gio.icon_new_for_string(`${extension.path}/icons/lampify-symbolic.svg`);
        super._init({title: 'Lamp', gicon, toggleMode: false});

        this._settings = extension.getSettings();
        this._lamp = new Lamp(() => lampConfig(this._settings));
        this._lastNotify = {};

        this.menu.setHeader(gicon, 'Lamp', 'Bluetooth LE lamp');

        // Gradient bar with one stop per preset (lib/presetBar.js).
        const row = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._presetBar = new PresetBar(PRESETS);
        this._presetBar.connect('activated', (_bar, id) => this._applyPreset(findPreset(id)));
        row.add_child(this._presetBar);
        this.menu.addMenuItem(row);

        this.checked = this._settings.get_boolean('power');
        this.connect('clicked', () => this._setPower(!this.checked));
        this._sync();
    }

    _preset() {
        return findPreset(this._settings.get_string('preset'));
    }

    _setPower(on) {
        this.checked = on;
        this._settings.set_boolean('power', on);
        this._sync();
        this._run(on ? this._lamp.on() : this._lamp.off());
        // Keyboard lights up when the lamp goes dark, and the other way round.
        if (this._settings.get_boolean('keyboard-backlight'))
            setKeyboardBacklight(!on).catch(logError);
    }

    _applyPreset(preset) {
        // The lamp ignores colors while it's off, so switch it on first.
        if (!this.checked)
            this._setPower(true);
        this._settings.set_string('preset', preset.id);
        this._sync();
        this._run(this._lamp.setColor(preset.brightness, preset.temperature));
    }

    _sync(error = null) {
        const preset = this._preset();
        this._presetBar.setSelected(preset?.id ?? null);

        if (error)
            this.subtitle = 'Failed to send';
        else if (!this.checked)
            this.subtitle = 'Off';
        else
            this.subtitle = preset?.name ?? 'On';
    }

    _run(promise) {
        promise.then(() => this._sync(), error => {
            if (this._destroyed)
                return;
            this._sync(error);
            const hint = errorHint(error);
            console.warn(`Lampify: ${error.message ?? error}`);
            const now = GLib.get_monotonic_time() / 1000;
            if (now - (this._lastNotify[hint] ?? -Infinity) > NOTIFY_INTERVAL) {
                this._lastNotify[hint] = now;
                Main.notify('Lampify', hint);
            }
        });
    }

    destroy() {
        this._destroyed = true;
        this._lamp.destroy();
        super.destroy();
    }
});

const LampIndicator = GObject.registerClass(
class LampIndicator extends SystemIndicator {
    _init(extension) {
        super._init();
        this.quickSettingsItems.push(new LampToggle(extension));
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});

export default class LampifyExtension extends Extension {
    enable() {
        this._indicator = new LampIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
