/**
 * constants/theme.ts — Colors, spacing and sizes used by every screen.
 *
 * Every screen reads colors through the useTheme() hook
 * (src/hooks/use-theme.ts), which picks the `light` or `dark` set below based
 * on the phone's appearance setting. Change a color here and it changes
 * everywhere.
 *
 * The first five keys (text, background, backgroundElement,
 * backgroundSelected, textSecondary) are the names the Expo starter template
 * used, kept so nothing that still imports them breaks. The rest were added
 * for the EverythingFitness screens.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#15161A',               // main text
    background: '#F3F1EC',         // screen background (warm off-white)
    backgroundElement: '#FFFFFF',  // cards, nodes, inputs
    backgroundSelected: '#E6E2D9', // pressed / selected surfaces
    textSecondary: '#6B6E76',      // labels, hints
    textFaint: '#A9ACB3',          // "previous" values (the greyed-out numbers)
    border: '#D9D5CB',             // outlines of circles and cards
    accent: '#FF5A1F',             // the one bright color: Begin, active node, primary buttons
    accentText: '#FFFFFF',         // text drawn on top of accent
    accentSoft: '#FFE3D6',         // tinted backgrounds (completed exercises)
    danger: '#D6332A',             // delete
    overlay: 'rgba(15, 16, 20, 0.45)', // dimmed backdrop behind dialogs
  },
  dark: {
    text: '#F4F3EF',
    background: '#0F1013',
    backgroundElement: '#1B1C21',
    backgroundSelected: '#2A2C33',
    textSecondary: '#9A9DA6',
    textFaint: '#5C5F68',
    border: '#2E3038',
    accent: '#FF6A33',
    accentText: '#FFFFFF',
    accentSoft: '#3A2118',
    danger: '#FF5A4F',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

/** One color set (either light or dark). */
export type Palette = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: { sans: 'var(--font-display)', serif: 'var(--font-serif)', rounded: 'var(--font-rounded)', mono: 'var(--font-mono)' },
});

/** Spacing scale (in points). Use these instead of random numbers so gaps line up. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Widest the content gets on tablets / desktop web, so it doesn't stretch edge to edge. */
export const MaxContentWidth = 520;
