// Light presets. brightness and temperature are 0..1 (temperature 0 = cold,
// 1 = warm). Lamps clamp to a minimum level, so Night's tiny brightness
// gives the dimmest glow the lamp can make. color is how the light looks
// (used for the track and knob in the menu); fg is the icon color on it.
export const PRESETS = [
    {id: 'night', name: 'Night', icon: 'weather-clear-night-symbolic', brightness: 0.01, temperature: 1, color: '#3a2510', fg: '#ffd9a6'},
    {id: 'dim', name: 'Dim', icon: 'weather-few-clouds-symbolic', brightness: 0.3, temperature: 0.5, color: '#b47a3e', fg: '#2a1608'},
    {id: 'warm', name: 'Warm', icon: 'daytime-sunset-symbolic', brightness: 1, temperature: 1, color: '#ffa94d', fg: '#3a1e04'},
    {id: 'cool', name: 'Cool', icon: 'weather-snow-symbolic', brightness: 1, temperature: 0, color: '#d4eaff', fg: '#173a5a'},
    {id: 'bright', name: 'Bright', icon: 'weather-clear-symbolic', brightness: 1, temperature: 0.5, color: '#fff1d6', fg: '#3a2e1a'},
];

export function findPreset(id) {
    return PRESETS.find(p => p.id === id) ?? null;
}
