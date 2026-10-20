import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {Lamp, lampConfig} from './lib/lamp.js';

const hex = id => `0x${id.toString(16).toUpperCase().padStart(4, '0')}`;

export default class LampifyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const lamp = new Lamp(() => lampConfig(settings));
        window.connect('close-request', () => {
            lamp.destroy();
            return false;
        });

        const page = new Adw.PreferencesPage();
        window.add(page);

        // Pairing
        const pairing = new Adw.PreferencesGroup({
            title: 'Pairing',
            description: 'Switch the lamp on at the wall, then press Pair within a few seconds. The lamp blinks once it has learned this computer’s ID.',
        });
        page.add(pairing);

        const send = (button, action, done) => {
            button.sensitive = false;
            action()
                .then(() => window.add_toast(new Adw.Toast({title: done})))
                .catch(e => window.add_toast(new Adw.Toast({title: e.message, timeout: 6})))
                .finally(() => {
                    button.sensitive = true;
                });
        };

        const pairButton = new Gtk.Button({label: 'Pair', valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
        pairButton.connect('clicked', () => send(pairButton, () => lamp.pair(), 'Pairing signal sent'));
        const pairRow = new Adw.ActionRow({title: 'Pair with lamp', subtitle: 'Teach the lamp this computer’s ID'});
        pairRow.add_suffix(pairButton);
        pairing.add(pairRow);

        const unpairButton = new Gtk.Button({label: 'Unpair', valign: Gtk.Align.CENTER, css_classes: ['destructive-action']});
        unpairButton.connect('clicked', () => send(unpairButton, () => lamp.unpair(), 'Unpair signal sent'));
        const unpairRow = new Adw.ActionRow({title: 'Unpair', subtitle: 'Make the lamp forget this computer’s ID'});
        unpairRow.add_suffix(unpairButton);
        pairing.add(unpairRow);

        // Behavior
        const behavior = new Adw.PreferencesGroup({title: 'Behavior'});
        page.add(behavior);
        const keyboardRow = new Adw.SwitchRow({
            title: 'Keyboard backlight follows lamp',
            subtitle: 'Light up the keyboard when the lamp turns off, and switch it off when the lamp turns on',
        });
        settings.bind('keyboard-backlight', keyboardRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(keyboardRow);

        // Device ID
        const identity = new Adw.PreferencesGroup({
            title: 'Identity',
            description: 'The lamp only obeys IDs it has been paired with. Changing the ID means pairing again.',
        });
        page.add(identity);

        const hostname = GLib.get_host_name();
        const hostnameRow = new Adw.SwitchRow({
            title: 'Use ID from hostname',
            subtitle: hostname.length <= 8
                ? `Matches the old lampify tool. “${hostname}” is 8 characters or shorter, so every computer with a short hostname gets this same ID.`
                : 'Matches the old lampify tool, so lamps paired with it keep working.',
        });
        identity.add(hostnameRow);

        const idRow = new Adw.ActionRow({title: 'Current ID'});
        const newIdButton = new Gtk.Button({label: 'New Random ID', valign: Gtk.Align.CENTER});
        newIdButton.connect('clicked', () => {
            settings.set_int('device-id', GLib.random_int_range(0, 0x10000));
        });
        idRow.add_suffix(newIdButton);
        identity.add(idRow);

        const syncId = () => {
            const id = settings.get_int('device-id');
            hostnameRow.active = id < 0;
            idRow.subtitle = hex(lampConfig(settings).deviceId);
        };
        hostnameRow.connect('notify::active', () => {
            if (hostnameRow.active)
                settings.set_int('device-id', -1);
            else if (settings.get_int('device-id') < 0)
                settings.set_int('device-id', lampConfig(settings).deviceId);
        });
        settings.connect('changed::device-id', syncId);
        syncId();

        // Bluetooth
        const bluetooth = new Adw.PreferencesGroup({title: 'Bluetooth'});
        page.add(bluetooth);
        const adapterRow = new Adw.EntryRow({title: 'Adapter (empty picks the first powered one, e.g. hci0)'});
        settings.bind('adapter', adapterRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        bluetooth.add(adapterRow);
        bluetooth.add(new Adw.ActionRow({
            title: 'How it sends',
            subtitle: 'Commands are BLE advertisements sent through BlueZ. The lamp needs a Flags field that BlueZ only adds while the adapter is discoverable, so your computer is visible to nearby devices for about a second per command.',
            subtitle_lines: 0,
        }));
    }
}
