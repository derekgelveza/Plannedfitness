/**
 * components/screen.tsx — The outer wrapper every screen uses.
 *
 * - Fills the screen with the theme's background color.
 * - Keeps content out from under the notch / status bar / home indicator
 *   (SafeAreaView).
 * - Limits width on tablets and desktop browsers (MaxContentWidth) so the
 *   phone layout from the wireframes doesn't stretch across a wide window.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.outer, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  safe: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
});
