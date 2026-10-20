#!/bin/sh
# Nested GNOME Shell for developing this extension. It uses its own config
# dir, so your real settings and extensions are untouched. The system bus
# (and so BlueZ and the lamp) is the real one.
#
# It runs as a transient systemd user service so that when the shell exits
# (or the terminal is closed), systemd kills everything the private session
# bus started. Without this, each run leaked ~20 services (portal, evolution,
# gvfs, goa, ...) that kept running after the dev shell was gone.
export XDG_CONFIG_HOME="${XDG_CACHE_HOME:-$HOME/.cache}/lampify-dev-shell"
mkdir -p "$XDG_CONFIG_HOME"
exec systemd-run --user --pty --wait --collect --same-dir \
    --unit=lampify-dev-shell \
    -E XDG_CONFIG_HOME -E WAYLAND_DISPLAY -E DISPLAY -E XDG_SESSION_TYPE \
    dbus-run-session -- sh -c '
        gsettings set org.gnome.shell enabled-extensions "[\"lampify@erfanium.local\"]"
        gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
        exec gnome-shell --devkit
    '
