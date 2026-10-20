import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

const SNAP_TIME = 180;
const ICON_FADE_TIME = 140;
// While dragging: how far from a stop (in stop widths, 0..0.5) the knob
// stays stuck to it, and how sharply it then lets go (1 = linear).
const MAGNET_RADIUS = 0.18;
const MAGNET_CURVE = 1.6;

const rgb = hex => [0, 1, 2].map(i => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16));
const toHex = c => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const mix = (a, b) => toHex(lerp(rgb(a), rgb(b), 0.5));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function gradient(start, end) {
    return `background-gradient-direction: horizontal; background-gradient-start: ${start}; background-gradient-end: ${end};`;
}

// A thin gradient track (warm amber -> cool white) with one stop per preset,
// and a round knob showing the selected preset's icon. Click a stop, or drag
// the knob (it snaps to the nearest stop on release). Arrow keys and
// scrolling also move it. Emits 'activated' with the preset id.
//
// The knob's color follows the gradient under it as it moves, and its icon
// cross-fades to the nearest preset's, so dragging and snapping look smooth.
//
// St gradients only have two colors, so each stop's track is two halves:
// from the midpoint with the previous preset to this preset's color, then on
// to the midpoint with the next one. Together they look like one gradient.
export const PresetBar = GObject.registerClass({
    Signals: {'activated': {param_types: [GObject.TYPE_STRING]}},
}, class PresetBar extends St.Widget {
    _init(presets) {
        super._init({
            style_class: 'lampify-bar',
            x_expand: true,
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        this._presets = presets;
        this._index = -1;
        this._shownIcon = -1;
        this._grab = null;

        // Equal-width stops, so stop i is centered at (i + 0.5) / n.
        this._track = new St.BoxLayout();
        this._track.layout_manager.homogeneous = true;
        presets.forEach((preset, i) => {
            const prev = presets[i - 1]?.color ?? preset.color;
            const next = presets[i + 1]?.color ?? preset.color;
            const halves = new St.BoxLayout({x_expand: true, y_align: Clutter.ActorAlign.CENTER});
            halves.add_child(new St.Widget({
                style_class: `lampify-track-half${i === 0 ? ' lampify-track-start' : ''}`,
                style: gradient(mix(prev, preset.color), preset.color),
                x_expand: true,
            }));
            halves.add_child(new St.Widget({
                style_class: `lampify-track-half${i === presets.length - 1 ? ' lampify-track-end' : ''}`,
                style: gradient(preset.color, mix(preset.color, next)),
                x_expand: true,
            }));
            const stop = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});
            stop.add_child(halves);
            stop.add_child(new St.Widget({
                style_class: `lampify-dot${i === 0 ? ' lampify-dot-light' : ''}`,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            this._track.add_child(stop);
        });
        this.add_child(this._track);

        // Two stacked icons, so the old one can fade out as the new one fades in.
        const icons = new St.Widget({layout_manager: new Clutter.BinLayout()});
        this._icons = [0, 1].map(() => {
            const icon = new St.Icon({style_class: 'lampify-knob-icon', opacity: 0});
            icons.add_child(icon);
            return icon;
        });
        this._knob = new St.Bin({style_class: 'lampify-knob', child: icons, visible: false});
        this._knob.connect('notify::translation-x', () => this._updateKnobLook());
        this.add_child(this._knob);

        this.connect('destroy', () => {
            this._grab?.dismiss();
            this._grab = null;
        });
    }

    // Selects a preset without emitting (used to reflect saved state).
    setSelected(id) {
        if (this._grab)
            return;
        const index = this._presets.findIndex(p => p.id === id);
        if (index === this._index)
            return;
        const wasShown = this._knob.visible;
        this._index = index;
        this._knob.visible = index >= 0;
        // Before the first layout, vfunc_allocate places the knob instead.
        if (index >= 0 && this.has_allocation())
            this._moveKnob(this._center(index), wasShown && this.mapped);
    }

    // Lay out by hand: the track fills the width, and the knob sits at the
    // track's left edge, moved only by translation_x. This way its position
    // never depends on when the layout last ran.
    vfunc_allocate(box) {
        this.set_allocation(box);
        const content = this.get_theme_node().get_content_box(box);
        const width = content.get_width(), height = content.get_height();

        const [, trackHeight] = this._track.get_preferred_height(width);
        const trackBox = new Clutter.ActorBox();
        trackBox.set_origin(content.x1, content.y1 + Math.round((height - trackHeight) / 2));
        trackBox.set_size(width, trackHeight);
        this._track.allocate(trackBox);

        const [, knobWidth] = this._knob.get_preferred_width(-1);
        const [, knobHeight] = this._knob.get_preferred_height(knobWidth);
        const knobBox = new Clutter.ActorBox();
        knobBox.set_origin(content.x1, content.y1 + Math.round((height - knobHeight) / 2));
        knobBox.set_size(knobWidth, knobHeight);
        this._knob.allocate(knobBox);

        if (!this._grab && this._index >= 0 && !this._knob.get_transition('translation-x'))
            this._moveKnob(this._center(this._index), false);
    }

    // Center of stop i, from the track's left edge.
    _center(i) {
        return this._track.width * (i + 0.5) / this._presets.length;
    }

    // Stop position under x, as a fractional index (0 = first stop's center).
    _position(x) {
        return x / this._track.width * this._presets.length - 0.5;
    }

    _moveKnob(centerX, animate) {
        const x = Math.round(centerX - this._knob.width / 2);
        this._knob.remove_transition('translation-x');
        if (animate) {
            this._knob.ease({
                translation_x: x,
                duration: SNAP_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        } else {
            this._knob.translation_x = x;
            this._updateKnobLook();
        }
    }

    // Knob color = the gradient color under its center; icon = nearest preset.
    _updateKnobLook() {
        if (!this._track.width)
            return;
        const n = this._presets.length;
        const pos = clamp(this._position(this._knob.translation_x + this._knob.width / 2), 0, n - 1);
        const i = Math.min(Math.floor(pos), n - 2);
        const color = lerp(rgb(this._presets[i].color), rgb(this._presets[i + 1].color), pos - i);
        this._knob.style = `background-color: ${toHex(color)};`;
        this._showIcon(Math.round(pos));
    }

    _showIcon(index) {
        if (index === this._shownIcon)
            return;
        const animate = this._shownIcon >= 0 && this.mapped;
        this._shownIcon = index;
        const preset = this._presets[index];
        const [oldIcon, newIcon] = this._icons;
        this._icons = [newIcon, oldIcon];

        newIcon.set({icon_name: preset.icon, style: `color: ${preset.fg};`});
        newIcon.remove_all_transitions();
        oldIcon.remove_all_transitions();
        if (!animate) {
            newIcon.opacity = 255;
            oldIcon.opacity = 0;
            return;
        }
        newIcon.opacity = 0;
        newIcon.ease({opacity: 255, duration: ICON_FADE_TIME, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        oldIcon.ease({opacity: 0, duration: ICON_FADE_TIME, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    _activate(index) {
        this._index = index;
        this._knob.visible = true;
        this._moveKnob(this._center(index), true);
        this.emit('activated', this._presets[index].id);
    }

    // Pointer x relative to the track's left edge.
    _trackX(event) {
        const [stageX, stageY] = event.get_coords();
        const [, x] = this.transform_stage_point(stageX, stageY);
        return x - this._track.x;
    }

    // Knob follows the pointer, clamped to the first and last stops, and is
    // pulled toward the nearest stop like a magnet: within MAGNET_RADIUS of
    // a stop it sticks to it, and between stops it hurries across. The
    // mapping is continuous, so it never jumps.
    _dragTo(x) {
        const n = this._presets.length;
        const pos = this._position(clamp(x, this._center(0), this._center(n - 1)));
        const stop = Math.round(pos);
        const offset = pos - stop; // -0.5 .. 0.5
        const free = Math.max(0, Math.abs(offset) - MAGNET_RADIUS) / (0.5 - MAGNET_RADIUS);
        const pulled = Math.sign(offset) * 0.5 * free ** MAGNET_CURVE;

        this._index = stop;
        this._knob.visible = true;
        this._moveKnob(this._center(stop + pulled), false);
    }

    _startDrag(event) {
        if (this._grab)
            return Clutter.EVENT_STOP;
        this._grab = global.stage.grab(this);
        this.grab_key_focus();
        this._dragTo(this._trackX(event));
        return Clutter.EVENT_STOP;
    }

    _endDrag() {
        if (!this._grab)
            return Clutter.EVENT_STOP;
        this._grab.dismiss();
        this._grab = null;
        this._activate(this._index);
        return Clutter.EVENT_STOP;
    }

    vfunc_button_press_event(event) {
        return event.get_button() === Clutter.BUTTON_PRIMARY
            ? this._startDrag(event) : Clutter.EVENT_PROPAGATE;
    }

    vfunc_motion_event(event) {
        if (!this._grab)
            return Clutter.EVENT_PROPAGATE;
        this._dragTo(this._trackX(event));
        return Clutter.EVENT_STOP;
    }

    vfunc_button_release_event(event) {
        return event.get_button() === Clutter.BUTTON_PRIMARY
            ? this._endDrag() : Clutter.EVENT_PROPAGATE;
    }

    vfunc_touch_event(event) {
        switch (event.type()) {
        case Clutter.EventType.TOUCH_BEGIN:
            return this._startDrag(event);
        case Clutter.EventType.TOUCH_UPDATE:
            return this.vfunc_motion_event(event);
        case Clutter.EventType.TOUCH_END:
        case Clutter.EventType.TOUCH_CANCEL:
            return this._endDrag();
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _step(delta) {
        const n = this._presets.length;
        const from = this._index < 0 ? (delta > 0 ? -1 : n) : this._index;
        const index = clamp(from + delta, 0, n - 1);
        if (index !== this._index)
            this._activate(index);
    }

    vfunc_scroll_event(event) {
        if (this._grab)
            return Clutter.EVENT_STOP;
        const dir = event.get_scroll_direction();
        if (dir === Clutter.ScrollDirection.UP || dir === Clutter.ScrollDirection.RIGHT)
            this._step(1);
        else if (dir === Clutter.ScrollDirection.DOWN || dir === Clutter.ScrollDirection.LEFT)
            this._step(-1);
        return Clutter.EVENT_STOP;
    }

    vfunc_key_press_event(event) {
        const key = event.get_key_symbol();
        if (key === Clutter.KEY_Right || key === Clutter.KEY_Up) {
            this._step(1);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Left || key === Clutter.KEY_Down) {
            this._step(-1);
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_key_press_event(event);
    }
});
