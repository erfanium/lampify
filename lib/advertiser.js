// Sends short BLE broadcast bursts through BlueZ's LEAdvertisingManager1 D-Bus API.
// No raw HCI sockets, no root, and the adapter is never reset, so other
// Bluetooth devices stay connected. BlueZ and the kernel pick legacy or
// extended advertising commands for the controller.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_NAME = 'org.bluez';
const MANAGER_IFACE = 'org.bluez.LEAdvertisingManager1';
const ADAPTER_IFACE = 'org.bluez.Adapter1';

const ADVERTISEMENT_XML = `
<node>
  <interface name="org.bluez.LEAdvertisement1">
    <method name="Release"/>
    <property name="Type" type="s" access="read"/>
    <property name="ServiceUUIDs" type="as" access="read"/>
    <property name="Data" type="a{yv}" access="read"/>
    <property name="MinInterval" type="u" access="read"/>
    <property name="MaxInterval" type="u" access="read"/>
  </interface>
</node>`;

// 20 ms, the fastest interval BLE allows (same as the old tool).
const INTERVAL_MS = 20;

function call(objectPath, iface, method, params) {
    return new Promise((resolve, reject) => {
        Gio.DBus.system.call(BUS_NAME, objectPath, iface, method, params, null,
            Gio.DBusCallFlags.NONE, 5000, null, (conn, res) => {
                try {
                    resolve(conn.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

function sleep(ms) {
    return new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

// Builds an a{yv} variant that keeps the given order of [type, bytes] entries.
function dataVariant(entries) {
    return GLib.Variant.new_array(new GLib.VariantType('{yv}'),
        entries.map(([type, bytes]) => GLib.Variant.new_dict_entry(
            GLib.Variant.new_byte(type),
            GLib.Variant.new_variant(new GLib.Variant('ay', Array.from(bytes))))));
}

export class Advertiser {
    constructor(objectPath) {
        this._path = objectPath;
        this._uuids = [];
        this._data = [];
        this._type = 'broadcast';
        const owner = this;
        this._impl = Gio.DBusExportedObject.wrapJSObject(ADVERTISEMENT_XML, {
            get Type() {
                return owner._type;
            },
            get ServiceUUIDs() {
                return owner._uuids;
            },
            get Data() {
                return dataVariant(owner._data);
            },
            MinInterval: INTERVAL_MS,
            MaxInterval: INTERVAL_MS,
            Release() {},
        });
        this._impl.export(Gio.DBus.system, this._path);
        this._chain = Promise.resolve();
    }

    destroy() {
        this._destroyed = true;
        this._impl.unexport();
    }

    // Finds the adapter to use: the requested one, or the first powered
    // adapter that can advertise.
    async _findAdapter(preferred) {
        const [objects] = (await call('/', 'org.freedesktop.DBus.ObjectManager',
            'GetManagedObjects', null)).deepUnpack();
        let fallback = null;
        for (const [path, ifaces] of Object.entries(objects)) {
            if (!(MANAGER_IFACE in ifaces))
                continue;
            if (preferred && !path.endsWith(`/${preferred}`))
                continue;
            if (ifaces[ADAPTER_IFACE]?.Powered?.deepUnpack())
                return {path, discoverable: ifaces[ADAPTER_IFACE].Discoverable?.deepUnpack()};
            fallback ??= path;
        }
        if (fallback)
            throw new Error('Bluetooth is turned off');
        throw new Error(preferred
            ? `Bluetooth adapter ${preferred} not found`
            : 'No Bluetooth adapter that supports advertising');
    }

    // Broadcasts an advertisement in `repeats` bursts of `burstMs`, with
    // `gapMs` between them. `ad` is {uuids: [...]} or {data: [[type, bytes], ...]}.
    // Calls run one after another.
    // `settleMs` is a pause after the send before the next one may start.
    send(ad, {burstMs = 300, gapMs = 150, repeats = 3, settleMs = 0, adapter = ''} = {}) {
        const run = async () => {
            try {
                await this._send(ad, burstMs, gapMs, repeats, adapter);
            } finally {
                if (settleMs && !this._destroyed)
                    await sleep(settleMs);
            }
        };
        const result = this._chain.then(run, run);
        this._chain = result.catch(() => {});
        return result;
    }

    _setDiscoverable(adapterPath, value) {
        return call(adapterPath, 'org.freedesktop.DBus.Properties', 'Set',
            new GLib.Variant('(ssv)', [ADAPTER_IFACE, 'Discoverable', new GLib.Variant('b', value)]));
    }

    // With `flags`, the advert starts with a real Flags field, which the lamp
    // requires. BlueZ only has the kernel add one to a connectable advert while
    // the adapter is discoverable, so the adapter is made discoverable for the
    // length of the send (about a second) and then switched back.
    async _send(ad, burstMs, gapMs, repeats, adapterName) {
        const adapter = await this._findAdapter(adapterName);
        const toggle = ad.flags && !adapter.discoverable;
        if (toggle)
            await this._setDiscoverable(adapter.path, true);
        try {
            await this._bursts(adapter.path, ad, burstMs, gapMs, repeats);
        } finally {
            if (toggle)
                await this._setDiscoverable(adapter.path, false).catch(logError);
        }
    }

    async _bursts(adapterPath, ad, burstMs, gapMs, repeats) {
        this._uuids = ad.uuids ?? [];
        this._data = ad.data ?? [];
        this._type = ad.flags ? 'peripheral' : ad.type ?? 'broadcast';
        for (let i = 0; i < repeats && !this._destroyed; i++) {
            if (i > 0)
                await sleep(gapMs);
            await call(adapterPath, MANAGER_IFACE, 'RegisterAdvertisement',
                new GLib.Variant('(oa{sv})', [this._path, {}]));
            try {
                await sleep(burstMs);
            } finally {
                await call(adapterPath, MANAGER_IFACE, 'UnregisterAdvertisement',
                    new GLib.Variant('(o)', [this._path])).catch(() => {});
            }
        }
    }
}
