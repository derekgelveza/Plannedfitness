/**
 * hooks/use-theme.ts — Returns the current color palette (light or dark).
 *
 * Usage inside any component:
 *   const theme = useTheme();
 *   <Text style={{ color: theme.text }}>Hi</Text>
 *
 * It re-renders automatically when the phone switches between light and
 * dark mode. Learn more: https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme(): Palette {
  const scheme = useColorScheme();
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
