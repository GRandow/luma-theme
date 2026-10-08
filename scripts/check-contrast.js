/**
 * Checks that every color scheme in config/settings_data.json meets WCAG AA
 * (4.5:1) for the color pairs the theme actually uses as text: body text and
 * secondary text on the background and on cards, accent text (eyebrows,
 * links, the sale badge), and both button styles.
 *
 * Usage: npm run contrast
 */
import { readFile } from 'node:fs/promises';

const MINIMUM = 4.5;

const PAIRS = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text_muted', 'background'],
  ['text_muted', 'surface'],
  ['accent', 'background'],
  ['button_label', 'button'],
  ['secondary_button_label', 'background'],
];

function luminance(hex) {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)
    .map((pair) => parseInt(pair, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const source = await readFile(new URL('../config/settings_data.json', import.meta.url), 'utf8');
// The theme editor writes a comment banner above the JSON.
const data = JSON.parse(source.replace(/^\s*\/\*[\s\S]*?\*\//, ''));
const schemes = data.current.color_schemes;

let failures = 0;
for (const [id, { settings }] of Object.entries(schemes)) {
  const results = PAIRS.map(([foreground, background]) => {
    const ratio = contrast(settings[foreground], settings[background]);
    const passes = ratio >= MINIMUM;
    if (!passes) failures += 1;
    return `${passes ? 'ok  ' : 'FAIL'} ${foreground} on ${background}: ${ratio.toFixed(2)}:1`;
  });
  console.log(`${id}\n  ${results.join('\n  ')}`);
}

if (failures) {
  console.error(`\n${failures} color pair(s) below ${MINIMUM}:1`);
  process.exit(1);
}
console.log(`\nAll color schemes meet ${MINIMUM}:1.`);
