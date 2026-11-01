/**
 * components/screen-header.tsx — The bar at the top of every screen in the
 * wireframes:  "←   TITLE   (right side)".
 *
 * - The ← button calls `onBack` (or just goes back one screen).
 * - `title` is normally plain text. If `onTitleChange` is given, the title
 *   becomes an editable text box instead — that's the "edit name" arrow on
 *   the Create Workout wireframe.
 * - `right` is any element to show on the right (Save button, ⋯ menu...).
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenHeaderProps = {
  title: string;
  onBack?: () => void;
  /** Makes the title editable. */
  onTitleChange?: (text: string) => void;
  titlePlaceholder?: string;
  right?: ReactNode;
};

export function ScreenHeader({ title, onBack, onTitleChange, titlePlaceholder = 'NAME', right }: ScreenHeaderProps) {
  const theme = useTheme();

  // Default back behaviour: pop this screen, or go to the dashboard if there's
  // nothing to go back to (e.g. the page was opened directly on the web).
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <View style={[styles.bar, { borderBottomColor: theme.border }]}>
      <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.side}>
        <Text style={[styles.back, { color: theme.text }]}>←</Text>
      </Pressable>

      <View style={styles.middle}>
        {onTitleChange ? (
          <TextInput
            value={title}
            // Convert to capitals as you type, so the box shows exactly what
            // will be saved. (The title style's textTransform only changes how
            // text LOOKS, not the text itself; that's why names used to be
            // saved as "Push" while the box showed "PUSH".)
            onChangeText={(text) => onTitleChange(text.toUpperCase())}
            autoCapitalize="characters" // phone keyboard starts in caps lock
            placeholder={titlePlaceholder}
            placeholderTextColor={theme.textFaint}
            style={[styles.title, styles.titleInput, { color: theme.text, borderBottomColor: theme.border }]}
            accessibilityLabel="Workout name"
            maxLength={60}
            returnKeyType="done"
          />
        ) : (
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>

      {/* Same width as the back button side so the title stays centred. */}
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { minWidth: 64, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  back: { fontSize: 26, lineHeight: 30 },
  middle: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center' },
  titleInput: { minWidth: 160, paddingVertical: Spacing.one, borderBottomWidth: 1 },
});
