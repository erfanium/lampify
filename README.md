# Lampify

A GNOME Shell extension that controls cheap Bluetooth LE ceiling lamps from Quick Settings: on/off, light presets and pairing. No root, no extra daemons. It talks to the lamp through BlueZ over D-Bus.

This started as a fork of [MasterDevX/lampify](https://github.com/MasterDevX/lampify), a C command-line tool. The protocol is now reimplemented in JavaScript, and the C code is gone.

## Features

- **Lamp** toggle in Quick Settings to switch the light on and off
- Preset bar in the toggle's menu: **Night**, **Dim**, **Warm**, **Cool** and **Bright**. Click a point or drag the knob, which snaps to the nearest preset. Arrow keys and scrolling work too.
- Pair and unpair from the extension's preferences
- Optional: the keyboard backlight turns on when the lamp goes off, and off when it goes on
- Choose which Bluetooth adapter to use, or let it pick the first powered one

## Compatible lamps

Lamps controlled by these Android apps share the same protocol and should work (tested with Victoria Lighting Losange/PL500):

- By [XuRenNan](https://play.google.com/store/apps/developer?id=XuRenNan): [LampSmart Pro](https://play.google.com/store/apps/details?id=com.jingyuan.lamp), [FanLamp Pro](https://play.google.com/store/apps/details?id=com.jingyuan.fan_lamp), [ApplianceSmart](https://play.google.com/store/apps/details?id=com.jingyuan.smart_home), [Vmax smart](https://play.google.com/store/apps/details?id=com.jingyuan.vmax_smart)
- By [ShangHai All Link Microelectronics](https://play.google.com/store/apps/developer?id=ShangHai+All+Link+Microelectronics+Co.,+Ltd): [FanLamp](https://play.google.com/store/apps/details?id=com.fan.lamp), [ControlSwitch](https://play.google.com/store/apps/details?id=com.alllink.power_switch), [Lamp Smart Pro-Soft Lighting](https://play.google.com/store/apps/details?id=com.alllink.smart_lighting)

## Requirements

- GNOME Shell 51
- BlueZ with Bluetooth turned on

## Install

```sh
git clone https://github.com/erfanium/lampify.git
cd lampify
make install
```

Log out and back in (Wayland), then enable it:

```sh
gnome-extensions enable lampify@erfanium.local
```

## Pairing

The lamp has to learn your computer's ID once:

1. Switch the lamp on at the wall.
2. Within a few seconds, open the extension's preferences and press **Pair**.
3. The lamp blinks when it has learned the ID.

## How it works

Commands are sent as BLE advertisements through BlueZ. The lamp needs a Flags field that BlueZ only adds while the adapter is discoverable, so your computer is visible to nearby devices for about a second per command.

## Development

```sh
make dev                                   # nested GNOME Shell with only this extension (run make install first)
tools/lampify-cli.js on                    # same code as the extension, from a terminal
tools/lampify-cli.js preset warm
tools/lampify-cli.js color 50 100          # brightness %, warmth %
```
