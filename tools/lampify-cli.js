#!/usr/bin/env -S gjs -m
// Command-line control using the same code as the extension.
// Usage: tools/lampify-cli.js <on|off|pair|unpair|preset <name>|color <brightness 0-100> <warmth 0-100>>
//        [--id 0x84F9] [--adapter hci0]

import GLib from 'gi://GLib';
import System from 'system';
import {Lamp} from '../lib/lamp.js';
import {deviceIdFromHostname} from '../lib/protocol.js';
import {PRESETS, findPreset} from '../lib/presets.js';

const args = [...ARGV];
function option(name) {
    const i = args.indexOf(name);
    if (i < 0)
        return null;
    const [, value] = args.splice(i, 2);
    return value;
}
const deviceId = Number(option('--id') ?? deviceIdFromHostname(GLib.get_host_name()));
const adapter = option('--adapter') ?? '';

const lamp = new Lamp(() => ({deviceId, adapter}));
const [cmd, a, b] = args;
const actions = {
    on: () => lamp.on(),
    off: () => lamp.off(),
    pair: () => lamp.pair(),
    unpair: () => lamp.unpair(),
    preset: () => {
        const p = findPreset(a);
        if (!p)
            return Promise.reject(new Error(`unknown preset; use one of: ${PRESETS.map(x => x.id).join(', ')}`));
        // The lamp ignores colors while it's off.
        lamp.on();
        return lamp.setColor(p.brightness, p.temperature);
    },
    color: () => lamp.setColor(Number(a) / 100, Number(b) / 100),
};
if (!(cmd in actions)) {
    printerr('usage: lampify-cli.js on|off|pair|unpair|preset <night|dim|warm|cool|bright>|color <brightness%> <warmth%> [--id N] [--adapter hciX]');
    System.exit(2);
}

const loop = new GLib.MainLoop(null, false);
let status = 0;
actions[cmd]()
    .catch(e => {
        printerr(e.message);
        status = 1;
    })
    .finally(() => {
        lamp.destroy();
        loop.quit();
    });
loop.run();
System.exit(status);
