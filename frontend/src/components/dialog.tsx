/**
 * components/dialog.tsx — Pop-ups that work the same on iOS, Android AND web.
 *
 * Why not React Native's built-in Alert.alert()? On the web it doesn't
 * support multiple buttons, so "Save / Discard / Keep going" would silently
 * do nothing there. These are drawn with <Modal> instead, which works
 * everywhere.
 *
 *   <Dialog>  title + message + a column of buttons (confirmations)
 *   <Menu>    small list anchored top-right — the "⋯" dropdown on the
 *             Edit Workout wireframe ("lets them get drop down to delete")
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type DialogAction = {
  label: string;
  onPress: () => void;
  /** primary = filled accent, destructive = red text, default = plain */
  kind?: 'primary' | 'destructive' | 'default';
};

type DialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  actions: DialogAction[];
  /** Tapping the dim background or the Android back button. */
  onDismiss: () => void;
};

export function Dialog({ visible, title, message, actions, onDismiss }: DialogProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      {/* The backdrop is itself a button: tapping outside the card dismisses. */}
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onDismiss} accessibilityLabel="Close dialog">
        {/* An inner Pressable with no onPress swallows taps on the card so they don't reach the backdrop. */}
        <Pressable style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text> : null}
          <View style={styles.actions}>
            {actions.map((action) => {
              const primary = action.kind === 'primary';
              const color = primary ? theme.accentText : action.kind === 'destructive' ? theme.danger : theme.text;
              return (
                <Pressable
                  key={action.label}
                  onPress={action.onPress}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.action,
                    { backgroundColor: primary ? theme.accent : theme.backgroundSelected, opacity: pressed ? 0.8 : 1 },
                  ]}>
                  <Text style={[styles.actionLabel, { color }]}>{action.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type MenuProps = {
  visible: boolean;
  items: DialogAction[];
  onDismiss: () => void;
};

/** The ⋯ dropdown. Appears under the top-right corner of the screen. */
export function Menu({ visible, items, onDismiss }: MenuProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.menuBackdrop} onPress={onDismiss} accessibilityLabel="Close menu">
        <View style={[styles.menu, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => { onDismiss(); item.onPress(); }}
              accessibilityRole="menuitem"
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: theme.backgroundSelected }]}>
              <Text style={[styles.menuLabel, { color: item.kind === 'destructive' ? theme.danger : theme.text }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  card: { width: '100%', maxWidth: 380, borderRadius: 20, padding: Spacing.four, gap: Spacing.two },
  title: { fontSize: 20, fontWeight: '700' },
  message: { fontSize: 15, lineHeight: 21 },
  actions: { marginTop: Spacing.three, gap: Spacing.two },
  action: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 16, fontWeight: '600' },
  menuBackdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    top: 64,
    right: Spacing.three,
    minWidth: 180,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: { paddingHorizontal: Spacing.three, paddingVertical: 12 },
  menuLabel: { fontSize: 16, fontWeight: '500' },
});
