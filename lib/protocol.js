// LampSmart Pro / FanLamp Pro "v1" protocol.
//
// The lamp has no Bluetooth chip; it has a cheap 2.4 GHz receiver (XN297-style).
// We build that receiver's raw packet (preamble, address, payload, CRC), then
// bit-reverse and pre-whiten it so that, after the BLE radio applies its own
// whitening on advertising channel 37, the bits on air are exactly the raw packet.
// That is why the byte offset of the payload inside the BLE PDU matters.

export const Command = {
    PAIR: 0x28,
    UNPAIR: 0x45,
    ON: 0x10,
    OFF: 0x11,
    COLOR: 0x21, // args: cold, warm (0-255 each)
    NIGHT_ON: 0x12, // "secondary light" on lamps that have one
    NIGHT_OFF: 0x13,
};

// Preamble (71 0F 55), receiver address (AA 98 43 AF 0B 46 46 46), then the
// payload. Byte 16 (0x83) is the variant's fixed "pair arg 3".
const MESSAGE_BASE = [
    0x71, 0x0F, 0x55, 0xAA, 0x98, 0x43, 0xAF, 0x0B, 0x46, 0x46, 0x46,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x83, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00,
];

// Where the payload starts inside the BLE advertising PDU: PDU header (2) +
// advertiser address (6) + Flags field (3) + AD length (1) + AD type (1).
// The lamp reads it at this fixed position, so the advert must be exactly
// Flags, then a 16-bit UUID list holding the payload.
const PAYLOAD_OFFSET = 13;

const CRC_TABLE = (() => {
    const table = new Uint16Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i << 8;
        for (let j = 0; j < 8; j++)
            c = c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1;
        table[i] = c & 0xFFFF;
    }
    return table;
})();

export function crc16(bytes, start, length) {
    let crc = 0xFFFF;
    for (let i = start; i < start + length; i++)
        crc = (CRC_TABLE[((crc >> 8) ^ bytes[i]) & 0xFF] ^ (crc << 8)) & 0xFFFF;
    return crc;
}

function reverseBits(b) {
    let r = 0;
    for (let i = 0; i < 8; i++)
        r |= ((b >> i) & 1) << (7 - i);
    return r;
}

// BLE data whitening (LFSR seeded for channel 37), applied as if `data`
// started `offset` bytes into the PDU.
function whiten(data, offset) {
    let state = 83;
    const out = new Uint8Array(data.length);
    for (let i = 0; i < offset + data.length; i++) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) {
            const s = state & 0xFF;
            b |= ((s & 64) >> 6) << bit;
            const shifted = s << 1;
            const carry = (shifted >> 7) & 1;
            const rotated = (shifted & ~1) | carry;
            state = ((rotated ^ (carry << 4)) & 16) | (rotated & ~16);
        }
        if (i >= offset)
            out[i - offset] = data[i - offset] ^ b;
    }
    return out;
}

// The ID the original lampify derived from the hostname: CRC of bytes 8..19
// of the zero-padded hostname. Hostnames of 8 characters or fewer all get the
// same ID, 0x84F9.
export function deviceIdFromHostname(hostname) {
    const buf = new Uint8Array(20);
    buf.set(new TextEncoder().encode(hostname).subarray(0, 20));
    return crc16(buf, 8, 12);
}

// Returns the 26 bytes that go after the AD type byte (0x03) of the advert.
export function buildPayload(command, arg1, arg2, deviceId, txCount) {
    const msg = Uint8Array.from(MESSAGE_BASE);
    msg[11] = command;
    msg[12] = (deviceId >> 8) & 0xFF;
    msg[13] = deviceId & 0xFF;
    msg[14] = arg1 & 0xFF;
    msg[15] = arg2 & 0xFF;
    msg[17] = txCount & 0xFF;
    const crc = crc16(msg, 11, 12);
    msg[23] = crc >> 8;
    msg[24] = crc & 0xFF;

    const out = new Uint8Array(26);
    out.set(whiten(msg.map(reverseBits), PAYLOAD_OFFSET));
    return out; // last byte is padding so the data splits into 16-bit UUIDs
}

export function pairArgs(deviceId) {
    return [(deviceId >> 8) & 0xFF, deviceId & 0xFF];
}

// BlueZ only lets us place these bytes in an AD type 0x03 field ("complete list
// of 16-bit service UUIDs"), so split them into little-endian 16-bit UUIDs.
export function payloadToUuids(payload) {
    const uuids = [];
    for (let i = 0; i < payload.length; i += 2) {
        const value = payload[i] | (payload[i + 1] << 8);
        uuids.push(value.toString(16).padStart(4, '0'));
    }
    return uuids;
}

// Map brightness (0..1) and color temperature (0 = cold, 1 = warm) to the
// cold/warm channel levels. The middle of the range runs both channels fully.
export function colorArgs(brightness, temperature) {
    const level = x => Math.round(Math.max(0, Math.min(1, x)) * 255);
    const cold = level(brightness * Math.min(1, 2 * (1 - temperature)));
    const warm = level(brightness * Math.min(1, 2 * temperature));
    return [cold, warm];
}
