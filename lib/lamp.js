import GLib from 'gi://GLib';

import {Advertiser} from './advertiser.js';
import {Command, buildPayload, payloadToUuids, pairArgs, colorArgs, deviceIdFromHostname} from './protocol.js';

const OBJECT_PATH = '/org/gnome/shell/extensions/lampify/advertisement';

// The lamp can miss a packet, so every command goes out as several bursts.
// It also ignores a command that comes right after another (tested: half of
// back-to-back commands were lost), so wait a moment between commands.
const SEND_OPTIONS = {burstMs: 300, gapMs: 150, repeats: 3, settleMs: 1000};


// Reads the lamp settings from the extension's GSettings.
export function lampConfig(settings) {
    const id = settings.get_int('device-id');
    return {
        deviceId: id >= 0 ? id : deviceIdFromHostname(GLib.get_host_name()),
        adapter: settings.get_string('adapter'),
    };
}

export class Lamp {
    // `getConfig` returns {deviceId, adapter} at send time, so settings
    // changes apply without recreating the lamp.
    constructor(getConfig) {
        this._getConfig = getConfig;
        this._advertiser = new Advertiser(OBJECT_PATH);
        this._tx = Math.floor(Math.random() * 256);
        this._pendingColor = null;
    }

    destroy() {
        this._advertiser.destroy();
    }

    _send(command, arg1 = 0, arg2 = 0) {
        const {deviceId, adapter} = this._getConfig();
        this._tx = (this._tx + 1) & 0xFF;
        const payload = buildPayload(command, arg1, arg2, deviceId, this._tx);
        return this._advertiser.send({uuids: payloadToUuids(payload), flags: true},
            {...SEND_OPTIONS, adapter});
    }

    on() {
        return this._send(Command.ON);
    }

    off() {
        return this._send(Command.OFF);
    }

    pair() {
        return this._send(Command.PAIR, ...pairArgs(this._getConfig().deviceId));
    }

    unpair() {
        return this._send(Command.UNPAIR);
    }

    // brightness and temperature are 0..1 (temperature 0 = cold, 1 = warm).
    // While a send is in flight, only the newest value is kept, so dragging
    // a slider doesn't queue up dozens of commands.
    setColor(brightness, temperature) {
        this._pendingColor = [brightness, temperature];
        this._colorLoop ??= this._sendColors().finally(() => {
            this._colorLoop = null;
        });
        return this._colorLoop;
    }

    async _sendColors() {
        while (this._pendingColor) {
            const [b, t] = this._pendingColor;
            this._pendingColor = null;
            await this._send(Command.COLOR, ...colorArgs(b, t));
        }
    }
}
