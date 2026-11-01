/**
 * components/buttons.tsx — The few button styles the app uses.
 *
 *   <PrimaryButton>   big filled accent button ("Log set", "Save workout")
 *   <TextButton>      plain word button for headers ("Save", "Finish")
 *   <FloatingAddButton> the round ⊕ in the bottom-right of the Workouts list
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean; // shows a spinner and blocks double taps while saving
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ label, onPress, disabled, busy, style }: PrimaryButtonProps) {
  const theme = useTheme();
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: theme.accent, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {busy ? <ActivityIndicator color={theme.accentText} /> : <Text style={[styles.primaryLabel, { color: theme.accentText }]}>{label}</Text>}
    </Pressable>
  );
}

type TextButtonProps = { label: string; onPress: () => void; disabled?: boolean; color?: string };

export function TextButton({ label, onPress, disabled, color }: TextButtonProps) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} accessibilityRole="button" style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
      <Text style={[styles.textLabel, { color: color ?? theme.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function FloatingAddButton({ onPress, label }: { onPress: () => void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.fab, { backgroundColor: theme.accent, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
      <Text style={[styles.fabPlus, { color: theme.accentText }]}>+</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  primaryLabel: { fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  textLabel: { fontSize: 16, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.five,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    // Soft shadow (iOS/web use shadow*, Android uses elevation).
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPlus: { fontSize: 34, lineHeight: 38, fontWeight: '400' },
});
